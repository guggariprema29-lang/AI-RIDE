import sys
import os

backend_path = os.path.join(os.path.dirname(__file__), "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from matching import annotate_best_matches
from cost_sharing import calculate_cost_split
from payment_gateway import PaymentGateway
from route_engine import detect_route_deviation

def test_matching_best_ride():
    print("=== Testing Matching Engine: Suggest Best Ride ===")
    matches = [
        {"id": 1, "match_percentage": 60.0, "rider_trust_score": 70, "detour_m": 800, "rider_rating": 4.2},
        {"id": 2, "match_percentage": 95.0, "rider_trust_score": 92, "detour_m": 120, "rider_rating": 4.9},
        {"id": 3, "match_percentage": 80.0, "rider_trust_score": 75, "detour_m": 400, "rider_rating": 4.5},
    ]

    annotated = annotate_best_matches(matches)
    assert annotated[1]["is_best_match"] is True, "Ride 2 should be marked as best match"
    print(f"[OK] Best Match Identified: Ride ID {annotated[1]['id']} | Reason: '{annotated[1]['best_match_reason']}'")


def test_cost_sharing():
    print("\n=== Testing Cost Sharing & Fare Breakdown ===")
    split = calculate_cost_split(
        shared_distance_m=12500.0, # 12.5 km
        total_ride_distance_m=20000.0, # 20 km
        fare_per_km=6.0,
        seats=2,
        vehicle_type="car"
    )
    print(f"[OK] Cost Split Results for 12.5km (2 seats):")
    print(f"  - Total Shared Fare: Rs.{split['total_fare']} (Rs.{split['fare_per_seat']} per seat)")
    print(f"  - Fuel Used: {split['estimated_fuel_liters']} L (Est. Fuel Cost: Rs.{split['estimated_fuel_cost']})")
    print(f"  - Passenger Savings vs Taxi: Rs.{split['passenger_savings_amount']} ({split['passenger_savings_percent']}%)")
    assert split["total_fare"] == 150.0, f"Expected 150.0 total fare, got {split['total_fare']}"
    assert split["fare_per_seat"] == 75.0, f"Expected 75.0 per seat fare, got {split['fare_per_seat']}"


def test_payment_gateway_mock():
    print("\n=== Testing Payment Gateway Simulation ===")
    user_id = 1
    amount = 500.0

    session = PaymentGateway.create_checkout_session(user_id, amount, payment_method="upi")
    assert session["session_id"].startswith("PAY-SESS-"), "Invalid session ID format"
    assert session["status"] == "created", "Session status should be created"
    print(f"[OK] Payment Session Created: {session['session_id']} | Method: {session['payment_method']} | Amount: Rs.{session['amount']}")

    # Verify session retrieval
    retrieved = PaymentGateway.get_session(session["session_id"])
    assert retrieved is not None, "Failed to retrieve payment session"
    print(f"[OK] Payment Session Verified from Memory Store.")


def test_route_deviation_detection():
    print("\n=== Testing Live Tracking: Route Deviation Detection ===")
    poly_route = [
        {"latitude": 12.9716, "longitude": 77.5946}, # Start
        {"latitude": 12.9352, "longitude": 77.6245}, # Mid point
        {"latitude": 12.8399, "longitude": 77.6770}, # End
    ]

    # Position 1: Directly on route (~20m away)
    pos_on_route = (12.9715, 77.5947)
    res_on = detect_route_deviation(pos_on_route, poly_route, threshold_m=500.0)
    assert res_on["is_deviated"] is False, f"Expected not deviated, got {res_on}"
    print(f"[OK] On-Route Position Check Passed: Deviation={res_on['deviation_distance_m']}m (Below 500m threshold)")

    # Position 2: Off route (~3.5km away in Whitefield)
    pos_off_route = (12.9698, 77.7499)
    res_off = detect_route_deviation(pos_off_route, poly_route, threshold_m=500.0)
    assert res_off["is_deviated"] is True, f"Expected route deviation detected, got {res_off}"
    print(f"[OK] Route Deviation Detected: Distance={res_off['deviation_distance_m']}m (Exceeds 500m threshold)")


if __name__ == "__main__":
    test_matching_best_ride()
    test_cost_sharing()
    test_payment_gateway_mock()
    test_route_deviation_detection()
    print("\nALL 4 NEW FEATURE SUITES VERIFIED SUCCESSFULLY! [OK]")
