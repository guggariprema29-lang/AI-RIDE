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
        if ride.get("seats_available", 0) < seats:
            continue
        score = match_ride(ride, pickup, drop, max_detour_m, min_overlap)
        if not score:
            continue
        merged = dict(ride)
        merged.update(score)
        merged["fare"] = round(score["fare"] * seats, 2)
        results.append(merged)

    # Closest pickup first — that is what a waiting passenger cares about —
    # then best overlap, then soonest departure.
    results.sort(key=lambda r: (r["pickup_detour_m"], -r["overlap_score"], r["departure_time"]))
    return results


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
