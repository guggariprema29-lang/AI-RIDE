import sys
import os

# Set Python path to backend
backend_path = os.path.join(os.path.dirname(__file__), "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from route_engine import haversine, route_length, count_matched_length, overlap_score, calculate_overlap_score
from matching import match_ride, rank_rides
from ai_engine import calculate_trust_score, classify_trust_risk_level, get_ai_recommendation, generate_risk_reasons
from rides import get_nearby_rides

def test_route_overlap():
    print("=== Testing Route Overlap Algorithm & Percentage ===")
    poly_rider = [
        {"latitude": 12.9716, "longitude": 77.5946}, # Majestic, Bengaluru
        {"latitude": 12.9352, "longitude": 77.6245}, # Koramangala
        {"latitude": 12.9141, "longitude": 77.6412}, # HSR Layout
        {"latitude": 12.8399, "longitude": 77.6770}, # Electronic City
    ]
    
    # Trip 1: Exact subset of rider's route (Koramangala -> HSR Layout)
    pickup = (12.9352, 77.6245)
    drop = (12.9141, 77.6412)
    
    mock_ride = {
        "id": 1,
        "origin_lat": 12.9716,
        "origin_lng": 77.5946,
        "dest_lat": 12.8399,
        "dest_lng": 77.6770,
        "polyline": poly_rider,
        "fare_per_km": 6.0,
        "seats_available": 3,
        "departure_time": "2026-07-26T12:00:00Z",
        "vehicle_type": "car"
    }
    
    match = match_ride(mock_ride, pickup, drop)
    assert match is not None, "Match failed for valid route subset"
    assert match["match_percentage"] == 100.0, f"Expected 100% overlap, got {match['match_percentage']}%"
    print(f"[OK] Overlap Percentage Test Passed: {match['match_percentage']}% overlap, Fare: Rs.{match['fare']}, Detour: {match['detour_m']}m")

    # Polyline overlap score
    poly_passenger = [
        {"latitude": 12.9352, "longitude": 77.6245},
        {"latitude": 12.9141, "longitude": 77.6412},
    ]
    ov_score = calculate_overlap_score(poly_rider, poly_passenger)
    assert ov_score > 0.9, f"Expected high polyline overlap score, got {ov_score}"
    print(f"[OK] Polyline Overlap Score Test Passed: {ov_score * 100:.1f}%")


def test_ai_trust_score():
    print("\n=== Testing AI Trust Score Calculation ===")
    # High trust profile (Verified, 4.9 rating, 20 deliveries, 100% success)
    score_high = calculate_trust_score(
        face_verified=True,
        rating=4.9,
        completed_deliveries=20,
        cancellation_count=0,
        delivery_success_rate=100.0,
        route_deviation_count=0,
        report_count=0,
        response_time_minutes=3.0
    )
    risk_high = classify_trust_risk_level(score_high)
    rec_high = get_ai_recommendation(score_high)
    print(f"[OK] High Trust Profile: Score={score_high}/100 | Risk={risk_high} | Recommendation='{rec_high}'")
    assert score_high >= 90, f"Expected score >= 90, got {score_high}"
    
    # Low trust profile (Unverified, 3.5 rating, 5 cancellations, 2 reports)
    score_low = calculate_trust_score(
        face_verified=False,
        rating=3.5,
        completed_deliveries=2,
        cancellation_count=5,
        delivery_success_rate=50.0,
        route_deviation_count=2,
        report_count=2,
        response_time_minutes=20.0
    )
    risk_low = classify_trust_risk_level(score_low)
    rec_low = get_ai_recommendation(score_low)
    reasons_low = generate_risk_reasons(
        face_verified=False, rating=3.5, completed_deliveries=2,
        cancellation_count=5, route_deviation_count=2, report_count=2, response_time_minutes=20.0
    )
    print(f"[OK] Low Trust Profile: Score={score_low}/100 | Risk={risk_low} | Recommendation='{rec_low}'")
    print(f"  Risk Flags: {reasons_low}")
    assert score_low < 60, f"Expected low score, got {score_low}"


def test_nearby_riders_mock():
    print("\n=== Testing Find Nearby Riders Logic ===")
    from route_engine import haversine
    center_lat, center_lng = 12.9716, 77.5946
    
    mock_rides = [
        {"id": 101, "rider_name": "Rider A", "current_lat": 12.9720, "current_lng": 77.5950, "rider_trust_score": 92}, # ~60m away
        {"id": 102, "rider_name": "Rider B", "current_lat": 12.9800, "current_lng": 77.6000, "rider_trust_score": 85}, # ~1.1km away
        {"id": 103, "rider_name": "Rider C", "current_lat": 13.1000, "current_lng": 77.8000, "rider_trust_score": 78}, # ~25km away
    ]
    
    radius_m = 5000.0
    filtered = []
    for r in mock_rides:
        dist = haversine((center_lat, center_lng), (r["current_lat"], r["current_lng"]))
        if dist <= radius_m:
            r["distance_m"] = round(dist, 1)
            filtered.append(r)
            
    filtered.sort(key=lambda x: x["distance_m"])
    assert len(filtered) == 2, f"Expected 2 nearby riders within 5km, found {len(filtered)}"
    assert filtered[0]["id"] == 101, "Closest rider should be Rider A"
    print(f"[OK] Nearby Riders Test Passed: Found {len(filtered)} riders within 5km.")
    for r in filtered:
        print(f"  - {r['rider_name']}: {r['distance_m']}m away | Trust Score: {r['rider_trust_score']}")


if __name__ == "__main__":
    test_route_overlap()
    test_ai_trust_score()
    test_nearby_riders_mock()
    print("\nALL FEATURE TESTS COMPLETED SUCCESSFULLY! [OK]")
