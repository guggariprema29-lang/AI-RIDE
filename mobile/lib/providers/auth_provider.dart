import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';

class AuthProvider with ChangeNotifier {
  final ApiService _apiService = ApiService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

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
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _apiService.login(email, password);
      _token = res['access_token'];
      _user = UserModel.fromJson(res['user']);

      _apiService.setAuthToken(_token);
      await _storage.write(key: 'jwt_token', value: _token);
      await _storage.write(key: 'user_data', value: jsonEncode(_user!.toJson()));

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register(Map<String, dynamic> payload) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _apiService.register(payload);
      _token = res['access_token'];
      _user = UserModel.fromJson(res['user']);

      _apiService.setAuthToken(_token);
      await _storage.write(key: 'jwt_token', value: _token);
      await _storage.write(key: 'user_data', value: jsonEncode(_user!.toJson()));

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    _apiService.setAuthToken(null);
    await _storage.deleteAll();
    notifyListeners();
  }
}
