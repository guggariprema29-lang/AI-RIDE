import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Pulse Ring Animation Widget
/// Replicates the `@keyframes pulse-ring` radar ping on the web map markers.
class PulseRing extends StatefulWidget {
  final double size;
  final Color color;
  final Widget child;

  const PulseRing({
    super.key,
    this.size = 54.0,
    this.color = AppColors.primary,
    required this.child,
  });

  @override
  State<PulseRing> createState() => _PulseRingState();
}

class _PulseRingState extends State<PulseRing> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              final scale = 1.0 + (_controller.value * 0.9);
              final opacity = (1.0 - _controller.value).clamp(0.0, 1.0);
              return Transform.scale(
                scale: scale,
                child: Container(
                  width: widget.size * 0.65,
                  height: widget.size * 0.65,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: widget.color.withOpacity(opacity * 0.7),
                      width: 2.0,
                    ),
                    color: widget.color.withOpacity(opacity * 0.15),
                  ),
                ),
              );
            },
          ),
          widget.child,
        ],
      ),
    );
  }
}

/// Entrance Reveal Animation
/// Replicates `.reveal.is-visible` CSS fade & slide entrance from the deployed web app.
class FadeReveal extends StatefulWidget {
  final Widget child;
  final Duration duration;
  final Duration delay;
  final double slideOffset;

  const FadeReveal({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 650),
    this.delay = Duration.zero,
    this.slideOffset = 24.0,
  });

  @override
  State<FadeReveal> createState() => _FadeRevealState();
}

class _FadeRevealState extends State<FadeReveal> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    );

    _fadeAnim = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );

    _slideAnim = Tween<Offset>(
      begin: Offset(0, widget.slideOffset / 100),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    ));

    if (widget.delay == Duration.zero) {
      _controller.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _slideAnim,
      child: FadeTransition(
        opacity: _fadeAnim,
        child: widget.child,
      ),
    );
  }
}
