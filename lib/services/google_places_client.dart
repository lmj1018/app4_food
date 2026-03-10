import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/utils/geo_math.dart';
import '../core/utils/name_similarity.dart';
import '../data/models/google_place_meta.dart';
import 'exceptions.dart';

abstract class GooglePlacesClient {
  Future<GooglePlaceMeta?> enrichPlace({
    required String name,
    required double lat,
    required double lng,
    String? address,
  });
}

class GooglePlaceCandidate {
  const GooglePlaceCandidate({
    required this.placeId,
    required this.name,
    required this.lat,
    required this.lng,
    required this.distanceM,
    required this.nameSimilarity,
    this.rating,
    this.userRatingCount,
  });

  final String placeId;
  final String name;
  final double lat;
  final double lng;
  final double distanceM;
  final double nameSimilarity;
  final double? rating;
  final int? userRatingCount;
}

GooglePlaceCandidate? pickBestGoogleCandidate({
  required List<GooglePlaceCandidate> candidates,
  required double maxDistanceM,
  required double minNameSimilarity,
}) {
  final filtered = candidates.where((candidate) {
    return candidate.distanceM <= maxDistanceM &&
        candidate.nameSimilarity >= minNameSimilarity;
  }).toList();
  if (filtered.isEmpty) {
    return null;
  }
  filtered.sort((a, b) {
    final simCompare = b.nameSimilarity.compareTo(a.nameSimilarity);
    if (simCompare != 0) {
      return simCompare;
    }
    return a.distanceM.compareTo(b.distanceM);
  });
  return filtered.first;
}

class GooglePlacesHttpClient implements GooglePlacesClient {
  GooglePlacesHttpClient({
    required String apiKey,
    http.Client? httpClient,
    this.maxDistanceM = 120,
    this.minNameSimilarity = 0.45,
  }) : _apiKey = apiKey,
       _httpClient = httpClient ?? http.Client();

  final String _apiKey;
  final http.Client _httpClient;
  final double maxDistanceM;
  final double minNameSimilarity;

  @override
  Future<GooglePlaceMeta?> enrichPlace({
    required String name,
    required double lat,
    required double lng,
    String? address,
  }) async {
    if (_apiKey.isEmpty) {
      throw MissingApiKeyException('GOOGLE_PLACES_API_KEY');
    }

    final query = address == null || address.trim().isEmpty
        ? name
        : '$name ${address.trim()}';
    final uri = Uri.https(
      'maps.googleapis.com',
      '/maps/api/place/findplacefromtext/json',
      <String, String>{
        'input': query,
        'inputtype': 'textquery',
        'fields': 'place_id,name,geometry,rating,user_ratings_total',
        'locationbias': 'circle:250@$lat,$lng',
        'language': 'ko',
        'key': _apiKey,
      },
    );

    final response = await _httpClient
        .get(uri, headers: <String, String>{'Content-Type': 'application/json'})
        .timeout(const Duration(seconds: 8));

    if (response.statusCode != 200) {
      throw ApiRequestException(
        'Google Places request failed.',
        statusCode: response.statusCode,
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw ApiRequestException('Google Places response format is invalid.');
    }
    final status = (decoded['status'] ?? '').toString();
    if (status == 'ZERO_RESULTS') {
      return null;
    }
    if (status != 'OK') {
      throw ApiRequestException('Google Places status: $status');
    }

    final candidatesRaw = decoded['candidates'];
    if (candidatesRaw is! List) {
      return null;
    }
    final parsed = <GooglePlaceCandidate>[];
    for (final item in candidatesRaw) {
      if (item is! Map<String, dynamic>) {
        continue;
      }
      final geometry = item['geometry'];
      if (geometry is! Map<String, dynamic>) {
        continue;
      }
      final location = geometry['location'];
      if (location is! Map<String, dynamic>) {
        continue;
      }
      final cLat = _toDouble(location['lat']);
      final cLng = _toDouble(location['lng']);
      if (cLat == null || cLng == null) {
        continue;
      }
      final candidateName = (item['name'] ?? '').toString();
      final similarity = nameSimilarity(name, candidateName);
      final distance = distanceMeters(
        startLat: lat,
        startLng: lng,
        endLat: cLat,
        endLng: cLng,
      );
      parsed.add(
        GooglePlaceCandidate(
          placeId: (item['place_id'] ?? '').toString(),
          name: candidateName,
          lat: cLat,
          lng: cLng,
          distanceM: distance,
          nameSimilarity: similarity,
          rating: _toDouble(item['rating']),
          userRatingCount: _toInt(item['user_ratings_total']),
        ),
      );
    }

    final best = pickBestGoogleCandidate(
      candidates: parsed,
      maxDistanceM: maxDistanceM,
      minNameSimilarity: minNameSimilarity,
    );
    if (best == null) {
      return null;
    }
    return GooglePlaceMeta(
      placeId: best.placeId,
      rating: best.rating,
      userRatingCount: best.userRatingCount,
      matchedDistanceM: best.distanceM,
      fetchedAt: DateTime.now(),
      matchedName: best.name,
    );
  }
}

double? _toDouble(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse((value ?? '').toString());
}

int? _toInt(dynamic value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse((value ?? '').toString());
}
