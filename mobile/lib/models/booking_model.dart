class BookingModel {
  final int id;
  final int rideId;
  final int passengerId;
  final String pickup;
  final String dropoff;
  final double pickupLat;
  final double pickupLng;
  final double dropLat;
  final double dropLng;
  final int seats;
  final double fare;
  final String status;
  final String? otp;
  final String? riderName;
  final String? riderPublicId;
  final int? riderTrustScore;
  final String? passengerName;
  final String? passengerPublicId;
  final int? passengerTrustScore;
  final String? vehicleType;
  final String? rideDepartureTime;
  final double? cancellationFee;
  final double? refundAmount;

  BookingModel({
    required this.id,
    required this.rideId,
    required this.passengerId,
    required this.pickup,
    required this.dropoff,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropLat,
    required this.dropLng,
    required this.seats,
    required this.fare,
    required this.status,
    this.otp,
    this.riderName,
    this.riderPublicId,
    this.riderTrustScore,
    this.passengerName,
    this.passengerPublicId,
    this.passengerTrustScore,
    this.vehicleType,
    this.rideDepartureTime,
    this.cancellationFee,
    this.refundAmount,
  });

  factory BookingModel.fromJson(Map<String, dynamic> json) {
    return BookingModel(
      id: json['id'] is int ? json['id'] : int.parse(json['id'].toString()),
      rideId: json['ride_id'] is int ? json['ride_id'] : int.parse(json['ride_id'].toString()),
      passengerId: json['passenger_id'] is int ? json['passenger_id'] : int.parse(json['passenger_id'].toString()),
      pickup: json['pickup'] ?? '',
      dropoff: json['dropoff'] ?? '',
      pickupLat: (json['pickup_lat'] ?? 0.0).toDouble(),
      pickupLng: (json['pickup_lng'] ?? 0.0).toDouble(),
      dropLat: (json['drop_lat'] ?? 0.0).toDouble(),
      dropLng: (json['drop_lng'] ?? 0.0).toDouble(),
      seats: json['seats'] ?? 1,
      fare: (json['fare'] ?? 0.0).toDouble(),
      status: json['status'] ?? 'pending',
      otp: json['otp'],
      riderName: json['rider_name'],
      riderPublicId: json['rider_public_id'],
      riderTrustScore: json['rider_trust_score'],
      passengerName: json['passenger_name'],
      passengerPublicId: json['passenger_public_id'],
      passengerTrustScore: json['passenger_trust_score'],
      vehicleType: json['vehicle_type'],
      rideDepartureTime: json['ride_departure_time'],
      cancellationFee: json['cancellation_fee'] != null ? (json['cancellation_fee']).toDouble() : null,
      refundAmount: json['refund_amount'] != null ? (json['refund_amount']).toDouble() : null,
    );
  }
}
