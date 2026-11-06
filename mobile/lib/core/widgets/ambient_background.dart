import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Cinematic Ambient Aurora Light Background
/// Replicates `drift-a` and `drift-b` CSS keyframe animations from the deployed web app.
class AmbientBackground extends StatefulWidget {
  final Widget child;
  final bool animate;

  const AmbientBackground({
    super.key,
    required this.child,
    this.animate = true,
  });

  @override
  State<AmbientBackground> createState() => _AmbientBackgroundState();
}

class _AmbientBackgroundState extends State<AmbientBackground>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    );
    if (widget.animate) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.darkBackground,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Aurora Mesh Canvas
          AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              final t = _controller.value;
              return CustomPaint(
                painter: _AuroraMeshPainter(progress: t),
                size: Size.infinite,
              );
            },
          ),
          // Foreground Content
          widget.child,
        ],
      ),
    );
  }
}

class _AuroraMeshPainter extends CustomPainter {
  final double progress;

  _AuroraMeshPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final double w = size.width;
    final double h = size.height;

    // Orb 1: Violet/Indigo Accent (drift-a)
    final double orb1X = w * (0.15 + 0.15 * math.sin(progress * math.pi));
    final double orb1Y = h * (0.12 + 0.10 * math.cos(progress * math.pi));
    final double orb1Radius = math.max(w, h) * 0.45;

    final paint1 = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.primary.withOpacity(0.28),
          AppColors.primary.withOpacity(0.12),
          Colors.transparent,
        ],
        stops: const [0.0, 0.45, 1.0],
      ).createShader(Rect.fromCircle(
        center: Offset(orb1X, orb1Y),
        radius: orb1Radius,
      ));

    canvas.drawCircle(Offset(orb1X, orb1Y), orb1Radius, paint1);

    // Orb 2: Electric Cyan / Car Glow (drift-b)
    final double orb2X = w * (0.85 - 0.18 * math.sin(progress * math.pi));
    final double orb2Y = h * (0.80 - 0.12 * math.cos(progress * math.pi));
    final double orb2Radius = math.max(w, h) * 0.48;

    final paint2 = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.carCyan.withOpacity(0.20),
          AppColors.carCyan.withOpacity(0.08),
          Colors.transparent,
        ],
        stops: const [0.0, 0.50, 1.0],
      ).createShader(Rect.fromCircle(
        center: Offset(orb2X, orb2Y),
        radius: orb2Radius,
      ));

    canvas.drawCircle(Offset(orb2X, orb2Y), orb2Radius, paint2);

    // Orb 3: Subtle Emerald Accent Glow (Ride/Bike synergy)
    final double orb3X = w * (0.75 + 0.10 * math.cos(progress * math.pi));
    final double orb3Y = h * (0.35 + 0.08 * math.sin(progress * math.pi));
    final double orb3Radius = math.max(w, h) * 0.32;

    final paint3 = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.secondary.withOpacity(0.12),
          Colors.transparent,
        ],
        stops: const [0.0, 1.0],
      ).createShader(Rect.fromCircle(
        center: Offset(orb3X, orb3Y),
        radius: orb3Radius,
      ));

    canvas.drawCircle(Offset(orb3X, orb3Y), orb3Radius, paint3);
  }

  @override
  bool shouldRepaint(covariant _AuroraMeshPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
