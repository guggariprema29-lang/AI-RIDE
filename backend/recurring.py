"""Recurring Commute Scheduler module (Office & College Commutes).

Allows riders and daily parcel senders to set repeating weekly schedules
(e.g., Monday to Friday at 8:30 AM from Koramangala ➔ Electronic City).
Auto-generates live single rides/parcels on scheduled days and auto-books seats for subscribers.
"""

import json
from datetime import datetime, date, timezone
from typing import Optional, List
from psycopg2.extras import RealDictCursor
from database import get_connection

CREATE_RECURRING_SCHEDULES_TABLE = """
CREATE TABLE IF NOT EXISTS recurring_schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    schedule_type TEXT DEFAULT 'rider_ride', -- 'rider_ride' or 'sender_parcel'
    title TEXT NOT NULL,
    days_of_week JSONB NOT NULL DEFAULT '["mon", "tue", "wed", "thu", "fri"]'::jsonb,
    departure_time_str TEXT NOT NULL DEFAULT '08:30',
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    dest_lat DOUBLE PRECISION NOT NULL,
    dest_lng DOUBLE PRECISION NOT NULL,
    polyline JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_distance_m REAL DEFAULT 0,
    vehicle_type TEXT DEFAULT 'car',
    vehicle_number TEXT,
    seats_total INTEGER DEFAULT 1,
    fare_per_km REAL DEFAULT 6.0,
    parcel_category TEXT DEFAULT 'documents',
    parcel_weight_kg REAL DEFAULT 1.0,
    parcel_fare REAL DEFAULT 60.0,
    receiver_name TEXT,
    receiver_phone TEXT,
    women_only BOOLEAN DEFAULT FALSE,
    notes TEXT,
    status TEXT DEFAULT 'active', -- 'active' or 'paused'
    last_generated_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_user ON recurring_schedules (user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_status ON recurring_schedules (status);
"""

CREATE_RECURRING_SUBSCRIPTIONS_TABLE = """
CREATE TABLE IF NOT EXISTS recurring_subscriptions (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES recurring_schedules(id) ON DELETE CASCADE,
    subscriber_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    seats INTEGER DEFAULT 1,
    pickup TEXT NOT NULL,
    dropoff TEXT NOT NULL,
    pickup_lat DOUBLE PRECISION NOT NULL,
    pickup_lng DOUBLE PRECISION NOT NULL,
    drop_lat DOUBLE PRECISION NOT NULL,
    drop_lng DOUBLE PRECISION NOT NULL,
    status TEXT DEFAULT 'active', -- 'active' or 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_subs_schedule ON recurring_subscriptions (schedule_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subs_subscriber ON recurring_subscriptions (subscriber_id);
"""


def create_recurring_tables() -> None:
    conn = get_connection()
    conn.autocommit = True
    with conn.cursor() as cursor:
        cursor.execute(CREATE_RECURRING_SCHEDULES_TABLE)
        cursor.execute(CREATE_RECURRING_SUBSCRIPTIONS_TABLE)
    conn.close()


def create_recurring_schedule(data: dict) -> dict:
    create_recurring_tables()
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO recurring_schedules (
                    user_id, schedule_type, title, days_of_week, departure_time_str,
                    origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
                    polyline, total_distance_m, vehicle_type, vehicle_number,
                    seats_total, fare_per_km, parcel_category, parcel_weight_kg,
                    parcel_fare, receiver_name, receiver_phone, women_only, notes, status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
                RETURNING *;
                """,
                (
                    data["user_id"],
                    data.get("schedule_type", "rider_ride"),
                    data.get("title", "Daily Commute"),
                    json.dumps(data.get("days_of_week", ["mon", "tue", "wed", "thu", "fri"])),
                    data.get("departure_time_str", "08:30"),
                    data["origin"],
                    data["destination"],
                    data["origin_lat"],
                    data["origin_lng"],
                    data["dest_lat"],
                    data["dest_lng"],
                    json.dumps(data.get("polyline", [])),
                    data.get("total_distance_m", 0.0),
                    data.get("vehicle_type", "car"),
                    data.get("vehicle_number"),
                    data.get("seats_total") or (1 if str(data.get("vehicle_type", "car")).lower() == "bike" else (3 if str(data.get("vehicle_type", "car")).lower() == "auto" else 4)),
                    data.get("fare_per_km", 6.0),
                    data.get("parcel_category", "documents"),
                    data.get("parcel_weight_kg", 1.0),
                    data.get("parcel_fare", 60.0),
                    data.get("receiver_name"),
                    data.get("receiver_phone"),
                    bool(data.get("women_only", False)),
                    data.get("notes"),
                ),
            )
            schedule = cursor.fetchone()
        conn.commit()
        return dict(schedule)
    finally:
        conn.close()


def get_user_recurring_schedules(user_id: int) -> List[dict]:
    create_recurring_tables()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT s.*,
                   u.name AS user_name, u.public_id AS user_public_id,
                   u.trust_score AS user_trust_score, u.gender AS user_gender,
                   (SELECT COUNT(*) FROM recurring_subscriptions sub WHERE sub.schedule_id = s.id AND sub.status = 'active') AS subscriber_count
            FROM recurring_schedules s
            JOIN users u ON u.id = s.user_id
            WHERE s.user_id = %s
            ORDER BY s.created_at DESC;
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recurring_schedule(schedule_id: int) -> Optional[dict]:
    create_recurring_tables()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT s.*,
                   u.name AS user_name, u.public_id AS user_public_id,
                   u.trust_score AS user_trust_score, u.gender AS user_gender,
                   (SELECT COUNT(*) FROM recurring_subscriptions sub WHERE sub.schedule_id = s.id AND sub.status = 'active') AS subscriber_count
            FROM recurring_schedules s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = %s;
            """,
            (schedule_id,)
        )
        row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def toggle_recurring_schedule(schedule_id: int) -> Optional[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                UPDATE recurring_schedules
                SET status = CASE WHEN status = 'active' THEN 'paused' ELSE 'active' END,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *;
                """,
                (schedule_id,)
            )
            row = cursor.fetchone()
        conn.commit()
    finally:
        conn.close()
    return get_recurring_schedule(schedule_id) if row else None


def subscribe_to_schedule(schedule_id: int, subscriber_id: int, data: dict) -> tuple[Optional[dict], str]:
    schedule = get_recurring_schedule(schedule_id)
    if not schedule:
        return None, "Schedule not found."
    if int(schedule["user_id"]) == int(subscriber_id):
        return None, "You cannot subscribe to your own schedule."
    if schedule["status"] != "active":
        return None, "This schedule is currently paused."

    pickup = data.get("pickup") or schedule["origin"]
    dropoff = data.get("dropoff") or schedule["destination"]
    pickup_lat = data.get("pickup_lat") if data.get("pickup_lat") is not None else schedule["origin_lat"]
    pickup_lng = data.get("pickup_lng") if data.get("pickup_lng") is not None else schedule["origin_lng"]
    drop_lat = data.get("drop_lat") if data.get("drop_lat") is not None else schedule["dest_lat"]
    drop_lng = data.get("drop_lng") if data.get("drop_lng") is not None else schedule["dest_lng"]

    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO recurring_subscriptions (
                    schedule_id, subscriber_id, seats, pickup, dropoff,
                    pickup_lat, pickup_lng, drop_lat, drop_lng, status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
                ON CONFLICT (schedule_id, subscriber_id) DO UPDATE
                    SET seats = EXCLUDED.seats,
                        pickup = EXCLUDED.pickup,
                        dropoff = EXCLUDED.dropoff,
                        pickup_lat = EXCLUDED.pickup_lat,
                        pickup_lng = EXCLUDED.pickup_lng,
                        drop_lat = EXCLUDED.drop_lat,
                        drop_lng = EXCLUDED.drop_lng,
                        status = 'active'
                RETURNING *;
                """,
                (
                    schedule_id,
                    subscriber_id,
                    data.get("seats", 1),
                    pickup,
                    dropoff,
                    pickup_lat,
                    pickup_lng,
                    drop_lat,
                    drop_lng,
                ),
            )
            sub = cursor.fetchone()
        conn.commit()
        return dict(sub), ""
    except Exception as e:
        conn.rollback()
        return None, f"Database error subscribing: {str(e)}"
    finally:
        conn.close()


def get_schedule_subscriptions(schedule_id: int) -> List[dict]:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT sub.*, u.name AS subscriber_name, u.public_id AS subscriber_public_id, u.trust_score AS subscriber_trust_score, u.phone AS subscriber_phone
            FROM recurring_subscriptions sub
            JOIN users u ON u.id = sub.subscriber_id
            WHERE sub.schedule_id = %s AND sub.status = 'active';
            """,
            (schedule_id,)
        )
        rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_recurring_schedules(passenger_gender: str = "unspecified", women_only_filter: bool = False) -> List[dict]:
    create_recurring_tables()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT s.*,
                   u.name AS user_name, u.public_id AS user_public_id,
                   u.trust_score AS user_trust_score, u.gender AS user_gender,
                   (SELECT COUNT(*) FROM recurring_subscriptions sub WHERE sub.schedule_id = s.id AND sub.status = 'active') AS subscriber_count
            FROM recurring_schedules s
            JOIN users u ON u.id = s.user_id
            WHERE s.status = 'active'
            ORDER BY s.created_at DESC;
            """
        )
        rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        d = dict(r)
        is_women_only = bool(d.get("women_only", False))
        if is_women_only and passenger_gender.lower() != "female":
            continue
        if women_only_filter and not is_women_only:
            continue
        results.append(d)

    return results


def process_recurring_schedules(target_date: Optional[date] = None) -> dict:
    """Scans active recurring schedules for today's day of week, auto-publishes rides/parcels, and auto-books subscribers."""
    from rides import publish_ride, create_booking
    from parcels import create_parcel
    from notifications import create_notification

    current_date = target_date or datetime.now(timezone.utc).date()
    day_abbr = current_date.strftime("%a").lower()  # 'mon', 'tue', etc.

    create_recurring_tables()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT s.*, u.gender AS user_gender
            FROM recurring_schedules s
            JOIN users u ON u.id = s.user_id
            WHERE s.status = 'active'
              AND (s.last_generated_date IS NULL OR s.last_generated_date < %s);
            """,
            (current_date,)
        )
        schedules = cursor.fetchall()
    conn.close()

    generated_rides = 0
    generated_parcels = 0
    generated_bookings = 0

    for sched in schedules:
        days = sched.get("days_of_week") or []
        if isinstance(days, str):
            try:
                days = json.loads(days)
            except Exception:
                days = ["mon", "tue", "wed", "thu", "fri"]

        if day_abbr not in [d.lower() for d in days]:
            continue

        # Parse departure time today
        time_parts = str(sched.get("departure_time_str", "08:30")).split(":")
        hh = int(time_parts[0]) if len(time_parts) > 0 else 8
        mm = int(time_parts[1]) if len(time_parts) > 1 else 30
        departure_dt = datetime.combine(current_date, datetime.min.time()).replace(hour=hh, minute=mm, tzinfo=timezone.utc)

        if sched["schedule_type"] == "rider_ride":
            ride_data = {
                "rider_id": sched["user_id"],
                "origin": sched["origin"],
                "destination": sched["destination"],
                "origin_lat": sched["origin_lat"],
                "origin_lng": sched["origin_lng"],
                "dest_lat": sched["dest_lat"],
                "dest_lng": sched["dest_lng"],
                "current_lat": sched["origin_lat"],
                "current_lng": sched["origin_lng"],
                "polyline": sched.get("polyline") or [],
                "total_distance_m": sched.get("total_distance_m", 0.0),
                "vehicle_type": sched.get("vehicle_type", "car"),
                "vehicle_number": sched.get("vehicle_number"),
                "seats_total": sched.get("seats_total") or (1 if str(sched.get("vehicle_type", "car")).lower() == "bike" else (3 if str(sched.get("vehicle_type", "car")).lower() == "auto" else 4)),
                "fare_per_km": sched.get("fare_per_km", 6.0),
                "departure_time": departure_dt.isoformat(),
                "notes": f"[Auto Commute] {sched.get('notes') or ''}".strip(),
                "women_only": sched.get("women_only", False),
            }
            try:
                published = publish_ride(ride_data)
                generated_rides += 1

                # Auto-book subscribers
                subs = get_schedule_subscriptions(sched["id"])
                for sub in subs:
                    booking_data = {
                        "ride_id": published["id"],
                        "passenger_id": sub["subscriber_id"],
                        "pickup": sub["pickup"],
                        "dropoff": sub["dropoff"],
                        "pickup_lat": sub["pickup_lat"],
                        "pickup_lng": sub["pickup_lng"],
                        "drop_lat": sub["drop_lat"],
                        "drop_lng": sub["drop_lng"],
                        "seats": sub["seats"],
                        "max_detour_m": 5000.0,
                    }
                    try:
                        b = create_booking(booking_data)
                        if b:
                            generated_bookings += 1
                            create_notification(
                                user_id=sub["subscriber_id"],
                                event_type="recurring_booking_auto",
                                title="Auto Commute Reserved!",
                                message=f"Your seat on {sched['title']} ({sched['origin']} ➔ {sched['destination']}) has been auto-reserved for today!",
                                category="booking"
                            )
                    except Exception as be:
                        print(f"[Recurring] Booking sub error: {be}")
            except Exception as re:
                print(f"[Recurring] Ride publish error: {re}")

        elif sched["schedule_type"] == "sender_parcel":
            parcel_data = {
                "sender_id": sched["user_id"],
                "title": sched["title"],
                "category": sched.get("parcel_category", "documents"),
                "weight_kg": sched.get("parcel_weight_kg", 1.0),
                "pickup": sched["origin"],
                "dropoff": sched["destination"],
                "pickup_lat": sched["origin_lat"],
                "pickup_lng": sched["origin_lng"],
                "drop_lat": sched["dest_lat"],
                "drop_lng": sched["dest_lng"],
                "receiver_name": sched.get("receiver_name") or "Receiver",
                "receiver_phone": sched.get("receiver_phone") or "9876543210",
                "notes": f"[Auto Parcel] {sched.get('notes') or ''}".strip(),
                "fare": sched.get("parcel_fare", 60.0),
                "women_only": sched.get("women_only", False),
            }
            try:
                p, err = create_parcel(parcel_data)
                if p:
                    generated_parcels += 1
            except Exception as pe:
                print(f"[Recurring] Parcel publish error: {pe}")

        # Update last_generated_date for schedule
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE recurring_schedules SET last_generated_date = %s WHERE id = %s;",
                    (current_date, sched["id"])
                )
            conn.commit()
        finally:
            conn.close()

    return {
        "success": True,
        "date": current_date.isoformat(),
        "generated_rides": generated_rides,
        "generated_parcels": generated_parcels,
        "generated_bookings": generated_bookings,
    }
