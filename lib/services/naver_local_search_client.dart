import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:http/http.dart' as http;

import '../data/models/naver_local_item.dart';
import 'exceptions.dart';
import 'naver_local_cache.dart';
import 'naver_usage_guard.dart';

class NaverLocalSearchClient {
  NaverLocalSearchClient({
    required String clientId,
    required String clientSecret,
    http.Client? httpClient,
    NaverLocalCache? cache,
    NaverUsageGuard? usageGuard,
    this.enableDebugLogs = false,
  }) : _clientId = clientId,
       _clientSecret = clientSecret,
       _httpClient = httpClient ?? http.Client(),
       _cache = cache,
       _usageGuard = usageGuard;

  final String _clientId;
  final String _clientSecret;
  final http.Client _httpClient;
  final NaverLocalCache? _cache;
  final NaverUsageGuard? _usageGuard;
  final bool enableDebugLogs;
  final Map<String, Future<List<NaverLocalItem>>> _inFlight =
      <String, Future<List<NaverLocalItem>>>{};
  String? _lastGuardNotice;

  String? get lastGuardNotice => _lastGuardNotice;

  void clearLastGuardNotice() {
    _lastGuardNotice = null;
  }

  Future<List<NaverLocalItem>> searchByComment({
    required String query,
    int display = 5,
  }) async {
    if (_clientId.isEmpty) {
      throw MissingApiKeyException('NAVER_CLIENT_ID');
    }
    if (_clientSecret.isEmpty) {
      throw MissingApiKeyException('NAVER_CLIENT_SECRET');
    }

    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty) {
      return const <NaverLocalItem>[];
    }

    final limitedDisplay = display.clamp(1, 5);
    final cacheKey = NaverLocalCache.buildCacheKey(
      query: normalizedQuery,
      display: limitedDisplay,
    );
    if (_cache != null) {
      final cached = await _cache.get(cacheKey);
      if (cached != null) {
        _debug('CACHE HIT query="$normalizedQuery" display=$limitedDisplay');
        return cached;
      }
    }

    final ongoing = _inFlight[cacheKey];
    if (ongoing != null) {
      _debug(
        'IN-FLIGHT REUSE query="$normalizedQuery" display=$limitedDisplay',
      );
      return ongoing;
    }

    final future = _requestAndCache(
      query: normalizedQuery,
      limitedDisplay: limitedDisplay,
      cacheKey: cacheKey,
    );
    _inFlight[cacheKey] = future;
    try {
      return await future;
    } finally {
      _inFlight.remove(cacheKey);
    }
  }

  Future<List<NaverLocalItem>> _requestAndCache({
    required String query,
    required int limitedDisplay,
    required String cacheKey,
  }) async {
    if (_usageGuard != null) {
      final decision = await _usageGuard.checkAndTrack(fingerprint: query);
      if (!decision.allow) {
        _debug('GUARD BLOCK query="$query" notice="${decision.notice}"');
        throw ApiRequestException(
          decision.notice ?? '리뷰 보강 요청이 제한되었습니다.',
          statusCode: 429,
        );
      }
      if (decision.notice != null && decision.notice!.isNotEmpty) {
        _lastGuardNotice = decision.notice;
        _debug('GUARD NOTICE query="$query" notice="${decision.notice}"');
      }
    }

    final uri = Uri.https('openapi.naver.com', '/v1/search/local.json', {
      'query': query,
      'display': '$limitedDisplay',
      'start': '1',
      'sort': 'comment',
    });
    _debug('REQUEST query="$query" display=$limitedDisplay');

    final response = await _httpClient
        .get(
          uri,
          headers: <String, String>{
            'X-Naver-Client-Id': _clientId,
            'X-Naver-Client-Secret': _clientSecret,
            'Content-Type': 'application/json',
          },
        )
        .timeout(const Duration(seconds: 8));

    if (response.statusCode != 200) {
      _debug('RESPONSE ERROR status=${response.statusCode} query="$query"');
      throw ApiRequestException(
        'Naver local API request failed.',
        statusCode: response.statusCode,
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw ApiRequestException('Naver response format is invalid.');
    }
    final items = decoded['items'];
    if (items is! List) {
      return const <NaverLocalItem>[];
    }
    final parsed = items
        .whereType<Map<String, dynamic>>()
        .map(NaverLocalItem.fromJson)
        .toList();
    _debug(
      'RESPONSE OK query="$query" items=${parsed.length} titles=${parsed.map((item) => item.title).toList()}',
    );
    if (_cache != null) {
      await _cache.set(cacheKey, parsed);
      _debug('CACHE WRITE query="$query" display=$limitedDisplay');
    }
    return parsed;
  }

  void _debug(String message) {
    if (!enableDebugLogs) {
      return;
    }
    developer.log(message, name: 'NaverLocalSearchClient');
  }
}
