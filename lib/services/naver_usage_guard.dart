import 'dart:convert';

import '../core/utils/name_similarity.dart';
import 'cache_store.dart';

enum NaverGuardLevel { normal, warning, quotaBlocked, suspiciousBlocked }

class NaverGuardDecision {
  const NaverGuardDecision({
    required this.allow,
    required this.level,
    this.notice,
  });

  const NaverGuardDecision.allow()
    : this(allow: true, level: NaverGuardLevel.normal);

  const NaverGuardDecision.warning(String notice)
    : this(allow: true, level: NaverGuardLevel.warning, notice: notice);

  const NaverGuardDecision.blocked({
    required NaverGuardLevel level,
    required String notice,
  }) : this(allow: false, level: level, notice: notice);

  final bool allow;
  final NaverGuardLevel level;
  final String? notice;
}

class NaverUsageGuard {
  NaverUsageGuard({
    required CacheStore store,
    int dailyQuota = 25000,
    this.warningRatio = 0.7,
    this.blockRatio = 0.9,
    this.requestBurstLimit = 30,
    this.duplicateBurstLimit = 8,
    this.burstWindow = const Duration(minutes: 1),
    this.duplicateWindow = const Duration(minutes: 2),
    this.abuseBlockDuration = const Duration(minutes: 10),
    DateTime Function()? now,
  }) : _store = store,
       _dailyQuota = dailyQuota,
       _now = now ?? DateTime.now;

  static const String usageStorageKey = 'naver_usage_guard_v1';

  final CacheStore _store;
  final int _dailyQuota;
  final double warningRatio;
  final double blockRatio;
  final int requestBurstLimit;
  final int duplicateBurstLimit;
  final Duration burstWindow;
  final Duration duplicateWindow;
  final Duration abuseBlockDuration;
  final DateTime Function() _now;

  final List<DateTime> _recentRequests = <DateTime>[];
  final Map<String, List<DateTime>> _recentByFingerprint =
      <String, List<DateTime>>{};

  Map<String, dynamic>? _decoded;

  Future<NaverGuardDecision> checkAndTrack({
    required String fingerprint,
  }) async {
    final now = _now();
    final state = await _ensureTodayState(now);

    final blockedUntilRaw = state['blockedUntil']?.toString();
    final blockedUntil = DateTime.tryParse(blockedUntilRaw ?? '');
    if (blockedUntil != null && now.isBefore(blockedUntil)) {
      return NaverGuardDecision.blocked(
        level: NaverGuardLevel.suspiciousBlocked,
        notice: '비정상 호출이 감지되어 잠시 리뷰 보강이 제한됩니다.',
      );
    }

    _pruneOldRequests(now);
    final normalizedFingerprint = normalizeName(fingerprint);
    final duplicateBucket = _recentByFingerprint.putIfAbsent(
      normalizedFingerprint,
      () => <DateTime>[],
    );
    if (_recentRequests.length >= requestBurstLimit ||
        duplicateBucket.length >= duplicateBurstLimit) {
      state['blockedUntil'] = now.add(abuseBlockDuration).toIso8601String();
      await _persist();
      return NaverGuardDecision.blocked(
        level: NaverGuardLevel.suspiciousBlocked,
        notice: '호출 패턴이 비정상으로 감지되어 리뷰 보강을 일시 중단합니다.',
      );
    }

    final used = (state['count'] as int?) ?? 0;
    final blockLimit = (_dailyQuota * blockRatio).floor();
    if (used >= blockLimit) {
      return NaverGuardDecision.blocked(
        level: NaverGuardLevel.quotaBlocked,
        notice: '오늘 리뷰 보강 사용량이 높아 기본 검색 결과만 제공합니다.',
      );
    }

    state['count'] = used + 1;
    await _persist();

    _recentRequests.add(now);
    duplicateBucket.add(now);

    final warningLimit = (_dailyQuota * warningRatio).floor();
    if ((state['count'] as int) >= warningLimit) {
      return const NaverGuardDecision.warning(
        '리뷰 보강 사용량이 높습니다. 곧 기본 검색 모드로 전환될 수 있습니다.',
      );
    }
    return const NaverGuardDecision.allow();
  }

  void _pruneOldRequests(DateTime now) {
    final burstCutoff = now.subtract(burstWindow);
    _recentRequests.removeWhere((time) => time.isBefore(burstCutoff));

    final duplicateCutoff = now.subtract(duplicateWindow);
    final keys = _recentByFingerprint.keys.toList();
    for (final key in keys) {
      final list = _recentByFingerprint[key];
      if (list == null) {
        continue;
      }
      list.removeWhere((time) => time.isBefore(duplicateCutoff));
      if (list.isEmpty) {
        _recentByFingerprint.remove(key);
      }
    }
  }

  Future<Map<String, dynamic>> _ensureTodayState(DateTime now) async {
    final state = await _ensureLoaded();
    final todayKey = _dayKey(now);
    if (state['day']?.toString() != todayKey) {
      state
        ..['day'] = todayKey
        ..['count'] = 0
        ..['blockedUntil'] = null;
      await _persist();
    }
    return state;
  }

  String _dayKey(DateTime time) {
    final local = time.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '${local.year}-$month-$day';
  }

  Future<Map<String, dynamic>> _ensureLoaded() async {
    if (_decoded != null) {
      return _decoded!;
    }
    final raw = await _store.read(usageStorageKey);
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
    await _store.write(usageStorageKey, jsonEncode(_decoded ?? {}));
  }
}
