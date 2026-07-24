from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr


class UserCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    government_id: str
    face_verified: bool = False
    rating: float = 0.0
    delivery_success_rate: float = 0.0
    cancellation_count: int = 0
    trust_score: int = 0
    completed_deliveries: int = 0
    route_deviation_count: int = 0
    report_count: int = 0
    response_time_minutes: float = 10.0
    # Optional auth fields
    password: Optional[str] = None
    dob: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    wallet_balance: float = 0.0
    escrow_balance: float = 0.0


class UserResponse(UserCreate):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


class RoutePoint(BaseModel):
    latitude: float
    longitude: float


class RouteCreate(BaseModel):
    user_id: int
    origin: str
    destination: str
    polyline: List[RoutePoint]
    departure_time: datetime
    max_wait_minutes: int = 15
    package_weight_kg: float = 0.0
    package_category: str = "none"
    route_type: Optional[str] = "traveler"
    package_size: Optional[str] = "medium"
    overlap_threshold: Optional[float] = None


class RouteResponse(RouteCreate):
    id: int
    total_distance_m: float
    created_at: datetime

    class Config:
        orm_mode = True


class MatchRequest(BaseModel):
    polyline: List[RoutePoint]
    departure_time: datetime
    max_wait_minutes: int = 15
    package_weight_kg: float = 0.0
    package_category: str = "none"
    route_type: Optional[str] = "parcel"
    package_size: Optional[str] = "medium"
    overlap_threshold: Optional[float] = None


class MatchCandidate(BaseModel):
    route_id: int
    user_id: int
    origin: str
    destination: str
    overlap_score: float
    trust_score: int
    risk_level: str
    estimated_cost_share: float
    carbon_savings_kg: float
    departure_time: datetime
    match_percentage: float
    shared_route_distance_m: float
    detour_m: float
    estimated_delivery_success: float
    ai_recommendation: str
    risk_reason: str


class MatchResponse(BaseModel):
    matches: List[MatchCandidate]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OTPRequest(BaseModel):
    phone: str


class OTPVerify(BaseModel):
    phone: str
    code: str


class WalletDepositRequest(BaseModel):
    user_id: int
    amount: float


class EscrowHoldRequest(BaseModel):
    sender_id: int
    amount: float


class EscrowReleaseRequest(BaseModel):
    sender_id: int
    driver_id: int
    amount: float


class EscrowRefundRequest(BaseModel):
    sender_id: int
    amount: float


class UserVerifyRequest(BaseModel):
    user_id: int
    government_id: str


class UserActivityUpdate(BaseModel):
    rating: Optional[float] = None
    completed_deliveries: Optional[int] = None
    cancellation_count: Optional[int] = None
    delivery_success_rate: Optional[float] = None
    route_deviation_count: Optional[int] = None
    report_count: Optional[int] = None
    response_time_minutes: Optional[float] = None
    face_verified: Optional[bool] = None
