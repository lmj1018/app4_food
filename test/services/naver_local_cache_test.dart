import 'package:app4_food/data/models/naver_local_item.dart';
import 'package:app4_food/services/cache_store.dart';
import 'package:app4_food/services/naver_local_cache.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('returns cached items before TTL and expires after TTL', () async {
    final store = _InMemoryCacheStore();
    var now = DateTime(2026, 2, 21, 12);
    final cache = NaverLocalCache(
      store: store,
      ttl: const Duration(minutes: 10),
      now: () => now,
    );
    final key = NaverLocalCache.buildCacheKey(query: '돈까스', display: 5);

    await cache.set(key, const <NaverLocalItem>[
      NaverLocalItem(
        title: '테스트',
        address: '서울',
        roadAddress: '서울 1',
        category: '한식',
        link: '',
      ),
    ]);

    final hit = await cache.get(key);
    expect(hit, isNotNull);
    expect(hit!.first.title, '테스트');

    now = now.add(const Duration(minutes: 11));
    final expired = await cache.get(key);
    expect(expired, isNull);
  });
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
