import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/constants/api_constants.dart';
import '../models/user_model.dart';
import '../models/ride_model.dart';
import '../models/booking_model.dart';
import '../models/parcel_model.dart';

class ApiService {
  String? _authToken;

  void setAuthToken(String? token) {
    _authToken = token;
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  // ── Authentication ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    final url = '${ApiConstants.baseUrl}${ApiConstants.login}';
    print('[AUTH API] AUTH REQUEST STARTED -> POST $url');
    try {
      final response = await http
          .post(
            Uri.parse(url),
            headers: _headers,
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 15));
      print('[AUTH API] RESPONSE RECEIVED (${response.statusCode}): ${response.body}');
      return _handleResponse(response);
    } on TimeoutException {
      print('[AUTH API] REQUEST TIMEOUT (15s)');
      throw Exception('Unable to connect to server. Please check your internet connection and try again.');
    } on SocketException catch (e) {
      print('[AUTH API] SOCKET EXCEPTION: $e');
      throw Exception('Unable to connect to server. Please check your internet connection and try again.');
    } catch (e) {
      print('[AUTH API] REQUEST ERROR: $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final url = '${ApiConstants.baseUrl}${ApiConstants.register}';
    print('[AUTH API] AUTH REGISTER STARTED -> POST $url');
    try {
      final response = await http
          .post(
            Uri.parse(url),
            headers: _headers,
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 15));
      print('[AUTH API] REGISTER RESPONSE RECEIVED (${response.statusCode}): ${response.body}');
      return _handleResponse(response);
    } on TimeoutException {
      print('[AUTH API] REGISTER TIMEOUT (15s)');
      throw Exception('Unable to connect to server. Please check your internet connection and try again.');
    } on SocketException catch (e) {
      print('[AUTH API] REGISTER SOCKET EXCEPTION: $e');
      throw Exception('Unable to connect to server. Please check your internet connection and try again.');
    } catch (e) {
      print('[AUTH API] REGISTER ERROR: $e');
      rethrow;
    }
  }

  // ── User & Trust Score ──────────────────────────────────────────────────────

  Future<UserModel> getUserProfile(int userId) async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}/users/$userId'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    return UserModel.fromJson(data);
  }

  Future<Map<String, dynamic>> getUserTrustProfile(int userId) async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.userTrustScore}/$userId'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ── Rides & AI Matching ─────────────────────────────────────────────────────

  Future<List<RideModel>> getLiveRides() async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.liveRides}'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    final List rides = data['rides'] ?? [];
    return rides.map((r) => RideModel.fromJson(r)).toList();
  }

  Future<List<RideModel>> searchRides({
    required double pickupLat,
    required double pickupLng,
    required double dropLat,
    required double dropLng,
    int seats = 1,
    int? passengerId,
    bool womenOnlyFilter = false,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.searchRides}'),
      headers: _headers,
      body: jsonEncode({
        'pickup_lat': pickupLat,
        'pickup_lng': pickupLng,
        'drop_lat': dropLat,
        'drop_lng': dropLng,
        'seats': seats,
        if (passengerId != null) 'passenger_id': passengerId,
        'women_only_filter': womenOnlyFilter,
      }),
    );
    final data = _handleResponse(response);
    final List matches = data['matches'] ?? [];
    return matches.map((m) => RideModel.fromJson(m)).toList();
  }

  Future<RideModel> publishRide(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.publishRide}'),
      headers: _headers,
      body: jsonEncode(payload),
    );
    final data = _handleResponse(response);
    return RideModel.fromJson(data);
  }

  Future<void> pushRideLocation(int rideId, double lat, double lng) async {
    await http.post(
      Uri.parse('${ApiConstants.baseUrl}/rides/$rideId/location'),
      headers: _headers,
      body: jsonEncode({'latitude': lat, 'longitude': lng}),
    );
  }

  // ── Bookings & Cost Split Escrow ────────────────────────────────────────────

  Future<BookingModel> createBooking(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.createBooking}'),
      headers: _headers,
      body: jsonEncode(payload),
    );
    final data = _handleResponse(response);
    return BookingModel.fromJson(data);
  }

  Future<List<BookingModel>> getPassengerBookings(int passengerId) async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.passengerBookings}/$passengerId'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    final List bookings = data['bookings'] ?? [];
    return bookings.map((b) => BookingModel.fromJson(b)).toList();
  }

  Future<List<BookingModel>> getRiderBookings(int riderId) async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.riderBookings}/$riderId'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    final List bookings = data['bookings'] ?? [];
    return bookings.map((b) => BookingModel.fromJson(b)).toList();
  }

  Future<BookingModel> startBooking(int bookingId, String otp) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/bookings/$bookingId/start'),
      headers: _headers,
      body: jsonEncode({'otp': otp}),
    );
    final data = _handleResponse(response);
    return BookingModel.fromJson(data);
  }

  Future<BookingModel> completeBooking(int bookingId) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/bookings/$bookingId/complete'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    return BookingModel.fromJson(data);
  }

  Future<BookingModel> payBooking(int bookingId) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/bookings/$bookingId/pay'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    return BookingModel.fromJson(data);
  }

  // ── Cancellation & Anti-Fraud ────────────────────────────────────────────────

  Future<Map<String, dynamic>> getCancellationPreview(int bookingId, int userId) async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}/bookings/$bookingId/cancellation-preview?user_id=$userId'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> cancelBooking(int bookingId, int userId, {String reason = 'Change of plans', String cancelledBy = 'passenger'}) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/bookings/$bookingId/cancel'),
      headers: _headers,
      body: jsonEncode({
        'user_id': userId,
        'reason': reason,
        'cancelled_by': cancelledBy,
      }),
    );
    return _handleResponse(response);
  }

  // ── Crowd-Sourced Parcel Sharing ──────────────────────────────────────────

  Future<ParcelModel> createParcel(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.parcelsCreate}'),
      headers: _headers,
      body: jsonEncode(payload),
    );
    final data = _handleResponse(response);
    return ParcelModel.fromJson(data);
  }

  Future<List<ParcelModel>> getSenderParcels(int senderId) async {
    final response = await http.get(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.parcelsSender}/$senderId'),
      headers: _headers,
    );
    final data = _handleResponse(response);
    final List parcels = data['parcels'] ?? [];
    return parcels.map((p) => ParcelModel.fromJson(p)).toList();
  }

  Future<ParcelModel> verifyParcelPickup(int parcelId, String otp) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/parcels/$parcelId/verify-pickup'),
      headers: _headers,
      body: jsonEncode({'otp': otp}),
    );
    final data = _handleResponse(response);
    return ParcelModel.fromJson(data);
  }

  Future<ParcelModel> verifyParcelDelivery(int parcelId, String otp) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/parcels/$parcelId/verify-delivery'),
      headers: _headers,
      body: jsonEncode({'otp': otp}),
    );
    final data = _handleResponse(response);
    return ParcelModel.fromJson(data);
  }

  // ── Emergency SOS ───────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> triggerSos({
    required int userId,
    required double latitude,
    required double longitude,
    String? locationName,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}${ApiConstants.triggerSos}'),
      headers: _headers,
      body: jsonEncode({
        'user_id': userId,
        'latitude': latitude,
        'longitude': longitude,
        if (locationName != null) 'location_name': locationName,
      }),
    );
    return _handleResponse(response);
  }

  // ── Response Helper ────────────────────────────────────────────────────────

  dynamic _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body);
    } else {
      Map<String, dynamic> err = {};
      try {
        err = jsonDecode(response.body);
      } catch (_) {}
      throw Exception(err['detail'] ?? err['message'] ?? 'API Request failed (${response.statusCode})');
    }
  }
}
