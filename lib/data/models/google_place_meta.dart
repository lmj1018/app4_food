class GooglePlaceMeta {
  const GooglePlaceMeta({
    required this.placeId,
    required this.matchedDistanceM,
    required this.fetchedAt,
    required this.matchedName,
    this.rating,
    this.userRatingCount,
  });

  final String placeId;
  final double? rating;
  final int? userRatingCount;
  final double matchedDistanceM;
  final DateTime fetchedAt;
  final String matchedName;

  bool get hasRatingData => rating != null && userRatingCount != null;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'placeId': placeId,
      'rating': rating,
      'userRatingCount': userRatingCount,
      'matchedDistanceM': matchedDistanceM,
      'fetchedAt': fetchedAt.toIso8601String(),
      'matchedName': matchedName,
    };
  }

  factory GooglePlaceMeta.fromJson(Map<String, dynamic> json) {
    return GooglePlaceMeta(
      placeId: (json['placeId'] ?? '').toString(),
      rating: _toDoubleOrNull(json['rating']),
      userRatingCount: _toIntOrNull(json['userRatingCount']),
      matchedDistanceM: _toDoubleOrNull(json['matchedDistanceM']) ?? 0,
      fetchedAt:
          DateTime.tryParse((json['fetchedAt'] ?? '').toString()) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      matchedName: (json['matchedName'] ?? '').toString(),
    );
  }
}

double? _toDoubleOrNull(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse((value ?? '').toString());
}

int? _toIntOrNull(dynamic value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse((value ?? '').toString());
}
