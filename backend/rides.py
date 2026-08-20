"""Live ride publishing, discovery and booking.

A "ride" is a journey a normal traveller is already making. Once published it
becomes visible on the live map so passengers heading the same way can book a
seat on it.
"""

import json
import secrets
from datetime import datetime
from typing import Optional

from psycopg2.extras import RealDictCursor

from database import get_connection

CREATE_RIDES_TABLE = """
CREATE TABLE IF NOT EXISTS rides (
    id SERIAL PRIMARY KEY,
    rider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    dest_lat DOUBLE PRECISION NOT NULL,
    dest_lng DOUBLE PRECISION NOT NULL,
    current_lat DOUBLE PRECISION,
    current_lng DOUBLE PRECISION,
    polyline JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_distance_m REAL DEFAULT 0,
    vehicle_type TEXT DEFAULT 'car',
    vehicle_number TEXT,
    seats_total INTEGER DEFAULT 4,
    booked_seats INTEGER DEFAULT 0,
    seats_available INTEGER DEFAULT 4,
    fare_per_km REAL DEFAULT 6.0,
    departure_time TIMESTAMPTZ NOT NULL,
    notes TEXT,
    women_only BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_BOOKINGS_TABLE = """
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    ride_id INTEGER REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pickup TEXT NOT NULL,
    dropoff TEXT NOT NULL,
    pickup_lat DOUBLE PRECISION NOT NULL,
    pickup_lng DOUBLE PRECISION NOT NULL,
    drop_lat DOUBLE PRECISION NOT NULL,
    drop_lng DOUBLE PRECISION NOT NULL,
    seats INTEGER DEFAULT 1,
    fare REAL DEFAULT 0,
    overlap_score REAL DEFAULT 0,
    detour_m REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_RIDE_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides (status);
CREATE INDEX IF NOT EXISTS idx_rides_rider ON rides (rider_id);
CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides (departure_time);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings (passenger_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ride ON bookings (ride_id);
"""

RIDE_COLUMNS = """
    r.id, r.rider_id, r.origin, r.destination,
    r.origin_lat, r.origin_lng, r.dest_lat, r.dest_lng,
    r.current_lat, r.current_lng, r.polyline, r.total_distance_m,
    r.vehicle_type, r.vehicle_number, r.seats_total, r.booked_seats, r.seats_available,
    r.fare_per_km, r.departure_time, r.notes, r.women_only, r.status, r.created_at, r.updated_at
"""


BOOKING_MIGRATIONS = [
    # Trip lifecycle: pending → accepted → ongoing → completed → paid → closed
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp TEXT;",
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;",
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;",
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;",
    # Ratings: each side scores the other once the trip is done.
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rider_rating REAL;",
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rider_review TEXT;",
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passenger_rating REAL;",
    "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passenger_review TEXT;",
    "ALTER TABLE rides ADD COLUMN IF NOT EXISTS women_only BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE rides ADD COLUMN IF NOT EXISTS booked_seats INTEGER DEFAULT 0;",
    "UPDATE rides SET booked_seats = COALESCE((SELECT SUM(seats) FROM bookings WHERE ride_id = rides.id AND status NOT IN ('cancelled', 'rejected')), 0);",
    "UPDATE rides SET seats_available = GREATEST(0, seats_total - booked_seats);",
]


def create_ride_tables() -> None:
    conn = get_connection()
    conn.autocommit = True
    with conn.cursor() as cursor:
        cursor.execute(CREATE_RIDES_TABLE)
        cursor.execute(CREATE_BOOKINGS_TABLE)
        cursor.execute(CREATE_RIDE_INDEXES)
        for migration in BOOKING_MIGRATIONS:
            cursor.execute(migration)
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id TEXT;")
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users (public_id);"
        )
        # Backfill public ids for users created before this column existed.
        cursor.execute(
            "UPDATE users SET public_id = 'AR-' || LPAD(id::text, 6, '0') WHERE public_id IS NULL;"
        )
    conn.close()


def ensure_public_id(user_id: int) -> str:
    """Every user carries a stable, shareable ID such as AR-000042."""
    public_id = f"AR-{user_id:06d}"
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET public_id = %s WHERE id = %s AND public_id IS DISTINCT FROM %s;",
                (public_id, user_id, public_id),
            )
        conn.commit()
    finally:
        conn.close()
    return public_id


def publish_ride(data: dict) -> dict:
    vtype = str(data.get("vehicle_type", "car")).lower()
    default_cap = 1 if vtype == "bike" else (3 if vtype == "auto" else 4)
    seats_total = int(data.get("seats_total") or default_cap)
    if seats_total <= 0:
        seats_total = default_cap

    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO rides (
                    rider_id, origin, destination,
                    origin_lat, origin_lng, dest_lat, dest_lng,
                    current_lat, current_lng, polyline, total_distance_m,
                    vehicle_type, vehicle_number, seats_total, booked_seats, seats_available,
                    fare_per_km, departure_time, notes, women_only, status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s, 'available')
                RETURNING *;
                """,
                (
                    data["rider_id"],
                    data["origin"],
                    data["destination"],
                    data["origin_lat"],
                    data["origin_lng"],
                    data["dest_lat"],
                    data["dest_lng"],
                    data.get("current_lat", data["origin_lat"]),
                    data.get("current_lng", data["origin_lng"]),
                    json.dumps(data.get("polyline", [])),
                    data.get("total_distance_m", 0.0),
                    vtype,
                    data.get("vehicle_number"),
                    seats_total,
                    seats_total,
                    data.get("fare_per_km", 6.0),
                    data["departure_time"],
                    data.get("notes"),
                    bool(data.get("women_only", False)),
                ),
            )
            ride = cursor.fetchone()
        conn.commit()
        return dict(ride)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _rows_with_rider(where: str, params: tuple, limit: Optional[int] = None) -> list[dict]:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            f"""
            SELECT {RIDE_COLUMNS},
                   u.name AS rider_name,
                   u.public_id AS rider_public_id,
                   u.trust_score AS rider_trust_score,
                   u.rating AS rider_rating,
                   u.face_verified AS rider_verified,
                   u.phone AS rider_phone,
                   u.gender AS rider_gender
            FROM rides r
            JOIN users u ON u.id = r.rider_id
            {where}
            ORDER BY r.departure_time ASC
            {'LIMIT %s' if limit is not None else ''};
            """,
            params + ((limit,) if limit is not None else ()),
        )
        rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_live_rides(limit: int = 200) -> list[dict]:
    return _rows_with_rider(
        "WHERE r.status IN ('available', 'started')",
        (),
        limit,
    )


def get_nearby_rides(lat: float, lng: float, radius_m: float = 5000.0, limit: int = 50) -> list[dict]:
    """Find live riders whose current position or origin is within `radius_m` meters of (lat, lng)."""
    from route_engine import haversine
    live = get_live_rides(limit=200)
    nearby = []
    for ride in live:
        rider_lat = ride.get("current_lat") or ride.get("origin_lat")
        rider_lng = ride.get("current_lng") or ride.get("origin_lng")
        if rider_lat is None or rider_lng is None:
            continue
        dist = haversine((lat, lng), (rider_lat, rider_lng))
        if dist <= radius_m:
            ride_copy = dict(ride)
            ride_copy["distance_m"] = round(dist, 1)
            ride_copy["distance_km"] = round(dist / 1000.0, 2)
            nearby.append(ride_copy)
    nearby.sort(key=lambda r: r["distance_m"])
    return nearby[:limit]


def get_ride(ride_id: int) -> Optional[dict]:
    rows = _rows_with_rider("WHERE r.id = %s", (ride_id,))
    return rows[0] if rows else None


def get_rides_by_rider(rider_id: int) -> list[dict]:
    return _rows_with_rider("WHERE r.rider_id = %s", (rider_id,))


def update_ride_location(ride_id: int, lat: float, lng: float) -> Optional[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                UPDATE rides
                SET current_lat = %s, current_lng = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING id;
                """,
                (lat, lng, ride_id),
            )
            row = cursor.fetchone()
        conn.commit()
    finally:
        conn.close()
    return get_ride(ride_id) if row else None


def update_ride_status(ride_id: int, status: str) -> Optional[dict]:
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE rides SET status = %s, updated_at = NOW() WHERE id = %s RETURNING id;",
                (status, ride_id),
            )
            row = cursor.fetchone()
        conn.commit()
    finally:
        conn.close()
    return get_ride(ride_id) if row else None


def create_booking(data: dict) -> Optional[dict]:
    """Book seats on a ride. Seat count is decremented in the same transaction."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT seats_total, booked_seats, seats_available, status FROM rides WHERE id = %s FOR UPDATE;",
                (data["ride_id"],),
            )
            ride = cursor.fetchone()
            if not ride:
                conn.rollback()
                return None
            if ride["status"] not in ("available", "started"):
                conn.rollback()
                return None

            requested_seats = max(1, int(data.get("seats", 1)))
            total_seats = int(ride.get("seats_total") or 1)
            current_booked = int(ride.get("booked_seats") or 0)
            avail = max(0, total_seats - current_booked)

            if avail < requested_seats:
                conn.rollback()
                return None

            # The passenger reads this code out at pickup; the rider types it in
            # to start the trip, which proves both parties actually met.
            otp = f"{secrets.randbelow(10000):04d}"
            cursor.execute(
                """
                INSERT INTO bookings (
                    ride_id, passenger_id, pickup, dropoff,
                    pickup_lat, pickup_lng, drop_lat, drop_lng,
                    seats, fare, overlap_score, detour_m, status, otp
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s)
                RETURNING *;
                """,
                (
                    data["ride_id"],
                    data["passenger_id"],
                    data["pickup"],
                    data["dropoff"],
                    data["pickup_lat"],
                    data["pickup_lng"],
                    data["drop_lat"],
                    data["drop_lng"],
                    requested_seats,
                    data.get("fare", 0.0),
                    data.get("overlap_score", 0.0),
                    data.get("detour_m", 0.0),
                    otp,
                ),
            )
            booking = cursor.fetchone()

            new_booked = current_booked + requested_seats
            new_avail = max(0, total_seats - new_booked)

            cursor.execute(
                "UPDATE rides SET booked_seats = %s, seats_available = %s, updated_at = NOW() WHERE id = %s;",
                (new_booked, new_avail, data["ride_id"]),
            )
        conn.commit()
        return dict(booking)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


BOOKING_JOIN = """
    SELECT b.*,
           r.rider_id AS rider_id,
           r.origin AS ride_origin,
           r.destination AS ride_destination,
           r.departure_time AS ride_departure_time,
           r.vehicle_type,
           r.vehicle_number,
           r.status AS ride_status,
           r.current_lat, r.current_lng,
           r.polyline AS ride_polyline,
           rider.name AS rider_name,
           rider.public_id AS rider_public_id,
           rider.trust_score AS rider_trust_score,
           rider.phone AS rider_phone,
           pax.name AS passenger_name,
           pax.public_id AS passenger_public_id,
           pax.trust_score AS passenger_trust_score,
           pax.phone AS passenger_phone
    FROM bookings b
    JOIN rides r ON r.id = b.ride_id
    JOIN users rider ON rider.id = r.rider_id
    JOIN users pax ON pax.id = b.passenger_id
"""


def _bookings(where: str, params: tuple) -> list[dict]:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(f"{BOOKING_JOIN} {where} ORDER BY b.created_at DESC;", params)
        rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_bookings_for_passenger(passenger_id: int) -> list[dict]:
    return _bookings("WHERE b.passenger_id = %s", (passenger_id,))


def get_bookings_for_rider(rider_id: int) -> list[dict]:
    return _bookings("WHERE r.rider_id = %s", (rider_id,))


def get_booking(booking_id: int) -> Optional[dict]:
    rows = _bookings("WHERE b.id = %s", (booking_id,))
    return rows[0] if rows else None


def start_booking_with_otp(booking_id: int, otp: str) -> tuple[Optional[dict], str]:
    """Rider types the passenger's code to begin the trip."""
    booking = get_booking(booking_id)
    if not booking:
        return None, "Booking not found."
    if booking["status"] != "accepted":
        return None, "This trip has to be accepted before it can start."
    if str(booking.get("otp") or "") != str(otp).strip():
        return None, "That code does not match. Ask the passenger to read it again."

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE bookings SET status = 'ongoing', started_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (booking_id,),
            )
            cursor.execute(
                "UPDATE rides SET status = 'started', updated_at = NOW() WHERE id = %s;",
                (booking["ride_id"],),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    updated = get_booking(booking_id)
    if updated:
        from notifications import create_notification
        pax_id = updated.get("passenger_id")
        rider_name = updated.get("rider_name", "Your rider")
        pickup = updated.get("pickup", "pickup point")
        dropoff = updated.get("dropoff", "destination")
        if pax_id:
            create_notification(
                user_id=pax_id,
                event_type="ride_started",
                title="Ride Started!",
                message=f"Your trip with {rider_name} from {pickup} to {dropoff} has started. Have a safe journey!",
                booking_id=booking_id
            )
    return updated, ""


def complete_booking(booking_id: int) -> tuple[Optional[dict], str]:
    """Rider marks the passenger dropped off."""
    booking = get_booking(booking_id)
    if not booking:
        return None, "Booking not found."
    if booking["status"] != "ongoing":
        return None, "The trip has to be running before it can be completed."

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE bookings SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (booking_id,),
            )
        conn.commit()
    finally:
        conn.close()
    return get_booking(booking_id), ""


def pay_booking(booking_id: int) -> tuple[Optional[dict], str]:
    """Passenger settles the cost share; the money moves to the rider."""
    booking = get_booking(booking_id)
    if not booking:
        return None, "Booking not found."
    if booking["status"] != "completed":
        return None, "Payment opens once the trip is completed."

    amount = float(booking["fare"] or 0)
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT wallet_balance FROM users WHERE id = %s FOR UPDATE;",
                (booking["passenger_id"],),
            )
            wallet = cursor.fetchone()
            if not wallet or float(wallet["wallet_balance"] or 0) < amount:
                conn.rollback()
                return None, "Not enough balance in your wallet. Add money and try again."

            cursor.execute(
                "UPDATE users SET wallet_balance = wallet_balance - %s WHERE id = %s;",
                (amount, booking["passenger_id"]),
            )
            cursor.execute(
                """
                UPDATE users SET wallet_balance = wallet_balance + %s,
                                 completed_deliveries = completed_deliveries + 1
                WHERE id = (SELECT rider_id FROM rides WHERE id = %s);
                """,
                (amount, booking["ride_id"]),
            )
            cursor.execute(
                "UPDATE bookings SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (booking_id,),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return get_booking(booking_id), ""


def rate_booking(booking_id: int, rater: str, rating: float, review: Optional[str]) -> tuple[Optional[dict], str]:
    """`rater` is 'passenger' (scoring the rider) or 'rider' (scoring the passenger)."""
    booking = get_booking(booking_id)
    if not booking:
        return None, "Booking not found."
    if booking["status"] not in ("paid", "completed", "closed"):
        return None, "You can rate once the trip is finished."

    column = "rider_rating" if rater == "passenger" else "passenger_rating"
    review_column = "rider_review" if rater == "passenger" else "passenger_review"

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"UPDATE bookings SET {column} = %s, {review_column} = %s, updated_at = NOW() WHERE id = %s;",
                (rating, review, booking_id),
            )
            # Both sides rated and the fare is settled — nothing left to do.
            cursor.execute(
                """
                UPDATE bookings SET status = 'closed'
                WHERE id = %s AND status = 'paid'
                  AND rider_rating IS NOT NULL AND passenger_rating IS NOT NULL;
                """,
                (booking_id,),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    rated_user_id = booking["rider_id"] if rater == "passenger" else booking["passenger_id"]
    refresh_user_rating(rated_user_id)
    return get_booking(booking_id), ""


def refresh_user_rating(user_id: int) -> Optional[float]:
    """Average every score this user has received, then re-run their trust score."""
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT AVG(score)::numeric AS average, COUNT(*) AS total FROM (
                SELECT b.rider_rating AS score
                FROM bookings b JOIN rides r ON r.id = b.ride_id
                WHERE r.rider_id = %s AND b.rider_rating IS NOT NULL
                UNION ALL
                SELECT b.passenger_rating AS score
                FROM bookings b
                WHERE b.passenger_id = %s AND b.passenger_rating IS NOT NULL
            ) scores;
            """,
            (user_id, user_id),
        )
        row = cursor.fetchone()
    conn.close()

    if not row or row["average"] is None:
        return None

    average = round(float(row["average"]), 2)
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET rating = %s WHERE id = %s;", (average, user_id))
        conn.commit()
    finally:
        conn.close()

    from models import recalculate_user_trust
    recalculate_user_trust(user_id)
    return average


def get_user_reviews(user_id: int, limit: int = 20) -> list[dict]:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT b.rider_rating AS rating, b.rider_review AS review, b.updated_at,
                   'As rider' AS context, pax.name AS author
            FROM bookings b
            JOIN rides r ON r.id = b.ride_id
            JOIN users pax ON pax.id = b.passenger_id
            WHERE r.rider_id = %s AND b.rider_rating IS NOT NULL
            UNION ALL
            SELECT b.passenger_rating AS rating, b.passenger_review AS review, b.updated_at,
                   'As passenger' AS context, rider.name AS author
            FROM bookings b
            JOIN rides r ON r.id = b.ride_id
            JOIN users rider ON rider.id = r.rider_id
            WHERE b.passenger_id = %s AND b.passenger_rating IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT %s;
            """,
            (user_id, user_id, limit),
        )
        rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_booking_status(booking_id: int, status: str) -> Optional[dict]:
    """Cancelling or rejecting a booking returns seats to the ride and refunds escrow."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT ride_id, passenger_id, seats, fare, status FROM bookings WHERE id = %s FOR UPDATE;",
                (booking_id,),
            )
            booking = cursor.fetchone()
            if not booking:
                conn.rollback()
                return None

            releasing = status in ("cancelled", "rejected")
            already_released = booking["status"] in ("cancelled", "rejected")

            cursor.execute(
                "UPDATE bookings SET status = %s, updated_at = NOW() WHERE id = %s;",
                (status, booking_id),
            )
            if releasing and not already_released:
                cursor.execute(
                    """
                    UPDATE rides
                    SET booked_seats = GREATEST(0, booked_seats - %s),
                        seats_available = GREATEST(0, seats_total - GREATEST(0, booked_seats - %s)),
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (booking["seats"], booking["seats"], booking["ride_id"]),
                )
                # Refund escrow back to passenger if held
                fare = float(booking.get("fare") or 0.0)
                if fare > 0:
                    cursor.execute(
                        """
                        UPDATE users SET wallet_balance = wallet_balance + LEAST(escrow_balance, %s),
                                         escrow_balance = GREATEST(0.0, escrow_balance - %s)
                        WHERE id = %s;
                        """,
                        (fare, fare, booking["passenger_id"])
                    )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    updated = get_booking(booking_id)
    if updated:
        from notifications import create_notification
        pax_id = updated.get("passenger_id")
        rider_id = updated.get("rider_id")
        rider_name = updated.get("rider_name", "Your rider")
        pax_name = updated.get("passenger_name", "Passenger")
        pickup = updated.get("pickup", "pickup point")
        dropoff = updated.get("dropoff", "destination")

        if status == "accepted" and pax_id:
            create_notification(
                user_id=pax_id,
                event_type="ride_accepted",
                title="Ride Accepted!",
                message=f"Your ride request from {pickup} to {dropoff} has been accepted by {rider_name}.",
                booking_id=booking_id
            )
        elif status in ("cancelled", "rejected"):
            title = "Ride Cancelled" if status == "cancelled" else "Ride Request Declined"
            if pax_id:
                create_notification(
                    user_id=pax_id,
                    event_type="ride_cancelled",
                    title=title,
                    message=f"Booking #{booking_id} from {pickup} to {dropoff} was {status}.",
                    booking_id=booking_id
                )
            if rider_id:
                create_notification(
                    user_id=rider_id,
                    event_type="ride_cancelled",
                    title=title,
                    message=f"Booking #{booking_id} for passenger {pax_name} was {status}.",
                    booking_id=booking_id
                )

    return updated
