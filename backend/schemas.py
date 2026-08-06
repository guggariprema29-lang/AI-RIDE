import re
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr, field_validator


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
    password: Optional[str] = None
    dob: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = "unspecified"
    wallet_balance: float = 0.0
    escrow_balance: float = 0.0

    @field_validator("phone")
    def validate_phone(cls, v):
        if not v:
            return "9876543210"
        clean = re.sub(r"\D", "", str(v))
        if len(clean) > 10 and clean.startswith("91"):
            clean = clean[2:]
        if len(clean) != 10:
            # Fallback for short/demo numbers to prevent 422 errors
            return clean if len(clean) >= 5 else "9876543210"
        return clean

    @field_validator("government_id")
    def validate_gov_id(cls, v):
        if not v:
            return "DEMO-GOV-ID-100"
        clean = re.sub(r"[\s-]", "", str(v).strip().upper())
        if len(clean) < 3:
            return "DEMO-GOV-ID-100"
        return clean


class UserResponse(UserCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


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
        from_attributes = True


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


class RidePublishRequest(BaseModel):
    rider_id: int
    origin: str
    destination: str
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    polyline: List[RoutePoint] = Field(default_factory=list)
    vehicle_type: str = "car"
    vehicle_number: Optional[str] = None
    seats_total: int = 1
    fare_per_km: Optional[float] = None
    departure_time: datetime
    notes: Optional[str] = None
    women_only: bool = False


class RideLocationUpdate(BaseModel):
    latitude: float
    longitude: float


class RideStatusUpdate(BaseModel):
    status: str  # available | started | completed | cancelled


class RideSearchRequest(BaseModel):
    passenger_id: Optional[int] = None
    pickup: str
    dropoff: str
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    seats: int = 1
    max_detour_m: float = 2000.0
    min_overlap: float = 0.45
    women_only_filter: bool = False


class BookingCreate(BaseModel):
    ride_id: int
    passenger_id: int
    pickup: str
    dropoff: str
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    seats: int = 1
    # Must match the radius the passenger searched with, otherwise a ride that
    # was offered to them would be refused at booking time.
    max_detour_m: float = 5000.0


class RelayBookingCreate(BaseModel):
    passenger_id: int
    leg1_ride_id: int
    leg2_ride_id: int
    pickup: str
    dropoff: str
    transfer_point: str
    pickup_lat: float
    pickup_lng: float
    transfer_lat: float
    transfer_lng: float
    drop_lat: float
    drop_lng: float
    seats: int = 1
    max_detour_m: float = 5000.0


class BookingStatusUpdate(BaseModel):
    status: str  # pending | accepted | rejected | cancelled


class BookingStartRequest(BaseModel):
    otp: str


class BookingRateRequest(BaseModel):
    rater: str  # "passenger" rates the rider, "rider" rates the passenger
    rating: float = Field(ge=1, le=5)
    review: Optional[str] = None


class UserActivityUpdate(BaseModel):
    rating: Optional[float] = None
    completed_deliveries: Optional[int] = None
    cancellation_count: Optional[int] = None
    delivery_success_rate: Optional[float] = None
    route_deviation_count: Optional[int] = None
    report_count: Optional[int] = None
    response_time_minutes: Optional[float] = None
    face_verified: Optional[bool] = None
    gender: Optional[str] = None


class ParcelCreate(BaseModel):
    sender_id: int
    title: str
    category: str = "documents"
    weight_kg: float = Field(default=1.0, le=5.0)
    pickup: str
    dropoff: str
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    receiver_name: str
    receiver_phone: str
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    fare: float = Field(default=50.0, gt=0.0)
    women_only: bool = False


class ParcelAcceptRequest(BaseModel):
    rider_id: int
    ride_id: int


class ParcelOTPVerify(BaseModel):
    otp: str

