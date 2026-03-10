import 'package:app4_food/services/cache_store.dart';
import 'package:app4_food/services/naver_usage_guard.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('warns at 70% and blocks at 90% daily threshold', () async {
    final store = _InMemoryCacheStore();
    var now = DateTime(2026, 2, 21, 9);
    final guard = NaverUsageGuard(
      store: store,
      dailyQuota: 10,
      warningRatio: 0.7,
      blockRatio: 0.9,
      now: () => now,
      requestBurstLimit: 100,
      duplicateBurstLimit: 100,
    );

    for (int i = 0; i < 6; i++) {
      final decision = await guard.checkAndTrack(fingerprint: '돈까스');
      expect(decision.allow, isTrue);
      expect(decision.level, NaverGuardLevel.normal);
    }

    final warning = await guard.checkAndTrack(fingerprint: '돈까스');
    expect(warning.allow, isTrue);
    expect(warning.level, NaverGuardLevel.warning);

    await guard.checkAndTrack(fingerprint: '돈까스');
    await guard.checkAndTrack(fingerprint: '돈까스');

    final blocked = await guard.checkAndTrack(fingerprint: '돈까스');
    expect(blocked.allow, isFalse);
    expect(blocked.level, NaverGuardLevel.quotaBlocked);

    now = now.add(const Duration(days: 1));
    final nextDay = await guard.checkAndTrack(fingerprint: '돈까스');
    expect(nextDay.allow, isTrue);
  });

  test('blocks suspicious repeated requests in short time', () async {
    final store = _InMemoryCacheStore();
    final now = DateTime(2026, 2, 21, 9);
    final guard = NaverUsageGuard(
      store: store,
      dailyQuota: 100,
      now: () => now,
      requestBurstLimit: 100,
      duplicateBurstLimit: 2,
    );

    final first = await guard.checkAndTrack(fingerprint: '마라탕');
    final second = await guard.checkAndTrack(fingerprint: '마라탕');
    final third = await guard.checkAndTrack(fingerprint: '마라탕');

    expect(first.allow, isTrue);
    expect(second.allow, isTrue);
    expect(third.allow, isFalse);
    expect(third.level, NaverGuardLevel.suspiciousBlocked);
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
