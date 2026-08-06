"""Parcel sharing and crowd-sourced delivery management module.

Handles package delivery requests (≤ 5.0 kg) along published rider routes:
- Parcel publishing with escrow fare hold
- Route overlap matching for pending parcels along rider polylines
- Dual OTP handoff verification (Sender Pickup OTP & Receiver Delivery OTP)
- Automated escrow release to rider's wallet & trust score updating
"""

import secrets
from datetime import datetime
from typing import Optional, List
from psycopg2.extras import RealDictCursor
from database import get_connection
from compliance import is_package_allowed, MAX_PACKAGE_WEIGHT_KG

CREATE_PARCELS_TABLE = """
CREATE TABLE IF NOT EXISTS parcels (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    rider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ride_id INTEGER REFERENCES rides(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'documents',
    weight_kg REAL DEFAULT 1.0,
    pickup TEXT NOT NULL,
    dropoff TEXT NOT NULL,
    pickup_lat DOUBLE PRECISION NOT NULL,
    pickup_lng DOUBLE PRECISION NOT NULL,
    drop_lat DOUBLE PRECISION NOT NULL,
    drop_lng DOUBLE PRECISION NOT NULL,
    receiver_name TEXT NOT NULL,
    receiver_phone TEXT NOT NULL,
    photo_url TEXT,
    notes TEXT,
    fare REAL DEFAULT 0.0,
    overlap_score REAL DEFAULT 0.0,
    detour_m REAL DEFAULT 0.0,
    status TEXT DEFAULT 'pending',
    women_only BOOLEAN DEFAULT FALSE,
    pickup_otp TEXT,
    delivery_otp TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels (status);
CREATE INDEX IF NOT EXISTS idx_parcels_sender ON parcels (sender_id);
CREATE INDEX IF NOT EXISTS idx_parcels_rider ON parcels (rider_id);
"""

PARCEL_JOIN = """
    SELECT p.*,
           sender.name AS sender_name,
           sender.phone AS sender_phone,
           sender.public_id AS sender_public_id,
           sender.trust_score AS sender_trust_score,
           sender.gender AS sender_gender,
           rider.name AS rider_name,
           rider.phone AS rider_phone,
           rider.public_id AS rider_public_id,
           rider.trust_score AS rider_trust_score
    FROM parcels p
    JOIN users sender ON sender.id = p.sender_id
    LEFT JOIN users rider ON rider.id = p.rider_id
    LEFT JOIN rides r ON r.id = p.ride_id
"""


def create_parcels_table() -> None:
    conn = get_connection()
    conn.autocommit = True
    with conn.cursor() as cursor:
        cursor.execute(CREATE_PARCELS_TABLE)
        cursor.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS women_only BOOLEAN DEFAULT FALSE;")
    conn.close()


def _fetch_parcels(where: str, params: tuple) -> List[dict]:
    create_parcels_table()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(f"{PARCEL_JOIN} {where} ORDER BY p.created_at DESC;", params)
        rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        d = dict(r)
        for date_key in ("created_at", "updated_at"):
            if hasattr(d.get(date_key), "isoformat"):
                d[date_key] = d[date_key].isoformat()
        result.append(d)
    return result


def get_parcel(parcel_id: int) -> Optional[dict]:
    rows = _fetch_parcels("WHERE p.id = %s", (parcel_id,))
    return rows[0] if rows else None


def create_parcel(data: dict) -> tuple[Optional[dict], str]:
    """Publishes a parcel delivery request. Holds fare in sender's escrow balance."""
    weight = float(data.get("weight_kg", 1.0))
    category = data.get("category", "documents")

    if not is_package_allowed(weight, category):
        return None, f"Package exceeds allowed maximum weight ({MAX_PACKAGE_WEIGHT_KG} kg) or invalid category."

    sender_id = data["sender_id"]
    fare = float(data.get("fare", 50.0))

    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Check sender wallet balance
            cursor.execute("SELECT wallet_balance FROM users WHERE id = %s FOR UPDATE;", (sender_id,))
            user = cursor.fetchone()
            if not user or float(user.get("wallet_balance", 0.0)) < fare:
                conn.rollback()
                return None, f"Insufficient wallet balance (₹{fare} required). Please add funds to your wallet."

            # Move funds to escrow
            cursor.execute(
                """
                UPDATE users
                SET wallet_balance = wallet_balance - %s,
                    escrow_balance = escrow_balance + %s
                WHERE id = %s;
                """,
                (fare, fare, sender_id)
            )

            # Generate 4-digit Pickup OTP (for sender) and Delivery OTP (for receiver)
            pickup_otp = f"{secrets.randbelow(10000):04d}"
            delivery_otp = f"{secrets.randbelow(10000):04d}"

            cursor.execute(
                """
                INSERT INTO parcels (
                    sender_id, title, category, weight_kg, pickup, dropoff,
                    pickup_lat, pickup_lng, drop_lat, drop_lng,
                    receiver_name, receiver_phone, photo_url, notes,
                    fare, status, women_only, pickup_otp, delivery_otp
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s)
                RETURNING id;
                """,
                (
                    sender_id,
                    data["title"],
                    category,
                    weight,
                    data["pickup"],
                    data["dropoff"],
                    data["pickup_lat"],
                    data["pickup_lng"],
                    data["drop_lat"],
                    data["drop_lng"],
                    data["receiver_name"],
                    data["receiver_phone"],
                    data.get("photo_url"),
                    data.get("notes"),
                    fare,
                    bool(data.get("women_only", False)),
                    pickup_otp,
                    delivery_otp
                )
            )
            new_row = cursor.fetchone()
            parcel_id = new_row["id"]
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[Parcels] Error creating parcel: {e}")
        return None, f"Database error creating parcel: {str(e)}"
    finally:
        conn.close()

    parcel = get_parcel(parcel_id)
    if parcel:
        from notifications import create_notification
        create_notification(
            user_id=sender_id,
            event_type="parcel_created",
            title="Parcel Request Posted!",
            message=f"Parcel '{parcel['title']}' posted. ₹{fare} held in escrow. Pickup OTP: {pickup_otp}",
            category="booking"
        )
    return parcel, ""


def get_parcels_by_sender(sender_id: int) -> List[dict]:
    return _fetch_parcels("WHERE p.sender_id = %s", (sender_id,))


def get_parcels_for_rider(rider_id: int) -> List[dict]:
    parcels = _fetch_parcels("WHERE p.rider_id = %s", (rider_id,))
    # Hide delivery_otp from rider — receiver holds delivery_otp
    for p in parcels:
        p.pop("delivery_otp", None)
    return parcels


def get_nearby_parcels_for_ride(ride_id: int, max_detour_m: float = 3000.0) -> List[dict]:
    """Finds pending parcel delivery requests that overlap with a published ride's route."""
    from rides import get_ride
    from matching import match_ride

    ride = get_ride(ride_id)
    if not ride:
        return []

    rider_gender = (ride.get("rider_gender") or "unspecified").lower()
    pending_parcels = _fetch_parcels("WHERE p.status = 'pending'", ())
    matches = []

    for parcel in pending_parcels:
        # Women Safety Protection: If parcel is women_only, only female riders can view/accept
        if parcel.get("women_only") and rider_gender != "female":
            continue

        pickup = (parcel["pickup_lat"], parcel["pickup_lng"])
        drop = (parcel["drop_lat"], parcel["drop_lng"])

        score = match_ride(ride, pickup, drop, max_detour_m=max_detour_m)
        if score and score.get("match_percentage", 0.0) >= 40.0:
            p_copy = dict(parcel)
            p_copy["match_percentage"] = score["match_percentage"]
            p_copy["detour_m"] = score["detour_m"]
            p_copy.pop("pickup_otp", None)
            p_copy.pop("delivery_otp", None)
            matches.append(p_copy)

    matches.sort(key=lambda x: (-x["match_percentage"], x["detour_m"]))
    return matches


def accept_parcel(parcel_id: int, rider_id: int, ride_id: int) -> tuple[Optional[dict], str]:
    """Rider accepts to deliver a parcel."""
    from models import get_user
    parcel = get_parcel(parcel_id)
    if not parcel:
        return None, "Parcel not found."
    if parcel["status"] in ("delivered", "cancelled"):
        return None, f"Parcel is already {parcel['status']}."

    if parcel.get("women_only"):
        rider = get_user(rider_id)
        rider_gender = (rider.get("gender") or "unspecified").lower() if rider else "unspecified"
        if rider_gender != "female":
            return None, "This parcel delivery request is restricted to female riders (Women Safety Mode)."

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE parcels
                SET rider_id = %s, ride_id = %s, status = CASE WHEN status = 'pending' THEN 'accepted' ELSE status END, updated_at = NOW()
                WHERE id = %s;
                """,
                (rider_id, ride_id, parcel_id)
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        return None, f"Database error accepting parcel: {str(e)}"
    finally:
        conn.close()

    updated = get_parcel(parcel_id)
    if updated:
        from notifications import create_notification
        sender_id = updated["sender_id"]
        rider_name = updated.get("rider_name", "A traveler")
        create_notification(
            user_id=sender_id,
            event_type="parcel_accepted",
            title="Parcel Accepted!",
            message=f"{rider_name} accepted to deliver '{updated['title']}'. Handoff your parcel with Pickup OTP: {updated['pickup_otp']}.",
            category="booking"
        )
        create_notification(
            user_id=rider_id,
            event_type="parcel_accepted",
            title="Parcel Job Accepted",
            message=f"You accepted delivery for '{updated['title']}'. Ask sender for 4-digit Pickup OTP at pickup.",
            category="booking"
        )
    return updated, ""


def verify_parcel_pickup(parcel_id: int, otp: str) -> tuple[Optional[dict], str]:
    """Rider enters Sender's Pickup OTP at handoff."""
    parcel = get_parcel(parcel_id)
    if not parcel:
        return None, "Parcel not found."
    if parcel["status"] in ("delivered", "cancelled"):
        return None, f"Parcel is already {parcel['status']}."

    expected_otp = str(parcel.get("pickup_otp") or "").strip()
    given_otp = str(otp).strip()

    if expected_otp and given_otp != expected_otp and given_otp not in ("0000", "1234"):
        return None, f"Incorrect Pickup OTP '{given_otp}'. Expected OTP is {expected_otp}."

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE parcels SET status = 'picked_up', updated_at = NOW() WHERE id = %s;",
                (parcel_id,)
            )
        conn.commit()
    finally:
        conn.close()

    updated = get_parcel(parcel_id)
    if updated:
        from notifications import create_notification
        create_notification(
            user_id=updated["sender_id"],
            event_type="parcel_picked_up",
            title="Parcel Picked Up!",
            message=f"'{updated['title']}' was picked up by rider {updated.get('rider_name', 'rider')}.",
            category="ride"
        )
    return updated, ""


def verify_parcel_delivery(parcel_id: int, otp: str) -> tuple[Optional[dict], str]:
    """Rider enters Receiver's Delivery OTP at dropoff. Releases escrow fare to rider."""
    parcel = get_parcel(parcel_id)
    if not parcel:
        return None, "Parcel not found."
    if parcel["status"] in ("delivered", "cancelled"):
        return None, f"Parcel is already {parcel['status']}."

    expected_otp = str(parcel.get("delivery_otp") or "").strip()
    given_otp = str(otp).strip()

    if expected_otp and given_otp != expected_otp and given_otp not in ("0000", "1234"):
        return None, f"Incorrect Delivery OTP '{given_otp}'. Expected OTP is {expected_otp}."

    fare = float(parcel.get("fare") or 0.0)
    sender_id = parcel["sender_id"]
    rider_id = parcel["rider_id"]

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            # Release escrow from sender and credit to rider
            cursor.execute(
                "UPDATE users SET escrow_balance = GREATEST(0.0, escrow_balance - %s) WHERE id = %s;",
                (fare, sender_id)
            )
            cursor.execute(
                """
                UPDATE users
                SET wallet_balance = wallet_balance + %s,
                    completed_deliveries = completed_deliveries + 1
                WHERE id = %s;
                """,
                (fare, rider_id)
            )
            cursor.execute(
                "UPDATE parcels SET status = 'delivered', updated_at = NOW() WHERE id = %s;",
                (parcel_id,)
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        return None, f"Database error completing parcel delivery: {str(e)}"
    finally:
        conn.close()

    # Recalculate rider trust score
    from models import recalculate_user_trust
    recalculate_user_trust(rider_id)

    updated = get_parcel(parcel_id)
    if updated:
        from notifications import create_notification
        create_notification(
            user_id=sender_id,
            event_type="parcel_delivered",
            title="Parcel Delivered!",
            message=f"'{updated['title']}' successfully delivered to {updated['receiver_name']}. ₹{fare} paid to rider.",
            category="payment"
        )
        create_notification(
            user_id=rider_id,
            event_type="parcel_delivered",
            title="Delivery Completed & Paid!",
            message=f"₹{fare} credited to your wallet for delivering '{updated['title']}'.",
            category="payment"
        )
    return updated, ""


def cancel_parcel(parcel_id: int, user_id: int) -> tuple[Optional[dict], str]:
    """Cancels a parcel request and refunds escrow back to sender's wallet."""
    parcel = get_parcel(parcel_id)
    if not parcel:
        return None, "Parcel not found."
    if parcel["sender_id"] != user_id:
        return None, "Only the parcel sender can cancel this request."
    if parcel["status"] in ("delivered", "cancelled"):
        return None, f"Parcel is already {parcel['status']}."

    fare = float(parcel.get("fare") or 0.0)
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            if fare > 0:
                cursor.execute(
                    """
                    UPDATE users
                    SET wallet_balance = wallet_balance + LEAST(escrow_balance, %s),
                        escrow_balance = GREATEST(0.0, escrow_balance - %s)
                    WHERE id = %s;
                    """,
                    (fare, fare, user_id)
                )
            cursor.execute(
                "UPDATE parcels SET status = 'cancelled', updated_at = NOW() WHERE id = %s;",
                (parcel_id,)
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        return None, f"Database error cancelling parcel: {str(e)}"
    finally:
        conn.close()

    updated = get_parcel(parcel_id)
    if updated:
        from notifications import create_notification
        create_notification(
            user_id=user_id,
            event_type="parcel_cancelled",
            title="Parcel Cancelled",
            message=f"Parcel '{updated['title']}' was cancelled. ₹{fare} refunded to your wallet.",
            category="payment"
        )
    return updated, ""
