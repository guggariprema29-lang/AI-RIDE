import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/ride_model.dart';
import '../../providers/auth_provider.dart';
import '../tracking/live_tracking_screen.dart';

class BookingPaymentScreen extends StatefulWidget {
  final RideModel ride;

  const BookingPaymentScreen({super.key, required this.ride});

  @override
  State<BookingPaymentScreen> createState() => _BookingPaymentScreenState();
}

class _BookingPaymentScreenState extends State<BookingPaymentScreen> {
  int _seats = 1;
  String _paymentMethod = 'upi';
  bool _isProcessing = false;

  double get _farePerSeat => widget.ride.estimatedFare ?? (widget.ride.farePerKm * 15);
  double get _totalFare => _farePerSeat * _seats;

  Future<void> _confirmBooking() async {
    setState(() => _isProcessing = true);
    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final passengerId = authProvider.user?.id ?? 1;

      final payload = {
        'ride_id': widget.ride.id,
        'passenger_id': passengerId,
        'pickup': widget.ride.origin,
        'dropoff': widget.ride.destination,
        'pickup_lat': widget.ride.originLat,
        'pickup_lng': widget.ride.originLng,
        'drop_lat': widget.ride.destLat,
        'drop_lng': widget.ride.destLng,
        'seats': _seats,
        'fare': _totalFare,
        'max_detour_m': 3000.0,
      };

      final booking = await authProvider.apiService.createBooking(payload);

      if (!mounted) return;
      setState(() => _isProcessing = false);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('🎉 Seat reserved! Payment held safely in Escrow.'),
          backgroundColor: AppColors.secondary,
        ),
      );

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => LiveTrackingScreen(booking: booking),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isProcessing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Booking failed: $e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Confirm & Reserve Seat')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Cost Sharing Receipt', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              const Text('Payment is held in Escrow and released only upon trip completion.', style: TextStyle(color: AppColors.darkTextSecondary)),
              const SizedBox(height: 20),

              // Receipt Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.darkSurface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.darkBorder),
                ),
                child: Column(
                  children: [
                    _receiptRow('Corridor Route:', '${widget.ride.origin} → ${widget.ride.destination}'),
                    const Divider(height: 24),
                    _receiptRow('Seats Selected:', '$_seats Seat'),
                    const SizedBox(height: 8),
                    _receiptRow('Distance Share:', Formatters.km(widget.ride.totalDistanceM)),
                    const SizedBox(height: 8),
                    _receiptRow('Fuel Cost Share:', Formatters.rupees(_totalFare * 0.85)),
                    const SizedBox(height: 8),
                    _receiptRow('Platform Fee:', '₹0.00 (Free)'),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total Escrow Hold Amount:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        Text(Formatters.rupees(_totalFare), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: AppColors.primary)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              const Text('Select Escrow Payment Method', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),

              RadioListTile<String>(
                value: 'upi',
                groupValue: _paymentMethod,
                onChanged: (v) => setState(() => _paymentMethod = v!),
                title: const Text('UPI / GPay / PhonePe'),
                subtitle: const Text('Instant Escrow deposit'),
                secondary: const Icon(Icons.account_balance_wallet_outlined, color: AppColors.primary),
                activeColor: AppColors.primary,
              ),
              RadioListTile<String>(
                value: 'wallet',
                groupValue: _paymentMethod,
                onChanged: (v) => setState(() => _paymentMethod = v!),
                title: const Text('AI Ride Wallet Balance'),
                subtitle: const Text('Use pre-funded wallet balance'),
                secondary: const Icon(Icons.wallet_outlined, color: AppColors.secondary),
                activeColor: AppColors.primary,
              ),
              const SizedBox(height: 28),

              ElevatedButton.icon(
                onPressed: _isProcessing ? null : _confirmBooking,
                icon: const Icon(Icons.lock_clock_outlined),
                label: _isProcessing
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text('Hold ${Formatters.rupees(_totalFare)} in Escrow & Reserve'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _receiptRow(String title, String val) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: const TextStyle(fontSize: 13, color: AppColors.darkTextSecondary)),
        Text(val, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
      ],
    );
  }
}
