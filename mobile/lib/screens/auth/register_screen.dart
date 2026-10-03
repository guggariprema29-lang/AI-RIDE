import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../home/home_dashboard_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _govIdController = TextEditingController();
  final _emergencyNameController = TextEditingController();
  final _emergencyPhoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _agreedToTerms = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Provider.of<AuthProvider>(context, listen: false).apiService.warmUpBackend();
      }
    });
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please accept the cost-sharing terms & conditions')),
      );
      return;
    }

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final payload = {
      'name': _nameController.text.trim(),
      'email': _emailController.text.trim(),
      'phone': _phoneController.text.trim(),
      'government_id': _govIdController.text.trim().isNotEmpty
          ? _govIdController.text.trim()
          : 'GOV-${DateTime.now().millisecondsSinceEpoch}',
      'password': _passwordController.text,
      'emergency_contact_name': _emergencyNameController.text.trim(),
      'emergency_contact_phone': _emergencyPhoneController.text.trim(),
      'face_verified': true, // Demo verification
    };

    final success = await authProvider.register(payload);

    if (!mounted) return;

    if (success) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeDashboardScreen()),
        (route) => false,
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(authProvider.error ?? 'Registration failed.'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Create AI Ride Account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Join AI Ride Community',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Shared mobility on the corridor you already travel.',
                  style: TextStyle(color: AppColors.darkTextSecondary),
                ),
                const SizedBox(height: 24),

                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Full Name', prefixIcon: Icon(Icons.person_outline)),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your full name' : null,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email Address', prefixIcon: Icon(Icons.email_outlined)),
                  validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone Number', prefixIcon: Icon(Icons.phone_outlined)),
                  validator: (v) => (v == null || v.trim().length < 8) ? 'Enter a valid phone number' : null,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _govIdController,
                  decoration: const InputDecoration(labelText: 'Govt / College ID (Optional Verification)', prefixIcon: Icon(Icons.badge_outlined)),
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _emergencyNameController,
                  decoration: const InputDecoration(labelText: 'Emergency Contact Name', prefixIcon: Icon(Icons.contact_phone_outlined)),
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _emergencyPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Emergency Contact Phone', prefixIcon: Icon(Icons.sos_outlined)),
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline)),
                  validator: (v) => (v == null || v.length < 6) ? 'Password must be at least 6 chars' : null,
                ),
                const SizedBox(height: 16),

                CheckboxListTile(
                  value: _agreedToTerms,
                  onChanged: (v) => setState(() => _agreedToTerms = v ?? true),
                  activeColor: AppColors.primary,
                  title: const Text(
                    'I agree to the Decentralised Cost-Sharing Terms, Safety Rules, and Community Code of Conduct.',
                    style: TextStyle(fontSize: 12, color: AppColors.darkTextSecondary),
                  ),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: 20),

                ElevatedButton(
                  onPressed: authProvider.isLoading ? null : _handleRegister,
                  child: authProvider.isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Register & Verify Profile'),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
