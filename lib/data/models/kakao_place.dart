class KakaoPlace {
  const KakaoPlace({
    required this.id,
    required this.name,
    required this.addressName,
    required this.roadAddressName,
    required this.phone,
    required this.lat,
    required this.lng,
    required this.distanceMeters,
    required this.placeUrl,
    required this.categoryName,
  });

  final String id;
  final String name;
  final String addressName;
  final String roadAddressName;
  final String phone;
  final double lat;
  final double lng;
  final double? distanceMeters;
  final String placeUrl;
  final String categoryName;

  factory KakaoPlace.fromJson(Map<String, dynamic> json) {
    final id = (json['id'] ?? '').toString();
    final x = double.tryParse((json['x'] ?? '').toString()) ?? 0;
    final y = double.tryParse((json['y'] ?? '').toString()) ?? 0;
    final distance = double.tryParse((json['distance'] ?? '').toString());
    return KakaoPlace(
      id: id,
      name: (json['place_name'] ?? '').toString(),
      addressName: (json['address_name'] ?? '').toString(),
      roadAddressName: (json['road_address_name'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      lat: y,
      lng: x,
      distanceMeters: distance,
      placeUrl: (json['place_url'] ?? '').toString(),
      categoryName: (json['category_name'] ?? '').toString(),
    );
  }

  String get displayAddress =>
      roadAddressName.isNotEmpty ? roadAddressName : addressName;

  double get distanceForSort => distanceMeters ?? double.infinity;
}
