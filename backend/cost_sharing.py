"""Cost sharing & fare breakdown calculation module.

Calculates fuel cost share, 5% platform infrastructure & safety fee,
rider payout, passenger fare breakdown, and savings vs commercial taxi.
"""

# Configurable Platform Fee / Commission percentage (5% nominal infrastructure & safety fee)
COMMISSION_PERCENT = 5.0

# Average fuel mileage by vehicle type (km per liter)
VEHICLE_MILEAGE = {
    "bike": 45.0,
    "auto": 25.0,
    "car": 15.0
}

# Average fuel price per liter in INR
FUEL_PRICE_PER_LITER = 102.0

# Estimated commercial taxi rate per km (INR) for savings calculation
TAXI_RATE_PER_KM = 16.0


def calculate_cost_split(
    shared_distance_m: float,
    total_ride_distance_m: float = 0.0,
    fare_per_km: float = 6.0,
    seats: int = 1,
    vehicle_type: str = "car",
    commission_percent: float = COMMISSION_PERCENT
) -> dict:
    """Calculates complete cost sharing breakdown between rider, passenger(s), and platform service fee."""
    shared_km = max(0.1, shared_distance_m / 1000.0)
    total_km = max(shared_km, total_ride_distance_m / 1000.0) if total_ride_distance_m > 0 else shared_km

    # Passenger cost share fare (base fuel split)
    fare_total = round(shared_km * fare_per_km * seats, 2)
    fare_per_seat = round(fare_total / max(1, seats), 2)

    # 5% Platform Infrastructure & Safety Fee
    platform_fee = round(fare_total * (commission_percent / 100.0), 2)
    rider_payout = round(fare_total - platform_fee, 2)

    # Estimated fuel consumption for the shared leg
    mileage = VEHICLE_MILEAGE.get(vehicle_type.lower(), 15.0)
    fuel_liters = round(shared_km / mileage, 3)
    fuel_cost_shared_leg = round(fuel_liters * FUEL_PRICE_PER_LITER, 2)

    # Commercial taxi reference cost for comparison
    commercial_taxi_fare = round(shared_km * TAXI_RATE_PER_KM * seats, 2)
    passenger_savings = max(0.0, round(commercial_taxi_fare - fare_total, 2))
    savings_percent = round((passenger_savings / commercial_taxi_fare) * 100.0, 1) if commercial_taxi_fare > 0 else 0.0

    # Share ratio of total ride
    share_ratio_percent = round((shared_km / total_km) * 100.0, 1)

    return {
        "shared_distance_km": round(shared_km, 2),
        "total_ride_distance_km": round(total_km, 2),
        "seats_booked": seats,
        "fare_per_km": fare_per_km,
        "total_fare": fare_total,
        "base_fare": fare_total,
        "platform_fee": platform_fee,
        "commission_percent": commission_percent,
        "rider_payout": rider_payout,
        "fare_per_seat": fare_per_seat,
        "estimated_fuel_liters": fuel_liters,
        "estimated_fuel_cost": fuel_cost_shared_leg,
        "commercial_taxi_estimate": commercial_taxi_fare,
        "passenger_savings_amount": passenger_savings,
        "passenger_savings_percent": savings_percent,
        "route_share_percent": share_ratio_percent,
    }
