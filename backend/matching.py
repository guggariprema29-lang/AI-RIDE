"""Passenger-to-ride matching.

A ride matches when the rider's path passes close to the passenger's pickup and
then, further along that same path, close to their drop. Where the rider
personally finishes is irrelevant — only the stretch the passenger needs.

Distances are measured to the route *segments*, not to its vertices, so a pickup
halfway down a long straight leg is correctly seen as being on the route.
"""

from math import cos, radians
from typing import Optional

from route_engine import haversine

# How far a passenger will walk to meet the route at either end.
DEFAULT_MAX_DETOUR_M = 2000.0
# Overlap is reported for ranking only; it never rejects a ride on its own.
DEFAULT_MIN_OVERLAP = 0.0

VEHICLE_DEFAULT_RATE = {"bike": 3.5, "car": 6.0, "auto": 4.5}
VEHICLE_DEFAULT_CAPACITY = {"bike": 1, "auto": 3, "car": 4}
VEHICLE_TOTAL_SEATS = {"bike": 2, "auto": 4, "car": 5}

EARTH_M_PER_DEG = 111_320.0


def _as_points(polyline: list) -> list[tuple[float, float]]:
    points = []
    for item in polyline or []:
        if isinstance(item, dict):
            lat = item.get("latitude", item.get("lat"))
            lng = item.get("longitude", item.get("lng"))
        else:
            lat, lng = item[0], item[1]
        if lat is None or lng is None:
            continue
        points.append((float(lat), float(lng)))
    return points


def _to_metres(point: tuple[float, float], origin_lat: float) -> tuple[float, float]:
    """Flat-earth projection — accurate enough over a city-scale route."""
    lat, lng = point
    return (lng * EARTH_M_PER_DEG * cos(radians(origin_lat)), lat * EARTH_M_PER_DEG)


def project_onto_route(
    point: tuple[float, float], points: list[tuple[float, float]]
) -> tuple[int, float, float]:
    """Closest point on the route.

    Returns (segment index, position 0..1 along that segment, distance in metres).
    """
    reference_lat = points[0][0]
    px, py = _to_metres(point, reference_lat)

    best = (0, 0.0, float("inf"))
    for index in range(len(points) - 1):
        ax, ay = _to_metres(points[index], reference_lat)
        bx, by = _to_metres(points[index + 1], reference_lat)
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy

        if length_sq == 0:
            t = 0.0
        else:
            t = ((px - ax) * dx + (py - ay) * dy) / length_sq
            t = max(0.0, min(1.0, t))

        closest_x, closest_y = ax + t * dx, ay + t * dy
        distance = ((px - closest_x) ** 2 + (py - closest_y) ** 2) ** 0.5
        if distance < best[2]:
            best = (index, t, distance)

    return best


def _distance_along(points: list[tuple[float, float]], index: int, t: float) -> float:
    """Metres travelled from the route start to a projected position."""
    total = 0.0
    for i in range(index):
        total += haversine(points[i], points[i + 1])
    if index < len(points) - 1:
        total += haversine(points[index], points[index + 1]) * t
    return total


def match_ride(
    ride: dict,
    pickup: tuple[float, float],
    drop: tuple[float, float],
    max_detour_m: float = DEFAULT_MAX_DETOUR_M,
    min_overlap: float = DEFAULT_MIN_OVERLAP,
) -> Optional[dict]:
    """Score one ride against one passenger trip. Returns None when unusable."""
    points = _as_points(ride.get("polyline"))
    if len(points) < 2:
        # Fall back to the straight origin/destination pair the rider submitted.
        points = [
            (float(ride["origin_lat"]), float(ride["origin_lng"])),
            (float(ride["dest_lat"]), float(ride["dest_lng"])),
        ]

    pickup_index, pickup_t, pickup_detour = project_onto_route(pickup, points)
    drop_index, drop_t, drop_detour = project_onto_route(drop, points)

    # Both ends must be within walking distance of the rider's path.
    if pickup_detour > max_detour_m or drop_detour > max_detour_m:
        return None

    pickup_along = _distance_along(points, pickup_index, pickup_t)
    drop_along = _distance_along(points, drop_index, drop_t)

    # The rider must reach the pickup before the drop — same direction of travel.
    if drop_along <= pickup_along:
        return None

    shared_distance_m = drop_along - pickup_along
    passenger_distance_m = haversine(pickup, drop)
    if passenger_distance_m <= 0:
        return None

    overlap = min(1.0, shared_distance_m / passenger_distance_m)
    if shared_distance_m >= passenger_distance_m:
        overlap = 1.0
    if min_overlap and overlap < min_overlap:
        return None

    rate = ride.get("fare_per_km") or VEHICLE_DEFAULT_RATE.get(ride.get("vehicle_type", "car"), 6.0)
    # Charge the distance actually carried, never below the passenger's own trip.
    billable_m = max(shared_distance_m, passenger_distance_m)
    fare = round((billable_m / 1000.0) * float(rate), 2)

    return {
        "overlap_score": round(overlap, 3),
        "match_percentage": round(overlap * 100, 1),
        "shared_distance_m": round(shared_distance_m, 1),
        "passenger_distance_m": round(passenger_distance_m, 1),
        "pickup_detour_m": round(pickup_detour, 1),
        "drop_detour_m": round(drop_detour, 1),
        "detour_m": round(pickup_detour + drop_detour, 1),
        "fare": fare,
    }


def find_relay_matches(
    rides: list[dict],
    pickup: tuple[float, float],
    drop: tuple[float, float],
    seats: int = 1,
    max_detour_m: float = DEFAULT_MAX_DETOUR_M,
) -> list[dict]:
    """Find 2-leg relay carpool combinations connecting two distinct rides at a transfer point."""
    relays = []
    pax_dist = haversine(pickup, drop)
    if pax_dist <= 0:
        return []

    # Filter rides with enough seats
    valid_rides = [r for r in rides if r.get("seats_available", 0) >= seats]

    for ride1 in valid_rides:
        points1 = _as_points(ride1.get("polyline"))
        if len(points1) < 2:
            points1 = [
                (float(ride1["origin_lat"]), float(ride1["origin_lng"])),
                (float(ride1["dest_lat"]), float(ride1["dest_lng"])),
            ]
        p1_idx, p1_t, p1_detour = project_onto_route(pickup, points1)
        if p1_detour > max_detour_m:
            continue

        for ride2 in valid_rides:
            if ride1.get("id") == ride2.get("id"):
                continue

            r1_dest = (float(ride1["dest_lat"]), float(ride1["dest_lng"]))
            r2_orig = (float(ride2["origin_lat"]), float(ride2["origin_lng"]))

            # Quick pre-filter: Transfer points must be within 2x detour radius
            if haversine(r1_dest, r2_orig) > (max_detour_m * 2.5):
                continue

            points2 = _as_points(ride2.get("polyline"))
            if len(points2) < 2:
                points2 = [r2_orig, (float(ride2["dest_lat"]), float(ride2["dest_lng"]))]

            d2_idx, d2_t, d2_detour = project_onto_route(drop, points2)
            if d2_detour > max_detour_m:
                continue

            # Candidate transfer points: ride1 dest and ride2 origin
            candidates = [r1_dest, r2_orig]

            best_transfer = None
            best_detour_sum = float("inf")
            best_m1, best_m2 = None, None

            for pt in candidates:
                # Match leg1 from pickup to pt
                m1 = match_ride(ride1, pickup, pt, max_detour_m=max_detour_m, min_overlap=0.0)
                if not m1:
                    continue
                # Match leg2 from pt to drop
                m2 = match_ride(ride2, pt, drop, max_detour_m=max_detour_m, min_overlap=0.0)
                if not m2:
                    continue

                detour_sum = m1["detour_m"] + m2["detour_m"]
                if detour_sum < best_detour_sum:
                    best_detour_sum = detour_sum
                    best_transfer = pt
                    best_m1, best_m2 = m1, m2

            if not best_transfer or not best_m1 or not best_m2:
                continue

            shared_m = best_m1["shared_distance_m"] + best_m2["shared_distance_m"]
            overlap = min(1.0, shared_m / pax_dist)
            total_fare = round((best_m1["fare"] + best_m2["fare"]) * seats, 2)

            transfer_name = ride1.get("destination") or "Transfer Hub"
            if " to " in transfer_name:
                transfer_name = transfer_name.split(" to ")[0]

            leg1_merged = dict(ride1)
            leg1_merged.update(best_m1)
            leg1_merged["fare"] = round(best_m1["fare"] * seats, 2)

            leg2_merged = dict(ride2)
            leg2_merged.update(best_m2)
            leg2_merged["fare"] = round(best_m2["fare"] * seats, 2)

            combined_polyline = list(ride1.get("polyline") or []) + list(ride2.get("polyline") or [])

            relay_id = int(f"{ride1['id']}999{ride2['id']}")
            relay = {
                "is_relay": True,
                "id": relay_id,
                "leg1": leg1_merged,
                "leg2": leg2_merged,
                "transfer_point": {
                    "name": transfer_name,
                    "lat": best_transfer[0],
                    "lng": best_transfer[1],
                },
                "rider_name": f"{ride1.get('rider_name', 'Rider A')} ➔ {ride2.get('rider_name', 'Rider B')}",
                "rider_public_id": f"{ride1.get('rider_public_id', '')} / {ride2.get('rider_public_id', '')}",
                "rider_verified": ride1.get("rider_verified", False) and ride2.get("rider_verified", False),
                "origin": ride1.get("origin", "Pickup"),
                "destination": ride2.get("destination", "Dropoff"),
                "origin_lat": float(ride1.get("origin_lat", 0.0)),
                "origin_lng": float(ride1.get("origin_lng", 0.0)),
                "dest_lat": float(ride2.get("dest_lat", 0.0)),
                "dest_lng": float(ride2.get("dest_lng", 0.0)),
                "polyline": combined_polyline,
                "vehicle_type": f"{ride1.get('vehicle_type', 'car')} + {ride2.get('vehicle_type', 'car')}",
                "match_percentage": round(overlap * 100, 1),
                "overlap_score": round(overlap, 3),
                "shared_distance_m": round(shared_m, 1),
                "passenger_distance_m": round(pax_dist, 1),
                "pickup_detour_m": best_m1["pickup_detour_m"],
                "detour_m": round(best_detour_sum, 1),
                "fare": total_fare,
                "seats_available": min(ride1.get("seats_available", 1), ride2.get("seats_available", 1)),
                "departure_time": ride1.get("departure_time"),
                "rider_trust_score": min(ride1.get("rider_trust_score") or 50, ride2.get("rider_trust_score") or 50),
                "rider_rating": round(
                    ((float(ride1.get("rider_rating") or 4.0)) + (float(ride2.get("rider_rating") or 4.0))) / 2, 1
                ),
            }
            relays.append(relay)

    return relays


def rank_rides(
    rides: list[dict],
    pickup: tuple[float, float],
    drop: tuple[float, float],
    seats: int = 1,
    max_detour_m: float = DEFAULT_MAX_DETOUR_M,
    min_overlap: float = DEFAULT_MIN_OVERLAP,
) -> list[dict]:
    results = []
    for ride in rides:
        score = match_ride(ride, pickup, drop, max_detour_m, min_overlap)
        if not score:
            continue
        merged = dict(ride)
        merged.update(score)
        merged["fare"] = round(score["fare"] * seats, 2)
        merged["is_full"] = (merged.get("seats_available", 0) < seats)
        results.append(merged)

    # Also search for multi-leg relay options
    relay_matches = find_relay_matches(rides, pickup, drop, seats, max_detour_m)
    for r in relay_matches:
        r["is_full"] = (r.get("seats_available", 0) < seats)
    results.extend(relay_matches)

    # Available rides first (0 before 1 for is_full), then closest pickup, best overlap, soonest departure.
    results.sort(key=lambda r: (1 if r.get("is_full") else 0, r["pickup_detour_m"], -r["overlap_score"], r["departure_time"]))
    return annotate_best_matches(results)



def annotate_best_matches(matches: list[dict]) -> list[dict]:
    """Evaluates candidate matches using a multi-factor AI scoring algorithm and marks the best overall option."""
    if not matches:
        return []

    best_index = -1
    best_score = -float("inf")

    for i, m in enumerate(matches):
        overlap_pct = m.get("match_percentage", 0.0)
        trust_score = m.get("rider_trust_score") or 50
        detour_m = m.get("detour_m", 0.0)
        rating = float(m.get("rider_rating") or 4.0)

        # Composite score
        score = (0.4 * overlap_pct) + (0.3 * trust_score) - (0.01 * detour_m) + (2.0 * rating)
        m["ai_match_score"] = round(score, 2)
        m["is_best_match"] = False
        m["best_match_reason"] = None

        if score > best_score:
            best_score = score
            best_index = i

    if best_index >= 0:
        top = matches[best_index]
        top["is_best_match"] = True
        reasons = []
        if top.get("match_percentage", 0) >= 80:
            reasons.append(f"{top['match_percentage']:.0f}% route overlap")
        if (top.get("rider_trust_score") or 0) >= 85:
            reasons.append("High trust rider")
        if top.get("detour_m", 999) <= 500:
            reasons.append(f"Minimal detour ({top['detour_m']}m)")
        top["best_match_reason"] = " | ".join(reasons) or "Overall optimal match"

    return matches


def ride_distance_m(ride: dict) -> float:
    points = _as_points(ride.get("polyline"))
    if len(points) >= 2:
        total = 0.0
        for i in range(len(points) - 1):
            total += haversine(points[i], points[i + 1])
        return total
    return haversine(
        (float(ride["origin_lat"]), float(ride["origin_lng"])),
        (float(ride["dest_lat"]), float(ride["dest_lng"])),
    )


def calculate_cost_savings(distance_m: float, vehicle_type: str = "car", seats: int = 1, is_parcel: bool = False, actual_fare: float = None) -> dict:
    """
    Calculates fuel consumption, zero-commission cost-share, and savings vs commercial taxis (Uber/Ola) or couriers (Porter/Dunzo).
    """
    distance_km = max(0.5, round(distance_m / 1000.0, 1))
    fuel_price_per_liter = 102.0  # INR per liter
    mileage_kpl = 15.0 if vehicle_type.lower() == "car" else 45.0
    
    fuel_liters = round(distance_km / mileage_kpl, 2)
    total_fuel_cost = round(fuel_liters * fuel_price_per_liter, 2)
    
    if actual_fare is not None and actual_fare > 0:
        cost_share = float(actual_fare)
    else:
        rate_per_km = 6.0 if vehicle_type.lower() == "car" else 3.0
        cost_share = round((distance_km * rate_per_km) * seats, 2)
        
    rider_fuel_offset = min(total_fuel_cost, round(cost_share, 2))
    
    if is_parcel:
        # Commercial Courier Rate (Porter/Dunzo): Base ₹40 + ₹15/km
        commercial_name = "Porter / Dunzo Courier"
        commercial_fare = round(40.0 + (distance_km * 15.0), 2)
    else:
        if vehicle_type.lower() == "car":
            # Commercial Taxi Rate (Uber / Ola Sedan): Base ₹50 + ₹18/km + time charge
            commercial_name = "Uber / Ola Cab"
            commercial_fare = round(50.0 + (distance_km * 18.0) + (distance_km * 1.5 * 2.0), 2)
        else:
            # Commercial Bike Taxi Rate (Rapido / Uber Moto): Base ₹30 + ₹10/km
            commercial_name = "Uber Moto / Rapido"
            commercial_fare = round(30.0 + (distance_km * 10.0), 2)
            
    savings_amount = max(0.0, round(commercial_fare - cost_share, 2))
    savings_pct = round((savings_amount / commercial_fare) * 100) if commercial_fare > 0 else 0
    co2_saved_kg = round(distance_km * 0.15, 2)
    
    return {
        "distance_km": distance_km,
        "vehicle_type": vehicle_type,
        "fuel_price_per_liter": fuel_price_per_liter,
        "mileage_kpl": mileage_kpl,
        "fuel_liters": fuel_liters,
        "total_fuel_cost": total_fuel_cost,
        "cost_share": cost_share,
        "rider_fuel_offset": rider_fuel_offset,
        "commercial_name": commercial_name,
        "commercial_fare": commercial_fare,
        "savings_amount": savings_amount,
        "savings_pct": max(0, min(95, savings_pct)),
        "co2_saved_kg": co2_saved_kg,
        "is_parcel": is_parcel
    }
