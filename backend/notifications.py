"""User notification management module with WebSocket real-time dispatch and categorised storage.

Categories:
- ride (Ride Updates)
- booking (Booking Updates)
- payment (Payment Updates)
- emergency (Emergency Alerts)
- system (System Notifications)
"""

import asyncio
from typing import Optional, List
from psycopg2.extras import RealDictCursor
from database import get_connection

CREATE_NOTIFICATIONS_TABLE = """
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'system',
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    ride_id INTEGER REFERENCES rides(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications (category);
"""

NOTIFICATION_MIGRATIONS = [
    "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'system';",
    "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ride_id INTEGER REFERENCES rides(id) ON DELETE CASCADE;",
]

def map_event_to_category(event_type: str) -> str:
    evt = (event_type or "").lower()
    if any(k in evt for k in ("ride_started", "ride_completed", "ride_published", "ride_cancelled", "ride_accepted", "ride")):
        if "booking" in evt:
            return "booking"
        return "ride"
    if any(k in evt for k in ("booking_created", "booking_accepted", "booking_rejected", "booking_cancelled", "booking")):
        return "booking"
    if any(k in evt for k in ("payment", "wallet", "escrow", "refund", "deposit", "pay")):
        return "payment"
    if any(k in evt for k in ("sos", "emergency", "help")):
        return "emergency"
    return "system"


def create_notifications_table() -> None:
    conn = get_connection()
    conn.autocommit = True
    with conn.cursor() as cursor:
        cursor.execute(CREATE_NOTIFICATIONS_TABLE)
        for mig in NOTIFICATION_MIGRATIONS:
            try:
                cursor.execute(mig)
            except Exception as e:
                print(f"[Notifications Migration] Info: {e}")
    conn.close()


def create_notification(
    user_id: int,
    event_type: str,
    title: str,
    message: str,
    category: Optional[str] = None,
    booking_id: Optional[int] = None,
    ride_id: Optional[int] = None
) -> Optional[dict]:
    """Inserts a new notification and attempts real-time WebSocket broadcast."""
    create_notifications_table()
    if not category:
        category = map_event_to_category(event_type)

    conn = get_connection()
    row = None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO notifications (user_id, category, event_type, title, message, booking_id, ride_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *;
                """,
                (user_id, category, event_type, title, message, booking_id, ride_id)
            )
            row = cursor.fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[Notifications] Error creating notification: {e}")
        return None
    finally:
        conn.close()

    if row:
        notification_dict = dict(row)
        # Convert datetime to string for JSON serialization
        if hasattr(notification_dict.get("created_at"), "isoformat"):
            notification_dict["created_at"] = notification_dict["created_at"].isoformat()

        # Try to dispatch via active WebSocket connections
        try:
            from ws_manager import manager
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                asyncio.create_task(manager.broadcast_to_user(user_id, {
                    "type": "NOTIFICATION_NEW",
                    "notification": notification_dict
                }))
        except Exception as ws_err:
            print(f"[Notifications WS] Broadcast notice: {ws_err}")

        return notification_dict

    return None


def get_user_notifications(user_id: int, category: Optional[str] = None, limit: int = 100) -> List[dict]:
    """Fetches notifications for a user, optionally filtered by category."""
    try:
        create_notifications_table()
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            if category and category.lower() != "all":
                cursor.execute(
                    """
                    SELECT * FROM notifications
                    WHERE user_id = %s AND LTRIM(RTRIM(LOWER(category))) = %s
                    ORDER BY created_at DESC
                    LIMIT %s;
                    """,
                    (user_id, category.lower().strip(), limit)
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM notifications
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s;
                    """,
                    (user_id, limit)
                )
            rows = cursor.fetchall()
        conn.close()
        
        result = []
        for r in rows:
            d = dict(r)
            if hasattr(d.get("created_at"), "isoformat"):
                d["created_at"] = d["created_at"].isoformat()
            result.append(d)
        return result
    except Exception as e:
        print(f"[Notifications] Error fetching notifications for user {user_id}: {e}")
        return []


def mark_notification_read(notification_id: int, user_id: Optional[int] = None) -> bool:
    """Marks a single notification as read."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            if user_id:
                cursor.execute(
                    "UPDATE notifications SET is_read = TRUE WHERE id = %s AND user_id = %s;",
                    (notification_id, user_id)
                )
            else:
                cursor.execute(
                    "UPDATE notifications SET is_read = TRUE WHERE id = %s;",
                    (notification_id,)
                )
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[Notifications] Error marking read: {e}")
        return False
    finally:
        conn.close()


def mark_all_notifications_read(user_id: int) -> bool:
    """Marks all unread notifications for a user as read."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE notifications SET is_read = TRUE WHERE user_id = %s AND is_read = FALSE;",
                (user_id,)
            )
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[Notifications] Error marking all read: {e}")
        return False
    finally:
        conn.close()


def delete_notification(notification_id: int, user_id: Optional[int] = None) -> bool:
    """Deletes a specific notification by ID."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            if user_id:
                cursor.execute("DELETE FROM notifications WHERE id = %s AND user_id = %s;", (notification_id, user_id))
            else:
                cursor.execute("DELETE FROM notifications WHERE id = %s;", (notification_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[Notifications] Error deleting notification: {e}")
        return False
    finally:
        conn.close()


def clear_user_notifications(user_id: int) -> bool:
    """Clears all notifications for a user."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM notifications WHERE user_id = %s;", (user_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[Notifications] Error clearing notifications: {e}")
        return False
    finally:
        conn.close()
