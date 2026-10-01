import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../models/booking_model.dart';
import '../../providers/auth_provider.dart';
import '../cancellation/cancellation_dialog.dart';

class LiveTrackingScreen extends StatefulWidget {
  final BookingModel booking;

  const LiveTrackingScreen({super.key, required this.booking});

  @override
  State<LiveTrackingScreen> createState() => _LiveTrackingScreenState();
}

class _LiveTrackingScreenState extends State<LiveTrackingScreen> {
  late BookingModel _booking;
  Timer? _locationTimer;
  final _otpController = TextEditingController();

  LatLng get _vehicleLocation => LatLng(_booking.pickupLat, _booking.pickupLng);

  @override
  void initState() {
    super.initState();
    _booking = widget.booking;
    _startLocationPolling();
  }

  void _startLocationPolling() {
    _locationTimer = Timer.periodic(const Duration(seconds: 8), (_) async {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      try {
        final updated = await authProvider.apiService.getPassengerBookings(authProvider.user?.id ?? 1);
        final match = updated.firstWhere((b) => b.id == _booking.id, orElse: () => _booking);
        if (mounted) setState(() => _booking = match);
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isPending = _booking.status == 'pending';
    final isAccepted = _booking.status == 'accepted';
    final isOngoing = _booking.status == 'ongoing';

    return Scaffold(
      appBar: AppBar(
        title: Text('Trip #${_booking.id} Live Tracking'),
        actions: [
          if (isPending || isAccepted)
            TextButton(
              onPressed: () {
                final authProvider = Provider.of<AuthProvider>(context, listen: false);
                showDialog(
                  context: context,
                  builder: (_) => CancellationDialog(
                    bookingId: _booking.id,
                    userId: authProvider.user?.id ?? 1,
                    onCancelled: () => Navigator.of(context).pop(),
                  ),
                );
              },
              child: const Text('Cancel', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.bold)),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Off-Route Deviation Warning Banner if active
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppColors.warning.withOpacity(0.2),
              child: const Row(
                children: [
                  Icon(Icons.shield_outlined, color: AppColors.warning, size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'AI Safe Ride Tracking Active • 500m Off-route monitoring enabled',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.warning),
                    ),
                  ),
                ],
              ),
            ),

            // Live Map View
            Expanded(
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: _vehicleLocation,
                  initialZoom: 14.0,
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.airide.mobility',
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: _vehicleLocation,
                        width: 40,
                        height: 40,
                        child: const Icon(Icons.directions_car_filled, color: AppColors.primary, size: 36),
                      ),
                      Marker(
                        point: LatLng(_booking.dropLat, _booking.dropLng),
                        width: 40,
                        height: 40,
                        child: const Icon(Icons.location_on, color: AppColors.danger, size: 36),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Bottom Trip Status Drawer
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: AppColors.darkSurface,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_booking.riderName ?? 'Verified Rider', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Text('${_booking.vehicleType?.toUpperCase() ?? "CAR"} • ${_booking.pickup}', style: const TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isOngoing ? AppColors.secondary.withOpacity(0.2) : AppColors.primary.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _booking.status.toUpperCase(),
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: isOngoing ? AppColors.secondary : AppColors.primary),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // 4-Digit Pickup OTP Handoff Box
                  if (_booking.otp != null && (isPending || isAccepted)) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Pickup Start Code:', style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
                              Text('Read code to rider at pickup', style: TextStyle(fontSize: 10, color: AppColors.darkTextSecondary)),
                            ],
                          ),
                          Text(
                            _booking.otp!,
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 4, color: AppColors.primary),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
