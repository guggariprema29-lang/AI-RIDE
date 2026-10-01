import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../services/api_service.dart';

class CancellationDialog extends StatefulWidget {
  final int bookingId;
  final int userId;
  final VoidCallback onCancelled;

  const CancellationDialog({
    super.key,
    required this.bookingId,
    required this.userId,
    required this.onCancelled,
  });

  @override
  State<CancellationDialog> createState() => _CancellationDialogState();
}

class _CancellationDialogState extends State<CancellationDialog> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  bool _isCancelling = false;
  Map<String, dynamic>? _preview;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchPreview();
  }

  Future<void> _fetchPreview() async {
    try {
      final res = await _apiService.getCancellationPreview(widget.bookingId, widget.userId);
      if (!mounted) return;
      setState(() {
        _preview = res;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _executeCancel() async {
    setState(() => _isCancelling = true);
    try {
      final res = await _apiService.cancelBooking(widget.bookingId, widget.userId);
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onCancelled();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Booking cancelled. Fee: ${Formatters.rupees(res['cancellation_fee'])}. Refund: ${Formatters.rupees(res['refund_amount'])}.'),
          backgroundColor: AppColors.info,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isCancelling = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to cancel: $e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      backgroundColor: AppColors.darkSurface,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: _isLoading
            ? const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(height: 20),
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Fetching Cancellation Policy…'),
                  SizedBox(height: 20),
                ],
              )
            : _error != null
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Error: $_error', style: const TextStyle(color: AppColors.danger)),
                      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(color: AppColors.danger.withOpacity(0.15), shape: BoxShape.circle),
                            child: const Icon(Icons.warning_amber_rounded, color: AppColors.danger, size: 28),
                          ),
                          const SizedBox(width: 12),
                          const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Cancel Booking?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                              Text('Cancellation Policy & Fee Review', style: TextStyle(fontSize: 11, color: AppColors.darkTextSecondary)),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      const Text(
                        'Your seat is currently reserved for this ride. Cancelling may incur a fee based on departure time policy.',
                        style: TextStyle(fontSize: 13, color: AppColors.darkTextSecondary),
                      ),
                      const SizedBox(height: 16),

                      // Breakdown Card
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.darkBackground,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.darkBorder),
                        ),
                        child: Column(
                          children: [
                            _row('Booking Amount:', Formatters.rupees(_preview?['booking_amount'])),
                            const SizedBox(height: 6),
                            _row('Cancellation Fee:', Formatters.rupees(_preview?['cancellation_fee']), isFee: true),
                            const Divider(height: 16),
                            _row('Net Refund to Wallet:', Formatters.rupees(_preview?['refund_amount']), isRefund: true),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      Text(
                        'ℹ️ Policy: ${_preview?['cancellation_policy'] ?? "Standard policy applied."}',
                        style: const TextStyle(fontSize: 12, color: AppColors.primary),
                      ),

                      if (_preview?['warning_message'] != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.danger.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppColors.danger.withOpacity(0.3)),
                          ),
                          child: Text(
                            '⚠️ ${_preview!['warning_message']}',
                            style: const TextStyle(fontSize: 11, color: AppColors.danger, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],

                      const SizedBox(height: 20),

                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Keep Booking'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
                              onPressed: _isCancelling ? null : _executeCancel,
                              child: _isCancelling
                                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                  : const Text('Cancel & Pay Fee', style: TextStyle(fontSize: 12)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _row(String label, String val, {bool isFee = false, bool isRefund = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
        Text(
          val,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: isFee ? AppColors.danger : (isRefund ? AppColors.secondary : Colors.white),
          ),
        ),
      ],
    );
  }
}
