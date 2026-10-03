import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';

class AuthProvider with ChangeNotifier {
  final ApiService _apiService = ApiService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  UserModel? _user;
  String? _token;
  bool _isLoading = false;
  String? _error;

  UserModel? get user => _user;
  String? get token => _token;
  bool get isAuthenticated => _token != null && _user != null;
  bool get isLoading => _isLoading;
  String? get error => _error;
  ApiService get apiService => _apiService;

  Future<void> tryAutoLogin() async {
    _isLoading = true;
    notifyListeners();
    try {
      final storedToken = await _storage.read(key: 'jwt_token');
      final storedUserData = await _storage.read(key: 'user_data');
      if (storedToken != null && storedUserData != null) {
        _token = storedToken;
        _apiService.setAuthToken(storedToken);
        _user = UserModel.fromJson(jsonDecode(storedUserData));
      }
    } catch (e) {
      print('[AUTH PROVIDER] Auto-login storage read notice: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    print('[AUTH PROVIDER] LOGIN STARTED for $email');

    try {
      final res = await _apiService.login(email, password);
      print('[AUTH PROVIDER] LOGIN RESPONSE RECEIVED: $res');

      _token = res['access_token'] ?? res['token'];

      final Map<String, dynamic> userData = (res['user'] != null && res['user'] is Map)
          ? Map<String, dynamic>.from(res['user'])
          : Map<String, dynamic>.from(res);

      _user = UserModel.fromJson(userData);
      _apiService.setAuthToken(_token);

      try {
        if (_token != null) await _storage.write(key: 'jwt_token', value: _token);
        if (_user != null) await _storage.write(key: 'user_data', value: jsonEncode(_user!.toJson()));
      } catch (stErr) {
        print('[AUTH PROVIDER] Storage write notice: $stErr');
      }

      print('[AUTH PROVIDER] LOGIN SUCCESSFUL FOR USER ${_user?.name} (ID: ${_user?.id})');
      return true;
    } catch (e, stack) {
      print('[AUTH PROVIDER] LOGIN ERROR: $e');
      print(stack);
      _error = e.toString().replaceAll('Exception: ', '');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
      print('[AUTH PROVIDER] LOGIN FINALLY: isLoading reset to false');
    }
  }

  Future<bool> register(Map<String, dynamic> payload) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    print('[AUTH PROVIDER] REGISTER STARTED for ${payload["email"]}');

    try {
      final res = await _apiService.register(payload);
      print('[AUTH PROVIDER] REGISTER RESPONSE RECEIVED: $res');

      _token = res['access_token'] ?? res['token'];

      final Map<String, dynamic> userData = (res['user'] != null && res['user'] is Map)
          ? Map<String, dynamic>.from(res['user'])
          : Map<String, dynamic>.from(res);

      _user = UserModel.fromJson(userData);
      _apiService.setAuthToken(_token);

      try {
        if (_token != null) await _storage.write(key: 'jwt_token', value: _token);
        if (_user != null) await _storage.write(key: 'user_data', value: jsonEncode(_user!.toJson()));
      } catch (stErr) {
        print('[AUTH PROVIDER] Storage write notice: $stErr');
      }

      print('[AUTH PROVIDER] REGISTER SUCCESSFUL FOR USER ${_user?.name} (ID: ${_user?.id})');
      return true;
    } catch (e, stack) {
      print('[AUTH PROVIDER] REGISTER ERROR: $e');
      print(stack);
      _error = e.toString().replaceAll('Exception: ', '');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
      print('[AUTH PROVIDER] REGISTER FINALLY: isLoading reset to false');
    }
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    _apiService.setAuthToken(null);
    try {
      await _storage.deleteAll();
    } catch (_) {}
    notifyListeners();
  }
}
