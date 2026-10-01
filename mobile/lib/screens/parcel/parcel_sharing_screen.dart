import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/parcel_model.dart';
import '../../providers/auth_provider.dart';

class ParcelSharingScreen extends StatefulWidget {
  const ParcelSharingScreen({super.key});

  @override
  State<ParcelSharingScreen> createState() => _ParcelSharingScreenState();
}

class _ParcelSharingScreenState extends State<ParcelSharingScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _formKey = GlobalKey<FormState>();
  final _pickupController = TextEditingController(text: 'Koramangala 5th Block');
  final _dropoffController = TextEditingController(text: 'Indiranagar 100ft Road');
  final _receiverNameController = TextEditingController(text: 'Rahul Kumar');
  final _receiverPhoneController = TextEditingController(text: '+919876543210');

  String _category = 'documents';
  double _weightKg = 1.5;
  bool _isPosting = false;
  List<ParcelModel> _sentParcels = [];

  double get _calculatedFare => 45.0 + (_weightKg * 15.0);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchSentParcels();
  }

  Future<void> _fetchSentParcels() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final userId = authProvider.user?.id ?? 1;
    try {
      final list = await authProvider.apiService.getSenderParcels(userId);
      if (!mounted) return;
      setState(() => _sentParcels = list);
    } catch (_) {}
  }

  Future<void> _postParcel() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isPosting = true);

    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final userId = authProvider.user?.id ?? 1;

      final payload = {
        'sender_id': userId,
        'category': _category,
        'weight_kg': _weightKg,
        'pickup_address': _pickupController.text.trim(),
        'dropoff_address': _dropoffController.text.trim(),
        'pickup_lat': 12.9352,
        'pickup_lng': 77.6245,
        'dropoff_lat': 12.9698,
        'dropoff_lng': 77.7500,
        'receiver_name': _receiverNameController.text.trim(),
        'receiver_phone': _receiverPhoneController.text.trim(),
        'notes': 'Small non-commercial parcel.',
      };

      await authProvider.apiService.createParcel(payload);

      if (!mounted) return;
      setState(() => _isPosting = false);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('🎉 Parcel delivery job posted! Escrow fare held safely.'),
          backgroundColor: AppColors.secondary,
        ),
      );
      _fetchSentParcels();
      _tabController.animateTo(1);
    } catch (e) {
      if (!mounted) return;
      setState(() => _isPosting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to post parcel: $e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parcel Sharing (≤5.0 kg)'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Send a Parcel'),
            Tab(text: 'My Sent Parcels'),
          ],
        ),
      ),
      body: SafeArea(
        child: TabBarView(
          controller: _tabController,
          children: [
            _buildSendTab(),
            _buildSentListTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSendTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Crowd-Sourced Parcel Delivery', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text('Send non-commercial packages via travelers on the same route.', style: TextStyle(color: AppColors.darkTextSecondary)),
            const SizedBox(height: 20),

            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(labelText: 'Package Category'),
              items: const [
                DropdownMenuItem(value: 'documents', child: Text('📄 Documents / Keys')),
                DropdownMenuItem(value: 'clothes', child: Text('👕 Clothes / Fabric')),
                DropdownMenuItem(value: 'electronics', child: Text('💻 Electronics / Gadgets')),
                DropdownMenuItem(value: 'gifts', child: Text('🎁 Gift / Box')),
                DropdownMenuItem(value: 'books', child: Text('📚 Books / Stationery')),
              ],
              onChanged: (v) => setState(() => _category = v!),
            ),
            const SizedBox(height: 14),

            // Weight Slider (≤ 5.0 kg cap compliance)
            Text('Package Weight: ${_weightKg.toStringAsFixed(1)} kg (Max 5.0 kg compliance cap)', style: const TextStyle(fontWeight: FontWeight.bold)),
            Slider(
              value: _weightKg,
              min: 0.5,
              max: 5.0,
              divisions: 9,
              activeColor: AppColors.primary,
              label: '${_weightKg.toStringAsFixed(1)} kg',
              onChanged: (v) => setState(() => _weightKg = v),
            ),
            const SizedBox(height: 10),

            TextFormField(
              controller: _pickupController,
              decoration: const InputDecoration(labelText: 'Pickup Address', prefixIcon: Icon(Icons.upload)),
              validator: (v) => v == null || v.isEmpty ? 'Enter pickup address' : null,
            ),
            const SizedBox(height: 14),

            TextFormField(
              controller: _dropoffController,
              decoration: const InputDecoration(labelText: 'Dropoff Address', prefixIcon: Icon(Icons.download)),
              validator: (v) => v == null || v.isEmpty ? 'Enter dropoff address' : null,
            ),
            const SizedBox(height: 14),

            TextFormField(
              controller: _receiverNameController,
              decoration: const InputDecoration(labelText: 'Receiver Name', prefixIcon: Icon(Icons.person_outline)),
              validator: (v) => v == null || v.isEmpty ? 'Enter receiver name' : null,
            ),
            const SizedBox(height: 14),

            TextFormField(
              controller: _receiverPhoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Receiver Phone Number', prefixIcon: Icon(Icons.phone_outlined)),
              validator: (v) => v == null || v.isEmpty ? 'Enter receiver phone' : null,
            ),
            const SizedBox(height: 16),

            // Fare Preview Box
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
                      Text('Parcel Escrow Fare:', style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
                      Text('Held in escrow until Delivery OTP verified', style: TextStyle(fontSize: 10, color: AppColors.secondary)),
                    ],
                  ),
                  Text(Formatters.rupees(_calculatedFare), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.primary)),
                ],
              ),
            ),
            const SizedBox(height: 24),

            ElevatedButton.icon(
              onPressed: _isPosting ? null : _postParcel,
              icon: const Icon(Icons.send),
              label: _isPosting
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Post Parcel Request'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSentListTab() {
    return _sentParcels.isEmpty
        ? const Center(child: Text('No parcels sent yet', style: TextStyle(color: AppColors.darkTextSecondary)))
        : ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _sentParcels.length,
            itemBuilder: (context, index) {
              final p = _sentParcels[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Parcel #${p.id} (${p.category.toUpperCase()})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.secondary.withOpacity(0.2), borderRadius: BorderRadius.circular(6)),
                            child: Text(p.status.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.secondary)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('${p.pickupAddress} → ${p.dropoffAddress}', style: const TextStyle(fontSize: 13, color: AppColors.darkTextSecondary)),
                      const SizedBox(height: 12),

                      // Pickup OTP Box
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Sender Pickup OTP (Give to Rider):', style: TextStyle(fontSize: 12)),
                            Text(p.pickupOtp, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 2, color: AppColors.primary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
  }
}
