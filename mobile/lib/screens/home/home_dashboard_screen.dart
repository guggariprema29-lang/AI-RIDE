import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/glass_card.dart';
import '../../core/widgets/pulse_ring.dart';
import '../../providers/auth_provider.dart';
import '../rides/offer_ride_screen.dart';
import '../rides/search_ride_screen.dart';
import '../parcel/parcel_sharing_screen.dart';
import '../history/ride_history_screen.dart';
import '../profile/profile_screen.dart';
import '../notifications/notification_screen.dart';
import '../sos/sos_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  const HomeDashboardScreen({super.key});

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  int _currentIndex = 0;
  final MapController _mapController = MapController();

  // Bangalore Central Default Map Coordinates
  final LatLng _currentLocation = const LatLng(12.9716, 77.5946);

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final user = authProvider.user;

    final List<Widget> pages = [
      _buildHomeTab(user),
      const SearchRideScreen(),
      const ParcelSharingScreen(),
      const RideHistoryScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      body: pages[_currentIndex],
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.darkSurface.withOpacity(0.95),
          border: const Border(
            top: BorderSide(color: AppColors.darkBorderSubtle, width: 1),
          ),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: AppColors.primary,
          unselectedItemColor: AppColors.darkTextDim,
          selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
          unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 12),
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.explore_outlined), activeIcon: Icon(Icons.explore), label: 'Explore'),
            BottomNavigationBarItem(icon: Icon(Icons.search_rounded), label: 'Find Ride'),
            BottomNavigationBarItem(icon: Icon(Icons.inventory_2_outlined), activeIcon: Icon(Icons.inventory_2), label: 'Parcels'),
            BottomNavigationBarItem(icon: Icon(Icons.confirmation_number_outlined), activeIcon: Icon(Icons.confirmation_number), label: 'My Trips'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
      floatingActionButton: PulseRing(
        size: 70,
        color: AppColors.danger,
        child: FloatingActionButton(
          backgroundColor: AppColors.danger,
          elevation: 8,
          shape: const CircleBorder(),
          onPressed: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SosScreen()),
            );
          },
          child: const Text(
            'SOS',
            style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 15),
          ),
        ),
      ),
    );
  }

  Widget _buildHomeTab(user) {
    return SafeArea(
      child: Stack(
        children: [
          // OpenStreetMap Tile Engine
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _currentLocation,
              initialZoom: 13.0,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.airide.mobility',
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _currentLocation,
                    width: 60,
                    height: 60,
                    child: PulseRing(
                      size: 60,
                      color: AppColors.primary,
                      child: Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2.5),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withOpacity(0.5),
                              blurRadius: 10,
                            ),
                          ],
                        ),
                        child: const Icon(Icons.navigation, color: Colors.white, size: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Header Bar (Floating Dynamic Island Capsule)
          Positioned(
            top: 14,
            left: 16,
            right: 16,
            child: GlassCard(
              borderRadius: 20,
              blur: 24,
              backgroundColor: Colors.black.withOpacity(0.65),
              borderColor: Colors.white.withOpacity(0.14),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [AppColors.primary, AppColors.carCyan],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withOpacity(0.3),
                          blurRadius: 10,
                        ),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'U',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Hello, ${user?.name.split(' ')[0] ?? 'Explorer'} 👋',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                            letterSpacing: -0.3,
                            color: AppColors.darkTextPrimary,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.secondary.withOpacity(0.18),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: AppColors.secondary.withOpacity(0.35),
                                  width: 1,
                                ),
                              ),
                              child: Text(
                                'Trust Score: ${user?.trustScore ?? 85}/100',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.secondary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.notifications_none_rounded, color: AppColors.darkTextPrimary),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const NotificationScreen()),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),

          // Action Drawer Sheet (Glassmorphic Bento Card)
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: GlassCard(
              borderRadius: 22,
              blur: 26,
              backgroundColor: Colors.black.withOpacity(0.75),
              borderColor: Colors.white.withOpacity(0.14),
              hasGlow: true,
              glowColor: AppColors.primary,
              padding: const EdgeInsets.all(18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _actionButton(
                          icon: Icons.search_rounded,
                          label: 'Find Ride',
                          color: AppColors.primary,
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const SearchRideScreen()),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _actionButton(
                          icon: Icons.add_road_rounded,
                          label: 'Offer Ride',
                          color: AppColors.secondary,
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const OfferRideScreen()),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Wallet: ${Formatters.rupees(user?.walletBalance ?? 500.0)}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: AppColors.darkTextPrimary,
                        ),
                      ),
                      const Text(
                        'Decentralised Cost Share • 0% Commission',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.darkTextDim,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: color.withOpacity(0.14),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.28), width: 1),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              children: [
                Icon(icon, color: color, size: 28),
                const SizedBox(height: 8),
                Text(
                  label,
                  style: TextStyle(fontWeight: FontWeight.w600, color: color, fontSize: 14),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
