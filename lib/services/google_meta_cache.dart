import 'dart:convert';

import '../core/utils/name_similarity.dart';
import '../data/models/google_place_meta.dart';
import 'cache_store.dart';

class GoogleMetaCache {
  GoogleMetaCache({
    required CacheStore store,
    Duration ttl = const Duration(hours: 24),
    DateTime Function()? now,
  }) : _store = store,
       _ttl = ttl,
       _now = now ?? DateTime.now;

  static const String cacheStorageKey = 'google_meta_cache_v1';

  final CacheStore _store;
  final Duration _ttl;
  final DateTime Function() _now;

  Map<String, dynamic>? _decoded;

  Future<GooglePlaceMeta?> get(String key) async {
    final cache = await _ensureLoaded();
    final raw = cache[key];
    if (raw is! Map<String, dynamic>) {
      return null;
    }
    final item = GooglePlaceMeta.fromJson(raw);
    final expiredAt = item.fetchedAt.add(_ttl);
    if (_now().isAfter(expiredAt)) {
      cache.remove(key);
      await _persist();
      return null;
    }
    return item;
  }

  Future<void> set(String key, GooglePlaceMeta value) async {
    final cache = await _ensureLoaded();
    cache[key] = value.toJson();
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

  static String buildCacheKey({
    required String name,
    required double lat,
    required double lng,
  }) {
    final normalizedName = normalizeName(name);
    final latGrid = (lat * 1000).round() / 1000;
    final lngGrid = (lng * 1000).round() / 1000;
    return '$normalizedName@$latGrid,$lngGrid';
  }
}
