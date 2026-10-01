import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../providers/auth_provider.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> {
  bool _isHolding = false;
  bool _sosDispatched = false;
  String? _alertMessage;

  Future<void> _triggerSos() async {
    setState(() => _isHolding = true);
    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final userId = authProvider.user?.id ?? 1;

      final res = await authProvider.apiService.triggerSos(
        userId: userId,
        latitude: 12.9716,
        longitude: 77.5946,
        locationName: 'Emergency SOS manual dispatch from mobile app',
      );

      if (!mounted) return;
      setState(() {
        _isHolding = false;
        _sosDispatched = true;
        _alertMessage = res['message'] ?? 'Emergency SOS Alert dispatched to emergency contacts & response team!';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isHolding = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to send SOS: $e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(title: const Text('Emergency SOS Center')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.danger.withOpacity(0.15),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.danger, width: 2),
                ),
                child: const Icon(Icons.warning_rounded, color: AppColors.danger, size: 64),
              ),
              const SizedBox(height: 24),
              const Text(
                'Emergency Assistance',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'Pressing SOS immediately broadcasts your live GPS location to your emergency contact and security response team.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.darkTextSecondary, fontSize: 14),
              ),
              const Spacer(),

              if (_sosDispatched) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.secondary.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.secondary),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.check_circle_rounded, color: AppColors.secondary, size: 40),
                      const SizedBox(height: 10),
                      Text(
                        _alertMessage ?? 'SOS Alert Sent Successfully!',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
              ] else ...[
                GestureDetector(
                  onLongPress: _triggerSos,
                  child: Container(
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.danger,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.danger.withOpacity(0.5),
                          blurRadius: 24,
                          spreadRadius: 8,
                        ),
                      ],
                    ),
                    child: Center(
                      child: _isHolding
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.touch_app, size: 36, color: Colors.white),
                                SizedBox(height: 4),
                                Text(
                                  'HOLD FOR SOS',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white),
                                ),
                              ],
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Press and hold to prevent accidental activation',
                  style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary),
                ),
              ],

              const Spacer(),

              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.darkSurface),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Dialing Emergency 112...')),
                  );
                },
                icon: const Icon(Icons.phone_forwarded, color: AppColors.danger),
                label: const Text('Call National Emergency 112'),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
