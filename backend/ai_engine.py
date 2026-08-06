from typing import Literal


def calculate_trust_score(
    face_verified: bool = False,
    rating: float = 0.0,
    completed_deliveries: int = 0,
    cancellation_count: int = 0,
    delivery_success_rate: float = 0.0, # 0 to 100
    route_deviation_count: int = 0,
    report_count: int = 0,
    response_time_minutes: float = 10.0,
    **kwargs
) -> int:
    # Handle old arguments for backward compatibility
    if "id_verification_score" in kwargs:
        face_verified = kwargs["id_verification_score"] >= 80.0
    if "user_rating" in kwargs:
        rating = kwargs["user_rating"] / 20.0  # user_rating was rating * 20
    if "risk_history_penalty" in kwargs:
        cancellation_count = int(kwargs["risk_history_penalty"] / 5.0)
    if "delivery_success_rate" in kwargs and delivery_success_rate == 0.0:
        delivery_success_rate = kwargs["delivery_success_rate"]

    # Start with base score of 50
    score = 50.0
    
    # 1. Identity Verification bonus (+20 points)
    if face_verified:
        score += 20.0
        
    # 2. Average Rating (0.0 to 5.0). Max 15 points.
    score += rating * 3.0
    
    # 3. Completed deliveries bonus (up to 15 points)
    score += min(15.0, completed_deliveries * 1.5)
    
    # 4. Delivery Success Rate (0 to 100). Max 10 points.
    score += (delivery_success_rate / 10.0)
    
    # Penalties:
    # 5. Cancellations: cancellation rate
    total_bookings = completed_deliveries + cancellation_count
    if total_bookings > 0:
        cancellation_rate = cancellation_count / total_bookings
        score -= cancellation_rate * 25.0
        
    # 6. Route deviation penalty: -5 points per deviation, max -20
    score -= min(20.0, route_deviation_count * 5.0)
    
    # 7. Reports/complaints penalty: -15 points per report, max -45
    score -= min(45.0, report_count * 15.0)
    
    # 8. Response time penalty
    if response_time_minutes > 5.0:
        penalty = min(10.0, (response_time_minutes - 5.0) * 0.2)
        score -= penalty
        
    return max(0, min(100, round(score)))


def classify_trust_risk_level(trust_score: int) -> str:
    # Risk Levels:
    # 90–100 → Very Low Risk
    # 75–89 → Low Risk
    # 50–74 → Medium Risk
    # 0–49 → High Risk
    if trust_score >= 90:
        return "Very Low Risk"
    elif trust_score >= 75:
        return "Low Risk"
    elif trust_score >= 50:
        return "Medium Risk"
    else:
        return "High Risk"


def get_ai_recommendation(trust_score: int) -> str:
    # AI Recommendation ("Highly Recommended", "Recommended", "Not Recommended")
    if trust_score >= 90:
        return "Highly Recommended"
    elif trust_score >= 50:
        return "Recommended"
    else:
        return "Not Recommended"


def generate_risk_reasons(
    face_verified: bool,
    rating: float,
    completed_deliveries: int,
    cancellation_count: int,
    route_deviation_count: int,
    report_count: int,
    response_time_minutes: float
) -> str:
    reasons = []
    if not face_verified:
        reasons.append("Identity verification pending")
    if rating < 4.2 and rating > 0:
        reasons.append(f"Below average rating ({rating:.1f}/5)")
    
    total_bookings = completed_deliveries + cancellation_count
    if total_bookings > 0:
        cancellation_rate = cancellation_count / total_bookings
        if cancellation_rate > 0.15:
            reasons.append(f"High cancellation rate ({cancellation_rate*100:.0f}%)")
            
    if route_deviation_count > 0:
        reasons.append(f"Route deviations detected ({route_deviation_count})")
    if report_count > 0:
        reasons.append(f"User reports filed ({report_count})")
    if response_time_minutes > 15.0:
        reasons.append(f"Slow response time ({response_time_minutes:.0f} mins)")
        
    if not reasons:
        return "Excellent profile history, fully verified and reliable."
    return ", ".join(reasons)





def estimate_carbon_savings(shared_route_m: float, individual_route_m: float) -> float:
    emissions_per_meter = 0.00000025
    shared_emissions = shared_route_m * emissions_per_meter
    separate_emissions = individual_route_m * emissions_per_meter * 2
    return max(0.0, separate_emissions - shared_emissions)
