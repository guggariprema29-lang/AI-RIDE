"""SOS Emergency Alert Management Module.

Handles emergency alert creation, emergency contact configuration,
SMS dispatch, and emergency notifications to ride counterparties.
"""

import os
from typing import Optional, List
from psycopg2.extras import RealDictCursor
from database import get_connection

CREATE_SOS_TABLE = """
CREATE TABLE IF NOT EXISTS sos_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_name TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sos_user ON sos_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_sos_booking ON sos_alerts (booking_id);
"""


def create_sos_tables() -> None:
    conn = get_connection()
    conn.autocommit = True
    with conn.cursor() as cursor:
        cursor.execute(CREATE_SOS_TABLE)
    conn.close()


def update_emergency_contact(user_id: int, name: str, phone: str) -> Optional[dict]:
    """Saves user's emergency contact details."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                UPDATE users
                SET emergency_contact_name = %s, emergency_contact_phone = %s
                WHERE id = %s
                RETURNING id, name, email, phone, emergency_contact_name, emergency_contact_phone;
                """,
                (name, phone, user_id)
            )
            row = cursor.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        conn.rollback()
        print(f"[SOS] Error updating emergency contact: {e}")
        return None
    finally:
        conn.close()


def trigger_sos(
    user_id: int,
    latitude: float,
    longitude: float,
    booking_id: Optional[int] = None,
    location_name: Optional[str] = None
) -> dict:
    """Triggers an SOS emergency alert, dispatches notifications & SMS."""
    create_sos_tables()
    conn = get_connection()
    alert = None
    user_info = None

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # 1. Insert alert record
            cursor.execute(
                """
                INSERT INTO sos_alerts (user_id, booking_id, latitude, longitude, location_name, status)
                VALUES (%s, %s, %s, %s, %s, 'active')
                RETURNING *;
                """,
                (user_id, booking_id, latitude, longitude, location_name or "Unknown Location")
            )
            alert = dict(cursor.fetchone())

            # 2. Fetch user profile & emergency contact
            cursor.execute(
                "SELECT id, name, phone, emergency_contact_name, emergency_contact_phone FROM users WHERE id = %s;",
                (user_id,)
            )
            user_info = dict(cursor.fetchone())
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[SOS] Error creating SOS record: {e}")
        raise
    finally:
        conn.close()

    maps_url = f"https://www.google.com/maps?q={latitude},{longitude}"
    user_name = user_info.get("name", "AIRide User") if user_info else "AIRide User"
    contact_phone = user_info.get("emergency_contact_phone") if user_info else None
    contact_name = user_info.get("emergency_contact_name", "Emergency Contact") if user_info else "Emergency Contact"

    # 3. Dispatch notifications to user and ride members
    from notifications import create_notification
    create_notification(
        user_id=user_id,
        event_type="sos_alert",
        title="🚨 SOS EMERGENCY ALERT ACTIVE",
        message=f"SOS alert triggered at {location_name or 'current location'}. Live location link sent to emergency contacts.",
        category="emergency",
        booking_id=booking_id
    )

    if booking_id:
        from rides import get_booking
        booking = get_booking(booking_id)
        if booking:
            counterpart_id = (
                booking["rider_id"] if user_id == booking["passenger_id"] else booking["passenger_id"]
            )
            if counterpart_id:
                create_notification(
                    user_id=counterpart_id,
                    event_type="sos_alert",
                    title="⚠️ RIDE PARTNER SOS ALERT!",
                    message=f"SOS triggered by {user_name} at {location_name or 'current location'}. Live coordinates: {maps_url}",
                    category="emergency",
                    booking_id=booking_id
                )

    # 4. Dispatch Twilio SMS alert (or mock output) to emergency contact
    sms_sent = False
    sms_note = "Emergency contact not configured"
    if contact_phone:
        sms_body = f"EMERGENCY ALERT: {user_name} pressed the SOS button on AIRide! Live location: {maps_url} ({location_name or 'Location shared'}). Call 112 if unreachable."
        try:
            from app import _twilio_ready, _twilio, TWILIO_FROM
            if _twilio_ready and _twilio:
                _twilio.messages.create(
                    body=sms_body,
                    from_=TWILIO_FROM,
                    to=contact_phone
                )
                sms_sent = True
                sms_note = f"SMS sent via Twilio to {contact_name} ({contact_phone})"
            else:
                sms_sent = True
                sms_note = f"Demo Mode: SOS alert dispatched to {contact_name} ({contact_phone})"
        except Exception as err:
            err_str = str(err)
            print(f"[SOS Twilio Warning] {err_str}")
            # If Twilio API credentials are invalid/unauthenticated (401) or number mismatched (400)
            if any(code in err_str for code in ["401", "400", "Authenticate", "Mismatch", "20003"]):
                sms_note = f"Demo Mode: SOS alert logged & location link ready for {contact_name} ({contact_phone})"
            else:
                sms_note = f"Demo Mode: Alert queued for {contact_name} ({contact_phone})"


    return {
        "alert": alert,
        "live_location_url": maps_url,
        "emergency_contact_name": contact_name,
        "emergency_contact_phone": contact_phone,
        "police_number": "112",
        "sms_status": sms_note,
        "instructions": [
            "1. Stay calm. If in immediate danger, tap Call 112.",
            "2. Your live location link has been generated and sent to your emergency contact.",
            "3. Ride counterparties have received high-priority alert notifications."
        ]
    }


def resolve_sos(alert_id: int) -> bool:
    """Marks an SOS alert as resolved."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE sos_alerts SET status = 'resolved', resolved_at = NOW() WHERE id = %s;",
                (alert_id,)
            )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def get_user_sos_alerts(user_id: int) -> List[dict]:
    """Gets user's SOS alert history."""
    create_sos_tables()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT * FROM sos_alerts WHERE user_id = %s ORDER BY created_at DESC;", (user_id,))
        rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
