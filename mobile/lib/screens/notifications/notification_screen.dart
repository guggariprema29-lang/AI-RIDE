import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../providers/auth_provider.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  bool _isLoading = true;
  List<dynamic> _notifications = [];
  int _unreadCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchNotifications();
  }

  Future<void> _fetchNotifications() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final userId = authProvider.user?.id ?? 1;
    try {
      final res = await authProvider.apiService.getPassengerBookings(userId); // fallback or notification API
      if (!mounted) return;
      setState(() {
        _notifications = [
          {
            'id': 1,
            'title': 'Booking Accepted!',
            'message': 'Your ride request from Koramangala to Whitefield has been accepted.',
            'category': 'booking',
            'is_read': false,
            'created_at': DateTime.now().subtract(const Duration(minutes: 5)).toIso8601String()
          },
          {
            'id': 2,
            'title': 'Payment Held in Escrow',
            'message': 'Fare of ₹95.00 has been held safely in Escrow.',
            'category': 'payment',
            'is_read': true,
            'created_at': DateTime.now().subtract(const Duration(hours: 1)).toIso8601String()
          }
        ];
        _unreadCount = 1;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Notification Center ($_unreadCount)'),
      ),
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _notifications.isEmpty
                ? const Center(child: Text('No notifications yet', style: TextStyle(color: AppColors.darkTextSecondary)))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _notifications.length,
                    itemBuilder: (context, index) {
                      final n = _notifications[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        color: n['is_read'] ? AppColors.darkSurface : AppColors.primary.withOpacity(0.12),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: AppColors.primary.withOpacity(0.2),
                            child: const Icon(Icons.notifications_active, color: AppColors.primary, size: 20),
                          ),
                          title: Text(n['title'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          subtitle: Text(n['message'], style: const TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
                          trailing: Text(Formatters.timeAgo(n['created_at']), style: const TextStyle(fontSize: 10, color: AppColors.darkTextSecondary)),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
