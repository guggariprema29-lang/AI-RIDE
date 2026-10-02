class RideModel {
  final int id;
  final int riderId;
  final String origin;
  final String destination;
  final double originLat;
  final double originLng;
  final double destLat;
  final double destLng;
  final double? currentLat;
  final double? currentLng;
  final String vehicleType;
  final String? vehicleNumber;
  final int seatsTotal;
  final int bookedSeats;
  final int seatsAvailable;
  final double farePerKm;
  final String departureTime;
  final String? notes;
  final bool womenOnly;
  final String status;
  final String? riderName;
  final String? riderPublicId;
  final int? riderTrustScore;
  final double? riderRating;
  final String? riskLevel;
  final String? aiRecommendation;
  final double? overlapScore;
  final double? detourMeters;
  final double? estimatedFare;

  RideModel({
    required this.id,
    required this.riderId,
    required this.origin,
    required this.destination,
    required this.originLat,
    required this.originLng,
    required this.destLat,
    required this.destLng,
    this.currentLat,
    this.currentLng,
    required this.vehicleType,
    this.vehicleNumber,
    required this.seatsTotal,
    required this.bookedSeats,
    required this.seatsAvailable,
    required this.farePerKm,
    required this.departureTime,
    this.notes,
    this.womenOnly = false,
    required this.status,
    this.riderName,
    this.riderPublicId,
    this.riderTrustScore,
    this.riderRating,
    this.riskLevel,
    this.aiRecommendation,
    this.overlapScore,
    this.detourMeters,
    this.estimatedFare,
  });

  factory RideModel.fromJson(Map<String, dynamic> json) {
    return RideModel(
      id: json['id'] is int ? json['id'] : int.parse(json['id'].toString()),
      riderId: json['rider_id'] is int ? json['rider_id'] : int.parse(json['rider_id'].toString()),
      origin: json['origin'] ?? '',
      destination: json['destination'] ?? '',
      originLat: (json['origin_lat'] ?? 0.0).toDouble(),
      originLng: (json['origin_lng'] ?? 0.0).toDouble(),
      destLat: (json['dest_lat'] ?? 0.0).toDouble(),
      destLng: (json['dest_lng'] ?? 0.0).toDouble(),
      currentLat: json['current_lat'] != null ? (json['current_lat']).toDouble() : null,
      currentLng: json['current_lng'] != null ? (json['current_lng']).toDouble() : null,
      vehicleType: json['vehicle_type'] ?? 'car',
      vehicleNumber: json['vehicle_number'],
      seatsTotal: json['seats_total'] ?? 4,
      bookedSeats: json['booked_seats'] ?? 0,
      seatsAvailable: json['seats_available'] ?? 4,
      farePerKm: (json['fare_per_km'] ?? 6.0).toDouble(),
      departureTime: json['departure_time'] ?? DateTime.now().toIso8601String(),
      notes: json['notes'],
      womenOnly: json['women_only'] ?? false,
      status: json['status'] ?? 'available',
      riderName: json['rider_name'],
      riderPublicId: json['rider_public_id'],
      riderTrustScore: json['rider_trust_score'],
      riderRating: json['rider_rating'] != null ? (json['rider_rating']).toDouble() : null,
      riskLevel: json['risk_level'],
      aiRecommendation: json['ai_recommendation'],
      overlapScore: json['overlap_score'] != null ? (json['overlap_score']).toDouble() : null,
      detourMeters: json['detour_m'] != null ? (json['detour_m']).toDouble() : null,
      estimatedFare: json['fare'] != null ? (json['fare']).toDouble() : null,
    );
  }

  double get totalDistanceM => detourMeters ?? 5000.0;
}
