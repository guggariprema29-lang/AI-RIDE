import 'package:intl/intl.dart';

class Formatters {
  static final NumberFormat _currencyFormatter = NumberFormat.currency(
    symbol: '₹',
    decimalDigits: 2,
    locale: 'en_IN',
  );

  static String rupees(dynamic amount) {
    if (amount == null) return '₹0.00';
    final double value = (amount is num) ? amount.toDouble() : (double.tryParse(amount.toString()) ?? 0.0);
    return _currencyFormatter.format(value);
  }

  static String km(dynamic meters) {
    if (meters == null) return '0.0 km';
    final double value = (meters is num) ? meters.toDouble() : (double.tryParse(meters.toString()) ?? 0.0);
    return '${(value / 1000.0).toStringAsFixed(1)} km';
  }

  static String timeAgo(String? isoDate) {
    if (isoDate == null) return 'just now';
    try {
      final DateTime date = DateTime.parse(isoDate).toLocal();
      final Duration diff = DateTime.now().difference(date);
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) {
      return isoDate;
    }
  }

  static String departureLabel(String? isoDate) {
    if (isoDate == null) return 'Immediate';
    try {
      final DateTime date = DateTime.parse(isoDate).toLocal();
      return DateFormat('EEE, MMM d • h:mm a').format(date);
    } catch (_) {
      return isoDate;
    }
  }
}
