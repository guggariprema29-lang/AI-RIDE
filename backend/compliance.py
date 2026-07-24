from typing import Literal

MAX_COST_SHARE_PERCENT = 100
MAX_PACKAGE_WEIGHT_KG = 5.0
ALLOWED_PACKAGE_CATEGORIES = {
    "documents",
    "clothes",
    "clothing",
    "accessories",
    "gift",
    "electronics",
    "food",
    "medicine",
    "personal-care",
    "books",
    "other",
    "none",
}


def is_package_allowed(weight_kg: float, category: str) -> bool:
    return weight_kg <= MAX_PACKAGE_WEIGHT_KG and category.lower() in ALLOWED_PACKAGE_CATEGORIES


def calculate_cost_share(total_fuel_cost: float, shared_distance_m: float, total_distance_m: float) -> float:
    if total_distance_m <= 0:
        return 0.0
    share_ratio = min(1.0, shared_distance_m / total_distance_m)
    fair_cost = total_fuel_cost * share_ratio
    return round(fair_cost, 2)


def enforce_earnings_cap(per_ride_amount: float, max_allowed: float = 10.0) -> float:
    return min(per_ride_amount, max_allowed)


def format_package_category(category: str) -> str:
    return category.lower().strip()
