import 'dart:convert';

import '../data/models/naver_local_item.dart';
import 'cache_store.dart';

class NaverLocalCache {
  NaverLocalCache({
    required CacheStore store,
    Duration ttl = const Duration(minutes: 10),
    DateTime Function()? now,
  }) : _store = store,
       _ttl = ttl,
       _now = now ?? DateTime.now;

  static const String cacheStorageKey = 'naver_local_cache_v1';

  final CacheStore _store;
  final Duration _ttl;
  final DateTime Function() _now;

  Map<String, dynamic>? _decoded;

  Future<List<NaverLocalItem>?> get(String key) async {
    final cache = await _ensureLoaded();
    final raw = cache[key];
    if (raw is! Map<String, dynamic>) {
      return null;
    }
    final fetchedAtRaw = raw['fetchedAt']?.toString();
    final fetchedAt = DateTime.tryParse(fetchedAtRaw ?? '');
    if (fetchedAt == null || _now().isAfter(fetchedAt.add(_ttl))) {
      cache.remove(key);
      await _persist();
      return null;
    }

    final itemsRaw = raw['items'];
    if (itemsRaw is! List) {
      return null;
    }

    return itemsRaw
        .whereType<Map<String, dynamic>>()
        .map(NaverLocalItem.fromJson)
        .toList();
  }

  Future<void> set(String key, List<NaverLocalItem> items) async {
    final cache = await _ensureLoaded();
    cache[key] = <String, dynamic>{
      'fetchedAt': _now().toIso8601String(),
      'items': items.map((item) => item.toJson()).toList(),
    };
    await _persist();
  }

  Future<Map<String, dynamic>> _ensureLoaded() async {
    if (_decoded != null) {
      return _decoded!;
    }
    final raw = await _store.read(cacheStorageKey);
    if (raw == null || raw.isEmpty) {
      _decoded = <String, dynamic>{};
      return _decoded!;
    }
    final parsed = jsonDecode(raw);
    if (parsed is Map<String, dynamic>) {
      _decoded = parsed;
      return _decoded!;
    }
    _decoded = <String, dynamic>{};
    return _decoded!;
  }

  Future<void> _persist() async {
    await _store.write(cacheStorageKey, jsonEncode(_decoded ?? {}));
  }

  static String buildCacheKey({required String query, required int display}) {
    final normalized = query.trim().toLowerCase();
    return '$normalized|$display';
  }
}
