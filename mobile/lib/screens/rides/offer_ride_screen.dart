import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../providers/auth_provider.dart';

class OfferRideScreen extends StatefulWidget {
  const OfferRideScreen({super.key});

  @override
  State<OfferRideScreen> createState() => _OfferRideScreenState();
}

class _OfferRideScreenState extends State<OfferRideScreen> {
  final _formKey = GlobalKey<FormState>();
  final _originController = TextEditingController(text: 'Bangalore Central');
  final _destinationController = TextEditingController(text: 'Electronic City');
  DateTime _departureTime = DateTime.now().add(const Duration(hours: 2));
  int _seatsTotal = 3;
  String _vehicleType = 'car';
  double _farePerKm = 6.0;
  bool _acceptsParcels = true;
  bool _womenOnly = false;
  bool _isPublishing = false;

  // Calculated estimates
  double get _distanceKm => 21.5;
  double get _estimatedFare => _distanceKm * _farePerKm;
  double get _estimatedFuelCost => _distanceKm * 4.5;
  double get _carbonSavingsKg => _distanceKm * 0.21;

  Future<void> _publishRide() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isPublishing = true);

    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final payload = {
        'rider_id': authProvider.user?.id ?? 1,
        'origin': _originController.text.trim(),
        'destination': _destinationController.text.trim(),
        'origin_lat': 12.9716,
        'origin_lng': 77.5946,
        'dest_lat': 12.8399,
        'dest_lng': 77.6770,
        'seats_total': _seatsTotal,
        'vehicle_type': _vehicleType,
        'fare_per_km': _farePerKm,
        'departure_time': _departureTime.toUtc().toIso8601String(),
        'women_only': _womenOnly,
        'notes': _acceptsParcels ? 'Accepting small parcel packages (≤5kg).' : null,
      };

      await authProvider.apiService.publishRide(payload);

      if (!mounted) return;
      setState(() => _isPublishing = false);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('🎉 Ride published successfully! Visible on live map.'),
          backgroundColor: AppColors.secondary,
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _isPublishing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to publish: $e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Offer a Ride')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Publish Corridor Journey', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                const Text('Share seats with commuters heading your way.', style: TextStyle(color: AppColors.darkTextSecondary)),
                const SizedBox(height: 24),

                TextFormField(
                  controller: _originController,
                  decoration: const InputDecoration(labelText: 'Starting Location', prefixIcon: Icon(Icons.my_location, color: AppColors.primary)),
                  validator: (v) => v == null || v.trim().isEmpty ? 'Enter origin' : null,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _destinationController,
                  decoration: const InputDecoration(labelText: 'Destination', prefixIcon: Icon(Icons.location_on_outlined, color: AppColors.danger)),
                  validator: (v) => v == null || v.trim().isEmpty ? 'Enter destination' : null,
                ),
                const SizedBox(height: 16),

                // Vehicle & Seats Row
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _vehicleType,
                        decoration: const InputDecoration(labelText: 'Vehicle Type'),
                        items: const [
                          DropdownMenuItem(value: 'car', child: Text('🚗 Car')),
                          DropdownMenuItem(value: 'auto', child: Text('🛺 Auto')),
                          DropdownMenuItem(value: 'bike', child: Text('🏍️ Bike')),
                        ],
                        onChanged: (v) => setState(() => _vehicleType = v ?? 'car'),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        value: _seatsTotal,
                        decoration: const InputDecoration(labelText: 'Available Seats'),
                        items: [1, 2, 3, 4, 5, 6].map((s) => DropdownMenuItem(value: s, child: Text('$s Seat${s > 1 ? 's' : ''}'))).toList(),
                        onChanged: (v) => setState(() => _seatsTotal = v ?? 3),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Fare breakdown preview card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                  ),
                  child: Column(
                    children: [
                      _estimateRow('Route Distance:', '${_distanceKm.toStringAsFixed(1)} km'),
                      const SizedBox(height: 6),
                      _estimateRow('Est. Fare / Seat:', Formatters.rupees(_estimatedFare)),
                      const SizedBox(height: 6),
                      _estimateRow('Est. Fuel Cost Saved:', Formatters.rupees(_estimatedFuelCost)),
                      const SizedBox(height: 6),
                      _estimateRow('CO₂ Carbon Reduced:', '${_carbonSavingsKg.toStringAsFixed(2)} kg'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                SwitchListTile(
                  value: _acceptsParcels,
                  onChanged: (v) => setState(() => _acceptsParcels = v),
                  title: const Text('Accept Small Parcels (≤5kg)'),
                  subtitle: const Text('Earn extra fare carrying package requests along your route.'),
                  activeColor: AppColors.secondary,
                ),
                SwitchListTile(
                  value: _womenOnly,
                  onChanged: (v) => setState(() => _womenOnly = v),
                  title: const Text('Women-Only Ride Filter'),
                  subtitle: const Text('Restrict bookings to verified female passengers.'),
                  activeColor: AppColors.primary,
                ),
                const SizedBox(height: 24),

                ElevatedButton(
                  onPressed: _isPublishing ? null : _publishRide,
                  child: _isPublishing
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Publish Ride on Live Map'),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _estimateRow(String title, String val) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: const TextStyle(fontSize: 13, color: AppColors.darkTextSecondary)),
        Text(val, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
      ],
    );
  }
}
