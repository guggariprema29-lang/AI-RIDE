import sys
import os

backend_path = os.path.join(os.path.dirname(__file__), "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from sos import update_emergency_contact, trigger_sos, resolve_sos, get_user_sos_alerts
from models import seed_demo_data, get_connection
from psycopg2.extras import RealDictCursor

def test_sos_emergency_alert():
    print("=== Testing SOS Emergency Alert System ===")
    seed_demo_data()

    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT id FROM users LIMIT 1;")
        user = cursor.fetchone()
    conn.close()

    assert user is not None, "No user found in DB"
    user_id = user["id"]

    # 1. Update Emergency Contact
    updated = update_emergency_contact(user_id, "Parent Contact", "+919876543210")
    assert updated is not None, "Failed to update emergency contact"
    assert updated["emergency_contact_phone"] == "+919876543210", "Phone mismatch"
    print(f"[OK] Emergency Contact Saved: {updated['emergency_contact_name']} ({updated['emergency_contact_phone']})")

    # 2. Trigger SOS Alert
    lat, lng = 12.9716, 77.5946
    res = trigger_sos(
        user_id=user_id,
        latitude=lat,
        longitude=lng,
        location_name="MG Road, Bengaluru"
    )
    assert res is not None, "Failed to trigger SOS"
    assert "google.com/maps" in res["live_location_url"], "Google Maps URL missing"
    assert res["police_number"] == "112", "Police 112 number missing"
    print(f"[OK] SOS Alert Triggered Successfully!")
    print(f"  - Alert ID: {res['alert']['id']}")
    print(f"  - Live Map Link: {res['live_location_url']}")
    print(f"  - SMS Status: {res['sms_status']}")
    print(f"  - Police Dialer: {res['police_number']}")

    # 3. Verify SOS Alert History
    history = get_user_sos_alerts(user_id)
    assert len(history) >= 1, "SOS alert not found in history"
    latest_alert_id = res["alert"]["id"]
    print(f"[OK] SOS Alert History Verified ({len(history)} record(s)).")

    # 4. Resolve SOS Alert
    resolved = resolve_sos(latest_alert_id)
    assert resolved is True, "Failed to resolve SOS alert"
    print(f"[OK] SOS Alert #{latest_alert_id} Marked Resolved.")


if __name__ == "__main__":
    test_sos_emergency_alert()
    print("\nALL SOS EMERGENCY FEATURE TESTS PASSED! [OK]")
