import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../data/models/kakao_place.dart';
import '../data/models/place_sort.dart';
import 'exceptions.dart';

class KakaoPlaceSearchClient {
  KakaoPlaceSearchClient({required String apiKey, http.Client? httpClient})
    : _apiKey = apiKey,
      _httpClient = httpClient ?? http.Client();

  final String _apiKey;
  final http.Client _httpClient;

  Future<List<KakaoPlace>> search({
    required String query,
    required double lat,
    required double lng,
    required int radius,
    required PlaceSort sort,
    int maxResults = 30,
  }) async {
    if (_apiKey.isEmpty) {
      throw MissingApiKeyException('KAKAO_REST_API_KEY');
    }
    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty) {
      return const <KakaoPlace>[];
    }

    final result = <KakaoPlace>[];
    final requestSize = maxResults < 1
        ? 1
        : (maxResults > 15 ? 15 : maxResults);
    final uri = Uri.https('dapi.kakao.com', '/v2/local/search/keyword.json', {
      'query': normalizedQuery,
      'y': '$lat',
      'x': '$lng',
      'radius': '$radius',
      'sort': sort.kakaoParam,
      'category_group_code': 'FD6',
      'size': '$requestSize',
      'page': '1',
    });

    final response = await _httpClient
        .get(
          uri,
          headers: <String, String>{
            'Authorization': 'KakaoAK $_apiKey',
            'Content-Type': 'application/json',
          },
        )
        .timeout(const Duration(seconds: 8));

    if (response.statusCode != 200) {
      throw ApiRequestException(
        'Kakao local API request failed.',
        statusCode: response.statusCode,
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw ApiRequestException('Kakao response format is invalid.');
    }
    final documents = decoded['documents'];
    if (documents is! List) {
      return const <KakaoPlace>[];
    }

    for (final item in documents) {
      if (item is! Map<String, dynamic>) {
        continue;
      }
      result.add(KakaoPlace.fromJson(item));
      if (result.length >= maxResults) {
        break;
      }
    }

    final dedup = <String, KakaoPlace>{};
    for (final place in result) {
      if (!dedup.containsKey(place.id)) {
        dedup[place.id] = place;
      }
    }
    return dedup.values.take(maxResults).toList();
  }
}
