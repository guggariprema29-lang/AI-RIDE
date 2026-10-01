import 'package:flutter/material.dart';

class AppColors {
  // Brand Colors
  static const Color primary = Color(0xFF6366F1);       // Indigo Accent
  static const Color primaryVariant = Color(0xFF4F46E5);
  static const Color secondary = Color(0xFF10B981);     // Emerald Accent
  static const Color danger = Color(0xFFEF4444);        // Red Alert / SOS
  static const Color warning = Color(0xFFF59E0B);       // Warning Orange
  static const Color info = Color(0xFF3B82F6);          // Blue Info

  // Dark Theme Tokens
  static const Color darkBackground = Color(0xFF0F172A); // Slate 900
  static const Color darkSurface = Color(0xFF1E293B);    // Slate 800
  static const Color darkCard = Color(0xFF334155);       // Slate 700
  static const Color darkTextPrimary = Color(0xFFF8FAFC);
  static const Color darkTextSecondary = Color(0xFF94A3B8);
  static const Color darkBorder = Color(0xFF334155);

  // Light Theme Tokens
  static const Color lightBackground = Color(0xFFF8FAFC);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFF1F5F9);
  static const Color lightTextPrimary = Color(0xFF0F172A);
  static const Color lightTextSecondary = Color(0xFF64748B);
  static const Color lightBorder = Color(0xFFE2E8F0);

  // Trust Score Gradient / Badges
  static const Color trustHigh = Color(0xFF10B981);     // 90-100 Very Low Risk
  static const Color trustMedium = Color(0xFF3B82F6);   // 75-89 Low Risk
  static const Color trustModerate = Color(0xFFF59E0B); // 50-74 Medium Risk
  static const Color trustLow = Color(0xFFEF4444);      // 0-49 High Risk
}
