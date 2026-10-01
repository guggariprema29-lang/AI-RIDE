import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/ride_model.dart';
import 'booking_payment_screen.dart';
import '../sos/sos_screen.dart';

class RideDetailsScreen extends StatelessWidget {
  final RideModel ride;

  const RideDetailsScreen({super.key, required this.ride});

  @override
  Widget build(BuildContext context) {
    final fare = ride.estimatedFare ?? (ride.farePerKm * 15);
    final trust = ride.riderTrustScore ?? 85;
    final riskLevel = ride.riskLevel ?? 'Very Low Risk';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ride Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sos_outlined, color: AppColors.danger),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SosScreen()),
              );
            },
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Driver Profile Header Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.darkSurface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.darkBorder),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppColors.primary,
                      child: Text(
                        ride.riderName?.isNotEmpty == true ? ride.riderName![0] : 'R',
                        style: const TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ride.riderName ?? 'Verified Rider',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.secondary.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Trust: $trust/100 • $riskLevel',
                                  style: const TextStyle(fontSize: 11, color: AppColors.secondary, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Route & Vehicle Info Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.darkSurface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.darkBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Route & Vehicle Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    _infoRow(Icons.directions_car, 'Vehicle', '${ride.vehicleType.toUpperCase()} (${ride.vehicleNumber ?? "KA-01-AB-1234"})'),
                    const SizedBox(height: 8),
                    _infoRow(Icons.my_location, 'Pickup Point', ride.origin),
                    const SizedBox(height: 8),
                    _infoRow(Icons.location_on, 'Dropoff Point', ride.destination),
                    const SizedBox(height: 8),
                    _infoRow(Icons.access_time, 'Departure', Formatters.departureLabel(ride.departureTime)),
                    const SizedBox(height: 8),
                    _infoRow(Icons.event_seat, 'Available Seats', '${ride.seatsAvailable} of ${ride.seatsTotal} seats free'),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Fare Summary Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Decentralised Fare Share', style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
                        Text('0% Platform Commission', style: TextStyle(fontSize: 11, color: AppColors.secondary)),
                      ],
                    ),
                    Text(
                      Formatters.rupees(fare),
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.primary),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              // Request Seat Button
              ElevatedButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => BookingPaymentScreen(ride: ride),
                    ),
                  );
                },
                icon: const Icon(Icons.bookmark_add_outlined),
                label: const Text('Request Seat & Escrow Hold'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String val) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(width: 10),
        Text('$label: ', style: const TextStyle(fontSize: 13, color: AppColors.darkTextSecondary)),
        Expanded(child: Text(val, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
      ],
    );
  }
}
