import sys
import os

backend_path = os.path.join(os.path.dirname(__file__), "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from notifications import (
    create_notifications_table, create_notification,
    get_user_notifications, mark_notification_read, clear_user_notifications
)

def test_notification_system():
    print("=== Testing Notification System (Accepted, Cancelled, Started) ===")
    from models import seed_demo_data, get_connection
    from psycopg2.extras import RealDictCursor

    seed_demo_data()
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT id FROM users LIMIT 1;")
        user = cursor.fetchone()
    conn.close()

    assert user is not None, "No test user found in DB"
    user_id = user["id"]

    # Clean previous test notifications
    clear_user_notifications(user_id)

    # 1. Test Ride Accepted notification
    n1 = create_notification(
        user_id=user_id,
        event_type="ride_accepted",
        title="Ride Accepted!",
        message="Your ride request from Koramangala to HSR Layout has been accepted by Anusha.",
        booking_id=None
    )
    assert n1 is not None, "Failed to create ride_accepted notification"
    assert n1["event_type"] == "ride_accepted", "Event type mismatch"
    print(f"[OK] Ride Accepted Notification Created: '{n1['title']}' - {n1['message']}")

    # 2. Test Ride Started notification
    n2 = create_notification(
        user_id=user_id,
        event_type="ride_started",
        title="Ride Started!",
        message="Your trip with Anusha from Koramangala to HSR Layout has started.",
        booking_id=None
    )
    assert n2 is not None, "Failed to create ride_started notification"
    print(f"[OK] Ride Started Notification Created: '{n2['title']}' - {n2['message']}")

    # 3. Test Ride Cancelled notification
    n3 = create_notification(
        user_id=user_id,
        event_type="ride_cancelled",
        title="Ride Cancelled",
        message="Booking request from Koramangala to HSR Layout was cancelled.",
        booking_id=None
    )
    assert n3 is not None, "Failed to create ride_cancelled notification"
    print(f"[OK] Ride Cancelled Notification Created: '{n3['title']}' - {n3['message']}")

    # 4. Test Notification Retrieval
    user_notes = get_user_notifications(user_id)
    assert len(user_notes) == 3, f"Expected 3 notifications, got {len(user_notes)}"
    unread = [n for n in user_notes if not n["is_read"]]
    assert len(unread) == 3, "All new notifications should be unread"
    print(f"[OK] User Notifications Retrieved: {len(user_notes)} total ({len(unread)} unread)")

    # 5. Test Mark as Read
    mark_success = mark_notification_read(n1["id"])
    assert mark_success is True, "Failed to mark notification as read"
    updated_notes = get_user_notifications(user_id)
    unread_after = [n for n in updated_notes if not n["is_read"]]
    assert len(unread_after) == 2, f"Expected 2 unread after marking 1 read, got {len(unread_after)}"
    print(f"[OK] Mark-as-Read Verified: 1 notification marked read.")

    # Cleanup
    clear_user_notifications(user_id)


if __name__ == "__main__":
    test_notification_system()
    print("\nALL NOTIFICATION FEATURE TESTS PASSED! [OK]")
