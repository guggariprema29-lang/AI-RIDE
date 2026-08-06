import asyncio
import re
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
TWILIO_VERIFY_SID = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")

if TWILIO_SID and TWILIO_TOKEN:
    try:
        from twilio.rest import Client as TwilioClient
        _twilio = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        _twilio_ready = True
        print(f"[Twilio] Real SMS Engine ready (Verify Service: {TWILIO_VERIFY_SID})")
    except Exception as e:
        _twilio = None
        _twilio_ready = False
        print(f"[Twilio] Failed to init: {e}")
else:
    _twilio = None
    _twilio_ready = False
    print("[Twilio] Not configured — running in demo mode (OTP shown on screen)")

import psycopg2
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from auth_jwt import create_access_token, decode_access_token
from ws_manager import manager
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
    BookingCreate, RelayBookingCreate, BookingStatusUpdate, BookingStartRequest, BookingRateRequest,
    ParcelCreate, ParcelAcceptRequest, ParcelOTPVerify,
    RecurringScheduleCreate, RecurringSubscribeRequest
)
from recurring import (
    create_recurring_schedule, get_user_recurring_schedules, get_recurring_schedule,
    toggle_recurring_schedule, subscribe_to_schedule, get_schedule_subscriptions,
    search_recurring_schedules, process_recurring_schedules
)
from rides import (
    create_ride_tables, ensure_public_id, publish_ride, get_live_rides, get_nearby_rides, get_ride,
    get_rides_by_rider, update_ride_location, update_ride_status,
    create_booking, get_bookings_for_passenger, get_bookings_for_rider,
    get_booking, update_booking_status, start_booking_with_otp, complete_booking,
    pay_booking, rate_booking, get_user_reviews
)
from parcels import (
    create_parcels_table, create_parcel, get_parcels_by_sender, get_parcels_for_rider,
    get_nearby_parcels_for_ride, accept_parcel, verify_parcel_pickup, verify_parcel_delivery, cancel_parcel
)
from matching import rank_rides, ride_distance_m, VEHICLE_DEFAULT_RATE
from datetime import datetime, timedelta
from route_engine import overlap_score, route_length, calculate_detour, calculate_overlap_score, detect_route_deviation
from cost_sharing import calculate_cost_split
from payment_gateway import PaymentGateway
from ai_engine import (
    calculate_trust_score, estimate_carbon_savings,
    classify_trust_risk_level, get_ai_recommendation, generate_risk_reasons
)

from notifications import (
    create_notifications_table, get_user_notifications,
    mark_notification_read, mark_all_notifications_read, delete_notification,
    clear_user_notifications, create_notification
)
from sos import (
    create_sos_tables, trigger_sos, update_emergency_contact,
    resolve_sos, get_user_sos_alerts
)

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
    allow_origin_regex=r"^(http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):\d+|https://.*\.vercel\.app)$",
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
    create_notifications_table()
    create_sos_tables()
    create_parcels_table()


@app.get("/", response_model=dict)
def home():
    return {"message": "AI Ride Sharing backend is running"}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """Real-Time WebSocket Manager endpoint for live chat and notifications."""
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Handle incoming WebSocket chat message
            if data.get("type") == "chat_message":
                booking_id = data.get("booking_id")
                sender_id = data.get("sender_id", user_id)
                sender_name = data.get("sender_name", "Commuter")
                message_text = str(data.get("message", "")).strip()

                if booking_id and message_text:
                    from models import create_chat_message
                    from rides import get_booking
                    saved_msg = create_chat_message(booking_id, sender_id, sender_name, message_text)
                    booking = get_booking(booking_id)
                    if booking:
                        payload = {
                            "type": "chat_message",
                            "booking_id": booking_id,
                            "message": saved_msg
                        }
                        if booking.get("passenger_id"):
                            await manager.broadcast_to_user(booking["passenger_id"], payload)
                        if booking.get("rider_id"):
                            await manager.broadcast_to_user(booking["rider_id"], payload)
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception as e:
        print(f"[WebSocket] Error for user {user_id}: {e}")
        manager.disconnect(user_id, websocket)


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
        token = create_access_token({"sub": str(new_user["id"]), "email": new_user.get("email"), "id": new_user["id"]})
        # Return safe dict — never expose password_hash
        safe = {k: (str(v) if hasattr(v, 'isoformat') else v)
                for k, v in new_user.items() if k != "password_hash"}
        safe["token"] = token
        safe["access_token"] = token
        return JSONResponse(content=jsonable_encoder(safe))
    except psycopg2.errors.UniqueViolation as e:
        raise HTTPException(status_code=400, detail="An account with this email or Government ID already exists.")
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ── Auth endpoints ─────────────────────────────────────────────────────────

@app.post("/auth/send-otp")
def send_otp(req: OTPRequest):
    """Generate a 6-digit OTP and send via Twilio Real SMS (or demo mode fallback)."""
    to_phone = req.phone.strip()
    if not to_phone.startswith("+"):
        clean = re.sub(r"\D", "", to_phone)
        to_phone = f"+91{clean}" if len(clean) == 10 else f"+{clean}"

    if _twilio_ready and TWILIO_VERIFY_SID:
        try:
            v = _twilio.verify.v2.services(TWILIO_VERIFY_SID).verifications.create(to=to_phone, channel='sms')
            print(f"[Twilio Verify API] Real SMS sent to {to_phone} (status: {v.status})")
            return {"message": f"Real SMS OTP sent to {to_phone}"}
        except Exception as e:
            print(f"[Twilio Verify API] Failed: {e}")

    code = str(random.randint(100000, 999999))
    _otp_store[req.phone] = {"code": code, "expires": time.time() + 300}
    _otp_store[to_phone] = {"code": code, "expires": time.time() + 300}

    if _twilio_ready and TWILIO_FROM and not TWILIO_FROM.startswith("+1XXXXX"):
        try:
            _twilio.messages.create(
                body=f"Your AIRide verification code is: {code}. Valid for 5 minutes.",
                from_=TWILIO_FROM,
                to=to_phone
            )
            print(f"[Twilio Messages API] Real SMS sent to {to_phone}")
            return {"message": f"OTP sent via real SMS to {to_phone}"}
        except Exception as e:
            print(f"[Twilio Messages API] Failed: {e}")
            return {"message": "SMS delivery failed — use demo code", "dev_code": code, "error": str(e)}

    return {"message": "OTP sent (demo)", "dev_code": code}


@app.post("/auth/verify-otp")
def verify_otp(req: OTPVerify):
    to_phone = req.phone.strip()
    if not to_phone.startswith("+"):
        clean = re.sub(r"\D", "", to_phone)
        to_phone = f"+91{clean}" if len(clean) == 10 else f"+{clean}"

    if _twilio_ready and TWILIO_VERIFY_SID:
        try:
            vc = _twilio.verify.v2.services(TWILIO_VERIFY_SID).verification_checks.create(to=to_phone, code=req.code)
            if vc.status == "approved":
                return {"verified": True}
        except Exception as e:
            print(f"[Twilio Verify Check] Failed: {e}")

    entry = _otp_store.get(req.phone) or _otp_store.get(to_phone)
    if not entry:
        raise HTTPException(status_code=400, detail="No OTP sent to this number. Request a new code.")
    if time.time() > entry["expires"]:
        del _otp_store[req.phone]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    if entry["code"] != req.code:
        raise HTTPException(status_code=400, detail="Incorrect code. Please try again.")
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
    token = create_access_token({"sub": str(user["id"]), "email": user.get("email"), "id": user["id"]})
    safe = {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in user.items()}
    safe["token"] = token
    safe["access_token"] = token
    return jsonable_encoder(safe)


@app.get("/users/{user_id}")
def get_user_profile(user_id: int):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.pop("password_hash", None)
    user["public_id"] = ensure_public_id(user_id)
    return jsonable_encoder({k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in user.items()})






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


@app.get("/rides/nearby")
def list_nearby_rides(lat: float, lng: float, radius_m: float = 5000.0, limit: int = 50):
    """Find available riders near a given lat/lng within radius_m meters."""
    rides = get_nearby_rides(lat, lng, radius_m, limit)
    for ride in rides:
        trust = ride.get("rider_trust_score") or 50
        ride["risk_level"] = classify_trust_risk_level(trust)
        ride["ai_recommendation"] = get_ai_recommendation(trust)
    return {"rides": rides, "count": len(rides), "radius_m": radius_m}


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

    # Check for route deviation
    polyline = ride.get("polyline") or []
    deviation_info = detect_route_deviation((req.latitude, req.longitude), polyline, threshold_m=500.0)

    if deviation_info["is_deviated"]:
        # Increment rider's route deviation count and recalculate trust
        rider_id = ride["rider_id"]
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET route_deviation_count = route_deviation_count + 1 WHERE id = %s;",
                    (rider_id,)
                )
            conn.commit()
        finally:
            conn.close()
        recalculate_user_trust(rider_id)

    ride["route_deviation"] = deviation_info
    return ride


@app.get("/rides/{ride_id}/cost-split")
def get_ride_cost_split(ride_id: int, shared_distance_m: Optional[float] = None):
    ride = get_ride(ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")

    dist = shared_distance_m or ride.get("total_distance_m", 0.0)
    split = calculate_cost_split(
        shared_distance_m=dist,
        total_ride_distance_m=ride.get("total_distance_m", 0.0),
        fare_per_km=ride.get("fare_per_km", 6.0),
        seats=ride.get("seats_available", 1),
        vehicle_type=ride.get("vehicle_type", "car")
    )
    return split


@app.post("/payments/create-session")
def create_payment_session_endpoint(payload: dict):
    user_id = payload.get("user_id")
    amount = float(payload.get("amount", 0.0))
    payment_method = payload.get("payment_method", "upi")
    if not user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="user_id and positive amount are required.")

    session = PaymentGateway.create_checkout_session(user_id, amount, payment_method)
    return session


@app.post("/payments/verify")
def verify_payment_session_endpoint(payload: dict):
    session_id = payload.get("session_id")
    transaction_ref = payload.get("transaction_ref")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    success, session, message = PaymentGateway.verify_and_process_payment(session_id, transaction_ref)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "session": session}


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
    passenger_gender = "unspecified"
    if req.passenger_id:
        passenger = get_user(req.passenger_id)
        if passenger:
            passenger_gender = (passenger.get("gender") or "unspecified").lower()

    filtered = []
    for ride in rides:
        if req.passenger_id and ride.get("rider_id") == req.passenger_id:
            continue
        is_women_only = bool(ride.get("women_only", False))
        if is_women_only and passenger_gender != "female":
            continue
        if req.women_only_filter and not is_women_only:
            continue
        filtered.append(ride)
    rides = filtered
    matches = rank_rides(
        rides,
        pickup=(req.pickup_lat, req.pickup_lng),
        drop=(req.drop_lat, req.drop_lng),
        seats=req.seats,
        max_detour_m=req.max_detour_m,
        min_overlap=req.min_overlap,
    )
    for match in matches:
        if match.get("is_relay"):
            trust1 = match["leg1"].get("rider_trust_score") or 50
            trust2 = match["leg2"].get("rider_trust_score") or 50
            trust = min(trust1, trust2)
            match["risk_level"] = classify_trust_risk_level(trust)
            match["ai_recommendation"] = f"🔀 Multi-leg relay option via {match['transfer_point']['name']}."
            match["carbon_savings_kg"] = round(
                estimate_carbon_savings(match["shared_distance_m"], match["passenger_distance_m"]), 3
            )
        else:
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


@app.post("/bookings/relay")
def book_relay_ride(req: RelayBookingCreate):
    passenger = get_user(req.passenger_id)
    if not passenger:
        raise HTTPException(status_code=404, detail="Passenger not found.")

    ride1 = get_ride(req.leg1_ride_id)
    ride2 = get_ride(req.leg2_ride_id)
    if not ride1 or not ride2:
        raise HTTPException(status_code=404, detail="One or both rides not found.")

    b1_data = {
        "ride_id": req.leg1_ride_id,
        "passenger_id": req.passenger_id,
        "pickup": req.pickup,
        "dropoff": f"Transfer: {req.transfer_point}",
        "pickup_lat": req.pickup_lat,
        "pickup_lng": req.pickup_lng,
        "drop_lat": req.transfer_lat,
        "drop_lng": req.transfer_lng,
        "seats": req.seats,
    }

    b2_data = {
        "ride_id": req.leg2_ride_id,
        "passenger_id": req.passenger_id,
        "pickup": f"Transfer: {req.transfer_point}",
        "dropoff": req.dropoff,
        "pickup_lat": req.transfer_lat,
        "pickup_lng": req.transfer_lng,
        "drop_lat": req.drop_lat,
        "drop_lng": req.drop_lng,
        "seats": req.seats,
    }

    from matching import match_ride
    score1 = match_ride(ride1, (req.pickup_lat, req.pickup_lng), (req.transfer_lat, req.transfer_lng), max_detour_m=req.max_detour_m, min_overlap=0.0)
    score2 = match_ride(ride2, (req.transfer_lat, req.transfer_lng), (req.drop_lat, req.drop_lng), max_detour_m=req.max_detour_m, min_overlap=0.0)

    b1_data["fare"] = round((score1["fare"] if score1 else 30.0) * req.seats, 2)
    b1_data["overlap_score"] = score1["overlap_score"] if score1 else 0.5
    b1_data["detour_m"] = score1["detour_m"] if score1 else 0.0

    b2_data["fare"] = round((score2["fare"] if score2 else 30.0) * req.seats, 2)
    b2_data["overlap_score"] = score2["overlap_score"] if score2 else 0.5
    b2_data["detour_m"] = score2["detour_m"] if score2 else 0.0

    b1 = create_booking(b1_data)
    b2 = create_booking(b2_data)

    if not b1 or not b2:
        raise HTTPException(status_code=400, detail="Could not book seats on relay rides.")

    booking1 = get_booking(b1["id"])
    booking2 = get_booking(b2["id"])

    return {
        "is_relay": True,
        "id": booking1["id"],
        "leg1": booking1,
        "leg2": booking2,
        "otp": f"{booking1['otp']} & {booking2['otp']}",
    }



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


@app.get("/bookings/{booking_id}/chat")
def get_chat_history(booking_id: int):
    from models import get_trip_chat_messages
    return {"messages": get_trip_chat_messages(booking_id)}


@app.post("/bookings/{booking_id}/chat")
async def send_chat_message(booking_id: int, req: dict):
    from models import create_chat_message
    sender_id = req.get("sender_id")
    sender_name = req.get("sender_name", "Commuter")
    message_text = str(req.get("message", "")).strip()

    if not sender_id or not message_text:
        raise HTTPException(status_code=400, detail="sender_id and message are required.")

    booking = get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    saved_msg = create_chat_message(booking_id, sender_id, sender_name, message_text)

    # Broadcast live chat message via WebSockets
    payload = {
        "type": "chat_message",
        "booking_id": booking_id,
        "message": saved_msg
    }
    if booking.get("passenger_id"):
        asyncio.create_task(manager.broadcast_to_user(booking["passenger_id"], payload))
    if booking.get("rider_id"):
        asyncio.create_task(manager.broadcast_to_user(booking["rider_id"], payload))

    return saved_msg


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


# ── Real-Time WebSocket endpoint ───────────────────────────────────────────

@app.websocket("/ws/notifications/{user_id}")
async def websocket_notifications(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception as e:
        manager.disconnect(user_id, websocket)


# ── Notification endpoints ───────────────────────────────────────────────

@app.get("/notifications/{user_id}")
def fetch_user_notifications(user_id: int, category: Optional[str] = None, limit: int = 100):
    notes = get_user_notifications(user_id, category=category, limit=limit)
    all_notes = get_user_notifications(user_id, category=None, limit=200)
    unread_count = sum(1 for n in all_notes if not n.get("is_read"))
    return {
        "notifications": notes,
        "count": len(notes),
        "unread_count": unread_count,
        "category": category or "all"
    }


@app.post("/notifications/create")
def create_notification_endpoint(payload: dict):
    user_id = payload.get("user_id")
    event_type = payload.get("event_type", "system")
    title = payload.get("title", "Notification")
    message = payload.get("message", "")
    category = payload.get("category")
    booking_id = payload.get("booking_id")
    ride_id = payload.get("ride_id")

    if not user_id or not title or not message:
        raise HTTPException(status_code=400, detail="user_id, title, and message are required.")

    note = create_notification(
        user_id=int(user_id),
        event_type=event_type,
        title=title,
        message=message,
        category=category,
        booking_id=int(booking_id) if booking_id else None,
        ride_id=int(ride_id) if ride_id else None
    )
    if not note:
        raise HTTPException(status_code=500, detail="Failed to create notification.")
    return note


@app.post("/notifications/{notification_id}/read")
def read_notification_endpoint(notification_id: int):
    success = mark_notification_read(notification_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark notification as read.")
    return {"success": True}


@app.post("/notifications/read-all/{user_id}")
def read_all_notifications_endpoint(user_id: int):
    success = mark_all_notifications_read(user_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark all notifications as read.")
    return {"success": True}


@app.delete("/notifications/{notification_id}")
def delete_notification_endpoint(notification_id: int):
    success = delete_notification(notification_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete notification.")
    return {"success": True}


@app.post("/notifications/clear/{user_id}")
@app.delete("/notifications/clear/{user_id}")
def clear_notifications_endpoint(user_id: int):
    success = clear_user_notifications(user_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to clear notifications.")
    return {"success": True}


# ── SOS Emergency Alert endpoints ────────────────────────────────────────

@app.post("/sos/trigger")
def trigger_sos_endpoint(payload: dict):
    user_id = payload.get("user_id")
    lat = payload.get("latitude")
    lng = payload.get("longitude")
    booking_id = payload.get("booking_id")
    location_name = payload.get("location_name")

    if not user_id or lat is None or lng is None:
        raise HTTPException(status_code=400, detail="user_id, latitude, and longitude are required.")

    result = trigger_sos(
        user_id=int(user_id),
        latitude=float(lat),
        longitude=float(lng),
        booking_id=int(booking_id) if booking_id else None,
        location_name=location_name
    )
    return result


@app.post("/sos/contact")
def update_contact_endpoint(payload: dict):
    user_id = payload.get("user_id")
    name = payload.get("name")
    phone = payload.get("phone")

    if not user_id or not name or not phone:
        raise HTTPException(status_code=400, detail="user_id, name, and phone are required.")

    updated = update_emergency_contact(int(user_id), name.strip(), phone.strip())
    if not updated:
        raise HTTPException(status_code=400, detail="Failed to update emergency contact.")
    return updated


@app.get("/sos/alerts/{user_id}")
def get_user_sos_history(user_id: int):
    alerts = get_user_sos_alerts(user_id)
    return {"alerts": alerts, "count": len(alerts)}


@app.post("/sos/{alert_id}/resolve")
def resolve_sos_endpoint(alert_id: int):
    success = resolve_sos(alert_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to resolve SOS alert.")
    return {"success": True}


# ── Parcel Sharing endpoints ─────────────────────────────────────────────

@app.post("/parcels/create")
def create_parcel_endpoint(req: ParcelCreate):
    parcel, error = create_parcel(req.dict())
    if error:
        raise HTTPException(status_code=400, detail=error)
    return parcel


@app.get("/parcels/sender/{sender_id}")
def get_sender_parcels_endpoint(sender_id: int):
    return {"parcels": get_parcels_by_sender(sender_id)}


@app.get("/parcels/rider/{rider_id}")
def get_rider_parcels_endpoint(rider_id: int):
    return {"parcels": get_parcels_for_rider(rider_id)}


@app.get("/parcels/nearby/{ride_id}")
def get_nearby_parcels_endpoint(ride_id: int, max_detour_m: float = 3000.0):
    parcels = get_nearby_parcels_for_ride(ride_id, max_detour_m)
    return {"parcels": parcels, "count": len(parcels)}


@app.post("/parcels/{parcel_id}/accept")
def accept_parcel_endpoint(parcel_id: int, req: ParcelAcceptRequest):
    parcel, error = accept_parcel(parcel_id, req.rider_id, req.ride_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return parcel


@app.post("/parcels/{parcel_id}/verify-pickup")
def verify_pickup_endpoint(parcel_id: int, req: ParcelOTPVerify):
    parcel, error = verify_parcel_pickup(parcel_id, req.otp)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return parcel


@app.post("/parcels/{parcel_id}/verify-delivery")
def verify_delivery_endpoint(parcel_id: int, req: ParcelOTPVerify):
    parcel, error = verify_parcel_delivery(parcel_id, req.otp)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return parcel


@app.post("/parcels/{parcel_id}/cancel")
def cancel_parcel_endpoint(parcel_id: int, payload: dict):
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    parcel, error = cancel_parcel(parcel_id, int(user_id))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return parcel


# ── Recurring Commute Scheduler endpoints ───────────────────────────────────

@app.post("/schedules/create")
def create_recurring_schedule_endpoint(req: RecurringScheduleCreate):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    data = req.dict()
    data["polyline"] = [p.dict() for p in req.polyline]
    schedule = create_recurring_schedule(data)
    process_recurring_schedules()
    return schedule


@app.get("/schedules/user/{user_id}")
def list_user_schedules_endpoint(user_id: int):
    return {"schedules": get_user_recurring_schedules(user_id)}


@app.get("/schedules/search")
def search_recurring_schedules_endpoint(passenger_gender: str = "unspecified", women_only_filter: bool = False):
    schedules = search_recurring_schedules(passenger_gender=passenger_gender, women_only_filter=women_only_filter)
    return {"schedules": schedules, "count": len(schedules)}


@app.post("/schedules/{schedule_id}/toggle")
def toggle_recurring_schedule_endpoint(schedule_id: int):
    schedule = toggle_recurring_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return schedule


@app.post("/schedules/{schedule_id}/subscribe")
def subscribe_recurring_schedule_endpoint(schedule_id: int, req: RecurringSubscribeRequest):
    sub, err = subscribe_to_schedule(schedule_id, req.subscriber_id, req.dict())
    if not sub:
        raise HTTPException(status_code=400, detail=err)
    process_recurring_schedules()
    return {"subscription": sub, "message": "Subscribed to daily commute!"}


@app.post("/schedules/trigger-generation")
def trigger_schedule_generation_endpoint():
    result = process_recurring_schedules()
    return result
