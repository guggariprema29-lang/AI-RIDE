"""Test suite for Multi-Leg Relay Carpooling in AI-RIDE."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from matching import find_relay_matches, rank_rides

# Mock rides:
# Ride 1: Chikkodi to Sankeshwar
ride1 = {
    "id": 101,
    "rider_id": 1,
    "rider_name": "Ramesh (Car)",
    "rider_public_id": "AR-101",
    "vehicle_type": "car",
    "origin": "Chikkodi",
    "destination": "Sankeshwar",
    "origin_lat": 16.43,
    "origin_lng": 74.59,
    "dest_lat": 16.26,
    "dest_lng": 74.47,
    "seats_available": 3,
    "fare_per_km": 6.0,
    "departure_time": "09:00",
    "rider_trust_score": 88,
    "rider_rating": 4.8,
    "rider_verified": True,
    "polyline": [
        {"lat": 16.43, "lng": 74.59},
        {"lat": 16.35, "lng": 74.53},
        {"lat": 16.26, "lng": 74.47}, # Sankeshwar
    ]
}

# Ride 2: Sankeshwar to Belagavi
ride2 = {
    "id": 102,
    "rider_id": 2,
    "rider_name": "Suresh (Auto)",
    "rider_public_id": "AR-102",
    "vehicle_type": "auto",
    "origin": "Sankeshwar",
    "destination": "Belagavi",
    "origin_lat": 16.26,
    "origin_lng": 74.47,
    "dest_lat": 15.87,
    "dest_lng": 74.50,
    "seats_available": 2,
    "fare_per_km": 4.5,
    "departure_time": "09:30",
    "rider_trust_score": 92,
    "rider_rating": 4.9,
    "rider_verified": True,
    "polyline": [
        {"lat": 16.26, "lng": 74.47}, # Sankeshwar
        {"lat": 16.05, "lng": 74.48},
        {"lat": 15.87, "lng": 74.50}, # Belagavi
    ]
}

def test_relay():
    rides = [ride1, ride2]
    # Passenger wants Chikkodi to Belagavi (no direct ride available!)
    pickup = (16.43, 74.59) # Chikkodi
    drop = (15.87, 74.50)   # Belagavi

    relays = find_relay_matches(rides, pickup, drop, seats=1, max_detour_m=5000)
    print(f"[TEST] Found {len(relays)} relay matches!")

    if len(relays) > 0:
        r = relays[0]
        print(f"  - Relay Option: {r['rider_name'].encode('ascii', 'ignore').decode()}")
        print(f"  - Transfer Point: {r['transfer_point']['name']} ({r['transfer_point']['lat']}, {r['transfer_point']['lng']})")
        print(f"  - Total Fare: Rs.{r['fare']}")
        print(f"  - Route Overlap: {r['match_percentage']}%")
        print("  - Leg 1:", r['leg1']['rider_name'], f"Rs.{r['leg1']['fare']}")
        print("  - Leg 2:", r['leg2']['rider_name'], f"Rs.{r['leg2']['fare']}")
        print("[SUCCESS] Multi-Leg Relay Matching test passed!")
    else:
        print("[FAIL] Relay match not found.")
        sys.exit(1)

if __name__ == "__main__":
    test_relay()
