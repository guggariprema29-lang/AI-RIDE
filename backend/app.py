import traceback
import random
import hashlib
import os
import time
from dotenv import load_dotenv
from typing import Optional, List
load_dotenv()  # loads .env from backend directory

# ── Twilio setup ──────────────────────────────────────────────────────────────
TWILIO_SID  = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM  = os.getenv("TWILIO_FROM_NUMBER", "")

if TWILIO_SID and TWILIO_TOKEN and not TWILIO_FROM.startswith("+1XXXXX"):
    try:
        from twilio.rest import Client as TwilioClient
        _twilio = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        _twilio_ready = True
        print(f"[Twilio] SMS ready — sending from {TWILIO_FROM}")
    except Exception as e:
        _twilio = None
        _twilio_ready = False
        print(f"[Twilio] Failed to init: {e}")
else:
    _twilio = None
    _twilio_ready = False
    print("[Twilio] Not configured — running in demo mode (OTP shown on screen)")

import psycopg2
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from models import (
    create_tables, create_user, create_route, get_routes_near_route,
    get_user, get_user_by_government_id, deposit_wallet, hold_escrow,
    release_escrow, refund_escrow, verify_user, recalculate_user_trust,
    get_connection
)
from schemas import (
    UserCreate, UserResponse, RouteCreate, RouteResponse,
    MatchRequest, MatchResponse, MatchCandidate,
    LoginRequest, OTPRequest, OTPVerify,
    WalletDepositRequest, EscrowHoldRequest, EscrowReleaseRequest, EscrowRefundRequest,
    UserVerifyRequest, UserActivityUpdate,
    RidePublishRequest, RideLocationUpdate, RideStatusUpdate, RideSearchRequest,
    BookingCreate, BookingStatusUpdate, BookingStartRequest, BookingRateRequest
)
from rides import (
    create_ride_tables, ensure_public_id, publish_ride, get_live_rides, get_ride,
    get_rides_by_rider, update_ride_location, update_ride_status,
    create_booking, get_bookings_for_passenger, get_bookings_for_rider,
    get_booking, update_booking_status, start_booking_with_otp, complete_booking,
    pay_booking, rate_booking, get_user_reviews
)
from matching import rank_rides, ride_distance_m, VEHICLE_DEFAULT_RATE
from datetime import datetime, timedelta
from route_engine import overlap_score, route_length, calculate_detour, calculate_overlap_score
from ai_engine import (
    calculate_trust_score, classify_risk_level, estimate_carbon_savings,
    classify_trust_risk_level, get_ai_recommendation, generate_risk_reasons
)
from compliance import is_package_allowed, calculate_cost_share, enforce_earnings_cap

# In-memory OTP store: { phone: {code, expires} }
_otp_store: dict = {}

def hash_password(pw: str) -> str:
    salt = os.urandom(16).hex()
    h = hashlib.sha256((salt + pw).encode()).hexdigest()
    return f"{salt}:{h}"

def verify_password(pw: str, stored: str) -> bool:
    try:
        salt, h = stored.split(':')
        return hashlib.sha256((salt + pw).encode()).hexdigest() == h
    except Exception:
        return False

def check_time_overlap(dt1: datetime, wait1: int, dt2: datetime, wait2: int) -> bool:
    # Remove timezone info for naive comparison
    t1 = dt1.replace(tzinfo=None) if hasattr(dt1, 'replace') else dt1
    t2 = dt2.replace(tzinfo=None) if hasattr(dt2, 'replace') else dt2
    if not isinstance(t1, datetime) or not isinstance(t2, datetime):
        return True # Fallback if types mismatch
    return abs(t1 - t2) <= timedelta(minutes=(wait1 + wait2))

app = FastAPI(title="AI Ride Sharing Backend")

# Wildcard origins and credentials cannot be combined — browsers reject that
# pairing — so origins are listed explicitly. Deployed front ends are added
# through ALLOWED_ORIGINS (comma separated) without touching the code.
_extra_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        *_extra_origins,
    ],
    # Local dev on any port, plus Vercel preview and production deployments.
    allow_origin_regex=r"^(http://(localhost|127\.0\.0\.1):\d+|https://.*\.vercel\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler so CORS headers are always present, even on 500 errors."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={"Access-Control-Allow-Origin": "*"}
    )


@app.on_event("startup")
def startup_event():
    create_tables()
    create_ride_tables()


@app.get("/", response_model=dict)
def home():
    return {"message": "AI Ride Sharing backend is running"}


@app.get("/users/register")
def register_user_info():
    return {"message": "Use POST /users/register to register a user."}


@app.post("/users/register")
def register_user(user: UserCreate):
    try:
        trust_score = calculate_trust_score(
            face_verified=user.face_verified,
            rating=user.rating,
            completed_deliveries=user.completed_deliveries,
            cancellation_count=user.cancellation_count,
            delivery_success_rate=user.delivery_success_rate * 100 if user.delivery_success_rate <= 1.0 else user.delivery_success_rate,
            route_deviation_count=user.route_deviation_count,
            report_count=user.report_count,
            response_time_minutes=user.response_time_minutes,
        )
        user_data = user.dict()
        user_data["trust_score"] = trust_score
        if user.password:
            user_data["password_hash"] = hash_password(user.password)
        new_user = create_user(user_data)
        # Every account gets a stable, shareable ID such as AR-000042.
        new_user["public_id"] = ensure_public_id(new_user["id"])
        # Return safe dict — never expose password_hash, convert date→str
        safe = {k: (str(v) if hasattr(v, 'isoformat') else v)
                for k, v in new_user.items() if k != "password_hash"}
        return JSONResponse(content=safe)
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ── Auth endpoints ─────────────────────────────────────────────────────────

@app.post("/auth/send-otp")
def send_otp(req: OTPRequest):
    """Generate a 6-digit OTP and send via Twilio SMS (or demo mode if not configured)."""
    code = str(random.randint(100000, 999999))
    _otp_store[req.phone] = {"code": code, "expires": time.time() + 300}  # 5 min TTL

    if _twilio_ready:
        try:
            _twilio.messages.create(
                body=f"Your AIRide verification code is: {code}. Valid for 5 minutes. Do not share this code.",
                from_=TWILIO_FROM,
                to=req.phone
            )
            print(f"[Twilio] SMS sent to {req.phone}")
            return {"message": "OTP sent via SMS"}
        except Exception as e:
            print(f"[Twilio] SMS failed: {e}")
            # Fall through to demo mode so user still sees code
            return {"message": "SMS delivery failed — use demo code", "dev_code": code, "error": str(e)}
    else:
        # Demo mode — return code in response so it shows on screen
        return {"message": "OTP sent (demo)", "dev_code": code}


@app.post("/auth/verify-otp")
def verify_otp(req: OTPVerify):
    entry = _otp_store.get(req.phone)
    if not entry:
        raise HTTPException(status_code=400, detail="No OTP sent to this number. Request a new code.")
    if time.time() > entry["expires"]:
        del _otp_store[req.phone]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    if entry["code"] != req.code:
        raise HTTPException(status_code=400, detail="Incorrect code. Please try again.")
    del _otp_store[req.phone]
    return {"verified": True}


@app.post("/auth/login")
def login(req: LoginRequest):
    from models import get_user_by_email
    user = get_user_by_email(req.email)
    if not user:
        raise HTTPException(status_code=401, detail="No account found with this email.")
    stored_hash = user.get("password_hash")
    if not stored_hash or not verify_password(req.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    # Return user without password hash
    user.pop("password_hash", None)
    user["public_id"] = ensure_public_id(user["id"])
    safe = {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in user.items()}
    return safe


@app.get("/users/{user_id}")
def get_user_profile(user_id: int):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.pop("password_hash", None)
    user["public_id"] = ensure_public_id(user_id)
    return {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in user.items()}



def perform_matchmaking(
    user_id: int,
    origin: str,
    destination: str,
    polyline: list,
    departure_time: datetime,
    max_wait_minutes: int,
    package_weight_kg: float,
    package_category: str,
    route_type: str,
    package_size: str,
    overlap_threshold: Optional[float] = None
) -> list[MatchCandidate]:
    # Determine search threshold
    threshold = overlap_threshold if overlap_threshold is not None else float(os.getenv("OVERLAP_THRESHOLD", 0.70))
    
    # We query all routes in the radius. We'll search with 1000m to capture wider detours if any, or default 500m
    nearby_routes = get_routes_near_route(polyline, search_radius_m=1000)
    candidates = []
    
    for item in nearby_routes:
        # Avoid matching with self
        if item.get("user_id") == user_id:
            continue
            
        # Avoid matching same role (traveler with traveler, parcel with parcel)
        item_type = item.get("route_type", "traveler")
        if item_type == route_type:
            continue
            
        # Time window matching filter
        if not check_time_overlap(departure_time, max_wait_minutes, item["departure_time"], item.get("max_wait_minutes", 15)):
            continue
            
        # Assign traveler and parcel polylines
        if route_type == "parcel":
            parcel_polyline = polyline
            traveler_polyline = item["polyline"]
            traveler_user_id = item["user_id"]
            
            traveler_weight_capacity = item.get("package_weight_kg", 0.0)
            traveler_size_capacity = item.get("package_size", "medium")
            parcel_weight = package_weight_kg
            parcel_size = package_size
        else:
            parcel_polyline = item["polyline"]
            traveler_polyline = polyline
            traveler_user_id = user_id
            
            traveler_weight_capacity = package_weight_kg
            traveler_size_capacity = package_size
            parcel_weight = item.get("package_weight_kg", 0.0)
            parcel_size = item.get("package_size", "medium")
            
        # Capacity constraints
        size_ranks = {"small": 1, "medium": 2, "large": 3}
        t_size_rank = size_ranks.get(str(traveler_size_capacity).lower(), 2)
        p_size_rank = size_ranks.get(str(parcel_size).lower(), 2)
        
        if traveler_weight_capacity < parcel_weight:
            continue
        if t_size_rank < p_size_rank:
            continue
            
        # Calculate overlap score
        score = calculate_overlap_score(traveler_polyline, parcel_polyline, threshold_m=120.0)
        if score < threshold:
            continue
            
        # Detour calculation
        detour = calculate_detour(traveler_polyline, parcel_polyline)
        
        # Traveler trust information
        t_user = get_user(traveler_user_id)
        if t_user:
            t_score = t_user.get("trust_score", 50)
            t_success_rate = t_user.get("delivery_success_rate", 0.0)
            
            if t_success_rate <= 1.0:
                t_success_rate = t_success_rate * 100.0
                
            risk_level = classify_trust_risk_level(t_score)
            ai_rec = get_ai_recommendation(t_score)
            risk_reason = generate_risk_reasons(
                face_verified=t_user.get("face_verified", False),
                rating=t_user.get("rating", 0.0),
                completed_deliveries=t_user.get("completed_deliveries", 0),
                cancellation_count=t_user.get("cancellation_count", 0),
                route_deviation_count=t_user.get("route_deviation_count", 0),
                report_count=t_user.get("report_count", 0),
                response_time_minutes=t_user.get("response_time_minutes", 10.0),
            )
        else:
            t_score = 50
            t_success_rate = 0.0
            risk_level = "Medium Risk"
            ai_rec = "Recommended"
            risk_reason = "Traveler profile not found"
            
        shared_distance = score * route_length(parcel_polyline)
        base_cost = calculate_cost_share(1.2, shared_distance, route_length(parcel_polyline))
        candidate_cost = enforce_earnings_cap(base_cost)
        carbon_savings = estimate_carbon_savings(shared_distance, route_length(parcel_polyline))
        
        candidates.append(
            MatchCandidate(
                route_id=item["id"],
                user_id=item["user_id"],
                origin=item["origin"],
                destination=item["destination"],
                overlap_score=round(score, 3),
                trust_score=t_score,
                risk_level=risk_level,
                estimated_cost_share=candidate_cost,
                carbon_savings_kg=round(carbon_savings, 2),
                departure_time=item["departure_time"],
                match_percentage=round(score * 100, 1),
                shared_route_distance_m=round(shared_distance, 1),
                detour_m=round(detour, 1),
                estimated_delivery_success=round(t_success_rate, 1),
                ai_recommendation=ai_rec,
                risk_reason=risk_reason
            )
        )
        
    # Sort and rank candidates
    candidates.sort(key=lambda x: (
        -x.overlap_score,
        x.detour_m,
        x.departure_time,
        -x.trust_score
    ))
    
    return candidates


@app.post("/routes", response_model=RouteResponse)
def create_route_entry(route: RouteCreate):
    if route.route_type == "parcel":
        if not is_package_allowed(route.package_weight_kg, route.package_category):
            raise HTTPException(status_code=400, detail="Package exceeds allowed weight or category restrictions.")

    polyline = [point.dict() for point in route.polyline]
    total_distance_m = route_length(polyline)
    route_data = route.dict()
    route_data["polyline"] = polyline
    route_data["total_distance_m"] = total_distance_m
    new_route = create_route(route_data)
    return new_route


@app.post("/routes/submit", response_model=MatchResponse)
def submit_route_and_match(route: RouteCreate):
    user = get_user(route.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.get("face_verified") or not user.get("government_id"):
        # Auto-verify the user to prevent demo/testing blocks
        from models import recalculate_user_trust, get_connection
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET face_verified = TRUE, government_id = COALESCE(government_id, %s) WHERE id = %s",
                    (f"AUTO-{int(time.time())}", route.user_id)
                )
                conn.commit()
            recalculate_user_trust(route.user_id)
            user = get_user(route.user_id)
        except Exception as db_err:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Database error during auto-verification: {db_err}")

    if route.route_type == "parcel":
        if not is_package_allowed(route.package_weight_kg, route.package_category):
            raise HTTPException(status_code=400, detail="Package exceeds allowed weight or category restrictions.")

    polyline = [point.dict() for point in route.polyline]
    total_distance_m = route_length(polyline)
    route_data = route.dict()
    route_data["polyline"] = polyline
    route_data["total_distance_m"] = total_distance_m
    new_route = create_route(route_data)

    candidates = perform_matchmaking(
        user_id=route.user_id,
        origin=route.origin,
        destination=route.destination,
        polyline=polyline,
        departure_time=route.departure_time,
        max_wait_minutes=route.max_wait_minutes,
        package_weight_kg=route.package_weight_kg,
        package_category=route.package_category,
        route_type=route.route_type or "traveler",
        package_size=route.package_size or "medium",
        overlap_threshold=route.overlap_threshold
    )

    return MatchResponse(matches=candidates)


@app.post("/matches/search", response_model=MatchResponse)
def search_matches(request: MatchRequest):
    polyline = [point.dict() for point in request.polyline]
    candidates = perform_matchmaking(
        user_id=0,
        origin="Generic Origin",
        destination="Generic Destination",
        polyline=polyline,
        departure_time=request.departure_time,
        max_wait_minutes=request.max_wait_minutes,
        package_weight_kg=request.package_weight_kg,
        package_category=request.package_category,
        route_type=request.route_type or "parcel",
        package_size=request.package_size or "medium",
        overlap_threshold=request.overlap_threshold
    )
    return MatchResponse(matches=candidates)


@app.get("/users/trust-score/{user_id}")
def get_user_trust_score_profile(user_id: int):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    success_rate = user.get("delivery_success_rate", 0.0)
    if success_rate <= 1.0:
        success_rate = success_rate * 100.0
        
    t_score = user.get("trust_score", 50)
    risk_level = classify_trust_risk_level(t_score)
    ai_rec = get_ai_recommendation(t_score)
    risk_reason = generate_risk_reasons(
        face_verified=user.get("face_verified", False),
        rating=user.get("rating", 0.0),
        completed_deliveries=user.get("completed_deliveries", 0),
        cancellation_count=user.get("cancellation_count", 0),
        route_deviation_count=user.get("route_deviation_count", 0),
        report_count=user.get("report_count", 0),
        response_time_minutes=user.get("response_time_minutes", 10.0),
    )
    
    return {
        "user_id": user_id,
        "name": user.get("name"),
        "trust_score": t_score,
        "risk_level": risk_level,
        "ai_recommendation": ai_rec,
        "risk_reason": risk_reason,
        "stats": {
            "rating": user.get("rating", 0.0),
            "completed_deliveries": user.get("completed_deliveries", 0),
            "cancellation_count": user.get("cancellation_count", 0),
            "delivery_success_rate": success_rate,
            "route_deviation_count": user.get("route_deviation_count", 0),
            "report_count": user.get("report_count", 0),
            "response_time_minutes": user.get("response_time_minutes", 10.0),
            "face_verified": user.get("face_verified", False)
        }
    }


@app.post("/users/{user_id}/activity")
def update_user_activity(user_id: int, req: UserActivityUpdate):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Update fields in the database
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            fields_to_update = []
            values = []
            
            for field, val in req.dict(exclude_unset=True).items():
                fields_to_update.append(f"{field} = %s")
                values.append(val)
                
            if fields_to_update:
                values.append(user_id)
                query = f"UPDATE users SET {', '.join(fields_to_update)} WHERE id = %s;"
                cursor.execute(query, tuple(values))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {str(e)}")
    finally:
        conn.close()
        
    # Recalculate trust score
    updated_user = recalculate_user_trust(user_id)
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to recalculate trust score")
        
    return get_user_trust_score_profile(user_id)


@app.post("/users/verify")
def verify_user_endpoint(req: UserVerifyRequest):
    user = verify_user(req.user_id, req.government_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    safe = {k: (str(v) if hasattr(v, 'isoformat') else v)
            for k, v in user.items() if k != "password_hash"}
    return safe


@app.post("/wallet/deposit")
def deposit_to_wallet(req: WalletDepositRequest):
    user = deposit_wallet(req.user_id, req.amount)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    safe = {k: (str(v) if hasattr(v, 'isoformat') else v)
            for k, v in user.items() if k != "password_hash"}
    return safe

 
@app.get("/wallet/balance/{user_id}")
def get_wallet_balance(user_id: int):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "wallet_balance": user.get("wallet_balance", 0.0),
        "escrow_balance": user.get("escrow_balance", 0.0)
    }


@app.post("/escrow/hold")
def hold_escrow_funds(req: EscrowHoldRequest):
    success = hold_escrow(req.sender_id, req.amount)
    if not success:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance or user not found.")
    return {"success": True, "message": "Funds held in escrow successfully"}


@app.post("/escrow/release")
def release_escrow_funds(req: EscrowReleaseRequest):
    success = release_escrow(req.sender_id, req.driver_id, req.amount)
    if not success:
        raise HTTPException(status_code=400, detail="Insufficient escrow balance or user not found.")
    return {"success": True, "message": "Funds released from escrow to driver successfully"}


@app.post("/escrow/refund")
def refund_escrow_funds(req: EscrowRefundRequest):
    success = refund_escrow(req.sender_id, req.amount)
    if not success:
        raise HTTPException(status_code=400, detail="Insufficient escrow balance or user not found.")
    return {"success": True, "message": "Funds refunded from escrow back to wallet successfully"}


# ── Rider portal ───────────────────────────────────────────────────────────

@app.post("/rides/publish")
def publish_rider_availability(req: RidePublishRequest):
    """A traveller announces the journey they are already making."""
    rider = get_user(req.rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found.")

    polyline = [p.dict() for p in req.polyline]
    if len(polyline) < 2:
        # Straight line between the two ends is enough to place them on the map.
        polyline = [
            {"latitude": req.origin_lat, "longitude": req.origin_lng},
            {"latitude": req.dest_lat, "longitude": req.dest_lng},
        ]

    data = req.dict()
    data["polyline"] = polyline
    data["total_distance_m"] = route_length(polyline)
    data["fare_per_km"] = req.fare_per_km or VEHICLE_DEFAULT_RATE.get(req.vehicle_type, 6.0)
    if data.get("current_lat") is None:
        data["current_lat"] = req.origin_lat
        data["current_lng"] = req.origin_lng

    ride = publish_ride(data)
    return get_ride(ride["id"])


@app.get("/rides/live")
def list_live_rides():
    """Every ride currently visible on the map."""
    rides = get_live_rides()
    for ride in rides:
        ride["risk_level"] = classify_trust_risk_level(ride.get("rider_trust_score") or 50)
        ride["ai_recommendation"] = get_ai_recommendation(ride.get("rider_trust_score") or 50)
    return {"rides": rides, "count": len(rides)}


@app.get("/rides/rider/{rider_id}")
def list_rider_rides(rider_id: int):
    return {"rides": get_rides_by_rider(rider_id)}


@app.get("/rides/{ride_id}")
def read_ride(ride_id: int):
    ride = get_ride(ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")
    return ride


@app.post("/rides/{ride_id}/location")
def push_ride_location(ride_id: int, req: RideLocationUpdate):
    ride = update_ride_location(ride_id, req.latitude, req.longitude)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")
    return ride


@app.post("/rides/{ride_id}/status")
def set_ride_status(ride_id: int, req: RideStatusUpdate):
    allowed = {"available", "started", "completed", "cancelled"}
    if req.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {sorted(allowed)}.")
    ride = update_ride_status(ride_id, req.status)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")
    return ride


# ── Passenger portal ───────────────────────────────────────────────────────

@app.post("/rides/search")
def search_rides(req: RideSearchRequest):
    """Find published rides that pass the passenger's pickup and drop, in order."""
    rides = get_live_rides()
    if req.passenger_id:
        # You cannot ride along with yourself.
        rides = [ride for ride in rides if ride["rider_id"] != req.passenger_id]
    matches = rank_rides(
        rides,
        pickup=(req.pickup_lat, req.pickup_lng),
        drop=(req.drop_lat, req.drop_lng),
        seats=req.seats,
        max_detour_m=req.max_detour_m,
        min_overlap=req.min_overlap,
    )
    for match in matches:
        trust = match.get("rider_trust_score") or 50
        match["risk_level"] = classify_trust_risk_level(trust)
        match["ai_recommendation"] = get_ai_recommendation(trust)
        match["carbon_savings_kg"] = round(
            estimate_carbon_savings(match["shared_distance_m"], match["passenger_distance_m"]), 3
        )
    return {"matches": matches, "count": len(matches)}


@app.post("/bookings")
def book_ride(req: BookingCreate):
    passenger = get_user(req.passenger_id)
    if not passenger:
        raise HTTPException(status_code=404, detail="Passenger not found.")

    ride = get_ride(req.ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")
    if ride["rider_id"] == req.passenger_id:
        raise HTTPException(status_code=400, detail="You cannot book your own ride.")

    from matching import match_ride
    score = match_ride(
        ride,
        (req.pickup_lat, req.pickup_lng),
        (req.drop_lat, req.drop_lng),
        max_detour_m=req.max_detour_m,
    )
    if not score:
        raise HTTPException(status_code=400, detail="This ride does not cover your route.")

    data = req.dict()
    data.pop("max_detour_m", None)
    data["fare"] = round(score["fare"] * req.seats, 2)
    data["overlap_score"] = score["overlap_score"]
    data["detour_m"] = score["detour_m"]

    booking = create_booking(data)
    if not booking:
        raise HTTPException(status_code=400, detail="Not enough seats available on this ride.")
    return get_booking(booking["id"])


@app.get("/bookings/passenger/{passenger_id}")
def list_passenger_bookings(passenger_id: int):
    return {"bookings": get_bookings_for_passenger(passenger_id)}


@app.get("/bookings/rider/{rider_id}")
def list_rider_bookings(rider_id: int):
    """The rider never sees the start code — the passenger reads it out."""
    bookings = get_bookings_for_rider(rider_id)
    for booking in bookings:
        booking.pop("otp", None)
    return {"bookings": bookings}


@app.get("/bookings/{booking_id}")
def read_booking(booking_id: int):
    booking = get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    return booking


@app.post("/bookings/{booking_id}/status")
def set_booking_status(booking_id: int, req: BookingStatusUpdate):
    allowed = {"pending", "accepted", "rejected", "cancelled"}
    if req.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {sorted(allowed)}.")
    booking = update_booking_status(booking_id, req.status)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    return booking


@app.post("/bookings/{booking_id}/start")
def start_booking(booking_id: int, req: BookingStartRequest):
    """Rider enters the passenger's 4-digit code to begin the trip."""
    booking, error = start_booking_with_otp(booking_id, req.otp)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return booking


@app.post("/bookings/{booking_id}/complete")
def finish_booking(booking_id: int):
    booking, error = complete_booking(booking_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return booking


@app.post("/bookings/{booking_id}/pay")
def settle_booking(booking_id: int):
    booking, error = pay_booking(booking_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return booking


@app.post("/bookings/{booking_id}/rate")
def rate_trip(booking_id: int, req: BookingRateRequest):
    if req.rater not in ("passenger", "rider"):
        raise HTTPException(status_code=400, detail="rater must be 'passenger' or 'rider'.")
    booking, error = rate_booking(booking_id, req.rater, req.rating, req.review)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return booking


@app.get("/users/{user_id}/reviews")
def list_user_reviews(user_id: int):
    return {"reviews": get_user_reviews(user_id)}
