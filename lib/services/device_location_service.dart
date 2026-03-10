import 'dart:async';

import 'package:geolocator/geolocator.dart';

class DeviceLocationService {
  static const double _southKoreaMinLat = 33.0;
  static const double _southKoreaMaxLat = 38.7;
  static const double _southKoreaMinLng = 124.0;
  static const double _southKoreaMaxLng = 132.0;
  static const Duration _cacheTtl = Duration(seconds: 18);

  static Position? _cachedPosition;
  static DateTime? _cachedAt;
  static Future<Position?>? _inFlight;

  bool isInSouthKorea({required double lat, required double lng}) {
    return lat >= _southKoreaMinLat &&
        lat <= _southKoreaMaxLat &&
        lng >= _southKoreaMinLng &&
        lng <= _southKoreaMaxLng;
  }

  Future<Position?> getCurrentPosition() async {
    final now = DateTime.now();
    final cachedAt = _cachedAt;
    if (_cachedPosition != null &&
        cachedAt != null &&
        now.difference(cachedAt) <= _cacheTtl) {
      return _cachedPosition;
    }

    final pending = _inFlight;
    if (pending != null) {
      return pending;
    }

    final future = _resolveCurrentPosition();
    _inFlight = future;
    Position? resolved;
    try {
      resolved = await future;
    } finally {
      _inFlight = null;
    }

    if (resolved != null) {
      _cachedPosition = resolved;
      _cachedAt = DateTime.now();
      return resolved;
    }
    return _cachedPosition;
  }

  Future<Position?> _resolveCurrentPosition() async {
    Position? lastKnown;
    try {
      lastKnown = await Geolocator.getLastKnownPosition();
    } catch (_) {}
    if (lastKnown != null) {
      _cachedPosition = lastKnown;
      _cachedAt = DateTime.now();
      return lastKnown;
    }

    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return null;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 3));
    } catch (_) {}

    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      ).timeout(const Duration(seconds: 2));
    } catch (_) {}

    try {
      return await Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      ).first.timeout(const Duration(seconds: 2));
    } catch (_) {}

    return null;
  }
}
