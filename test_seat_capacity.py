import sys
import os
import threading
import time

# Set Python path to backend
backend_path = os.path.join(os.path.dirname(__file__), "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from database import get_connection
from rides import create_ride_tables, publish_ride, create_booking, update_booking_status, get_ride
from models import create_user, create_tables

def setup_test_users():
    create_tables()
    create_ride_tables()
    rider = create_user({"email": "rider_seat_test@example.com", "name": "Rider Seat Test", "government_id": "GOV-RIDER-SEAT", "gender": "male"})
    pax1 = create_user({"email": "pax1_seat_test@example.com", "name": "Pax One", "government_id": "GOV-PAX1-SEAT", "gender": "female"})
    pax2 = create_user({"email": "pax2_seat_test@example.com", "name": "Pax Two", "government_id": "GOV-PAX2-SEAT", "gender": "male"})
    pax3 = create_user({"email": "pax3_seat_test@example.com", "name": "Pax Three", "government_id": "GOV-PAX3-SEAT", "gender": "female"})
    pax4 = create_user({"email": "pax4_seat_test@example.com", "name": "Pax Four", "government_id": "GOV-PAX4-SEAT", "gender": "male"})
    pax5 = create_user({"email": "pax5_seat_test@example.com", "name": "Pax Five", "government_id": "GOV-PAX5-SEAT", "gender": "female"})
    return rider, pax1, pax2, pax3, pax4, pax5

def test_car_capacity():
    print("\n--- Testing Car Capacity (4 Seats Default) ---")
    rider, p1, p2, p3, p4, p5 = setup_test_users()

    # 1. Publish Car ride
    ride = publish_ride({
        "rider_id": rider["id"],
        "origin": "Majestic",
        "destination": "Electronic City",
        "origin_lat": 12.9716,
        "origin_lng": 77.5946,
        "dest_lat": 12.8399,
        "dest_lng": 77.6770,
        "vehicle_type": "car",
        "departure_time": "2026-08-10T10:00:00Z"
    })
    
    assert ride["seats_total"] == 4, f"Expected 4 seats total for Car, got {ride['seats_total']}"
    assert ride["seats_available"] == 4, f"Expected 4 seats available initially, got {ride['seats_available']}"
    print(f"[OK] Car created: {ride['seats_available']} / {ride['seats_total']} seats available")

    # Step 1: Book 1 seat -> 3 available
    b1 = create_booking({
        "ride_id": ride["id"], "passenger_id": p1["id"],
        "pickup": "Majestic", "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245, "seats": 1
    })
    r1 = get_ride(ride["id"])
    assert r1["seats_available"] == 3, f"Expected 3 available, got {r1['seats_available']}"
    print(f"[OK] Passenger 1 booked 1 seat -> {r1['seats_available']} / {r1['seats_total']} seats available")

    # Step 2: Book 1 seat -> 2 available
    b2 = create_booking({
        "ride_id": ride["id"], "passenger_id": p2["id"],
        "pickup": "Majestic", "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245, "seats": 1
    })
    r2 = get_ride(ride["id"])
    assert r2["seats_available"] == 2, f"Expected 2 available, got {r2['seats_available']}"
    print(f"[OK] Passenger 2 booked 1 seat -> {r2['seats_available']} / {r2['seats_total']} seats available")

    # Step 3: Book 1 seat -> 1 available
    b3 = create_booking({
        "ride_id": ride["id"], "passenger_id": p3["id"],
        "pickup": "Majestic", "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245, "seats": 1
    })
    r3 = get_ride(ride["id"])
    assert r3["seats_available"] == 1, f"Expected 1 available, got {r3['seats_available']}"
    print(f"[OK] Passenger 3 booked 1 seat -> {r3['seats_available']} / {r3['seats_total']} seats available")

    # Step 4: Book 1 seat -> 0 available
    b4 = create_booking({
        "ride_id": ride["id"], "passenger_id": p4["id"],
        "pickup": "Majestic", "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245, "seats": 1
    })
    r4 = get_ride(ride["id"])
    assert r4["seats_available"] == 0, f"Expected 0 available, got {r4['seats_available']}"
    print(f"[OK] Passenger 4 booked 1 seat -> {r4['seats_available']} / {r4['seats_total']} seats available (FULL)")

    # Step 5: Attempt 5th booking when 0 available -> rejected
    b5 = create_booking({
        "ride_id": ride["id"], "passenger_id": p5["id"],
        "pickup": "Majestic", "dropoff": "Koramangala",
        "pickup_lat": 12.9716, "pickup_lng": 77.5946,
        "drop_lat": 12.9352, "drop_lng": 77.6245, "seats": 1
    })
    assert b5 is None, "Expected 5th booking attempt on full ride to be rejected!"
    print(f"[OK] 5th booking attempt rejected as expected when 0 seats available")

    # Step 6: Cancel 1 confirmed booking -> 1 seat becomes available again
    update_booking_status(b4["id"], "cancelled")
    r6 = get_ride(ride["id"])
    assert r6["seats_available"] == 1, f"Expected 1 seat restored on cancel, got {r6['seats_available']}"
    print(f"[OK] Cancelled booking #4 -> {r6['seats_available']} / {r6['seats_total']} seats available again")

def test_auto_capacity():
    print("\n--- Testing Auto Capacity (3 Seats Default) ---")
    rider, p1, p2, p3, p4, _ = setup_test_users()

    ride = publish_ride({
        "rider_id": rider["id"],
        "origin": "Koramangala",
        "destination": "MG Road",
        "origin_lat": 12.9352,
        "origin_lng": 77.6245,
        "dest_lat": 12.9756,
        "dest_lng": 77.6066,
        "vehicle_type": "auto",
        "departure_time": "2026-08-10T11:00:00Z"
    })

    assert ride["seats_total"] == 3, f"Expected 3 seats total for Auto, got {ride['seats_total']}"
    assert ride["seats_available"] == 3, f"Expected 3 available initially, got {ride['seats_available']}"
    print(f"[OK] Auto created: {ride['seats_available']} / {ride['seats_total']} seats available")

    # Book 2 seats -> 1 available
    b1 = create_booking({
        "ride_id": ride["id"], "passenger_id": p1["id"],
        "pickup": "Koramangala", "dropoff": "MG Road",
        "pickup_lat": 12.9352, "pickup_lng": 77.6245,
        "drop_lat": 12.9756, "drop_lng": 77.6066, "seats": 2
    })
    r1 = get_ride(ride["id"])
    assert r1["seats_available"] == 1, f"Expected 1 available, got {r1['seats_available']}"
    print(f"[OK] Passenger 1 booked 2 seats -> {r1['seats_available']} / {r1['seats_total']} seats available")

    # Attempt to book 2 seats when only 1 available -> rejected
    b_fail = create_booking({
        "ride_id": ride["id"], "passenger_id": p2["id"],
        "pickup": "Koramangala", "dropoff": "MG Road",
        "pickup_lat": 12.9352, "pickup_lng": 77.6245,
        "drop_lat": 12.9756, "drop_lng": 77.6066, "seats": 2
    })
    assert b_fail is None, "Expected booking for 2 seats when only 1 available to fail!"
    print(f"[OK] Booking request for 2 seats rejected when only 1 seat available")

    # Book remaining 1 seat -> 0 available
    b2 = create_booking({
        "ride_id": ride["id"], "passenger_id": p3["id"],
        "pickup": "Koramangala", "dropoff": "MG Road",
        "pickup_lat": 12.9352, "pickup_lng": 77.6245,
        "drop_lat": 12.9756, "drop_lng": 77.6066, "seats": 1
    })
    r2 = get_ride(ride["id"])
    assert r2["seats_available"] == 0, f"Expected 0 available, got {r2['seats_available']}"
    print(f"[OK] Passenger 3 booked remaining 1 seat -> {r2['seats_available']} / {r2['seats_total']} seats available")

def test_bike_capacity():
    print("\n--- Testing Bike Capacity (1 Seat Default) ---")
    rider, p1, p2, _, _, _ = setup_test_users()

    ride = publish_ride({
        "rider_id": rider["id"],
        "origin": "HSR Layout",
        "destination": "Indiranagar",
        "origin_lat": 12.9141,
        "origin_lng": 77.6412,
        "dest_lat": 12.9784,
        "dest_lng": 77.6408,
        "vehicle_type": "bike",
        "departure_time": "2026-08-10T12:00:00Z"
    })

    assert ride["seats_total"] == 1, f"Expected 1 seat total for Bike, got {ride['seats_total']}"
    assert ride["seats_available"] == 1, f"Expected 1 available, got {ride['seats_available']}"
    print(f"[OK] Bike created: {ride['seats_available']} / {ride['seats_total']} seats available")

    # Book 1 seat -> 0 available
    b1 = create_booking({
        "ride_id": ride["id"], "passenger_id": p1["id"],
        "pickup": "HSR Layout", "dropoff": "Indiranagar",
        "pickup_lat": 12.9141, "pickup_lng": 77.6412,
        "drop_lat": 12.9784, "drop_lng": 77.6408, "seats": 1
    })
    r1 = get_ride(ride["id"])
    assert r1["seats_available"] == 0, f"Expected 0 available, got {r1['seats_available']}"
    print(f"[OK] Passenger 1 booked 1 seat -> {r1['seats_available']} / {r1['seats_total']} seats available")

    # Attempt second booking on bike -> rejected
    b2 = create_booking({
        "ride_id": ride["id"], "passenger_id": p2["id"],
        "pickup": "HSR Layout", "dropoff": "Indiranagar",
        "pickup_lat": 12.9141, "pickup_lng": 77.6412,
        "drop_lat": 12.9784, "drop_lng": 77.6408, "seats": 1
    })
    assert b2 is None, "Expected second booking attempt on bike to be rejected!"
    print(f"[OK] Second booking attempt on bike rejected as expected")

def test_concurrent_booking_safety():
    print("\n--- Testing Concurrent Booking Safety ---")
    rider, p1, p2, _, _, _ = setup_test_users()

    # Bike with 1 seat available
    ride = publish_ride({
        "rider_id": rider["id"],
        "origin": "Whitefield",
        "destination": "Airport",
        "origin_lat": 12.9698,
        "origin_lng": 77.7499,
        "dest_lat": 13.1986,
        "dest_lng": 77.7066,
        "vehicle_type": "bike",
        "departure_time": "2026-08-10T14:00:00Z"
    })

    results = []

    def try_book(passenger_id):
        b = create_booking({
            "ride_id": ride["id"], "passenger_id": passenger_id,
            "pickup": "Whitefield", "dropoff": "Airport",
            "pickup_lat": 12.9698, "pickup_lng": 77.7499,
            "drop_lat": 13.1986, "drop_lng": 77.7066, "seats": 1
        })
        if b:
            results.append(b)

    t1 = threading.Thread(target=try_book, args=(p1["id"],))
    t2 = threading.Thread(target=try_book, args=(p2["id"],))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert len(results) == 1, f"Expected exactly 1 concurrent booking to succeed, got {len(results)}"
    r_final = get_ride(ride["id"])
    assert r_final["seats_available"] == 0, f"Expected 0 seats remaining, got {r_final['seats_available']}"
    print(f"[OK] Concurrency test passed: 2 threads attempted to book 1 seat simultaneously -> exactly 1 succeeded")

if __name__ == "__main__":
    print("==================================================")
    print("   RUNNING Dynamic Seat Capacity Test Suite       ")
    print("==================================================")
    test_car_capacity()
    test_auto_capacity()
    test_bike_capacity()
    test_concurrent_booking_safety()
    print("\n[SUCCESS] ALL DYNAMIC SEAT & CAPACITY TESTS PASSED SUCCESSFULLY!")
