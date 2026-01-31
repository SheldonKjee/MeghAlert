import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:geolocator/geolocator.dart';
import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:geocoding/geocoding.dart' as geo;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as latLng;

// Debug: force showing registration screen on launch for screenshots/testing
const bool _DEBUG_FORCE_REGISTRATION = true;

void main() => runApp(MyApp());

class MyApp extends StatelessWidget {
  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SOS Buzzer',
      theme: ThemeData(
        primarySwatch: Colors.lightBlue,
        scaffoldBackgroundColor: Color(0xFFEAF6FF),
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: Colors.blue[900],
          elevation: 0,
        ),
      ),
      home: MyHomePage(title: 'SOS Buzzer'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({Key? key, required this.title}) : super(key: key);

  final String title;

  @override
  _MyHomePageState createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> with TickerProviderStateMixin {
  Map<String, String> _userData = {};
  bool _registered = false;

  // SOS state
  bool _sosPending = false;
  bool _sosSharing = false; // true when continuous sharing after countdown
  int _countdown = 10;
  double? _currentLat;
  double? _currentLng;
  List<latLng.LatLng> _movementPath = [];  Timer? _sosTimer;
  Timer? _shareTimer; // periodic 4s share
  String _lastLocation = '';
  DateTime? _lastLocationAt;

  // SOS button animation
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _loadRegistrationStatus();
    _pulseController = AnimationController(vsync: this, duration: Duration(seconds: 1))..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.06).animate(CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _sosTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _loadRegistrationStatus() async {
    final prefs = await SharedPreferences.getInstance();
    final isRegistered = prefs.getBool('is_registered') ?? false;
    if (isRegistered) {
      final data = prefs.getString('user_data');
      if (data != null) {
        try {
          final Map m = jsonDecode(data);
          _userData = m.map((k, v) => MapEntry(k.toString(), v.toString()));
        } catch (_) {}
      }
      setState(() {
        _registered = true;
      });
      if (_DEBUG_FORCE_REGISTRATION) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _askRegistration();
        });
      }
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _askRegistration();
      });
    }
  }

  void _askRegistration() async {
    final result = await Navigator.of(context).push(MaterialPageRoute(
        builder: (ctx) => RegistrationScreen(initialData: _userData)));
    if (result is Map<String, String>) {
      setState(() {
        _userData = result;
        _registered = true;
      });
    }
  }


  void _startSosCountdown() {
    if (_sosPending) return;
    setState(() {
      _sosPending = true;
      _countdown = 30;
    });
    _sosTimer?.cancel();
    _sosTimer = Timer.periodic(Duration(seconds: 1), (t) {
      setState(() {
        _countdown--;
      });
      if (_countdown <= 0) {
        t.cancel();
        // Countdown finished — start continuous sharing every 4s
        setState(() {
          _sosPending = false;
          _sosSharing = true;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('SOS confirmed — sharing location every 4s')));
        // Send immediately, then schedule periodic 4s updates
        _sendLocationUpdate();
        _shareTimer?.cancel();
        _shareTimer = Timer.periodic(Duration(seconds: 4), (_) {
          _sendLocationUpdate();
        });
        // Also update map movement path with any existing coordinates
        if (_currentLat != null && _currentLng != null) {
          _movementPath.add(latLng.LatLng(_currentLat!, _currentLng!));
        }
      }
    });

    // show a brief snack that SOS is sent and overlay will show cancel option
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('SOS Distress call sent — expecting a response in 30s')));

  }

  void _cancelSos() {
    _sosTimer?.cancel();
    _sosTimer = null;
    _shareTimer?.cancel();
    _shareTimer = null;
    setState(() {
      _sosPending = false;
      _sosSharing = false;
      _lastLocation = '';
      _lastLocationAt = null;
      _currentLat = null;
      _currentLng = null;
      _movementPath.clear();
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('SOS canceled')));
  }

  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("SOS Buzzer"),
        actions: [
          IconButton(
            icon: Icon(Icons.person),
            tooltip: 'Edit profile',
            onPressed: () async {
              final result = await Navigator.of(context).push(MaterialPageRoute(builder: (ctx) => RegistrationScreen(initialData: _userData)));
              if (result is Map<String, String>) setState(() => _userData = result);
            },
          )
        ],
      ),
      body: bodyData(),
      backgroundColor: Colors.white,
    );
  }

  Future<void> _sendLocationUpdate() async {
    try {
      // Check and request permission
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        print('Location permission denied');
        return;
      }

      // Get current position
      Position pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      double lat = pos.latitude;
      double lng = pos.longitude;

      String addressLine;
      // On web or Windows, skip reverse geocoding (may not be supported)
      if (kIsWeb) {
        addressLine = 'Lat: $lat, Lng: $lng';
      } else {
        List<geo.Placemark> placemarks = await geo.placemarkFromCoordinates(lat, lng);
        if (placemarks.isEmpty) {
          print('No placemarks found');
          return;
        }
        final first = placemarks.first;
        addressLine = '${first.name ?? ''} ${first.street ?? ''}, ${first.locality ?? ''} ${first.postalCode ?? ''} ${first.country ?? ''}'.trim();
      }

      setState(() {
        _lastLocation = addressLine;
        _lastLocationAt = DateTime.now();
        _currentLat = lat;
        _currentLng = lng;
        _movementPath.add(latLng.LatLng(lat, lng));
      });

      // Send to backend (demo server) so admin UI can display real-time SOS
      try {
        final uri = Uri.parse('http://localhost:3000/api/sos');
        final deviceId = _userData['phone'] ?? _userData['email'] ?? 'unknown_device_${DateTime.now().millisecondsSinceEpoch}';
        final body = jsonEncode({
          'deviceId': deviceId,
          'name': _userData['name'] ?? deviceId,
          'phone': _userData['phone'] ?? '',
          'lat': lat,
          'lng': lng
        });
        final r = await http.post(uri, headers: {'Content-Type': 'application/json'}, body: body).timeout(Duration(seconds: 5));
        if (r.statusCode != 200) {
          print('❌ SOS POST failed: ${r.statusCode}');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('⚠️ Warning: SOS sent but server response: ${r.statusCode}'),
              backgroundColor: Colors.orange,
              duration: Duration(seconds: 2),
            )
          );
        } else {
          print('✅ SOS POST success to admin dashboard!');
          print('Response: ${r.body}');
          // Show brief confirmation that admin was notified
          if (_movementPath.length == 1) { // Only show on first successful send
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('🚨 SOS Alert sent to Admin Dashboard!'),
                backgroundColor: Colors.green,
                duration: Duration(seconds: 2),
              )
            );
          }
        }
        print('📍 Posted deviceId: $deviceId to $uri');
      } catch (e) {
        // Show error notification so user knows there might be a connection issue
        print('❌ Error sending SOS to server: $e');
        if (_movementPath.length == 1) { // Only show on first attempt
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('⚠️ Cannot reach admin server. Check if server is running.'),
              backgroundColor: Colors.red,
              duration: Duration(seconds: 3),
            )
          );
        }
      }

      // Debug/log
      print('Shared location: $_lastLocation');
    } catch (e) {
      print('error during continuous location update');
      print(e);
    }
  }




  Widget bodyData() => Stack(
        children: [
          Container(
            width: double.infinity,
            padding: EdgeInsets.symmetric(horizontal: 24, vertical: 40),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFEAF6FF), Color(0xFFDFF3FF)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: <Widget>[
                SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    _registered ? 'Welcome, ${_userData['name'] ?? 'Friend'}' : 'Welcome',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.blue[900]),
                  ),
                ),
                SizedBox(height: 6),
                Card(
                  color: _sosPending ? Color(0xFFFFF1F0) : Colors.white,
                  elevation: _sosPending ? 6 : 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Container(
                    padding: EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Stack(children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: Colors.blue[200],
                            child: Text(
                              (_userData['name'] ?? 'A').isNotEmpty ? (_userData['name'] ?? 'A')[0].toUpperCase() : 'A',
                              style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                            ),
                          ),
                          if (_sosPending)
                            Positioned(
                              right: -2,
                              bottom: -2,
                              child: CircleAvatar(radius: 10, backgroundColor: Colors.redAccent, child: Icon(Icons.priority_high, size: 14, color: Colors.white)),
                            )
                        ]),
                        SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Expanded(child: Text(
                                  _userData['name'] ?? 'No profile',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                )),
                                if (_sosPending) Chip(label: Text('PRIORITY', style: TextStyle(color: Colors.white)), backgroundColor: Colors.redAccent)
                              ]),
                              SizedBox(height: 4),
                              Text(
                                _userData['address'] != null && _userData['address']!.isNotEmpty ? _userData['address']! : 'Address not set',
                                style: TextStyle(color: Colors.grey[700]),
                              )
                            ],
                          ),
                        )
                      ],
                    ),
                  ),
                ),
                Spacer(),
                // Big SOS button
                ScaleTransition(
                  scale: _pulseAnimation,
                  child: GestureDetector(
                    onTap: () async {
                      // Immediately start SOS countdown; location sharing begins only after countdown reaches 0
                      _startSosCountdown();
                    },
                    child: Container(
                      width: 260,
                      height: 260,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(colors: [Colors.blueAccent, Color(0xFF0047B3)]),
                        boxShadow: [BoxShadow(color: Colors.blue.withValues(alpha: 60), blurRadius: 20, spreadRadius: 4)],
                      ),
                      child: Center(
                          child: Text('SOS', style: TextStyle(color: Colors.white, fontSize: 44, fontWeight: FontWeight.bold))),
                    ),
                  ),
                ),
                SizedBox(height: 28),
                Text(
                  "Tap the button to alert your emergency contacts.",
                  style: TextStyle(
                      color: Colors.blueGrey[700],
                      fontSize: 16,
                      fontWeight: FontWeight.w500),
                  textAlign: TextAlign.center,
                ),
                Spacer(),
                SizedBox(height: 10),
              ],
            ),
          ),
          if (_sosPending || _sosSharing)
            Positioned(
              // place the popup below the SOS button area (approximate)
              bottom: 140,
              left: 24,
              right: 24,
              child: Material(
                elevation: 6,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (_sosPending) ...[
                              Text('SOS Distress sent — expect a callback in', style: TextStyle(fontWeight: FontWeight.bold)),
                              SizedBox(height: 6),
                              Text('${_countdown}s', style: TextStyle(fontSize: 18, color: Colors.redAccent, fontWeight: FontWeight.bold)),
                              SizedBox(height: 6),
                              Text('If pressed by mistake, cancel using the X button.', style: TextStyle(color: Colors.grey[700], fontSize: 12)),
                            ] else ...[
                              Text('Sharing location — updates every 4s', style: TextStyle(fontWeight: FontWeight.bold)),
                              SizedBox(height: 8),
                              // show a small map that updates position; if no coords yet, show a placeholder text
                              Container(
                                height: 160,
                                child: _currentLat != null && _currentLng != null
                                    ? Column(
                                        children: [
                                          Expanded(
                                            child: FlutterMap(
                                              options: MapOptions(
                                                center: latLng.LatLng(_currentLat!, _currentLng!),
                                                zoom: 15.0,
                                              ),
                                              children: [
                                                TileLayer(
                                                  urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                                  subdomains: ['a','b','c'],
                                                  userAgentPackageName: 'com.example.sos_buzzer',
                                                ),
                                                PolylineLayer(polylines: [Polyline(points: _movementPath, color: Colors.redAccent, strokeWidth: 3.0)]),
                                                MarkerLayer(markers: [
                                                  Marker(
                                                    width: 40,
                                                    height: 40,
                                                    point: latLng.LatLng(_currentLat!, _currentLng!),
                                                    builder: (ctx) => Icon(Icons.my_location, color: Colors.blueAccent, size: 28),
                                                  )
                                                ])
                                              ],
                                            ),
                                          ),
                                          if (_lastLocationAt != null) Padding(
                                            padding: EdgeInsets.only(top: 6),
                                            child: Text('Last update: ${_lastLocationAt!.toLocal().toIso8601String()}', style: TextStyle(color: Colors.grey[600], fontSize: 11)),
                                          )
                                        ],
                                      )
                                    : Center(child: Text('Awaiting first location...')),
                              ),
                            ]
                          ],
                        ),
                      ),
                      IconButton(onPressed: _cancelSos, icon: Icon(Icons.close, color: Colors.black54))
                    ],
                  ),
                ),
              ),
            ),
        ],
      );
}

// --- Registration screen widget ---
class RegistrationScreen extends StatefulWidget {
  final Map<String, String>? initialData;
  RegistrationScreen({this.initialData});

  @override
  _RegistrationScreenState createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final Map<String, TextEditingController> _controllers = {
    'name': TextEditingController(),
    'email': TextEditingController(),
    'phone': TextEditingController(),
    'altPhone': TextEditingController(),
    'address': TextEditingController(),
    'emergency': TextEditingController(),
    'notes': TextEditingController(),
  };

  @override
  void initState() {
    super.initState();
    final d = widget.initialData ?? {};
    _controllers.forEach((k, c) {
      c.text = d[k] ?? '';
    });
  }

  @override
  void dispose() {
    _controllers.values.forEach((c) => c.dispose());
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final Map<String, String> values = {};
    _controllers.forEach((k, c) => values[k] = c.text.trim());
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_data', jsonEncode(values));
    await prefs.setBool('is_registered', true);
    Navigator.of(context).pop(values);
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? 'Required' : null;
  String? _emailValidator(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    final re = RegExp(r"^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}");
    return re.hasMatch(v.trim()) ? null : 'Invalid email';
  }

  String? _phoneValidator(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    final s = v.trim();
    // Fix: remove stray backslash before '$' so the regex correctly anchors the end
    final re1 = RegExp(r'^(?:\+91|91)?[6-9]\d{9}$'); // +919876543210 or 9876543210
    if (re1.hasMatch(s)) return null;
    return 'Enter Indian number (+91) or 10-digit mobile';
  }

  String? _emergencyValidator(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    // check contains a phone number (Indian mobile)
    final phoneRe = RegExp(r'(?:\+91|91)?[6-9]\d{9}');
    return phoneRe.hasMatch(v) ? null : 'Include emergency mobile number (Indian)';
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Register Profile')),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(controller: _controllers['name'], decoration: InputDecoration(labelText: 'Full name'), validator: _required, textCapitalization: TextCapitalization.words),
              TextFormField(controller: _controllers['email'], decoration: InputDecoration(labelText: 'Email'), validator: _emailValidator, keyboardType: TextInputType.emailAddress),
              TextFormField(controller: _controllers['phone'], decoration: InputDecoration(labelText: 'Phone number (e.g., +919876543210 or 9876543210)'), validator: _phoneValidator, keyboardType: TextInputType.phone),
              TextFormField(controller: _controllers['altPhone'], decoration: InputDecoration(labelText: 'Alternative phone (optional)'), keyboardType: TextInputType.phone),
              TextFormField(controller: _controllers['address'], decoration: InputDecoration(labelText: 'Residential address'), validator: _required),
              TextFormField(controller: _controllers['emergency'], decoration: InputDecoration(labelText: 'Emergency contact (name & number)'), validator: _emergencyValidator, keyboardType: TextInputType.text),
              TextFormField(controller: _controllers['notes'], decoration: InputDecoration(labelText: 'Medical notes / history (optional)'), maxLines: 3),
              SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: ElevatedButton(onPressed: _save, child: Text('Save locally'))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
