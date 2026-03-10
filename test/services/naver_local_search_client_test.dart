import 'dart:convert';

import 'package:app4_food/services/cache_store.dart';
import 'package:app4_food/services/exceptions.dart';
import 'package:app4_food/services/naver_local_cache.dart';
import 'package:app4_food/services/naver_local_search_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  test('sends Naver headers and comment sort parameter', () async {
    final fake = _InspectingHttpClient();
    final client = NaverLocalSearchClient(
      clientId: 'naver-id',
      clientSecret: 'naver-secret',
      httpClient: fake,
    );

    await client.searchByComment(query: '돈까스', display: 5);

    expect(fake.lastRequest, isNotNull);
    final req = fake.lastRequest!;
    expect(req.url.host, 'openapi.naver.com');
    expect(req.url.path, '/v1/search/local.json');
    expect(req.url.queryParameters['sort'], 'comment');
    expect(req.headers['X-Naver-Client-Id'], 'naver-id');
    expect(req.headers['X-Naver-Client-Secret'], 'naver-secret');
  });

  test('parses title and strips html tags', () async {
    final fake = _InspectingHttpClient(
      responseBody: jsonEncode({
        'items': [
          {
            'title': '<b>테스트 식당</b>',
            'address': '서울시 강남구',
            'roadAddress': '서울시 강남구 테헤란로 1',
            'category': '음식점>한식',
            'link': 'https://example.com',
          },
        ],
      }),
    );
    final client = NaverLocalSearchClient(
      clientId: 'id',
      clientSecret: 'secret',
      httpClient: fake,
    );

    final items = await client.searchByComment(query: '테스트');

    expect(items.length, 1);
    expect(items.first.title, '테스트 식당');
    expect(items.first.displayAddress, '서울시 강남구 테헤란로 1');
  });

  test('throws ApiRequestException when status is not 200', () async {
    final fake = _InspectingHttpClient(statusCode: 401);
    final client = NaverLocalSearchClient(
      clientId: 'id',
      clientSecret: 'secret',
      httpClient: fake,
    );

    expect(
      () => client.searchByComment(query: '테스트'),
      throwsA(isA<ApiRequestException>()),
    );
  });

  test(
    'uses local cache to avoid duplicate API calls for same query',
    () async {
      final fake = _InspectingHttpClient(
        responseBody: jsonEncode({
          'items': [
            {
              'title': 'A식당',
              'address': '서울',
              'roadAddress': '서울 1',
              'category': '한식',
              'link': '',
            },
          ],
        }),
      );
      final cache = NaverLocalCache(store: _InMemoryCacheStore());
      final client = NaverLocalSearchClient(
        clientId: 'id',
        clientSecret: 'secret',
        httpClient: fake,
        cache: cache,
      );

      final first = await client.searchByComment(query: 'A식당', display: 5);
      final second = await client.searchByComment(query: 'A식당', display: 5);

      expect(first.length, 1);
      expect(second.length, 1);
      expect(fake.sendCount, 1);
    },
  );
}

class _InspectingHttpClient extends http.BaseClient {
  _InspectingHttpClient({this.statusCode = 200, String? responseBody})
    : _responseBody = responseBody ?? jsonEncode({'items': []});

  final int statusCode;
  final String _responseBody;
  int sendCount = 0;
  http.BaseRequest? lastRequest;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    sendCount += 1;
    lastRequest = request;
    return http.StreamedResponse(
      Stream.value(utf8.encode(_responseBody)),
      statusCode,
      headers: const {'content-type': 'application/json'},
    );
  }
}

class _InMemoryCacheStore implements CacheStore {
  final Map<String, String> _data = <String, String>{};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }
}
