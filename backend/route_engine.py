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
    distances = [
        haversine(point, (segment_point["latitude"], segment_point["longitude"]))
        for segment_point in route
    ]
    return min(distances) if distances else float("inf")


def count_matched_length(source_polyline: List[dict], target_polyline: List[dict], threshold_m: float = 120.0) -> float:
    matched_length = 0.0
    for i in range(len(source_polyline) - 1):
        midpoint = (
            (source_polyline[i]["latitude"] + source_polyline[i + 1]["latitude"]) / 2,
            (source_polyline[i]["longitude"] + source_polyline[i + 1]["longitude"]) / 2,
        )
        segment_length = haversine(
            (source_polyline[i]["latitude"], source_polyline[i]["longitude"]),
            (source_polyline[i + 1]["latitude"], source_polyline[i + 1]["longitude"]),
        )
        if minimum_distance_to_route(midpoint, target_polyline) <= threshold_m:
            matched_length += segment_length
    return matched_length


def overlap_score(polyline_a: List[dict], polyline_b: List[dict], threshold_m: float = 120.0) -> float:
    if len(polyline_a) < 2 or len(polyline_b) < 2:
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
