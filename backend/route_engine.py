from math import radians, sin, cos, sqrt, atan2
from typing import List

EARTH_RADIUS_M = 6371000


def haversine(point_a: tuple[float, float], point_b: tuple[float, float]) -> float:
    lat1, lon1 = point_a
    lat2, lon2 = point_b
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_M * c


def route_length(polyline: List[dict]) -> float:
    total = 0.0
    for i in range(len(polyline) - 1):
        total += haversine(
            (polyline[i]["latitude"], polyline[i]["longitude"]),
            (polyline[i + 1]["latitude"], polyline[i + 1]["longitude"]),
        )
    return total


def minimum_distance_to_route(point: tuple[float, float], route: List[dict]) -> float:
    """Calculates the minimum distance (in meters) from a point to any segment of a route polyline."""
    if not route:
        return float("inf")
    if len(route) == 1:
        return haversine(point, (route[0]["latitude"], route[0]["longitude"]))

    from math import cos, radians
    ref_lat = route[0]["latitude"]
    m_per_deg = 111_320.0
    px, py = point[1] * m_per_deg * cos(radians(ref_lat)), point[0] * m_per_deg

    min_dist = float("inf")
    for i in range(len(route) - 1):
        ax = route[i]["longitude"] * m_per_deg * cos(radians(ref_lat))
        ay = route[i]["latitude"] * m_per_deg
        bx = route[i + 1]["longitude"] * m_per_deg * cos(radians(ref_lat))
        by = route[i + 1]["latitude"] * m_per_deg

        dx, dy = bx - ax, by - ay
        len_sq = dx * dx + dy * dy
        if len_sq == 0:
            t = 0.0
        else:
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len_sq))

        closest_x, closest_y = ax + t * dx, ay + t * dy
        dist = ((px - closest_x) ** 2 + (py - closest_y) ** 2) ** 0.5
        if dist < min_dist:
            min_dist = dist

    return min_dist


def count_matched_length(source_polyline: List[dict], target_polyline: List[dict], threshold_m: float = 120.0) -> float:
    """Calculates the distance (in meters) of source_polyline that overlaps with target_polyline within threshold_m."""
    if not source_polyline or not target_polyline or len(source_polyline) < 2 or len(target_polyline) < 2:
        return 0.0
    matched_length = 0.0
    for i in range(len(source_polyline) - 1):
        p1 = (source_polyline[i]["latitude"], source_polyline[i]["longitude"])
        p2 = (source_polyline[i + 1]["latitude"], source_polyline[i + 1]["longitude"])
        segment_length = haversine(p1, p2)
        if segment_length <= 0:
            continue
        # Sample points along long segments (at least midpoint, or every ~100m)
        num_samples = max(2, int(segment_length / 100.0) + 1)
        matched_samples = 0
        for s in range(num_samples):
            t = s / (num_samples - 1) if num_samples > 1 else 0.5
            sample_lat = p1[0] + t * (p2[0] - p1[0])
            sample_lng = p1[1] + t * (p2[1] - p1[1])
            if minimum_distance_to_route((sample_lat, sample_lng), target_polyline) <= threshold_m:
                matched_samples += 1
        fraction_matched = matched_samples / num_samples
        matched_length += segment_length * fraction_matched
    return matched_length


def overlap_score(polyline_a: List[dict], polyline_b: List[dict], threshold_m: float = 120.0) -> float:
    if not polyline_a or not polyline_b or len(polyline_a) < 2 or len(polyline_b) < 2:
        return 0.0
    common_length = count_matched_length(polyline_a, polyline_b, threshold_m)
    shorter = min(route_length(polyline_a), route_length(polyline_b))
    return min(1.0, common_length / shorter) if shorter > 0 else 0.0


def calculate_detour(traveler_polyline: List[dict], parcel_polyline: List[dict]) -> float:
    """
    Calculates the detour distance (in meters) for a traveler to carry a parcel.
    Detour = min_distance(P_start to T_polyline) + min_distance(P_end to T_polyline)
    """
    if not traveler_polyline or not parcel_polyline:
        return 0.0
    p_start = (parcel_polyline[0]["latitude"], parcel_polyline[0]["longitude"])
    p_end = (parcel_polyline[-1]["latitude"], parcel_polyline[-1]["longitude"])
    
    detour_start = minimum_distance_to_route(p_start, traveler_polyline)
    detour_end = minimum_distance_to_route(p_end, traveler_polyline)
    
    if detour_start == float("inf"):
        detour_start = 0.0
    if detour_end == float("inf"):
        detour_end = 0.0
        
    return detour_start + detour_end


def calculate_overlap_score(traveler_polyline: List[dict], parcel_polyline: List[dict], threshold_m: float = 120.0) -> float:
    """
    Calculates overlap score = Common Route Distance / Total Route Distance (of the parcel)
    """
    if len(traveler_polyline) < 2 or len(parcel_polyline) < 2:
        return 0.0
    common_length = count_matched_length(parcel_polyline, traveler_polyline, threshold_m)
    total_length = route_length(parcel_polyline)
    return min(1.0, common_length / total_length) if total_length > 0 else 0.0


def detect_route_deviation(current_pos: tuple[float, float], route: List[dict], threshold_m: float = 500.0) -> dict:
    """
    Checks if a rider's live position (lat, lng) has deviated from their registered polyline beyond threshold_m.
    Returns: {"is_deviated": bool, "deviation_distance_m": float, "threshold_m": float}
    """
    if not route or len(route) < 2:
        return {"is_deviated": False, "deviation_distance_m": 0.0, "threshold_m": threshold_m}

    dist = minimum_distance_to_route(current_pos, route)
    is_deviated = (dist != float("inf")) and (dist > threshold_m)
    return {
        "is_deviated": is_deviated,
        "deviation_distance_m": round(dist, 1) if dist != float("inf") else 0.0,
        "threshold_m": threshold_m
    }
