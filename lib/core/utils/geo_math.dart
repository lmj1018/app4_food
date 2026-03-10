import 'dart:math';

double distanceMeters({
  required double startLat,
  required double startLng,
  required double endLat,
  required double endLng,
}) {
  const double earthRadius = 6371000;
  final double dLat = _toRadians(endLat - startLat);
  final double dLng = _toRadians(endLng - startLng);
  final double a =
      sin(dLat / 2) * sin(dLat / 2) +
      cos(_toRadians(startLat)) *
          cos(_toRadians(endLat)) *
          sin(dLng / 2) *
          sin(dLng / 2);
  final double c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return earthRadius * c;
}

double _toRadians(double degree) => degree * pi / 180;
