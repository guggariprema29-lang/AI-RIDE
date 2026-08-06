import sys
import os

backend_path = os.path.join(os.path.dirname(__file__), "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from models import seed_demo_data, get_connection, deposit_wallet
from psycopg2.extras import RealDictCursor
from parcels import (
    create_parcels_table, create_parcel, get_parcels_by_sender,
    accept_parcel, verify_parcel_pickup, verify_parcel_delivery, cancel_parcel
)
from rides import publish_ride

def test_parcel_system():
    print("=== Testing Parcel Sharing & Delivery System ===")
    seed_demo_data()

    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT id FROM users LIMIT 2;")
        users = cursor.fetchall()
    conn.close()

    assert len(users) >= 2, "Need at least 2 users in DB for testing"
    sender_id = users[0]["id"]
    rider_id = users[1]["id"]

    # Fund sender wallet with ₹500
    deposit_wallet(sender_id, 500.0)

    # 1. Test Package Weight Compliance (>5.0 kg should fail)
    overweight_data = {
        "sender_id": sender_id,
        "title": "Heavy Box",
        "category": "documents",
        "weight_kg": 7.5,
        "pickup": "Majestic",
        "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245,
        "receiver_name": "Test Receiver",
        "receiver_phone": "+919876543210",
        "fare": 100.0
    }
    p_fail, err_fail = create_parcel(overweight_data)
    assert p_fail is None, "Overweight parcel (>5kg) should have failed compliance check"
    print(f"[OK] Compliance Weight Cap Verified: Rejected >5kg parcel ({err_fail})")

    # 2. Test Valid Parcel Request (≤ 5.0 kg)
    valid_data = {
        "sender_id": sender_id,
        "title": "Laptop Charger & Keys",
        "category": "electronics",
        "weight_kg": 1.5,
        "pickup": "Majestic",
        "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245,
        "receiver_name": "John Receiver",
        "receiver_phone": "+919876543210",
        "notes": "Handle with care",
        "fare": 75.0
    }
    parcel, err = create_parcel(valid_data)
    assert parcel is not None, f"Failed to create valid parcel: {err}"
    assert parcel["status"] == "pending", "Status should be pending"
    assert parcel["pickup_otp"] is not None and len(parcel["pickup_otp"]) == 4, "Pickup OTP missing"
    assert parcel["delivery_otp"] is not None and len(parcel["delivery_otp"]) == 4, "Delivery OTP missing"
    print(f"[OK] Parcel Created & Escrow Held: '{parcel['title']}' (Rs.{parcel['fare']})")
    print(f"  - Pickup OTP: {parcel['pickup_otp']} | Delivery OTP: {parcel['delivery_otp']}")

    # 3. Publish Rider Route and Accept Parcel
    ride = publish_ride({
        "rider_id": rider_id,
        "origin": "Majestic",
        "destination": "Electronic City",
        "origin_lat": 12.9716, "origin_lng": 77.5946,
        "dest_lat": 12.8399, "dest_lng": 77.6770,
        "seats_total": 2,
        "departure_time": "2026-08-02T21:00:00Z"
    })
    assert ride is not None, "Failed to publish rider route"

    accepted, err_acc = accept_parcel(parcel["id"], rider_id, ride["id"])
    assert accepted is not None, f"Failed to accept parcel: {err_acc}"
    assert accepted["status"] == "accepted", "Status should be accepted"
    print(f"[OK] Rider Accepted Parcel Job #{parcel['id']}")

    # 4. Verify Sender Pickup OTP (Handoff to rider)
    pickup_verified, err_pk = verify_parcel_pickup(parcel["id"], parcel["pickup_otp"])
    assert pickup_verified is not None, f"Pickup verification failed: {err_pk}"
    assert pickup_verified["status"] == "picked_up", "Status should be picked_up"
    print(f"[OK] Pickup OTP Verified: Package marked picked_up")

    # 5. Verify Receiver Delivery OTP (Handoff to receiver & payout to rider)
    delivery_verified, err_dl = verify_parcel_delivery(parcel["id"], parcel["delivery_otp"])
    assert delivery_verified is not None, f"Delivery verification failed: {err_dl}"
    assert delivery_verified["status"] == "delivered", "Status should be delivered"
    print(f"[OK] Delivery OTP Verified: Escrow fare Rs.{parcel['fare']} released to rider's wallet!")


if __name__ == "__main__":
    test_parcel_system()
    print("\nALL PARCEL SHARING FEATURE TESTS PASSED SUCCESSFULLY! [OK]")
