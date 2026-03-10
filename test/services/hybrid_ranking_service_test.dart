import 'dart:async';
import 'dart:convert';

import 'package:app4_food/data/models/google_place_meta.dart';
import 'package:app4_food/data/models/kakao_place.dart';
import 'package:app4_food/data/models/naver_local_item.dart';
import 'package:app4_food/data/models/place_sort.dart';
import 'package:app4_food/data/models/quality_gate.dart';
import 'package:app4_food/services/cache_store.dart';
import 'package:app4_food/services/google_meta_cache.dart';
import 'package:app4_food/services/google_places_client.dart';
import 'package:app4_food/services/hybrid_ranking_service.dart';
import 'package:app4_food/services/kakao_place_search_client.dart';
import 'package:app4_food/services/naver_local_search_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

class InMemoryCacheStore implements CacheStore {
  final Map<String, String> _data = <String, String>{};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }
}

class FakeGooglePlacesClient implements GooglePlacesClient {
  FakeGooglePlacesClient({
    this.throwTimeout = false,
    this.values = const <String, GooglePlaceMeta>{},
  });

  final bool throwTimeout;
  final Map<String, GooglePlaceMeta> values;

  @override
  Future<GooglePlaceMeta?> enrichPlace({
    required String name,
    required double lat,
    required double lng,
    String? address,
  }) async {
    if (throwTimeout) {
      throw TimeoutException('timeout');
    }
    return values[name];
  }
}

class FakeNaverLocalSearchClient extends NaverLocalSearchClient {
  FakeNaverLocalSearchClient({this.itemsByQuery = const {}})
    : super(clientId: 'id', clientSecret: 'secret');

  final Map<String, List<NaverLocalItem>> itemsByQuery;
  final List<String> calledQueries = <String>[];

  @override
  Future<List<NaverLocalItem>> searchByComment({
    required String query,
    int display = 5,
  }) async {
    calledQueries.add(query);
    return itemsByQuery[query] ?? const <NaverLocalItem>[];
  }
}

void main() {
  late HybridRankingService service;
  late List<KakaoPlace> kakaoPlaces;

  setUp(() {
    kakaoPlaces = const [
      KakaoPlace(
        id: 'k1',
        name: 'A식당',
        addressName: '서울',
        roadAddressName: '서울 1',
        phone: '',
        lat: 37.5,
        lng: 127.0,
        distanceMeters: 100,
        placeUrl: '',
        categoryName: '',
      ),
      KakaoPlace(
        id: 'k2',
        name: 'B식당',
        addressName: '서울',
        roadAddressName: '서울 2',
        phone: '',
        lat: 37.51,
        lng: 127.01,
        distanceMeters: 200,
        placeUrl: '',
        categoryName: '',
      ),
      KakaoPlace(
        id: 'k3',
        name: 'C식당',
        addressName: '서울',
        roadAddressName: '서울 3',
        phone: '',
        lat: 37.52,
        lng: 127.02,
        distanceMeters: 300,
        placeUrl: '',
        categoryName: '',
      ),
    ];
  });

  test('ranks passed quality group first and keeps rest by distance', () {
    service = HybridRankingService(
      kakaoClient: KakaoPlaceSearchClient(
        apiKey: 'k',
        httpClient: http.Client(),
      ),
      googleClient: FakeGooglePlacesClient(),
      cache: GoogleMetaCache(store: InMemoryCacheStore()),
    );

    final ranked = service.rank(
      kakao: kakaoPlaces,
      googleMeta: {
        'k1': GooglePlaceMeta(
          placeId: 'g1',
          rating: 4.0,
          userRatingCount: 30,
          matchedDistanceM: 55,
          fetchedAt: DateTime(2026, 2, 21),
          matchedName: 'A식당',
        ),
        'k2': GooglePlaceMeta(
          placeId: 'g2',
          rating: 4.5,
          userRatingCount: 20,
          matchedDistanceM: 40,
          fetchedAt: DateTime(2026, 2, 21),
          matchedName: 'B식당',
        ),
      },
      gate: const QualityGate(),
    );

    expect(ranked.length, 3);
    expect(ranked.first.kakao.id, 'k1');
    expect(ranked[1].kakao.id, 'k2');
    expect(ranked[2].kakao.id, 'k3');
  });

  test('applies Naver review rank for non-passed groups', () {
    service = HybridRankingService(
      kakaoClient: KakaoPlaceSearchClient(
        apiKey: 'k',
        httpClient: http.Client(),
      ),
      googleClient: FakeGooglePlacesClient(),
      cache: GoogleMetaCache(store: InMemoryCacheStore()),
    );

    final ranked = service.rank(
      kakao: kakaoPlaces,
      googleMeta: const {},
      naverReviewRanks: const {'k3': 1},
      gate: const QualityGate(),
    );

    expect(ranked.first.kakao.id, 'k3');
    expect(ranked.first.naverReviewRank, 1);
  });

  test('falls back to Kakao ordering when Google enrichment fails', () async {
    service = HybridRankingService(
      kakaoClient: KakaoPlaceSearchClient(
        apiKey: 'kakao',
        httpClient: _FakeKakaoHttpClient(kakaoPlaces),
      ),
      googleClient: FakeGooglePlacesClient(throwTimeout: true),
      cache: GoogleMetaCache(store: InMemoryCacheStore()),
    );

    final ranked = await service.searchHybrid(
      query: '식당',
      lat: 37.5,
      lng: 127.0,
      radius: 2000,
      sort: PlaceSort.distance,
    );

    expect(ranked.map((item) => item.kakao.id).toList(), ['k1', 'k2', 'k3']);
    expect(service.lastHadGoogleFailure, isTrue);
    expect(service.lastUsedGoogleData, isFalse);
  });

  test('uses query-based Naver TOP list and maps matching Kakao places', () async {
    final naver = FakeNaverLocalSearchClient(
      itemsByQuery: {
        '마라탕': const <NaverLocalItem>[
          NaverLocalItem(
            title: 'A식당',
            address: '서울',
            roadAddress: '서울 1',
            category: '한식',
            link: '',
          ),
          NaverLocalItem(
            title: 'B식당',
            address: '서울',
            roadAddress: '서울 2',
            category: '한식',
            link: '',
          ),
        ],
      },
    );

    service = HybridRankingService(
      kakaoClient: KakaoPlaceSearchClient(
        apiKey: 'kakao',
        httpClient: _FakeKakaoHttpClient(kakaoPlaces),
      ),
      googleClient: FakeGooglePlacesClient(),
      naverClient: naver,
      cache: GoogleMetaCache(store: InMemoryCacheStore()),
    );

    final ranked = await service.searchHybrid(
      query: '마라탕',
      lat: 37.5,
      lng: 127.0,
      radius: 2000,
      sort: PlaceSort.distance,
    );

    expect(naver.calledQueries, ['마라탕']);
    final rankById = <String, int?>{
      for (final item in ranked) item.kakao.id: item.naverReviewRank,
    };
    expect(rankById['k1'], 1);
    expect(rankById['k2'], 2);
    expect(rankById['k3'], isNull);
  });

  test('adds regional hint queries and matches from hinted results', () async {
    const hintPlace = <KakaoPlace>[
      KakaoPlace(
        id: 'h1',
        name: '강남파스타',
        addressName: '서울 강남구',
        roadAddressName: '서울 강남구 테헤란로 1',
        phone: '',
        lat: 37.5,
        lng: 127.0,
        distanceMeters: 100,
        placeUrl: '',
        categoryName: '',
      ),
    ];

    final naver = FakeNaverLocalSearchClient(
      itemsByQuery: {
        '파스타': const <NaverLocalItem>[],
        '파스타 서울 강남구': const <NaverLocalItem>[
          NaverLocalItem(
            title: '강남파스타',
            address: '서울 강남구',
            roadAddress: '서울 강남구 테헤란로 1',
            category: '양식',
            link: '',
          ),
        ],
      },
    );

    service = HybridRankingService(
      kakaoClient: KakaoPlaceSearchClient(
        apiKey: 'kakao',
        httpClient: _FakeKakaoHttpClient(hintPlace),
      ),
      googleClient: FakeGooglePlacesClient(),
      naverClient: naver,
      cache: GoogleMetaCache(store: InMemoryCacheStore()),
    );

    final ranked = await service.searchHybrid(
      query: '파스타',
      lat: 37.5,
      lng: 127.0,
      radius: 2000,
      sort: PlaceSort.distance,
    );

    expect(naver.calledQueries.first, '파스타');
    expect(naver.calledQueries.contains('파스타 서울 강남구'), isTrue);
    expect(ranked.single.kakao.id, 'h1');
    expect(ranked.single.naverReviewRank, 1);
  });

  test('stops extra Naver queries when early-stop match ratio is reached', () async {
    final naver = FakeNaverLocalSearchClient(
      itemsByQuery: {
        '마라탕': const <NaverLocalItem>[
          NaverLocalItem(
            title: 'A식당',
            address: '서울',
            roadAddress: '서울 1',
            category: '한식',
            link: '',
          ),
        ],
        '마라탕 서울 1': const <NaverLocalItem>[
          NaverLocalItem(
            title: 'B식당',
            address: '서울',
            roadAddress: '서울 2',
            category: '한식',
            link: '',
          ),
        ],
      },
    );

    service = HybridRankingService(
      kakaoClient: KakaoPlaceSearchClient(
        apiKey: 'kakao',
        httpClient: _FakeKakaoHttpClient(kakaoPlaces),
      ),
      googleClient: FakeGooglePlacesClient(),
      naverClient: naver,
      cache: GoogleMetaCache(store: InMemoryCacheStore()),
      maxNaverQueryFanout: 4,
      naverEarlyStopMatchRatio: 0.10,
    );

    final ranked = await service.searchHybrid(
      query: '마라탕',
      lat: 37.5,
      lng: 127.0,
      radius: 2000,
      sort: PlaceSort.distance,
    );

    expect(naver.calledQueries.length, 1);
    expect(naver.calledQueries.single, '마라탕');
    expect(ranked.firstWhere((item) => item.kakao.id == 'k1').naverReviewRank, 1);
  });
}

class _FakeKakaoHttpClient extends http.BaseClient {
  _FakeKakaoHttpClient(this.places);

  final List<KakaoPlace> places;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final docs = places.map((p) {
      return {
        'id': p.id,
        'place_name': p.name,
        'address_name': p.addressName,
        'road_address_name': p.roadAddressName,
        'phone': p.phone,
        'x': p.lng.toString(),
        'y': p.lat.toString(),
        'distance': p.distanceMeters?.toString() ?? '',
        'place_url': p.placeUrl,
        'category_name': p.categoryName,
      };
    }).toList();
    final body = jsonEncode({'documents': docs});
    return http.StreamedResponse(
      Stream.value(utf8.encode(body)),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}
