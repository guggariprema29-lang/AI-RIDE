class UserModel {
  final int id;
  final String name;
  final String? email;
  final String? phone;
  final String? governmentId;
  final bool faceVerified;
  final double rating;
  final int trustScore;
  final double walletBalance;
  final double escrowBalance;
  final int completedDeliveries;
  final int cancellationCount;
  final int totalBookings;
  final int totalCancellations;
  final double cancellationRate;
  final bool isCancellationFlagged;
  final int routeDeviationCount;
  final int reportCount;
  final String gender;
  final String? publicId;

  UserModel({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.governmentId,
    this.faceVerified = false,
    this.rating = 0.0,
    this.trustScore = 50,
    this.walletBalance = 0.0,
    this.escrowBalance = 0.0,
    this.completedDeliveries = 0,
    this.cancellationCount = 0,
    this.totalBookings = 0,
    this.totalCancellations = 0,
    this.cancellationRate = 0.0,
    this.isCancellationFlagged = false,
    this.routeDeviationCount = 0,
    this.reportCount = 0,
    this.gender = 'unspecified',
    this.publicId,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] is int ? json['id'] : int.parse(json['id'].toString()),
      name: json['name'] ?? 'User',
      email: json['email'],
      phone: json['phone'],
      governmentId: json['government_id'],
      faceVerified: json['face_verified'] ?? false,
      rating: (json['rating'] ?? 0.0).toDouble(),
      trustScore: json['trust_score'] ?? 50,
      walletBalance: (json['wallet_balance'] ?? 0.0).toDouble(),
      escrowBalance: (json['escrow_balance'] ?? 0.0).toDouble(),
      completedDeliveries: json['completed_deliveries'] ?? 0,
      cancellationCount: json['cancellation_count'] ?? 0,
      totalBookings: json['total_bookings'] ?? 0,
      totalCancellations: json['total_cancellations'] ?? 0,
      cancellationRate: (json['cancellation_rate'] ?? 0.0).toDouble(),
      isCancellationFlagged: json['is_cancellation_flagged'] ?? false,
      routeDeviationCount: json['route_deviation_count'] ?? 0,
      reportCount: json['report_count'] ?? 0,
      gender: json['gender'] ?? 'unspecified',
      publicId: json['public_id'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'government_id': governmentId,
      'face_verified': faceVerified,
      'rating': rating,
      'trust_score': trustScore,
      'wallet_balance': walletBalance,
      'escrow_balance': escrowBalance,
      'completed_deliveries': completedDeliveries,
      'cancellation_count': cancellationCount,
      'total_bookings': totalBookings,
      'total_cancellations': totalCancellations,
      'cancellation_rate': cancellationRate,
      'is_cancellation_flagged': isCancellationFlagged,
      'route_deviation_count': routeDeviationCount,
      'report_count': reportCount,
      'gender': gender,
      'public_id': publicId,
    };
  }
}
