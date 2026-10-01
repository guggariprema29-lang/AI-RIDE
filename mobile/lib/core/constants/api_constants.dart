import 'dart:io';
import 'package:flutter/foundation.dart';

class ApiConstants {
  // Production Cloud Deployed API (Render)
  static const String prodApiBase = 'https://airide-api-mzah.onrender.com';

  // Local Development Fallbacks
  static String get localApiBase {
    if (kIsWeb) return 'http://127.0.0.1:8000';
    if (Platform.isAndroid) return 'http://10.0.2.2:8000'; // Android emulator host alias
    return 'http://127.0.0.1:8000'; // iOS simulator / local
  }

  // Active Base URL (Production by default)
  static String get baseUrl => prodApiBase;

  // Active WebSocket Base URL
  static String get wsBaseUrl {
    final base = baseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    return base;
  }

  // Endpoints
  static const String login = '/auth/login';
  static const String register = '/users/register';
  static const String sendOtp = '/auth/send-otp';
  static const String verifyOtp = '/auth/verify-otp';
  
  static const String liveRides = '/rides/live';
  static const String nearbyRides = '/rides/nearby';
  static const String searchRides = '/rides/search';
  static const String publishRide = '/rides/publish';
  
  static const String createBooking = '/bookings';
  static const String relayBooking = '/bookings/relay';
  static const String passengerBookings = '/bookings/passenger';
  static const String riderBookings = '/bookings/rider';
  
  static const String cancellationPreview = '/cancellation-preview';
  static const String cancelBooking = '/cancel';
  
  static const String triggerSos = '/sos/trigger';
  static const String emergencyContact = '/sos/contact';
  
  static const String parcelsCreate = '/parcels/create';
  static const String parcelsSender = '/parcels/sender';
  static const String parcelsRider = '/parcels/rider';
  
  static const String userTrustScore = '/users/trust-score';
  static const String userVerify = '/users/verify';
  static const String walletBalance = '/wallet/balance';
  static const String walletDeposit = '/wallet/deposit';
}
