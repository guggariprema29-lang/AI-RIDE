import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/ride_model.dart';
import '../../providers/auth_provider.dart';
import '../booking/ride_details_screen.dart';

class SearchRideScreen extends StatefulWidget {
  const SearchRideScreen({super.key});

  @override
  State<SearchRideScreen> createState() => _SearchRideScreenState();
}

class _SearchRideScreenState extends State<SearchRideScreen> {
  final _pickupController = TextEditingController(text: 'Koramangala');
  final _dropController = TextEditingController(text: 'Whitefield');
  int _seatsRequested = 1;
  bool _womenOnlyFilter = false;

  bool _isSearching = false;
  List<RideModel> _searchResults = [];

  @override
  void initState() {
    super.initState();
    _performSearch();
  }

  Future<void> _performSearch() async {
    setState(() => _isSearching = true);
    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final results = await authProvider.apiService.searchRides(
        pickupLat: 12.9352,
        pickupLng: 77.6245,
        dropLat: 12.9698,
        dropLng: 77.7500,
        seats: _seatsRequested,
        passengerId: authProvider.user?.id,
        womenOnlyFilter: _womenOnlyFilter,
      );
      if (!mounted) return;
      setState(() {
        _searchResults = results;
        _isSearching = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSearching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Find a Shared Ride')),
      body: SafeArea(
        child: Column(
          children: [
            // Search Form Card
            Container(
              padding: const EdgeInsets.all(16),
              color: AppColors.darkSurface,
              child: Column(
                children: [
                  TextFormField(
                    controller: _pickupController,
                    decoration: const InputDecoration(
                      labelText: 'Pickup Location',
                      prefixIcon: Icon(Icons.my_location, color: AppColors.primary, size: 20),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _dropController,
                    decoration: const InputDecoration(
                      labelText: 'Dropoff Destination',
                      prefixIcon: Icon(Icons.location_on_outlined, color: AppColors.danger, size: 20),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _performSearch,
                          icon: const Icon(Icons.search, size: 20),
                          label: const Text('Search Matching Rides'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Search Results List
            Expanded(
              child: _isSearching
                  ? const Center(child: CircularProgressIndicator())
                  : _searchResults.isEmpty
                      ? const Center(
                          child: Text(
                            'No matching rides found for this corridor.\nTry expanding your search radius.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppColors.darkTextSecondary),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _searchResults.length,
                          itemBuilder: (context, index) {
                            final ride = _searchResults[index];
                            return _buildRideCard(ride);
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRideCard(RideModel ride) {
    final overlapPct = ((ride.overlapScore ?? 0.87) * 100).round();
    final trust = ride.riderTrustScore ?? 85;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => RideDetailsScreen(ride: ride),
            ),
          );
        },
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Driver & Trust Badge Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: AppColors.primary,
                        radius: 18,
                        child: Text(
                          ride.riderName?.isNotEmpty == true ? ride.riderName![0] : 'R',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ride.riderName ?? 'Verified Rider',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                          Text(
                            '${ride.vehicleType.toUpperCase()} • ${ride.riderPublicId ?? 'AR-000042'}',
                            style: const TextStyle(fontSize: 11, color: AppColors.darkTextSecondary),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.secondary.withOpacity(0.4)),
                    ),
                    child: Text(
                      'AI Match: $overlapPct%',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.secondary),
                    ),
                  ),
                ],
              ),

              const Divider(height: 20),

              // Route & Distance
              Row(
                children: [
                  const Icon(Icons.trip_origin, size: 16, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(child: Text(ride.origin, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis)),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.location_on, size: 16, color: AppColors.danger),
                  const SizedBox(width: 8),
                  Expanded(child: Text(ride.destination, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis)),
                ],
              ),
              const SizedBox(height: 12),

              // Metadata Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.shield_outlined, size: 14, color: AppColors.warning),
                      const SizedBox(width: 4),
                      Text('Trust: $trust/100', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  Row(
                    children: [
                      const Icon(Icons.access_time, size: 14, color: AppColors.darkTextSecondary),
                      const SizedBox(width: 4),
                      Text(Formatters.departureLabel(ride.departureTime), style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                  Text(
                    Formatters.rupees(ride.estimatedFare ?? (ride.farePerKm * 15)),
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
