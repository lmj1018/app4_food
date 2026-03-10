import 'package:app4_food/data/models/google_place_meta.dart';
import 'package:app4_food/services/cache_store.dart';
import 'package:app4_food/services/google_meta_cache.dart';
import 'package:flutter_test/flutter_test.dart';

class InMemoryCacheStore implements CacheStore {
  final Map<String, String> _data = <String, String>{};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }
}

void main() {
  test('returns cached value before TTL and expires after TTL', () async {
    final store = InMemoryCacheStore();
    var now = DateTime(2026, 2, 21, 10, 0);
    final cache = GoogleMetaCache(
      store: store,
      ttl: const Duration(hours: 24),
      now: () => now,
    );

    final key = GoogleMetaCache.buildCacheKey(
      name: '교촌치킨',
      lat: 37.5,
      lng: 127.0,
    );
    final meta = GooglePlaceMeta(
      placeId: 'g-1',
      rating: 4.2,
      userRatingCount: 60,
      matchedDistanceM: 30,
      fetchedAt: now,
      matchedName: '교촌치킨 강남점',
    );
    await cache.set(key, meta);

    final hit = await cache.get(key);
    expect(hit, isNotNull);
    expect(hit!.placeId, 'g-1');

    now = now.add(const Duration(hours: 25));
    final expired = await cache.get(key);
    expect(expired, isNull);
  });
}
