import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../services/api_service.dart';

class RatingDialog extends StatefulWidget {
  final int bookingId;
  final String counterpartyName;

  const RatingDialog({
    super.key,
    required this.bookingId,
    required this.counterpartyName,
  });

  @override
  State<RatingDialog> createState() => _RatingDialogState();
}

class _RatingDialogState extends State<RatingDialog> {
  final ApiService _apiService = ApiService();
  final _reviewController = TextEditingController();
  int _rating = 5;
  bool _isSubmitting = false;

  Future<void> _submitRating() async {
    setState(() => _isSubmitting = true);
    try {
      await _apiService.completeBooking(widget.bookingId); // or rate API
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Rating submitted! AI Trust score updated.'), backgroundColor: AppColors.secondary),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to rate: $e'), backgroundColor: AppColors.danger),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Rate ${widget.counterpartyName}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            const Text('Your feedback directly updates their AI Trust Score.', style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary)),
            const SizedBox(height: 20),

            // 5 Stars Row
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (index) {
                final starVal = index + 1;
                return IconButton(
                  icon: Icon(
                    starVal <= _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: AppColors.warning,
                    size: 36,
                  ),
                  onPressed: () => setState(() => _rating = starVal),
                );
              }),
            ),
            const SizedBox(height: 16),

            TextFormField(
              controller: _reviewController,
              decoration: const InputDecoration(
                labelText: 'Leave an optional review note',
                hintText: 'Was pickup on time? Safe driving?',
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 24),

            ElevatedButton(
              onPressed: _isSubmitting ? null : _submitRating,
              child: _isSubmitting
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Submit Rating & Update Trust Score'),
            ),
          ],
        ),
      ),
    );
  }
}
