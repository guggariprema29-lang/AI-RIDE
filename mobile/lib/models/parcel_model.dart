class ParcelModel {
  final int id;
  final int senderId;
  final int? riderId;
  final int? rideId;
  final String category;
  final double weightKg;
  final String pickupAddress;
  final String dropoffAddress;
  final String receiverName;
  final String receiverPhone;
  final double fare;
  final String status;
  final String pickupOtp;
  final String deliveryOtp;
  final String? senderName;
  final String? riderName;

  ParcelModel({
    required this.id,
    required this.senderId,
    this.riderId,
    this.rideId,
    required this.category,
    required this.weightKg,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.receiverName,
    required this.receiverPhone,
    required this.fare,
    required this.status,
    required this.pickupOtp,
    required this.deliveryOtp,
    this.senderName,
    this.riderName,
  });

  factory ParcelModel.fromJson(Map<String, dynamic> json) {
    return ParcelModel(
      id: json['id'] is int ? json['id'] : int.parse(json['id'].toString()),
      senderId: json['sender_id'] is int ? json['sender_id'] : int.parse(json['sender_id'].toString()),
      riderId: json['rider_id'] != null ? (json['rider_id'] is int ? json['rider_id'] : int.parse(json['rider_id'].toString())) : null,
      rideId: json['ride_id'] != null ? (json['ride_id'] is int ? json['ride_id'] : int.parse(json['ride_id'].toString())) : null,
      category: json['category'] ?? 'documents',
      weightKg: (json['weight_kg'] ?? 1.0).toDouble(),
      pickupAddress: (json['pickup'] ?? json['pickup_address'] ?? '').toString(),
      dropoffAddress: (json['dropoff'] ?? json['dropoff_address'] ?? '').toString(),
      receiverName: json['receiver_name'] ?? '',
      receiverPhone: json['receiver_phone'] ?? '',
      fare: (json['fare'] ?? 0.0).toDouble(),
      status: json['status'] ?? 'published',
      pickupOtp: json['pickup_otp'] ?? '0000',
      deliveryOtp: json['delivery_otp'] ?? '0000',
      senderName: json['sender_name'],
      riderName: json['rider_name'],
    );
  }
}
