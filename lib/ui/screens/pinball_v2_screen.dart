import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/food_image_catalog.dart';
import '../../services/shared_preferences_cache_store.dart';

class PinballV2ScreenArgs {
  const PinballV2ScreenArgs({
    required this.candidates,
    required this.mapId,
    this.autoStart = true,
    this.waitForFullRanking = false,
  });

  final List<String> candidates;
  final String mapId;
  final bool autoStart;
  final bool waitForFullRanking;
}

class PinballV2Screen extends StatefulWidget {
  const PinballV2Screen({required this.args, super.key});

  static const String routeName = '/roulette/pinball/v2';

  final PinballV2ScreenArgs args;

  @override
  State<PinballV2Screen> createState() => _PinballV2ScreenState();
}

class _PinballV2ScreenState extends State<PinballV2Screen> {
  static const String _pinballAssetDir = 'assets/ui/pinball';
  static const String _v2ZoomPresetIndexCacheKey =
      'pinball_v2_zoom_preset_index_v1';
  static const List<String> _v2ZoomPresetLabels = <String>[
    '1',
    '1.5',
    '2',
    '2.5',
    '3',
  ];
  static const int _v2ZoomPresetDefault = 0;
  static const int _v2ZoomPresetMin = 0;
  static final int _v2ZoomPresetMax = _v2ZoomPresetLabels.length - 1;
  static const Duration _zoomPresetOverlayDuration = Duration(
    milliseconds: 1500,
  );
  static const Duration _startupTimeout = Duration(seconds: 30);
  static const int _fullRankingWaitTimeoutTicks = 180;
  static const int _normalCountdownTotalMs = 60000;
  static const int _fullRankingCountdownTotalMs = 150000;
  static const Duration _countdownTickInterval = Duration(milliseconds: 50);
  static const String _thirdPartyNoticesAssetPath =
      'assets/licenses/THIRD_PARTY_NOTICES.txt';
  static const List<String> _slowMotionBannerAssets = <String>[
    'assets/background/p1_1.png',
    'assets/background/p2_1.png',
  ];
  static const Duration _slowMotionFirstTrigger = Duration(seconds: 4);
  static const Duration _slowMotionSecondTrigger = Duration(seconds: 8);
  static const Duration _slowMotionBannerDuration = Duration(seconds: 3);
  static const int _ambientBannerFirstMinDelayMs = 1000;
  static const int _ambientBannerFirstMaxDelayMs = 12000;
  static const int _ambientBannerSecondMinDelayMs = 25000;
  static const int _ambientBannerSecondMaxDelayMs = 35000;
  static const int _slowMotionDialogueMaxLines = 2;
  static const Duration _slowMotionDialogueTypingInterval = Duration(
    milliseconds: 42,
  );
  static const List<String> _slowMotionSubordinateDialogues = <String>[
    '부장님... 이번엔 진짜 마지막입니다...',
    '아까도 마지막이라고 하셨잖아요...',
    '정말... 이번엔 이거 먹는 겁니다...',
    '제발요 부장님... 배고파 죽겠습니다...',
    '룰렛도 지쳤을 것 같습니다...',
    '직원들도 다 굶고 있습니다...',
    '부장님... 점심시간 끝나가요...',
    '정말... 정말 이번엔 마지막이에요...',
    '부장님... 저희 회의도 있습니다...',
    '오늘만 벌써 열 번째입니다...',
    '룰렛이 울고 있습니다...',
    '메뉴도 운명 아닙니까...',
    '제발 이걸로 가시죠... 부탁드립니다...',
    '직원들이 눈물이 납니다...',
    '부장님... 이러다 저녁 먹겠습니다...',
    '제 위장이 버티질 못합니다...',
    '이번엔 진짜 먹는 거죠...?',
    '룰렛 결과도 존중해 주시죠...',
    '제발 이번엔... 부탁드립니다...',
    '흑흑... 이번엔 진짜입니다...',
    '부장님... 전설 말고 점심이요...',
    '배가... 협상 결렬 상태입니다...',
    '직원들 눈에 초점이 사라졌습니다...',
    '룰렛보다 저희가 먼저 쓰러질 것 같습니다...',
    '부장님... 저는 이미 마음의 준비를 했습니다... 아무거나요...',
    '이러다 메뉴보다 제가 먼저 결정될 것 같습니다...',
    '방금 제 위장이 항의했습니다...',
    '직원 한 명이 컵라면을 꺼냈습니다... 위험합니다...',
    '점심시간이 점점 역사 속으로 사라지고 있습니다...',
    '룰렛이 아니라 저희가 도는 것 같습니다...',
    '부장님... 제가 먼저 메뉴가 되겠습니다...',
    '직원들 표정이 점점 다큐멘터리입니다...',
    '룰렛이 멈춰도 부장님은 안 멈추십니다...',
    '부장님... 제 눈앞에 김치찌개 환영이 보입니다...',
    '직원 둘이 이미 식당을 검색하고 있습니다...',
    '이제 메뉴가 아니라 생존입니다...',
    '제 배가 방금 크게 한숨 쉬었습니다...',
    '이쯤이면 룰렛도 퇴근하고 싶을 겁니다...',
    '부장님... 점심이 아니라 이벤트가 됐습니다...',
    '저희... 점심 먹으러 온 거 맞죠...?',
  ];
  static const List<String> _slowMotionManagerDialogues = <String>[
    '다시 한번 더 가보자고! 인생은 한방이야!',
    '이건 연습게임이지! 진짜는 다음 판이야!',
    '흐흐... 느낌이 왔어. 이번 판이 진짜다!',
    '에이~ 이건 워밍업이지! 다시 돌려!',
    '아직 운이 안 풀렸어. 한 번만 더!',
    '자네... 승부사의 심장을 모르는군!',
    '룰렛은 배신하지 않아. 다시!',
    '아니 이 메뉴는 뭔가 아쉬운데? 다시 가자!',
    '인생은 선택이 아니라 도전이야! 다시!',
    '자네 오늘 운 좋아 보이는데? 한 번 더!',
    '이건 데이터 수집이야. 다시 돌려보게!',
    '승부는 지금부터다! 다시!',
    '자네 너무 성급해! 한 판 더 보고 결정하자!',
    '메뉴는 타이밍이야! 다시 돌려!',
    '흐흐... 이번엔 느낌이 진짜다!',
    '이 친구 융통성이 없구만! 한 번 더!',
    '아직 점심의 신이 안 왔어! 다시!',
    '자네도 알잖아... 마지막은 항상 한 번 더야!',
    '이 판은 무효! 다시 돌려보게!',
    '좋아... 딱 한 번만 더다! 진짜 마지막!',
    '잠깐... 룰렛이 방금 눈치 봤어. 다시 돌리자!',
    '이건 운명이 아니야. 운명은 다시 온다!',
    '자네... 점심을 이렇게 쉽게 정하려고?',
    '메뉴는 확신이 들 때 먹는 거야! 다시!',
    '방금 룰렛 손맛이 별로였어. 다시!',
    '아까는 테스트였네. 이번이 본게임이야!',
    '이건 메뉴가 아니라 힌트야! 다시 돌려!',
    '자네 아직 점심의 깊이를 모르는군!',
    '이건 점심이 아니라 선택의 역사야!',
    '메뉴가 우리를 시험하는 것 같지 않나?',
    '룰렛이 아직 진심을 안 보여줬어!',
    '느낌 왔다... 근데 아직 아니다! 다시!',
    '점심은 타협이 아니라 승리다!',
    '이건 승부다! 회사의 명예가 걸렸다!',
    '룰렛도 긴장해서 제대로 못 돌았어!',
    '방금 건 예선전이었다네!',
    '메뉴가 우리를 부르고 있어... 다시!',
    '딱 한 번만 더! 이번엔 진짜 촉이다!',
    '자네 눈빛이 흔들린다... 다시 돌려!',
    '오늘 점심은 전설이 될 거야! 다시!',
  ];
  static const String _thirdPartyNoticesFallback = '''
Marble Roulette (Pinball Engine)
Copyright (c) 2022 lazygyu

Licensed under the MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
''';

  final SharedPreferencesCacheStore _cacheStore = SharedPreferencesCacheStore();
  final Random _random = Random();
  late final WebViewController _controller;
  HttpServer? _localServer;
  Uri? _localBaseUri;
  Directory? _cachedLocalMapsDir;
  Timer? _startupTimer;
  Timer? _winnerMonitorTimer;
  int _winnerMonitorTicks = 0;
  int? _fullRankingWaitStartTick;

  bool _pageLoaded = false;
  bool _isStarting = false;
  bool _didStart = false;
  bool _isFinishing = false;
  bool _hasError = false;
  String _statusText = 'V2 엔진 로딩 중...';
  String _mapLabel = '';
  bool _showMapLabelOverlay = false;
  bool _didShowMapLabelOverlayOnce = false;
  Timer? _mapLabelOverlayTimer;
  String? _selectedMapIdOverride;
  Timer? _licenseHoldTimer;
  bool _licenseHoldTriggered = false;
  bool _slowMotionActive = false;
  DateTime? _slowMotionActiveSince;
  int _slowMotionActivationCount = 0;
  final Set<String> _slowMotionAssetsUsed = <String>{};
  final Set<String> _slowMotionAvailableAssets = <String>{};
  bool _slowMotionAssetsResolved = false;
  String? _slowMotionBannerAsset;
  String? _queuedSlowMotionBannerAsset;
  String _slowMotionDialogueFullText = '';
  int _slowMotionDialogueVisibleChars = 0;
  String _lastSlowMotionDialogue = '';
  Offset _slowMotionBannerOffset = Offset.zero;
  Timer? _slowMotionBannerTimer;
  Timer? _slowMotionDialogueTypingTimer;
  final List<Timer> _ambientBannerTimers = <Timer>[];
  Timer? _countdownTimer;
  Timer? _zoomPresetOverlayTimer;
  DateTime? _countdownStartedAt;
  DateTime? _countdownLastTickAt;
  int _countdownRemainingMs = 0;
  double _countdownRemainingMsExact = 0;
  double _countdownSpeedMultiplier = 1;
  double _countdownTimeScale = 1;
  double _countdownRate = 1;
  Future<void>? _viewPrefsLoadFuture;
  int _v2ZoomPresetIndex = _v2ZoomPresetDefault;
  int _zoomPresetOverlayIndex = _v2ZoomPresetDefault;
  bool _showZoomPresetOverlay = false;
  bool _showHoldFastForwardOverlay = false;

  List<String>? _cachedCandidates;
  String? _candidateImageKey;
  Map<String, String>? _candidateImageDataUrls;
  String? _goalLineImageDataUrl;
  String? _magicWizardImageDataUrl;
  String? _ninjaImageDataUrl;
  final List<String> _runtimeDebugTrail = <String>[];

  List<String> get _candidates => _cachedCandidates ??= () {
    final seen = <String>{};
    final list = <String>[];
    for (final raw in widget.args.candidates) {
      final value = _normalizeCandidate(raw);
      if (value.isEmpty || seen.contains(value)) {
        continue;
      }
      seen.add(value);
      list.add(value);
    }
    return list;
  }();

  String get _effectiveMapId {
    final override = _selectedMapIdOverride?.trim() ?? '';
    if (override.isNotEmpty) {
      return override;
    }
    final fromArgs = widget.args.mapId.trim();
    return fromArgs.isEmpty ? 'v2_default' : fromArgs;
  }

  int get _countdownTotalMs => widget.args.waitForFullRanking
      ? _fullRankingCountdownTotalMs
      : _normalCountdownTotalMs;

  String _normalizeCandidate(String value) {
    var out = value.trim();
    if (out.isEmpty) {
      return '';
    }
    out = out.replaceAll('\r', '').replaceAll('\n', '').trim();
    out = out.replaceFirst(RegExp(r'^\d+\s*[`\.\-:)]\s*'), '').trim();
    return out;
  }

  void _setStatus(String text, {bool error = false, bool clearError = false}) {
    if (!mounted) {
      return;
    }
    setState(() {
      _statusText = text;
      if (clearError) {
        _hasError = false;
      }
      if (error) {
        _hasError = true;
      }
    });
    if (error) {
      _dumpRuntimeDebugTrail();
    }
  }

  void _pushRuntimeDebug(String tag, [Object? payload]) {
    final now = DateTime.now();
    final stamp = now.toIso8601String();
    final suffix = payload == null ? '' : ' ${_decodeJsString(payload)}';
    final line = '$stamp [$tag]$suffix';
    _runtimeDebugTrail.add(line);
    if (_runtimeDebugTrail.length > 120) {
      _runtimeDebugTrail.removeRange(0, _runtimeDebugTrail.length - 120);
    }
    debugPrint('[PinballV2] $line');
  }

  void _dumpRuntimeDebugTrail() {
    if (_runtimeDebugTrail.isEmpty) {
      return;
    }
    final start = max(0, _runtimeDebugTrail.length - 18);
    for (var i = start; i < _runtimeDebugTrail.length; i++) {
      debugPrint('[PinballV2][trace] ${_runtimeDebugTrail[i]}');
    }
  }

  void _clearStartupTimer() {
    _startupTimer?.cancel();
    _startupTimer = null;
  }

  void _startStartupTimer() {
    _clearStartupTimer();
    _startupTimer = Timer(_startupTimeout, () {
      if (!mounted || _didStart || _isFinishing || _hasError) {
        return;
      }
      _setStatus('V2 시작 대기 시간 초과', error: true);
    });
  }

  void _clearWinnerMonitor() {
    _winnerMonitorTimer?.cancel();
    _winnerMonitorTimer = null;
    _winnerMonitorTicks = 0;
    _fullRankingWaitStartTick = null;
  }

  void _clearMapLabelOverlayTimer() {
    _mapLabelOverlayTimer?.cancel();
    _mapLabelOverlayTimer = null;
  }

  void _clearCountdownTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
  }

  void _resetCountdown() {
    _clearCountdownTimer();
    _countdownStartedAt = null;
    _countdownLastTickAt = null;
    _countdownSpeedMultiplier = 1;
    _countdownTimeScale = 1;
    _countdownRate = 1;
    _countdownRemainingMsExact = _countdownTotalMs.toDouble();
    _countdownRemainingMs = _countdownTotalMs;
  }

  void _ensureCountdownStarted() {
    if (_countdownStartedAt != null) {
      return;
    }
    final now = DateTime.now();
    _countdownStartedAt = now;
    _countdownLastTickAt = now;
    _countdownRemainingMsExact = _countdownTotalMs.toDouble();
    _countdownRemainingMs = _countdownTotalMs;
    _countdownTimer = Timer.periodic(_countdownTickInterval, (_) {
      if (!mounted || _isFinishing) {
        _clearCountdownTimer();
        return;
      }
      final lastTickAt = _countdownLastTickAt;
      if (lastTickAt == null) {
        _countdownLastTickAt = DateTime.now();
        return;
      }
      final tickNow = DateTime.now();
      _countdownLastTickAt = tickNow;
      final deltaMs = tickNow.difference(lastTickAt).inMicroseconds / 1000.0;
      if (!deltaMs.isFinite || deltaMs <= 0) {
        return;
      }
      final scaledDeltaMs = deltaMs * _countdownRate;
      if (!scaledDeltaMs.isFinite || scaledDeltaMs <= 0) {
        return;
      }
      _countdownRemainingMsExact = max(
        0.0,
        _countdownRemainingMsExact - scaledDeltaMs,
      );
      final remainingMs = max(0, _countdownRemainingMsExact.ceil());
      if (remainingMs == _countdownRemainingMs) {
        return;
      }
      setState(() {
        _countdownRemainingMs = remainingMs;
      });
      if (remainingMs == 0) {
        _clearCountdownTimer();
      }
    });
  }

  String get _countdownText {
    final remaining = max(0, _countdownRemainingMs);
    final minutes = remaining ~/ 60000;
    final secondText = ((remaining % 60000) / 1000)
        .toStringAsFixed(2)
        .padLeft(5, '0');
    return '${minutes.toString().padLeft(2, '0')}:$secondText초';
  }

  double _toDouble(dynamic value, {double fallback = double.nan}) {
    if (value is num) {
      return value.toDouble();
    }
    if (value is String) {
      return double.tryParse(value.trim()) ?? fallback;
    }
    return fallback;
  }

  double _normalizeCountdownRate(double value) {
    if (!value.isFinite || value <= 0) {
      return 1;
    }
    return value.clamp(0.1, 6).toDouble();
  }

  void _syncCountdownRate({dynamic speedMultiplier, dynamic timeScale}) {
    final nextSpeed = _toDouble(speedMultiplier, fallback: double.nan);
    if (nextSpeed.isFinite && nextSpeed > 0) {
      _countdownSpeedMultiplier = nextSpeed;
    }
    final nextScale = _toDouble(timeScale, fallback: double.nan);
    if (nextScale.isFinite && nextScale > 0) {
      _countdownTimeScale = nextScale;
    }
    _countdownRate = _normalizeCountdownRate(
      _countdownSpeedMultiplier * _countdownTimeScale,
    );
  }

  int _normalizeV2ZoomPresetIndex(dynamic value) {
    final parsed = _toInt(value, fallback: _v2ZoomPresetDefault);
    if (parsed < _v2ZoomPresetMin) {
      return _v2ZoomPresetDefault;
    }
    if (parsed > _v2ZoomPresetMax) {
      return _v2ZoomPresetMax;
    }
    return parsed;
  }

  Future<void> _loadPersistedV2ViewPrefs() async {
    final raw = await _cacheStore.read(_v2ZoomPresetIndexCacheKey);
    if (!mounted) {
      return;
    }
    _v2ZoomPresetIndex = _normalizeV2ZoomPresetIndex(raw);
    _zoomPresetOverlayIndex = _v2ZoomPresetIndex;
  }

  Future<void> _ensureV2ViewPrefsLoaded() async {
    final future = _viewPrefsLoadFuture ??= _loadPersistedV2ViewPrefs();
    await future;
  }

  Future<void> _persistV2ZoomPresetIndex(dynamic rawValue) async {
    final normalized = _normalizeV2ZoomPresetIndex(rawValue);
    _v2ZoomPresetIndex = normalized;
    await _cacheStore.write(_v2ZoomPresetIndexCacheKey, normalized.toString());
  }

  void _clearZoomPresetOverlayTimer() {
    _zoomPresetOverlayTimer?.cancel();
    _zoomPresetOverlayTimer = null;
  }

  void _showZoomPresetOverlayForIndex(dynamic rawValue) {
    final normalized = _normalizeV2ZoomPresetIndex(rawValue);
    _clearZoomPresetOverlayTimer();
    if (!mounted) {
      return;
    }
    setState(() {
      _zoomPresetOverlayIndex = normalized;
      _showZoomPresetOverlay = true;
    });
    _zoomPresetOverlayTimer = Timer(_zoomPresetOverlayDuration, () {
      if (!mounted) {
        return;
      }
      setState(() {
        _showZoomPresetOverlay = false;
      });
    });
  }

  void _setHoldFastForwardOverlay(bool active) {
    if (!mounted || _showHoldFastForwardOverlay == active) {
      return;
    }
    setState(() {
      _showHoldFastForwardOverlay = active;
    });
  }

  void _clearLicenseHoldTimer() {
    _licenseHoldTimer?.cancel();
    _licenseHoldTimer = null;
  }

  void _startLicenseHoldTimer() {
    _clearLicenseHoldTimer();
    _licenseHoldTriggered = false;
    _licenseHoldTimer = Timer(const Duration(seconds: 5), () {
      if (!mounted) {
        return;
      }
      _licenseHoldTriggered = true;
      unawaited(_showMapSelectDialogAndRestart());
    });
  }

  Future<List<_V2RuntimeMapChoice>> _loadRuntimeMapChoices() async {
    const manifestPath = 'assets/ui/pinball/maps/manifest.json';
    try {
      final raw = await rootBundle.loadString(manifestPath);
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        final maps = decoded['maps'];
        if (maps is List) {
          final items = <_V2RuntimeMapChoice>[];
          for (final entry in maps) {
            if (entry is! Map) {
              continue;
            }
            final id = (entry['id'] ?? '').toString().trim();
            if (id.isEmpty) {
              continue;
            }
            final enabled = entry['enabled'];
            if (enabled is bool && !enabled) {
              continue;
            }
            final engine = (entry['engine'] ?? '')
                .toString()
                .trim()
                .toLowerCase();
            if (engine.isNotEmpty && engine != 'v2') {
              continue;
            }
            final titleRaw = (entry['title'] ?? '').toString().trim();
            final sort = _toInt(entry['sort'], fallback: 9999);
            items.add(
              _V2RuntimeMapChoice(
                id: id,
                title: titleRaw.isEmpty ? id : titleRaw,
                sort: sort,
              ),
            );
          }
          items.sort((a, b) {
            final bySort = a.sort.compareTo(b.sort);
            if (bySort != 0) {
              return bySort;
            }
            return a.title.compareTo(b.title);
          });
          if (items.isNotEmpty) {
            return items;
          }
        }
      }
    } catch (_) {}
    final fallbackId = _effectiveMapId;
    return <_V2RuntimeMapChoice>[
      _V2RuntimeMapChoice(id: fallbackId, title: fallbackId, sort: 0),
    ];
  }

  Future<void> _showMapSelectDialogAndRestart() async {
    if (!mounted) {
      return;
    }
    final choices = await _loadRuntimeMapChoices();
    if (!mounted || choices.isEmpty) {
      return;
    }
    final selectedId = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        final currentMapId = _effectiveMapId;
        return AlertDialog(
          backgroundColor: const Color(0xFF101214),
          title: const Text(
            '맵 선택',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 320),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final choice in choices)
                    ListTile(
                      dense: true,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      leading: Icon(
                        choice.id == currentMapId
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_unchecked_rounded,
                        color: choice.id == currentMapId
                            ? const Color(0xFFFF4D98)
                            : Colors.white70,
                      ),
                      title: Text(
                        choice.title,
                        style: const TextStyle(color: Colors.white),
                      ),
                      subtitle: Text(
                        choice.id,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 12,
                        ),
                      ),
                      onTap: () => Navigator.of(dialogContext).pop(choice.id),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('취소'),
            ),
          ],
        );
      },
    );
    if (selectedId == null || !mounted) {
      return;
    }
    await _restartWithSelectedMapId(selectedId);
  }

  Future<void> _restartWithSelectedMapId(String mapId) async {
    if (!mounted) {
      return;
    }
    final nextMapId = mapId.trim();
    if (nextMapId.isEmpty) {
      return;
    }
    _clearLicenseHoldTimer();
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearMapLabelOverlayTimer();
    _resetCountdown();
    _resetSlowMotionBannerState();
    setState(() {
      _selectedMapIdOverride = nextMapId;
      _hasError = false;
      _didStart = false;
      _isStarting = false;
      _isFinishing = false;
      _pageLoaded = false;
      _mapLabel = '';
      _showMapLabelOverlay = false;
      _didShowMapLabelOverlayOnce = false;
      _statusText = '$nextMapId 로딩 중...';
    });
    await _loadPage(clearCache: true);
  }

  void _clearSlowMotionBannerTimer() {
    _slowMotionBannerTimer?.cancel();
    _slowMotionBannerTimer = null;
  }

  void _clearSlowMotionDialogueTypingTimer() {
    _slowMotionDialogueTypingTimer?.cancel();
    _slowMotionDialogueTypingTimer = null;
  }

  void _clearAmbientBannerTimer() {
    for (final timer in _ambientBannerTimers) {
      timer.cancel();
    }
    _ambientBannerTimers.clear();
  }

  Duration _randomDurationBetween(int minMs, int maxMs) {
    if (maxMs <= minMs) {
      return Duration(milliseconds: max(1, minMs));
    }
    final delta = maxMs - minMs + 1;
    return Duration(milliseconds: minMs + _random.nextInt(delta));
  }

  String _pickRandomAmbientBannerAsset() {
    final source = _slowMotionAvailableAssets.isNotEmpty
        ? _slowMotionAvailableAssets.toList(growable: false)
        : _slowMotionBannerAssets;
    if (source.isEmpty) {
      return '';
    }
    var index = _random.nextInt(source.length);
    if (source.length > 1 && source[index] == _slowMotionBannerAsset) {
      index = (index + 1 + _random.nextInt(source.length - 1)) % source.length;
    }
    return source[index];
  }

  void _queueAnySlowMotionBanner(String assetPath) {
    if (assetPath.isEmpty) {
      return;
    }
    if (_slowMotionBannerAsset == null) {
      _showSlowMotionBanner(assetPath);
      return;
    }
    _queuedSlowMotionBannerAsset = assetPath;
  }

  void _scheduleAmbientBannerWindow({
    required int minDelayMs,
    required int maxDelayMs,
  }) {
    final timer = Timer(_randomDurationBetween(minDelayMs, maxDelayMs), () {
      if (!mounted) {
        return;
      }
      if (!_isFinishing && !_hasError) {
        final assetPath = _pickRandomAmbientBannerAsset();
        if (assetPath.isNotEmpty) {
          _queueAnySlowMotionBanner(assetPath);
        }
      }
    });
    _ambientBannerTimers.add(timer);
  }

  void _startAmbientBannerLoop() {
    _clearAmbientBannerTimer();
    _scheduleAmbientBannerWindow(
      minDelayMs: _ambientBannerFirstMinDelayMs,
      maxDelayMs: _ambientBannerFirstMaxDelayMs,
    );
    _scheduleAmbientBannerWindow(
      minDelayMs: _ambientBannerSecondMinDelayMs,
      maxDelayMs: _ambientBannerSecondMaxDelayMs,
    );
  }

  bool _isSubordinateSlowMotionBanner(String assetPath) {
    return assetPath.toLowerCase().endsWith('p1_1.png');
  }

  bool _isManagerSlowMotionBanner(String assetPath) {
    return assetPath.toLowerCase().endsWith('p2_1.png');
  }

  String _pickRandomSlowMotionDialogue(String assetPath) {
    final source = _isSubordinateSlowMotionBanner(assetPath)
        ? _slowMotionSubordinateDialogues
        : _isManagerSlowMotionBanner(assetPath)
        ? _slowMotionManagerDialogues
        : const <String>[];
    if (source.isEmpty) {
      return '';
    }
    var index = _random.nextInt(source.length);
    if (source.length > 1 && source[index] == _lastSlowMotionDialogue) {
      index = (index + 1 + _random.nextInt(source.length - 1)) % source.length;
    }
    final picked = source[index];
    _lastSlowMotionDialogue = picked;
    return picked;
  }

  String _formatDialogueForBubble(String rawLine) {
    final normalized = rawLine
        .replaceAll('\n', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (normalized.isEmpty) {
      return '';
    }
    final words = normalized.split(' ');
    if (words.length <= 2 || normalized.length <= 16) {
      return normalized;
    }
    final spaces = RegExp(
      r'\s+',
    ).allMatches(normalized).toList(growable: false);
    if (spaces.isEmpty) {
      return normalized;
    }
    final midpoint = normalized.length ~/ 2;
    var bestSplit = -1;
    var bestDistance = normalized.length;
    for (final match in spaces) {
      final split = match.start;
      if (split <= 0 || split >= normalized.length - 1) {
        continue;
      }
      final distance = (split - midpoint).abs();
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSplit = split;
      }
    }
    if (bestSplit <= 0 || bestSplit >= normalized.length - 1) {
      return normalized;
    }
    final firstLine = normalized.substring(0, bestSplit).trim();
    final secondLine = normalized.substring(bestSplit).trim();
    if (firstLine.isEmpty || secondLine.isEmpty) {
      return normalized;
    }
    return '$firstLine\n$secondLine';
  }

  void _startSlowMotionDialogueTyping(String line) {
    _clearSlowMotionDialogueTypingTimer();
    if (!mounted) {
      return;
    }
    final formattedLine = _formatDialogueForBubble(line);
    setState(() {
      _slowMotionDialogueFullText = formattedLine;
      _slowMotionDialogueVisibleChars = 0;
    });
    final target = _slowMotionDialogueFullText;
    if (target.isEmpty) {
      return;
    }
    _slowMotionDialogueTypingTimer = Timer.periodic(
      _slowMotionDialogueTypingInterval,
      (timer) {
        if (!mounted || _slowMotionBannerAsset == null) {
          _clearSlowMotionDialogueTypingTimer();
          return;
        }
        final nextLength = min(
          _slowMotionDialogueVisibleChars + 1,
          _slowMotionDialogueFullText.length,
        );
        if (nextLength <= _slowMotionDialogueVisibleChars) {
          _clearSlowMotionDialogueTypingTimer();
          return;
        }
        setState(() {
          _slowMotionDialogueVisibleChars = nextLength;
        });
        if (_slowMotionDialogueVisibleChars >=
            _slowMotionDialogueFullText.length) {
          _clearSlowMotionDialogueTypingTimer();
        }
      },
    );
  }

  String get _slowMotionDialogueTypedText {
    if (_slowMotionDialogueFullText.isEmpty) {
      return '';
    }
    final visible = _slowMotionDialogueVisibleChars.clamp(
      0,
      _slowMotionDialogueFullText.length,
    );
    if (visible == 0) {
      return '';
    }
    return _slowMotionDialogueFullText.substring(0, visible);
  }

  _SlowMotionDialogueBubbleLayout _slowMotionDialogueBubbleLayoutForAsset(
    String assetPath,
  ) {
    if (_isSubordinateSlowMotionBanner(assetPath)) {
      return const _SlowMotionDialogueBubbleLayout(
        leftFactor: 0.41,
        topFactor: 0.20,
        widthFactor: 0.53,
        heightFactor: 0.24,
      );
    }
    if (_isManagerSlowMotionBanner(assetPath)) {
      return const _SlowMotionDialogueBubbleLayout(
        leftFactor: 0.44,
        topFactor: 0.14,
        widthFactor: 0.49,
        heightFactor: 0.24,
      );
    }
    return const _SlowMotionDialogueBubbleLayout(
      leftFactor: 0.41,
      topFactor: 0.17,
      widthFactor: 0.51,
      heightFactor: 0.22,
    );
  }

  void _resetSlowMotionBannerState() {
    _clearSlowMotionBannerTimer();
    _clearSlowMotionDialogueTypingTimer();
    _clearAmbientBannerTimer();
    _slowMotionActive = false;
    _slowMotionActiveSince = null;
    _slowMotionActivationCount = 0;
    _slowMotionAssetsUsed.clear();
    _queuedSlowMotionBannerAsset = null;
    _slowMotionBannerAsset = null;
    _slowMotionDialogueFullText = '';
    _slowMotionDialogueVisibleChars = 0;
    _slowMotionBannerOffset = Offset.zero;
  }

  Offset _entryOffsetForSlowMotionBanner(String assetPath) {
    final lower = assetPath.toLowerCase();
    if (lower.endsWith('p1_1.png')) {
      return const Offset(-1.08, 0);
    }
    if (lower.endsWith('p2_1.png')) {
      return const Offset(1.08, 0);
    }
    return Offset.zero;
  }

  Future<void> _resolveSlowMotionBannerAssets() async {
    if (_slowMotionAssetsResolved) {
      return;
    }
    _slowMotionAssetsResolved = true;
    for (final assetPath in _slowMotionBannerAssets) {
      try {
        await rootBundle.load(assetPath);
        _slowMotionAvailableAssets.add(assetPath);
      } catch (_) {}
    }
  }

  Future<void> _warmUpSlowMotionBannerAssets() async {
    await _resolveSlowMotionBannerAssets();
    if (!mounted) {
      return;
    }
    for (final assetPath in _slowMotionAvailableAssets) {
      try {
        await precacheImage(AssetImage(assetPath), context);
      } catch (_) {}
    }
  }

  String _pickRandomSlowMotionBannerAsset() {
    if (_slowMotionAssetsUsed.length >= _slowMotionBannerAssets.length) {
      return '';
    }
    final source = _slowMotionAvailableAssets.isNotEmpty
        ? _slowMotionAvailableAssets.toList(growable: false)
        : const <String>[];
    if (source.isEmpty) {
      return '';
    }
    final remaining = source
        .where((asset) => !_slowMotionAssetsUsed.contains(asset))
        .toList(growable: false);
    if (remaining.isEmpty) {
      return '';
    }
    if (remaining.length == 1) {
      return remaining.first;
    }
    return remaining[_random.nextInt(remaining.length)];
  }

  void _enqueueSlowMotionBanner(String assetPath) {
    if (assetPath.isEmpty ||
        _slowMotionAssetsUsed.contains(assetPath) ||
        _slowMotionAssetsUsed.length >= _slowMotionBannerAssets.length) {
      return;
    }
    _slowMotionAssetsUsed.add(assetPath);
    if (_slowMotionBannerAsset == null) {
      _showSlowMotionBanner(assetPath);
      return;
    }
    _queuedSlowMotionBannerAsset ??= assetPath;
  }

  void _showSlowMotionBanner(String assetPath) {
    if (!mounted) {
      return;
    }
    final knownAsset =
        _slowMotionAvailableAssets.contains(assetPath) ||
        _slowMotionBannerAssets.contains(assetPath);
    if (!knownAsset) {
      return;
    }
    _clearSlowMotionBannerTimer();
    _clearSlowMotionDialogueTypingTimer();
    final beginOffset = _entryOffsetForSlowMotionBanner(assetPath);
    final dialogue = _pickRandomSlowMotionDialogue(assetPath);
    setState(() {
      _slowMotionBannerAsset = assetPath;
      _slowMotionBannerOffset = beginOffset;
      _slowMotionDialogueFullText = dialogue;
      _slowMotionDialogueVisibleChars = 0;
    });
    _startSlowMotionDialogueTyping(dialogue);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _slowMotionBannerAsset != assetPath) {
        return;
      }
      setState(() {
        _slowMotionBannerOffset = Offset.zero;
      });
    });
    _slowMotionBannerTimer = Timer(_slowMotionBannerDuration, () {
      if (!mounted) {
        return;
      }
      final queued = _queuedSlowMotionBannerAsset;
      if (queued != null && queued.isNotEmpty) {
        _queuedSlowMotionBannerAsset = null;
        _showSlowMotionBanner(queued);
        return;
      }
      setState(() {
        _slowMotionBannerAsset = null;
        _slowMotionDialogueFullText = '';
        _slowMotionDialogueVisibleChars = 0;
        _slowMotionBannerOffset = Offset.zero;
      });
    });
  }

  void _updateSlowMotionBanner(bool active) {
    final now = DateTime.now();
    if (active) {
      if (!_slowMotionActive) {
        _slowMotionActive = true;
        _slowMotionActiveSince = now;
        _slowMotionActivationCount += 1;
      }
      final startedAt = _slowMotionActiveSince ?? now;
      final elapsed = now.difference(startedAt);
      if (_slowMotionAssetsUsed.isEmpty && elapsed >= _slowMotionFirstTrigger) {
        _enqueueSlowMotionBanner(_pickRandomSlowMotionBannerAsset());
        return;
      }
      if (_slowMotionAssetsUsed.length == 1) {
        final allowSecondByRepeat =
            _slowMotionActivationCount >= 2 &&
            elapsed >= _slowMotionFirstTrigger;
        final allowSecondByLongSlow = elapsed >= _slowMotionSecondTrigger;
        if (allowSecondByRepeat || allowSecondByLongSlow) {
          _enqueueSlowMotionBanner(_pickRandomSlowMotionBannerAsset());
        }
      }
      return;
    }
    if (_slowMotionActive) {
      _slowMotionActive = false;
      _slowMotionActiveSince = null;
    }
  }

  Future<String> _loadThirdPartyNoticesText() async {
    try {
      final text = await rootBundle.loadString(_thirdPartyNoticesAssetPath);
      if (text.trim().isNotEmpty) {
        return text;
      }
    } catch (_) {}
    return _thirdPartyNoticesFallback;
  }

  Future<void> _showLicenseNotice() async {
    final noticeText = await _loadThirdPartyNoticesText();
    if (!mounted) {
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        final textTheme = Theme.of(dialogContext).textTheme;
        return Dialog(
          backgroundColor: const Color(0xFF101214),
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 10,
            vertical: 14,
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 560),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Licensed',
                          style: textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(dialogContext).pop(),
                        icon: const Icon(
                          Icons.close_rounded,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    height: 1,
                    color: Colors.white.withValues(alpha: 0.14),
                  ),
                  const SizedBox(height: 6),
                  Expanded(
                    child: SingleChildScrollView(
                      child: SelectableText(
                        noticeText,
                        style: textTheme.bodySmall?.copyWith(
                          color: Colors.white.withValues(alpha: 0.92),
                          height: 1.45,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('닫기'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  ContentType _contentTypeForPath(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.html')) {
      return ContentType.html;
    }
    if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
      return ContentType('application', 'javascript', charset: 'utf-8');
    }
    if (lower.endsWith('.css')) {
      return ContentType('text', 'css', charset: 'utf-8');
    }
    if (lower.endsWith('.json') || lower.endsWith('.map')) {
      return ContentType('application', 'json', charset: 'utf-8');
    }
    if (lower.endsWith('.svg')) {
      return ContentType('image', 'svg+xml');
    }
    if (lower.endsWith('.png')) {
      return ContentType('image', 'png');
    }
    if (lower.endsWith('.wasm')) {
      return ContentType('application', 'wasm');
    }
    if (lower.endsWith('.ico')) {
      return ContentType('image', 'x-icon');
    }
    if (lower.endsWith('.webmanifest')) {
      return ContentType('application', 'manifest+json', charset: 'utf-8');
    }
    return ContentType.binary;
  }

  String _normalizeAssetPath(String path) {
    final trimmed = path.startsWith('/') ? path.substring(1) : path;
    final normalized = trimmed.isEmpty ? 'index_v2.html' : trimmed;
    if (normalized.contains('..')) {
      return 'index_v2.html';
    }
    return normalized;
  }

  Future<Directory?> _resolveLocalMapsDir() async {
    if (_cachedLocalMapsDir != null) {
      return _cachedLocalMapsDir;
    }
    final sep = Platform.pathSeparator;
    final candidates = <String>[
      <String>[
        Directory.current.path,
        'assets',
        'ui',
        'pinball',
        'maps',
      ].join(sep),
      <String>[
        Directory.current.path,
        '..',
        'assets',
        'ui',
        'pinball',
        'maps',
      ].join(sep),
    ];
    for (final path in candidates) {
      try {
        final dir = Directory(path);
        if (await dir.exists()) {
          _cachedLocalMapsDir = dir;
          return dir;
        }
      } catch (_) {}
    }
    return null;
  }

  Future<Uint8List?> _tryReadLocalMapBytes(String relativePath) async {
    if (!relativePath.startsWith('maps/')) {
      return null;
    }
    final mapsDir = await _resolveLocalMapsDir();
    if (mapsDir == null) {
      return null;
    }
    final safeSubPath = relativePath.substring('maps/'.length);
    if (safeSubPath.isEmpty || safeSubPath.contains('..')) {
      return null;
    }
    final file = File(
      <String>[mapsDir.path, safeSubPath].join(Platform.pathSeparator),
    );
    if (!await file.exists()) {
      return null;
    }
    try {
      return await file.readAsBytes();
    } catch (_) {
      return null;
    }
  }

  Future<Uri> _ensureLocalServer() async {
    if (_localBaseUri != null) {
      return _localBaseUri!;
    }

    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
      shared: true,
    );
    _localServer = server;
    _localBaseUri = Uri.parse('http://127.0.0.1:${server.port}');

    unawaited(
      server.forEach((request) async {
        try {
          final relativePath = _normalizeAssetPath(request.uri.path);
          Uint8List bytes;
          String contentPath = relativePath;
          if (relativePath.startsWith('__app_asset/')) {
            final assetPath = relativePath.substring('__app_asset/'.length);
            if (assetPath.isEmpty || assetPath.contains('..')) {
              throw Exception('invalid asset path');
            }
            final data = await rootBundle.load(assetPath);
            bytes = data.buffer.asUint8List(
              data.offsetInBytes,
              data.lengthInBytes,
            );
            contentPath = assetPath;
          } else {
            final localMapBytes = await _tryReadLocalMapBytes(relativePath);
            if (localMapBytes != null) {
              bytes = localMapBytes;
            } else {
              final assetPath = '$_pinballAssetDir/$relativePath';
              final data = await rootBundle.load(assetPath);
              bytes = data.buffer.asUint8List(
                data.offsetInBytes,
                data.lengthInBytes,
              );
              contentPath = relativePath;
            }
          }
          request.response.headers.contentType = _contentTypeForPath(
            contentPath,
          );
          request.response.headers.set('cache-control', 'no-store');
          request.response.add(bytes);
          await request.response.close();
        } catch (_) {
          request.response.statusCode = HttpStatus.notFound;
          request.response.headers.contentType = ContentType.text;
          request.response.write('Not found');
          await request.response.close();
        }
      }),
    );

    return _localBaseUri!;
  }

  Future<void> _loadPage({bool clearCache = false}) async {
    final mapId = _effectiveMapId;
    _pushRuntimeDebug('load_page_begin', <String, Object>{
      'clearCache': clearCache,
      'mapId': mapId,
      'candidateCount': _candidates.length,
    });
    if (clearCache) {
      try {
        await _controller.clearCache();
      } catch (_) {}
      try {
        await _controller.clearLocalStorage();
      } catch (_) {}
    }
    final baseUri = await _ensureLocalServer();
    final query = <String, String>{
      'fromApp': '1',
      'isPinballApp': '1',
      'disableSw': '1',
      'mapId': mapId,
      'appCacheBust': '${DateTime.now().microsecondsSinceEpoch}',
    };
    final uri = baseUri.replace(path: '/index_v2.html', queryParameters: query);
    _pushRuntimeDebug('load_page_uri', uri.toString());
    await _controller.loadRequest(uri);
  }

  Future<Map<String, String>> _resolveCandidateImageDataUrls() async {
    final key = _candidates.join('\n');
    if (_candidateImageDataUrls != null && _candidateImageKey == key) {
      return _candidateImageDataUrls!;
    }

    final candidateToAsset = <String, String>{};
    for (final candidate in _candidates) {
      String? asset = FoodImageCatalog.assetForKeyword(candidate);
      if (asset == null) {
        final assets = FoodImageCatalog.assetsFromTexts(<String>[
          candidate,
        ], limit: 1);
        if (assets.isNotEmpty) {
          asset = assets.first;
        }
      }
      if (asset == null) {
        final fallback = FoodImageCatalog.fallbackAssetsForSeed(
          candidate,
          count: 1,
        );
        if (fallback.isNotEmpty) {
          asset = fallback.first;
        }
      }
      asset ??= 'assets/foodimages/other.jpg';
      if (asset.startsWith('assets/foodimages/')) {
        asset = asset.replaceFirst('assets/foodimages/', 'assets/ballimages/');
      }
      candidateToAsset[candidate] = asset;
    }

    final baseUri = await _ensureLocalServer();
    final uniqueAssets = candidateToAsset.values.toSet();
    final assetImageUrl = <String, String>{};
    for (final assetPath in uniqueAssets) {
      var imageUrl = await _resolveAppAssetUrl(baseUri, assetPath);
      if (imageUrl.isEmpty && assetPath.startsWith('assets/ballimages/')) {
        final fallbackAsset = assetPath.replaceFirst(
          'assets/ballimages/',
          'assets/foodimages/',
        );
        imageUrl = await _resolveAppAssetUrl(baseUri, fallbackAsset);
      }
      assetImageUrl[assetPath] = imageUrl;
    }

    final result = <String, String>{};
    for (final entry in candidateToAsset.entries) {
      final imageUrl = assetImageUrl[entry.value];
      if (imageUrl != null && imageUrl.isNotEmpty) {
        result[entry.key] = imageUrl;
      }
    }

    _candidateImageKey = key;
    _candidateImageDataUrls = result;
    return result;
  }

  Future<String> _resolveGoalLineImageDataUrl() async {
    if (_goalLineImageDataUrl != null) {
      return _goalLineImageDataUrl!;
    }
    final baseUri = await _ensureLocalServer();
    var imageUrl = await _resolveAppAssetUrl(
      baseUri,
      'assets/background/finish.png',
    );
    if (imageUrl.isEmpty) {
      imageUrl = await _resolveAppAssetUrl(
        baseUri,
        'assets/ui/pinball/goal_line_tab1.png',
      );
    }
    if (imageUrl.isEmpty) {
      imageUrl = await _resolveAppAssetUrl(
        baseUri,
        'assets/ui/pinball/goal_line_tab1.svg',
      );
    }
    _goalLineImageDataUrl = imageUrl;
    return imageUrl;
  }

  Future<String> _resolveMagicWizardImageDataUrl() async {
    if (_magicWizardImageDataUrl != null) {
      return _magicWizardImageDataUrl!;
    }
    final baseUri = await _ensureLocalServer();
    var imageUrl = await _resolveAppAssetUrl(
      baseUri,
      'assets/background/magic.svg',
    );
    if (imageUrl.isEmpty) {
      imageUrl = await _resolveAppAssetUrl(
        baseUri,
        'assets/ui/pinball/assets/magic.svg',
      );
    }
    _magicWizardImageDataUrl = imageUrl;
    return imageUrl;
  }

  Future<String> _resolveNinjaImageDataUrl() async {
    if (_ninjaImageDataUrl != null) {
      return _ninjaImageDataUrl!;
    }
    final baseUri = await _ensureLocalServer();
    var imageUrl = await _resolveAppAssetUrl(
      baseUri,
      'assets/background/ninja.svg',
    );
    if (imageUrl.isEmpty) {
      imageUrl = await _resolveAppAssetUrl(
        baseUri,
        'assets/ui/pinball/assets/ninja.svg',
      );
    }
    _ninjaImageDataUrl = imageUrl;
    return imageUrl;
  }

  Future<String> _resolveAppAssetUrl(Uri baseUri, String assetPath) async {
    try {
      await rootBundle.load(assetPath);
    } catch (_) {
      return '';
    }
    final encodedAssetPath = assetPath
        .split('/')
        .map(Uri.encodeComponent)
        .join('/');
    return baseUri.replace(path: '/__app_asset/$encodedAssetPath').toString();
  }

  String _decodeJsString(Object? raw) {
    dynamic current = raw;
    for (var i = 0; i < 3; i++) {
      if (current is String) {
        final text = current.trim();
        if (text.isEmpty || text == 'null' || text == 'undefined') {
          return '';
        }
        try {
          final parsed = jsonDecode(text);
          if (parsed is String) {
            current = parsed;
            continue;
          }
          return jsonEncode(parsed);
        } catch (_) {
          return text;
        }
      }
      if (current is Map || current is List) {
        return jsonEncode(current);
      }
      if (current == null) {
        return '';
      }
      return current.toString();
    }
    return '';
  }

  Map<String, dynamic>? _decodeJsMap(Object? raw) {
    final text = _decodeJsString(raw);
    if (text.isEmpty) {
      return null;
    }
    try {
      final decoded = jsonDecode(text);
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
    } catch (_) {}
    return null;
  }

  Map<String, dynamic>? _coerceStringKeyMap(Object? raw) {
    if (raw is! Map) {
      return null;
    }
    return raw.map((key, value) => MapEntry(key.toString(), value));
  }

  bool _isTransientStartFailure(Map<String, dynamic>? parsed, String reason) {
    if (parsed == null || parsed.isEmpty) {
      return true;
    }
    final lower = reason.trim().toLowerCase();
    if (lower.isEmpty) {
      return true;
    }
    if (lower == 'v2 init 실패' || lower == 'init failed') {
      return true;
    }
    return lower.contains('start failed after init') ||
        lower.contains('start guard failed') ||
        lower.contains('start retry exhausted') ||
        lower.contains('v2 api not ready');
  }

  String _extractMapLabel(Map<String, dynamic>? state) {
    if (state != null) {
      final directLabel = state['mapLabel'];
      if (directLabel is String && directLabel.trim().isNotEmpty) {
        return directLabel.trim();
      }
      final mapId = state['mapId'];
      if (mapId is String && mapId.trim().isNotEmpty) {
        return mapId.trim();
      }
    }
    return _effectiveMapId;
  }

  void _syncMapLabel(Map<String, dynamic>? state, {bool forceShow = false}) {
    final next = _extractMapLabel(state);
    if (next.isEmpty) {
      return;
    }
    if (next == _mapLabel && !forceShow) {
      return;
    }
    _clearMapLabelOverlayTimer();
    final shouldShow = forceShow || !_didShowMapLabelOverlayOnce;
    if (!mounted) {
      _mapLabel = next;
      _showMapLabelOverlay = shouldShow;
      if (shouldShow) {
        _didShowMapLabelOverlayOnce = true;
      }
      return;
    }
    setState(() {
      _mapLabel = next;
      _showMapLabelOverlay = shouldShow;
    });
    if (!shouldShow) {
      return;
    }
    _didShowMapLabelOverlayOnce = true;
    _mapLabelOverlayTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) {
        return;
      }
      setState(() {
        _showMapLabelOverlay = false;
      });
    });
  }

  Future<void> _startPinball() async {
    if (!mounted ||
        _isStarting ||
        _didStart ||
        _isFinishing ||
        !_pageLoaded ||
        _candidates.isEmpty) {
      if (_candidates.isEmpty) {
        _setStatus('후보가 없어 시작할 수 없습니다', error: true);
      }
      return;
    }

    await _ensureV2ViewPrefsLoaded();
    if (!mounted || _isFinishing) {
      return;
    }

    _pushRuntimeDebug('start_pinball_requested', <String, Object>{
      'pageLoaded': _pageLoaded,
      'candidateCount': _candidates.length,
      'autoStart': widget.args.autoStart,
      'mapId': _effectiveMapId,
      'zoomPresetIndex': _v2ZoomPresetIndex,
    });
    _isStarting = true;
    _resetSlowMotionBannerState();
    _startStartupTimer();
    _setStatus('V2 초기화 중...', clearError: true);

    final imageDataUrls = await _resolveCandidateImageDataUrls();
    final goalLineImageDataUrl = await _resolveGoalLineImageDataUrl();
    final magicWizardImageDataUrl = await _resolveMagicWizardImageDataUrl();
    final ninjaImageDataUrl = await _resolveNinjaImageDataUrl();
    if (!mounted || _isFinishing) {
      _isStarting = false;
      return;
    }

    final payload = <String, Object>{
      'mapId': _effectiveMapId,
      'candidates': _candidates,
      'winningRank': 1,
      'autoStart': widget.args.autoStart,
      'zoomPresetIndex': _v2ZoomPresetIndex,
      'fromApp': true,
      'isPinballApp': true,
      'imageDataUrls': imageDataUrls,
      'goalLineImageDataUrl': goalLineImageDataUrl,
      'magicWizardImageDataUrl': magicWizardImageDataUrl,
      'ninjaImageDataUrl': ninjaImageDataUrl,
    };
    final encodedPayload = jsonEncode(payload);

    try {
      final result = await _controller.runJavaScriptReturningResult('''
(() => {
  const payload = $encodedPayload;
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const setCanvasVisible = (visible) => {
    try {
      if (typeof window.__pinballV2SetCanvasVisible === 'function') {
        window.__pinballV2SetCanvasVisible(visible === true);
        return;
      }
    } catch (_) {
    }
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return;
    }
    canvas.style.opacity = visible === true ? '1' : '0';
    canvas.style.visibility = visible === true ? 'visible' : 'hidden';
  };
  const suppressUi = () => {
    const status = document.getElementById('v2Status');
    if (status) {
      status.style.display = 'none';
      status.style.opacity = '0';
      status.style.pointerEvents = 'none';
    }
    const roulette = window.roulette;
    if (!roulette || typeof roulette !== 'object') {
      return;
    }
    if (Array.isArray(roulette._uiObjects)) {
      roulette._uiObjects = [];
    }
    if (typeof roulette.addUiObject === 'function' && roulette.__appV2UiMuted !== true) {
      roulette.__appV2UiMuted = true;
      roulette.__appV2OriginalAddUiObject = roulette.addUiObject.bind(roulette);
      roulette.addUiObject = () => {};
    }
    const particleManager = roulette._particleManager;
    if (particleManager && typeof particleManager.shot === 'function' && particleManager.__appV2ShotMuted !== true) {
      particleManager.__appV2ShotMuted = true;
      particleManager.__appV2OriginalShot = particleManager.shot.bind(particleManager);
      particleManager.shot = () => {};
    }
  };
  const run = async () => {
    setCanvasVisible(false);
    const ensureStarted = async (api, state) => {
      if (!payload.autoStart) {
        return { ok: true, state, fallbackStartCount: 0 };
      }
      let nextState = state;
      let fallbackStartCount = 0;
      for (let retry = 0; retry < 7; retry += 1) {
        const running = !!(nextState && nextState.running === true);
        const marbleCount = Number(nextState && nextState.marbleCount);
        if (running && Number.isFinite(marbleCount) && marbleCount > 0) {
          return { ok: true, state: nextState, fallbackStartCount };
        }
        if (!api || typeof api.start !== 'function') {
          return { ok: false, reason: 'api.start unavailable', state: nextState, fallbackStartCount };
        }
        fallbackStartCount += 1;
        const startResult = await api.start();
        await sleep(90);
        nextState = typeof api.getState === 'function' ? api.getState() : nextState;
        if (!startResult || startResult.ok !== true) {
          if (retry >= 6) {
            return {
              ok: false,
              reason: String((startResult && startResult.reason) || 'start failed after init'),
              state: nextState,
              fallbackStartCount,
            };
          }
        }
      }
      return { ok: false, reason: 'start retry exhausted', state: nextState, fallbackStartCount };
    };
    for (let attempt = 0; attempt < 280; attempt += 1) {
      suppressUi();
      const api = window.__appPinballV2;
      if (api && typeof api.init === 'function') {
        try {
          const initResult = await api.init(payload);
          suppressUi();
          const state = typeof api.getState === 'function' ? api.getState() : null;
          if (!initResult || initResult.ok !== true) {
            return JSON.stringify({ ok: false, reason: String((initResult && initResult.reason) || 'init failed'), initResult, state, attempt });
          }
          const started = await ensureStarted(api, state);
          if (!started.ok) {
            return JSON.stringify({
              ok: false,
              reason: started.reason || 'start guard failed',
              initResult,
              state: started.state,
              fallbackStartCount: started.fallbackStartCount || 0,
              attempt,
            });
          }
          setCanvasVisible(true);
          return JSON.stringify({
            ok: true,
            initResult,
            state: started.state,
            fallbackStartCount: started.fallbackStartCount || 0,
            attempt,
          });
        } catch (error) {
          const reason = String(error && error.message ? error.message : error);
          return JSON.stringify({ ok: false, reason });
        }
      }
      await sleep(80);
    }
    return JSON.stringify({ ok: false, reason: 'v2 api not ready' });
  };
  return run();
})()
''');
      final parsed = _decodeJsMap(result);
      final ok = parsed?['ok'] == true;
      if (!ok) {
        final reason =
            (parsed?['reason'] ??
                    parsed?['initResult']?['reason'] ??
                    'V2 init 실패')
                .toString();
        final transient = _isTransientStartFailure(parsed, reason);
        _pushRuntimeDebug(
          transient ? 'start_pinball_pending' : 'start_pinball_failed',
          <String, Object?>{
            'reason': reason,
            'parsed': parsed,
            'raw': _decodeJsString(result),
          },
        );
        if (transient) {
          _setStatus('V2 초기화 중...', clearError: true);
          return;
        }
        _setStatus(reason, error: true);
        return;
      }
      _pushRuntimeDebug('start_pinball_ok', <String, Object?>{
        'attempt': parsed?['attempt'],
        'fallbackStartCount': parsed?['fallbackStartCount'],
        'state': parsed?['state'],
      });
      _didStart = true;
      _clearStartupTimer();
      _syncMapLabel(_coerceStringKeyMap(parsed?['state']), forceShow: true);
      _setStatus('게임 진행 중...', clearError: true);
      _startWinnerMonitor();
    } catch (error) {
      _setStatus('V2 초기화 오류: $error', error: true);
    } finally {
      _isStarting = false;
    }
  }

  void _startWinnerMonitor() {
    _clearWinnerMonitor();
    _ensureCountdownStarted();
    _startAmbientBannerLoop();
    _winnerMonitorTimer = Timer.periodic(const Duration(milliseconds: 220), (
      _,
    ) async {
      if (!mounted || _isFinishing) {
        return;
      }
      try {
        final raw = await _controller.runJavaScriptReturningResult('''
(() => {
  const roulette = window.roulette;
  const api = window.__appPinballV2;
  const winner = roulette && roulette._winner && typeof roulette._winner.name === 'string'
    ? roulette._winner.name
    : '';
  const ranking = Array.isArray(roulette && roulette._winners)
    ? roulette._winners
        .map((item) => item && typeof item.name === 'string' ? item.name.trim() : '')
        .filter((name) => !!name)
    : [];
  if (winner && !ranking.includes(winner)) {
    ranking.unshift(winner);
  }
  const state = api && typeof api.getState === 'function' ? api.getState() : null;
  const running = !!(state && state.running === true);
  const timeScale = Number(roulette && roulette._timeScale);
  const goalDist = Number(roulette && roulette._goalDist);
  const slowMotionActive = !!(
    running
    && ((Number.isFinite(timeScale) && timeScale < 0.999) || (Number.isFinite(goalDist) && goalDist < 5))
  );
  return JSON.stringify({ winner, ranking, state, slowMotionActive, timeScale, goalDist });
})()
''');
        final parsed = _decodeJsMap(raw);
        _winnerMonitorTicks += 1;
        final winner = (parsed?['winner'] ?? '').toString().trim();
        final ranking = _extractStringList(parsed?['ranking']);
        final stateMap = _coerceStringKeyMap(parsed?['state']);
        final stateRanking = _extractStringList(stateMap?['ranking']);
        final mergedRanking = _normalizeRankingForResult(
          ranking.isNotEmpty ? ranking : stateRanking,
          winner: winner,
        );
        _syncCountdownRate(
          speedMultiplier: stateMap?['speedMultiplier'],
          timeScale: parsed?['timeScale'],
        );
        final slowMotionActive = parsed?['slowMotionActive'] == true;
        _updateSlowMotionBanner(slowMotionActive);
        if (stateMap != null && mounted) {
          _syncMapLabel(stateMap);
          final running = stateMap['running'] == true;
          if (!running && !_hasError) {
            final text = (stateMap['statusText'] ?? '').toString().trim();
            if (text.isNotEmpty) {
              _setStatus(text);
            }
          }
        }
        final running = stateMap?['running'] == true;
        final expectedCount = max(
          2,
          _toInt(stateMap?['candidateCount'], fallback: _candidates.length),
        );
        if (widget.args.waitForFullRanking &&
            _fullRankingWaitStartTick == null &&
            (winner.isNotEmpty || mergedRanking.isNotEmpty)) {
          _fullRankingWaitStartTick = _winnerMonitorTicks;
        }
        if (winner.isNotEmpty) {
          if (widget.args.waitForFullRanking) {
            final rankingComplete = mergedRanking.length >= expectedCount;
            final waitStartTick =
                _fullRankingWaitStartTick ?? _winnerMonitorTicks;
            final timedOut =
                (_winnerMonitorTicks - waitStartTick) >=
                _fullRankingWaitTimeoutTicks;
            if (!rankingComplete && !timedOut) {
              if (_winnerMonitorTicks % 20 == 0) {
                _setStatus('1등 확정. 전체 순위 집계 중...');
              }
              return;
            }
          }
          _finish(winner, ranking: mergedRanking);
          return;
        }
        if (widget.args.waitForFullRanking && mergedRanking.isNotEmpty) {
          final rankingComplete = mergedRanking.length >= expectedCount;
          final waitStartTick =
              _fullRankingWaitStartTick ?? _winnerMonitorTicks;
          final timedOut =
              (_winnerMonitorTicks - waitStartTick) >=
              _fullRankingWaitTimeoutTicks;
          if (!rankingComplete && !timedOut) {
            if (_winnerMonitorTicks % 20 == 0) {
              _setStatus('전체 순위 집계 중...');
            }
            return;
          }
          _finish(mergedRanking.first, ranking: mergedRanking);
          return;
        }
        if (!widget.args.waitForFullRanking &&
            !running &&
            mergedRanking.isNotEmpty) {
          _finish(mergedRanking.first, ranking: mergedRanking);
          return;
        }
      } catch (_) {}
    });
  }

  Map<String, dynamic>? _parseBridgeMessage(String message) {
    dynamic current = message;
    for (var i = 0; i < 3; i++) {
      if (current is Map) {
        return current.map((key, value) => MapEntry(key.toString(), value));
      }
      if (current is String) {
        final text = current.trim();
        if (text.isEmpty || text == 'null' || text == 'undefined') {
          return null;
        }
        try {
          current = jsonDecode(text);
          continue;
        } catch (_) {
          return null;
        }
      }
      return null;
    }
    return null;
  }

  String _extractWinnerName(dynamic payload) {
    if (payload is String) {
      return payload.trim();
    }
    if (payload is Map) {
      final winner = payload['winner'];
      if (winner is String) {
        return winner.trim();
      }
    }
    return '';
  }

  List<String> _extractStringList(dynamic payload) {
    if (payload is! List) {
      return const <String>[];
    }
    return payload
        .map((item) => item == null ? '' : item.toString().trim())
        .where((item) => item.isNotEmpty)
        .toList(growable: false);
  }

  List<String> _normalizeRankingForResult(
    List<String> ranking, {
    required String winner,
  }) {
    final normalized = <String>[];
    final seen = <String>{};
    final winnerName = winner.trim();
    if (winnerName.isNotEmpty) {
      normalized.add(winnerName);
      seen.add(winnerName);
    }
    for (final raw in ranking) {
      final value = raw.trim();
      if (value.isEmpty || seen.contains(value)) {
        continue;
      }
      normalized.add(value);
      seen.add(value);
    }
    return normalized;
  }

  int _toInt(dynamic value, {int fallback = 0}) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value.trim()) ?? fallback;
    }
    return fallback;
  }

  bool _toBool(dynamic value, {bool fallback = false}) {
    if (value is bool) {
      return value;
    }
    if (value is num) {
      return value != 0;
    }
    if (value is String) {
      final normalized = value.trim().toLowerCase();
      if (normalized == 'true' || normalized == '1') {
        return true;
      }
      if (normalized == 'false' || normalized == '0' || normalized.isEmpty) {
        return false;
      }
    }
    return fallback;
  }

  void _finish(String winner, {List<String> ranking = const <String>[]}) {
    if (_isFinishing || !mounted) {
      return;
    }
    _isFinishing = true;
    _clearCountdownTimer();
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearSlowMotionBannerTimer();
    _clearSlowMotionDialogueTypingTimer();
    _clearAmbientBannerTimer();
    _clearZoomPresetOverlayTimer();
    _showZoomPresetOverlay = false;
    _showHoldFastForwardOverlay = false;
    _slowMotionDialogueFullText = '';
    _slowMotionDialogueVisibleChars = 0;
    final normalizedWinner = winner.trim();
    final normalizedRanking = _normalizeRankingForResult(
      ranking,
      winner: normalizedWinner,
    );
    if (widget.args.waitForFullRanking || normalizedRanking.length > 1) {
      Navigator.pop<Map<String, dynamic>>(context, <String, dynamic>{
        'winner': normalizedWinner,
        'ranking': normalizedRanking,
        'top3': normalizedRanking.take(3).toList(growable: false),
      });
      return;
    }
    Navigator.pop<String>(context, normalizedWinner);
  }

  Future<void> _onBridgeMessage(JavaScriptMessage message) async {
    final parsed = _parseBridgeMessage(message.message);
    if (parsed == null || !mounted) {
      return;
    }
    final event = parsed['event']?.toString() ?? '';
    if (event == 'debug') {
      _pushRuntimeDebug('runtime', parsed['payload']);
      return;
    }
    if (event == 'zoomPresetChanged') {
      final payload = _coerceStringKeyMap(parsed['payload']);
      final presetIndex = _normalizeV2ZoomPresetIndex(payload?['presetIndex']);
      await _persistV2ZoomPresetIndex(presetIndex);
      if (!mounted) {
        return;
      }
      _showZoomPresetOverlayForIndex(presetIndex);
      _pushRuntimeDebug('zoom_preset_changed', payload);
      return;
    }
    if (event == 'holdFastForwardChanged') {
      final payload = _coerceStringKeyMap(parsed['payload']);
      _setHoldFastForwardOverlay(_toBool(payload?['active']));
      _syncCountdownRate(speedMultiplier: payload?['speedMultiplier']);
      _pushRuntimeDebug('hold_fast_forward_changed', payload);
      return;
    }
    if (event == 'goal') {
      final winner = _extractWinnerName(parsed['payload']);
      if (winner.isNotEmpty) {
        _pushRuntimeDebug('goal', parsed['payload']);
        final rankingFromPayload = _extractStringList(
          parsed['payload'] is Map ? parsed['payload']['ranking'] : null,
        );
        final ranking = _normalizeRankingForResult(
          rankingFromPayload,
          winner: winner,
        );
        if (widget.args.waitForFullRanking) {
          final expectedCount = max(2, _candidates.length);
          if (ranking.length < expectedCount) {
            _fullRankingWaitStartTick ??= _winnerMonitorTicks;
            _setStatus('1등 확정. 전체 순위 집계 중...');
            return;
          }
        }
        _finish(winner, ranking: ranking);
      }
      return;
    }
    if (event == 'ready') {
      _pushRuntimeDebug('ready', parsed['payload']);
      if (!_didStart && !_isStarting) {
        await _startPinball();
      }
      return;
    }
    if (event == 'spinStarted') {
      _pushRuntimeDebug('spin_started', parsed['payload']);
      _didStart = true;
      _clearStartupTimer();
      _syncMapLabel(_coerceStringKeyMap(parsed['payload']), forceShow: true);
      _setStatus('게임 진행 중...', clearError: true);
      _startWinnerMonitor();
    }
  }

  Future<void> _retry() async {
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearMapLabelOverlayTimer();
    _clearZoomPresetOverlayTimer();
    _resetCountdown();
    _resetSlowMotionBannerState();
    setState(() {
      _hasError = false;
      _didStart = false;
      _isStarting = false;
      _pageLoaded = false;
      _statusText = 'V2 엔진 다시 로딩 중...';
      _mapLabel = '';
      _showMapLabelOverlay = false;
      _didShowMapLabelOverlayOnce = false;
      _showZoomPresetOverlay = false;
      _showHoldFastForwardOverlay = false;
    });
    await _loadPage(clearCache: true);
  }

  @override
  void initState() {
    super.initState();
    _resetCountdown();
    _viewPrefsLoadFuture = _loadPersistedV2ViewPrefs();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      unawaited(_warmUpSlowMotionBannerAssets());
    });
    unawaited(_resolveCandidateImageDataUrls());
    unawaited(_resolveGoalLineImageDataUrl());
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'PinballBridge',
        onMessageReceived: _onBridgeMessage,
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (!mounted) {
              return;
            }
            _pushRuntimeDebug('page_started');
            _resetCountdown();
            _clearZoomPresetOverlayTimer();
            setState(() {
              _pageLoaded = false;
              _didStart = false;
              _isStarting = false;
              _hasError = false;
              _statusText = 'V2 엔진 로딩 중...';
              _mapLabel = '';
              _showMapLabelOverlay = false;
              _didShowMapLabelOverlayOnce = false;
              _showZoomPresetOverlay = false;
              _showHoldFastForwardOverlay = false;
            });
          },
          onPageFinished: (_) async {
            if (!mounted) {
              return;
            }
            _pushRuntimeDebug('page_finished');
            setState(() {
              _pageLoaded = true;
              _statusText = '엔진 연결 대기 중...';
            });
            Future<void>.delayed(const Duration(milliseconds: 450), () async {
              if (!mounted ||
                  _isFinishing ||
                  _didStart ||
                  _isStarting ||
                  _hasError ||
                  !_pageLoaded) {
                return;
              }
              await _startPinball();
            });
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame != true) {
              return;
            }
            _pushRuntimeDebug('page_error', <String, Object?>{
              'errorCode': error.errorCode,
              'description': error.description,
              'url': error.url,
            });
            _setStatus('V2 페이지 로드 실패', error: true);
          },
        ),
      );
    unawaited(_loadPage(clearCache: true));
  }

  @override
  void dispose() {
    _clearCountdownTimer();
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearMapLabelOverlayTimer();
    _clearLicenseHoldTimer();
    _clearSlowMotionBannerTimer();
    _clearSlowMotionDialogueTypingTimer();
    _clearAmbientBannerTimer();
    _clearZoomPresetOverlayTimer();
    final server = _localServer;
    _localServer = null;
    if (server != null) {
      unawaited(server.close(force: true));
    }
    super.dispose();
  }

  Widget _buildZoomPresetOverlay(BuildContext context) {
    if (!_didStart || _hasError || _isFinishing) {
      return const SizedBox.shrink();
    }
    return SafeArea(
      child: IgnorePointer(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.only(left: 16, right: 16, bottom: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: AnimatedOpacity(
                opacity: _showZoomPresetOverlay ? 1 : 0,
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                child: SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final slotWidth =
                          constraints.maxWidth / _v2ZoomPresetLabels.length;
                      final highlightWidth = max(
                        0.0,
                        slotWidth - 10,
                      ).toDouble();
                      final highlightLeft =
                          (_zoomPresetOverlayIndex * slotWidth) + 5;
                      return DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.66),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.14),
                          ),
                          boxShadow: <BoxShadow>[
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.24),
                              blurRadius: 18,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: Stack(
                          children: [
                            AnimatedPositioned(
                              duration: const Duration(milliseconds: 240),
                              curve: Curves.easeOutCubic,
                              left: highlightLeft,
                              top: 6,
                              width: highlightWidth,
                              height: 44,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 1.35,
                                  ),
                                ),
                              ),
                            ),
                            Row(
                              children: List<Widget>.generate(
                                _v2ZoomPresetLabels.length,
                                (index) {
                                  final isActive =
                                      index == _zoomPresetOverlayIndex;
                                  return Expanded(
                                    child: Center(
                                      child: Text(
                                        _v2ZoomPresetLabels[index],
                                        style: TextStyle(
                                          color: isActive
                                              ? Colors.white
                                              : Colors.white.withValues(
                                                  alpha: 0.68,
                                                ),
                                          fontSize: 15,
                                          fontWeight: isActive
                                              ? FontWeight.w800
                                              : FontWeight.w600,
                                          letterSpacing: -0.2,
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHoldFastForwardOverlay() {
    if (!_didStart || _hasError || _isFinishing) {
      return const SizedBox.shrink();
    }
    return IgnorePointer(
      child: Center(
        child: AnimatedOpacity(
          opacity: _showHoldFastForwardOverlay ? 1 : 0,
          duration: const Duration(milliseconds: 120),
          curve: Curves.easeOut,
          child: Container(
            width: 128,
            height: 128,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withValues(alpha: 0.18),
            ),
            alignment: Alignment.center,
            child: Icon(
              Icons.fast_forward_rounded,
              size: 84,
              color: Colors.white.withValues(alpha: 0.46),
            ),
          ),
        ),
      ),
    );
  }

  double _resolveSlowMotionDialogueFontSize({
    required BuildContext context,
    required String text,
    required double maxWidth,
    required double maxHeight,
  }) {
    if (text.trim().isEmpty || maxWidth <= 0 || maxHeight <= 0) {
      return 14;
    }
    const double minFontSize = 12.5;
    const double maxFontSize = 30.0;
    const double lineHeight = 1.16;
    final textDirection = Directionality.maybeOf(context) ?? TextDirection.ltr;
    for (
      double fontSize = maxFontSize;
      fontSize >= minFontSize;
      fontSize -= 0.5
    ) {
      final painter = TextPainter(
        text: TextSpan(
          text: text,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.w700,
            height: lineHeight,
          ),
        ),
        textDirection: textDirection,
        textAlign: TextAlign.center,
        maxLines: _slowMotionDialogueMaxLines,
      )..layout(maxWidth: maxWidth);
      if (!painter.didExceedMaxLines && painter.height <= maxHeight + 0.5) {
        return fontSize;
      }
    }
    return minFontSize;
  }

  Widget _buildSlowMotionDialogueOverlay(String assetPath) {
    final typedText = _slowMotionDialogueTypedText;
    if (typedText.isEmpty) {
      return const SizedBox.shrink();
    }
    final layout = _slowMotionDialogueBubbleLayoutForAsset(assetPath);
    return Positioned.fill(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final height = constraints.maxHeight;
          if (!width.isFinite ||
              !height.isFinite ||
              width <= 1 ||
              height <= 1) {
            return const SizedBox.shrink();
          }
          final left = width * layout.leftFactor;
          final top = height * layout.topFactor;
          final right = width * (1 - layout.leftFactor - layout.widthFactor);
          final bottom = height * (1 - layout.topFactor - layout.heightFactor);
          final bubbleWidth = max(1.0, width * layout.widthFactor);
          final bubbleHeight = max(1.0, height * layout.heightFactor);
          final horizontalPadding = max(8.0, bubbleWidth * 0.065);
          final verticalPadding = max(6.0, bubbleHeight * 0.15);
          final availableWidth = max(
            1.0,
            bubbleWidth - (horizontalPadding * 2),
          );
          final availableHeight = max(
            1.0,
            bubbleHeight - (verticalPadding * 2),
          );
          final fullText = _slowMotionDialogueFullText.isNotEmpty
              ? _slowMotionDialogueFullText
              : typedText;
          final fontSize = _resolveSlowMotionDialogueFontSize(
            context: context,
            text: fullText,
            maxWidth: availableWidth,
            maxHeight: availableHeight,
          );
          return Padding(
            padding: EdgeInsets.fromLTRB(left, top, right, bottom),
            child: Align(
              alignment: Alignment.topCenter,
              child: Container(
                padding: EdgeInsets.symmetric(
                  horizontal: horizontalPadding,
                  vertical: verticalPadding,
                ),
                alignment: Alignment.topCenter,
                child: Text(
                  typedText,
                  textAlign: TextAlign.center,
                  maxLines: _slowMotionDialogueMaxLines,
                  softWrap: false,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.black.withValues(alpha: 0.88),
                    fontSize: fontSize,
                    height: 1.16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bannerCacheWidth = max(
      1,
      (MediaQuery.sizeOf(context).width *
              MediaQuery.devicePixelRatioOf(context))
          .round(),
    );
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(child: WebViewWidget(controller: _controller)),
          if (_showMapLabelOverlay && _mapLabel.isNotEmpty)
            SafeArea(
              child: Align(
                alignment: Alignment.topLeft,
                child: Padding(
                  padding: const EdgeInsets.only(left: 12, top: 10),
                  child: IgnorePointer(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Text(
                        _mapLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (_didStart && !_hasError && !_isFinishing)
            SafeArea(
              child: Align(
                alignment: Alignment.topRight,
                child: Padding(
                  padding: const EdgeInsets.only(right: 12, top: 10),
                  child: IgnorePointer(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Text(
                        _countdownText,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (!_hasError && !_didStart)
            Container(
              color: Colors.black,
              alignment: Alignment.center,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white70,
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      '로딩중',
                      style: TextStyle(color: Colors.white),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          if (_hasError)
            Positioned.fill(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _statusText,
                        style: const TextStyle(
                          color: Color(0xFFFFA3B1),
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _retry,
                        child: const Text('다시 시도'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (_slowMotionBannerAsset != null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: IgnorePointer(
                child: RepaintBoundary(
                  child: ClipRect(
                    child: AnimatedSlide(
                      duration: const Duration(milliseconds: 420),
                      curve: Curves.easeOutCubic,
                      offset: _slowMotionBannerOffset,
                      child: Stack(
                        children: [
                          Image.asset(
                            _slowMotionBannerAsset!,
                            width: double.infinity,
                            fit: BoxFit.fitWidth,
                            alignment: Alignment.bottomCenter,
                            filterQuality: FilterQuality.low,
                            cacheWidth: bannerCacheWidth,
                            gaplessPlayback: true,
                            errorBuilder: (context, error, stackTrace) {
                              WidgetsBinding.instance.addPostFrameCallback((_) {
                                if (!mounted) {
                                  return;
                                }
                                _clearSlowMotionBannerTimer();
                                _clearSlowMotionDialogueTypingTimer();
                                if (_slowMotionBannerAsset != null) {
                                  setState(() {
                                    _slowMotionBannerAsset = null;
                                    _slowMotionDialogueFullText = '';
                                    _slowMotionDialogueVisibleChars = 0;
                                    _queuedSlowMotionBannerAsset = null;
                                    _slowMotionBannerOffset = Offset.zero;
                                  });
                                }
                              });
                              return const SizedBox.shrink();
                            },
                          ),
                          _buildSlowMotionDialogueOverlay(
                            _slowMotionBannerAsset!,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          _buildHoldFastForwardOverlay(),
          _buildZoomPresetOverlay(context),
          SafeArea(
            child: Align(
              alignment: Alignment.bottomRight,
              child: Padding(
                padding: const EdgeInsets.only(right: 8, bottom: 2),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(7),
                    onTapDown: (_) => _startLicenseHoldTimer(),
                    onTapUp: (_) => _clearLicenseHoldTimer(),
                    onTapCancel: _clearLicenseHoldTimer,
                    onTap: () {
                      _clearLicenseHoldTimer();
                      if (_licenseHoldTriggered) {
                        _licenseHoldTriggered = false;
                        return;
                      }
                      _showLicenseNotice();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.68),
                        borderRadius: BorderRadius.circular(7),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.16),
                          width: 0.8,
                        ),
                      ),
                      child: const Text(
                        'Licensed',
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _V2RuntimeMapChoice {
  const _V2RuntimeMapChoice({
    required this.id,
    required this.title,
    required this.sort,
  });

  final String id;
  final String title;
  final int sort;
}

class _SlowMotionDialogueBubbleLayout {
  const _SlowMotionDialogueBubbleLayout({
    required this.leftFactor,
    required this.topFactor,
    required this.widthFactor,
    required this.heightFactor,
  });

  final double leftFactor;
  final double topFactor;
  final double widthFactor;
  final double heightFactor;
}
