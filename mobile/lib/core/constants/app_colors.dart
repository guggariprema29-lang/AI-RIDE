import 'package:flutter/material.dart';

class AppColors {
  // Cinema Modern Dark Palette (matching deployed web tokens.css)
  static const Color primary = Color(0xFF6E79E0);          // --color-accent #6e79e0
  static const Color primaryVariant = Color(0xFF808AE8);   // --color-accent-hover
  static const Color primaryGlow = Color(0x596E79E0);      // --color-accent-glow
  static const Color secondary = Color(0xFF3DDC91);        // --color-success #3ddc91
  static const Color danger = Color(0xFFFF6B6B);           // --color-destructive #ff6b6b
  static const Color warning = Color(0xFFF5B544);          // --color-warning #f5b544
  static const Color info = Color(0xFF6CC6FF);             // --color-car #6cc6ff
  static const Color carCyan = Color(0xFF6CC6FF);          // Ambient glow cyan
  static const Color bikeEmerald = Color(0xFF3DDC91);

  // Dark Theme Tokens
  static const Color darkDeep = Color(0xFF020203);         // --color-deep #020203
  static const Color darkBackground = Color(0xFF050506);   // --color-background #050506
  static const Color darkElevated = Color(0xFF0A0A0C);     // --color-elevated #0a0a0c
  static const Color darkSurface = Color(0xFF141418);      // Elevated surface
  static const Color darkCard = Color(0xFF1A1A22);         // Card surface
  static const Color darkTextPrimary = Color(0xFFEDEDEF);  // --color-foreground #ededef
  static const Color darkTextSecondary = Color(0xFFB6BAC2);// --color-foreground-soft
  static const Color darkTextDim = Color(0xFF8A8F98);      // --color-foreground-dim
  static const Color darkBorder = Color(0x1FFFFFFF);       // hairline rgba(255,255,255,0.12)
  static const Color darkBorderSubtle = Color(0x14FFFFFF); // rgba(255,255,255,0.08)

  // Liquid Glass Tokens
  static const Color glassFill = Color(0x0FFFFFFF);        // rgba(255,255,255,0.06)
  static const Color glassFillStrong = Color(0x1AFFFFFF);  // rgba(255,255,255,0.10)
  static const Color glassBorder = Color(0x26FFFFFF);      // rgba(255,255,255,0.15)
  static const Color glassHighlight = Color(0x17FFFFFF);   // hairline inner highlight

  // Light Theme Tokens (Fallback)
  static const Color lightBackground = Color(0xFFF8FAFC);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFF1F5F9);
  static const Color lightTextPrimary = Color(0xFF0F172A);
  static const Color lightTextSecondary = Color(0xFF64748B);
  static const Color lightBorder = Color(0xFFE2E8F0);

  // Trust Score Badges
  static const Color trustHigh = Color(0xFF3DDC91);        // 90-100 Very Low Risk
  static const Color trustMedium = Color(0xFF6CC6FF);      // 75-89 Low Risk
  static const Color trustModerate = Color(0xFFF5B544);    // 50-74 Medium Risk
  static const Color trustLow = Color(0xFFFF6B6B);         // 0-49 High Risk
}
