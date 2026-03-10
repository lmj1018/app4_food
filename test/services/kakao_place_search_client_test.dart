import 'dart:convert';

import 'package:app4_food/data/models/place_sort.dart';
import 'package:app4_food/services/exceptions.dart';
import 'package:app4_food/services/kakao_place_search_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  test('sends Kakao auth header and FD6 category filter', () async {
    final fake = _InspectingHttpClient();
    final client = KakaoPlaceSearchClient(
      apiKey: 'kakao-test-key',
      httpClient: fake,
    );

    await client.search(
      query: '돈까스',
      lat: 37.5,
      lng: 127.0,
      radius: 2000,
      sort: PlaceSort.distance,
      maxResults: 5,
    );

    expect(fake.lastRequest, isNotNull);
    final req = fake.lastRequest!;
    expect(req.url.host, 'dapi.kakao.com');
    expect(req.url.path, '/v2/local/search/keyword.json');
    expect(req.url.queryParameters['category_group_code'], 'FD6');
    expect(req.url.queryParameters['sort'], 'distance');
    expect(req.headers['Authorization'], 'KakaoAK kakao-test-key');
  });

  test('parses Kakao documents', () async {
    final fake = _InspectingHttpClient(
      responseBody: jsonEncode({
        'documents': [
          {
            'id': '101',
            'place_name': '테스트 식당',
            'address_name': '서울시 강남구',
            'road_address_name': '서울시 강남구 테헤란로 1',
            'phone': '02-000-0000',
            'x': '127.000',
            'y': '37.500',
            'distance': '180',
            'place_url': 'https://place.map.kakao.com/101',
            'category_name': '음식점 > 한식',
          },
        ],
      }),
    );
    final client = KakaoPlaceSearchClient(apiKey: 'key', httpClient: fake);

    final result = await client.search(
      query: '테스트',
      lat: 37.5,
      lng: 127.0,
      radius: 2000,
      sort: PlaceSort.distance,
      maxResults: 5,
    );

    expect(result.length, 1);
    expect(result.first.id, '101');
    expect(result.first.name, '테스트 식당');
    expect(result.first.distanceMeters, 180);
  });

  test('throws ApiRequestException when Kakao status is not 200', () async {
    final fake = _InspectingHttpClient(statusCode: 401);
    final client = KakaoPlaceSearchClient(apiKey: 'key', httpClient: fake);

    expect(
      () => client.search(
        query: '테스트',
        lat: 37.5,
        lng: 127.0,
        radius: 2000,
        sort: PlaceSort.distance,
        maxResults: 5,
      ),
      throwsA(isA<ApiRequestException>()),
    );
  });
}

class _InspectingHttpClient extends http.BaseClient {
  _InspectingHttpClient({this.statusCode = 200, String? responseBody})
    : _responseBody = responseBody ?? jsonEncode({'documents': []});

  final int statusCode;
  final String _responseBody;
  http.BaseRequest? lastRequest;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    lastRequest = request;
    return http.StreamedResponse(
      Stream.value(utf8.encode(_responseBody)),
      statusCode,
      headers: const {'content-type': 'application/json'},
    );
  }
}
