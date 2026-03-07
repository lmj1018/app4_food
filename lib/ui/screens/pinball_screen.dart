import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/food_image_catalog.dart';

class PinballScreenArgs {
  const PinballScreenArgs({
    required this.candidates,
    this.autoStart = true,
    this.selectedMapIndex,
    this.waitForFullRanking = false,
    this.expectedRankingCount = 0,
  });

  final List<String> candidates;
  final bool autoStart;
  final int? selectedMapIndex;
  final bool waitForFullRanking;
  final int expectedRankingCount;
}

class PinballScreen extends StatefulWidget {
  const PinballScreen({required this.args, super.key});

  static const String routeName = '/roulette/pinball';

  final PinballScreenArgs args;

  @override
  State<PinballScreen> createState() => _PinballScreenState();
}

class _PinballScreenState extends State<PinballScreen> {
  static const String _pinballAssetDir = 'assets/ui/pinball';
  static const Duration _startupTimeout = Duration(seconds: 35);
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

  late final WebViewController _controller;
  final Random _random = Random();
  bool _pageLoaded = false;
  bool _isFinishing = false;
  bool _hasError = false;
  bool _didStart = false;
  bool _isStarting = false;
  int _startGeneration = 0;
  int _winnerMonitorTicket = 0;
  int _engineReloadCount = 0;
  Timer? _startupTimeoutTimer;
  HttpServer? _localPinballServer;
  Uri? _localPinballBaseUri;
  Map<String, String>? _candidateImageDataUrls;
  String? _candidateImageKey;
  String? _goalLineImageDataUrl;
  String _mapLabel = '';
  bool _showMapLabelOverlay = false;
  Timer? _mapLabelOverlayTimer;
  bool _didShowMapLabelOverlayOnce = false;
  int? _selectedMapIndexOverride;
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
  Offset _slowMotionBannerOffset = Offset.zero;
  Timer? _slowMotionBannerTimer;
  final List<Timer> _ambientBannerTimers = <Timer>[];
  Timer? _countdownTimer;
  DateTime? _countdownStartedAt;
  int _countdownRemainingMs = 0;

  void _logPinballStatus(String value) {
    debugPrint('[Pinball][status] $value');
  }

  void _clearStartupTimeout() {
    _startupTimeoutTimer?.cancel();
    _startupTimeoutTimer = null;
  }

  void _clearMapLabelOverlayTimer() {
    _mapLabelOverlayTimer?.cancel();
    _mapLabelOverlayTimer = null;
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

  Future<void> _showMapSelectDialogAndRestart() async {
    if (!mounted) {
      return;
    }
    final selected = await showDialog<int>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101214),
          title: const Text(
            '맵 선택',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var mapIndex = 1; mapIndex <= 4; mapIndex++)
                ListTile(
                  dense: true,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  title: Text(
                    '맵 $mapIndex',
                    style: const TextStyle(color: Colors.white),
                  ),
                  onTap: () => Navigator.of(dialogContext).pop(mapIndex),
                ),
            ],
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
    if (selected == null || !mounted) {
      return;
    }
    await _restartWithSelectedMap(selected);
  }

  Future<void> _restartWithSelectedMap(int mapIndex) async {
    if (!mounted) {
      return;
    }
    _clearLicenseHoldTimer();
    _resetCountdown();
    setState(() {
      _selectedMapIndexOverride = mapIndex;
      _hasError = false;
      _mapLabel = '';
      _showMapLabelOverlay = false;
      _didShowMapLabelOverlayOnce = false;
      _pageLoaded = false;
      _didStart = false;
      _isStarting = false;
      _startGeneration += 1;
      _winnerMonitorTicket += 1;
      _engineReloadCount = 0;
      _logPinballStatus('맵 $mapIndex 재시작 중...');
    });
    _clearStartupTimeout();
    _resetSlowMotionBannerState();
    await _loadPinballPage(clearCache: true);
  }

  void _clearSlowMotionBannerTimer() {
    _slowMotionBannerTimer?.cancel();
    _slowMotionBannerTimer = null;
  }

  void _clearAmbientBannerTimer() {
    for (final timer in _ambientBannerTimers) {
      timer.cancel();
    }
    _ambientBannerTimers.clear();
  }

  Duration _randomDurationBetween(int minDelayMs, int maxDelayMs) {
    if (maxDelayMs <= minDelayMs) {
      return Duration(milliseconds: max(1, minDelayMs));
    }
    final delta = maxDelayMs - minDelayMs + 1;
    return Duration(milliseconds: minDelayMs + _random.nextInt(delta));
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

  int get _countdownTotalMs => _waitForFullRanking
      ? _fullRankingCountdownTotalMs
      : _normalCountdownTotalMs;

  void _clearCountdownTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
  }

  void _resetCountdown() {
    _clearCountdownTimer();
    _countdownStartedAt = null;
    _countdownRemainingMs = _countdownTotalMs;
  }

  void _ensureCountdownStarted() {
    if (_countdownStartedAt != null) {
      return;
    }
    _countdownStartedAt = DateTime.now();
    _countdownRemainingMs = _countdownTotalMs;
    _countdownTimer = Timer.periodic(_countdownTickInterval, (_) {
      if (!mounted || _isFinishing) {
        _clearCountdownTimer();
        return;
      }
      final startedAt = _countdownStartedAt;
      if (startedAt == null) {
        _clearCountdownTimer();
        return;
      }
      final elapsedMs = DateTime.now().difference(startedAt).inMilliseconds;
      final remainingMs = max(0, _countdownTotalMs - elapsedMs);
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

  void _resetSlowMotionBannerState() {
    _clearSlowMotionBannerTimer();
    _clearAmbientBannerTimer();
    _slowMotionActive = false;
    _slowMotionActiveSince = null;
    _slowMotionActivationCount = 0;
    _slowMotionAssetsUsed.clear();
    _queuedSlowMotionBannerAsset = null;
    _slowMotionBannerAsset = null;
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
    final beginOffset = _entryOffsetForSlowMotionBanner(assetPath);
    setState(() {
      _slowMotionBannerAsset = assetPath;
      _slowMotionBannerOffset = beginOffset;
    });
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
        _slowMotionBannerOffset = Offset.zero;
      });
    });
  }

  void _updateSlowMotionBanner(Map<String, dynamic>? state) {
    final active = state?['slowMotionActive'] == true;
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

  void _startStartupTimeout() {
    _clearStartupTimeout();
    _startupTimeoutTimer = Timer(_startupTimeout, () {
      if (!mounted || _isFinishing || _didStart || _hasError) {
        return;
      }
      setState(() {
        _hasError = true;
        _logPinballStatus('시작 대기 시간 초과');
        _mapLabel = '';
        _pageLoaded = false;
        _didStart = false;
        _isStarting = false;
        _startGeneration += 1;
        _winnerMonitorTicket += 1;
      });
    });
  }

  List<String> get _candidates => _cachedCandidates ??= () {
    final seen = <String>{};
    final normalized = <String>[];

    for (final candidate in widget.args.candidates) {
      final value = _normalizeCandidate(candidate);
      if (value.isEmpty || seen.contains(value)) {
        continue;
      }
      seen.add(value);
      normalized.add(value);
    }

    return normalized;
  }();

  bool get _waitForFullRanking => widget.args.waitForFullRanking;
  int get _expectedRankingCount {
    if (!_waitForFullRanking) {
      return 0;
    }
    final configured = widget.args.expectedRankingCount;
    if (configured >= 2) {
      return configured;
    }
    return max(1, _candidates.length);
  }

  List<String>? _cachedCandidates;

  String _normalizePinballAssetRequestPath(String path) {
    final trimmed = path.startsWith('/') ? path.substring(1) : path;
    final normalized = trimmed.isEmpty ? 'index.html' : trimmed;
    if (normalized.contains('..')) {
      return 'index.html';
    }
    return normalized;
  }

  ContentType _pinballContentTypeForPath(String path) {
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
    if (lower.endsWith('.json')) {
      return ContentType('application', 'json', charset: 'utf-8');
    }
    if (lower.endsWith('.webmanifest')) {
      return ContentType('application', 'manifest+json', charset: 'utf-8');
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
    if (lower.endsWith('.map')) {
      return ContentType('application', 'json', charset: 'utf-8');
    }
    return ContentType.binary;
  }

  Future<Uri> _ensureLocalPinballServer() async {
    if (_localPinballBaseUri != null) {
      return _localPinballBaseUri!;
    }

    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
      shared: true,
    );
    _localPinballServer = server;
    final baseUri = Uri.parse('http://127.0.0.1:${server.port}');
    _localPinballBaseUri = baseUri;

    unawaited(
      server.forEach((request) async {
        try {
          var relativePath = _normalizePinballAssetRequestPath(
            request.uri.path,
          );
          final assetPath = '$_pinballAssetDir/$relativePath';
          ByteData data;
          try {
            data = await rootBundle.load(assetPath);
          } catch (_) {
            final shouldFallbackToIndex =
                relativePath == 'index.html' || !relativePath.contains('.');
            if (!shouldFallbackToIndex) {
              rethrow;
            }
            relativePath = 'index.html';
            data = await rootBundle.load('$_pinballAssetDir/index.html');
          }

          var bytes = data.buffer.asUint8List(
            data.offsetInBytes,
            data.lengthInBytes,
          );
          if (relativePath == 'index.html') {
            final isFromApp =
                request.uri.queryParameters['fromApp'] == '1' ||
                request.uri.queryParameters['isPinballApp'] == '1';
            if (isFromApp) {
              final html = utf8.decode(bytes, allowMalformed: true);
              if (!html.contains('__appPinballBootHide')) {
                const bootHideScript = '''
<script>(function(){var q=new URLSearchParams(window.location.search);var app=q.get('fromApp')==='1'||q.get('isPinballApp')==='1';if(!app)return;document.documentElement.classList.add('from-app');var s=document.createElement('style');s.id='__appPinballBootHide';s.textContent='#settings,#donate,#notice,#btnNotice,.toast,.result,.history,.copyright,#in_names,.winner,.winner-box,.winner-panel,.winner-popup,.winner-text,.winner-image,#winner,#winnerImage,#winnerName{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;}body{overflow:hidden!important;touch-action:none!important;}';(document.head||document.documentElement).appendChild(s);}());</script>
''';
                bytes = utf8.encode('$bootHideScript$html');
              }
            }
          }
          request.response.headers.contentType = _pinballContentTypeForPath(
            relativePath,
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

    return baseUri;
  }

  Future<void> _loadPinballPage({bool clearCache = false}) async {
    if (clearCache) {
      try {
        await _controller.clearCache();
      } catch (_) {
        // Ignore cache-clear failures and continue with a cache-busted URL load.
      }
      try {
        await _controller.clearLocalStorage();
      } catch (_) {
        // Ignore local-storage clear failures and continue.
      }
    }

    final baseUri = await _ensureLocalPinballServer();
    final queryParameters = <String, String>{
      'fromApp': '1',
      'isPinballApp': '1',
      'disableSw': '1',
      'preferWebGpu': '1',
      'appCacheBust': '${DateTime.now().microsecondsSinceEpoch}',
    };
    final uri = baseUri.replace(
      path: '/index.html',
      queryParameters: queryParameters,
    );
    await _controller.loadRequest(uri);
  }

  @override
  void initState() {
    super.initState();
    _selectedMapIndexOverride = widget.args.selectedMapIndex;
    _resetCountdown();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      unawaited(_warmUpSlowMotionBannerAssets());
    });
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'PinballBridge',
        onMessageReceived: _onBridgeMessage,
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            _resetCountdown();
            setState(() {
              _logPinballStatus('핀볼 게임 페이지 로딩 중...');
              _mapLabel = '';
              _hasError = false;
              _pageLoaded = false;
              _didStart = false;
              _isStarting = false;
              _startGeneration += 1;
              _winnerMonitorTicket += 1;
              _engineReloadCount = 0;
              _startStartupTimeout();
            });
          },
          onPageFinished: (_) async {
            if (!mounted) {
              return;
            }
            setState(() {
              _pageLoaded = true;
              _didStart = false;
              _logPinballStatus('후보를 전달하고 게임을 시작합니다...');
            });
            // Remote engine bootstrap can be sensitive to aggressive cache/service-worker cleanup.
            // Keep startup path minimal and deterministic.
            await _suppressAppChrome();
            await _startPinball();
          },
          onWebResourceError: (error) {
            if (!mounted) {
              return;
            }
            setState(() {
              _hasError = true;
              _logPinballStatus('핀볼 게임을 불러오지 못했습니다.');
            });
            _clearStartupTimeout();
          },
        ),
      );
    // Preload candidate food images before the web game starts.
    unawaited(_resolveCandidateImageDataUrls());
    unawaited(_resolveGoalLineImageDataUrl());
    unawaited(_loadPinballPage(clearCache: true));
  }

  Future<void> _startPinball() async {
    if (!mounted ||
        !_pageLoaded ||
        _candidates.isEmpty ||
        _didStart ||
        _isFinishing ||
        _isStarting) {
      return;
    }

    _isStarting = true;
    _resetSlowMotionBannerState();
    _didShowMapLabelOverlayOnce = false;
    final generation = ++_startGeneration;
    if (mounted) {
      setState(() {
        _logPinballStatus('핀볼 엔진 초기화 중...');
      });
    }

    try {
      await _resolveSlowMotionBannerAssets();
      _startStartupTimeout();
      setState(() {
        _logPinballStatus('음식 이미지를 불러오는 중...');
      });
      final imageDataUrls = await _resolveCandidateImageDataUrls();
      final goalLineImageDataUrl = await _resolveGoalLineImageDataUrl();
      if (!mounted || _isFinishing || generation != _startGeneration) {
        return;
      }

      final payload = <String, Object>{
        'candidates': _candidates,
        'autoStart': true,
        'winnerType': 'custom',
        'winningRank': 1,
        'imageDataUrls': imageDataUrls,
        'goalLineImageDataUrl': goalLineImageDataUrl,
        'selectedMapIndex': _selectedMapIndexOverride ?? -1,
      };
      final encodedPayload = jsonEncode(payload);

      await _controller.runJavaScript('''
(() => {
  window.__appPinballControl = null;
  window.__appPinballPayload = $encodedPayload;
})();
''');

      const maxAttempt = 220;
      Map<String, dynamic>? lastState;
      for (var attempt = 0; attempt < maxAttempt; attempt++) {
        if (!mounted || _isFinishing || generation != _startGeneration) {
          return;
        }

        final state = await _runStartTick();
        lastState = state;
        _updateSlowMotionBanner(state);
        _syncMapLabel(state);
        final hasRoulette = state?['hasRoulette'] == true;
        final running = state?['running'] == true;
        final count = _toInt(state?['count']);
        final mapReady = state?['mapReady'] == true;
        final foodImagesReady = state?['foodImagesReady'] == true;
        final bridgeStartFn = state?['bridgeStartFn'] == true;
        final populateError =
            (state?['populateError'] as String?)?.trim() ?? '';
        final mapLayoutError =
            (state?['mapLayoutError'] as String?)?.trim() ?? '';
        final movedTicks = _toInt(state?['movedTicks']);
        final runningTicks = _toInt(state?['runningTicks']);
        final startMethod = (state?['startMethod'] as String?)?.trim() ?? '';
        final tickError = (state?['tickError'] as String?)?.trim() ?? '';
        final recoveryCount = _toInt(state?['map5RecoveryCount']);
        final stallTicks = _toInt(state?['map5StallTicks']);
        final winner = _extractWinnerName(state?['winner']);
        final skillFxPatched = state?['skillFxPatched'] == true;
        final skillFxColor = (state?['skillFxColor'] as String?)?.trim() ?? '';

        if (attempt % 20 == 0) {
          debugPrint(
            '[Pinball][tick] hasRoulette=$hasRoulette bridgeFn=$bridgeStartFn map=$_mapLabel running=$running count=$count moved=$movedTicks runningTicks=$runningTicks start=$startMethod recovery=$recoveryCount stall=$stallTicks skillFxPatched=$skillFxPatched skillFxColor="$skillFxColor" populateErr="$populateError"',
          );
        }

        if (winner.isNotEmpty) {
          _clearStartupTimeout();
          _didStart = true;
          _finish(winner);
          return;
        }

        if (running && count > 0) {
          _didStart = true;
          _clearStartupTimeout();
          if (mounted) {
            setState(() {
              _logPinballStatus('게임 진행 중...');
            });
          }
          _startWinnerMonitor(generation);
          return;
        }

        if (!hasRoulette && attempt >= 120 && _engineReloadCount < 1) {
          _engineReloadCount += 1;
          if (mounted && generation == _startGeneration) {
            setState(() {
              _logPinballStatus('엔진 재로딩 중...');
            });
          }
          await _loadPinballPage(clearCache: true);
          return;
        }

        if (!mounted || generation != _startGeneration) {
          return;
        }
        if (attempt % 12 == 0) {
          setState(() {
            if (tickError.isNotEmpty) {
              _logPinballStatus('엔진 스크립트 오류 복구 중...');
            } else if (!hasRoulette) {
              _logPinballStatus(
                bridgeStartFn ? '핀볼 엔진 로딩을 기다리는 중...' : '엔진 스크립트 초기화 대기 중...',
              );
            } else if (!foodImagesReady) {
              _logPinballStatus('음식 볼 이미지를 게임에 적용하는 중...');
            } else if (!mapReady) {
              _logPinballStatus(
                mapLayoutError.isNotEmpty
                    ? '맵 구성 오류 복구 중...'
                    : '프리셋 맵을 준비하는 중...',
              );
            } else if (count == 0) {
              _logPinballStatus(
                populateError.isNotEmpty
                    ? '구슬 생성 복구 중...'
                    : '후보를 핀볼에 적용하는 중...',
              );
            } else if (running) {
              _logPinballStatus(
                stallTicks > 10 ? '구슬 정체 감지. 자동 복구 중...' : '구슬 움직임을 확인하는 중...',
              );
            } else {
              _logPinballStatus('게임 시작 재시도 중...');
            }
          });
        }
        await Future<void>.delayed(const Duration(milliseconds: 120));
      }

      final winnerAfterLoop = _extractWinnerName(lastState?['winner']);
      if (winnerAfterLoop.isNotEmpty) {
        _didStart = true;
        _finish(winnerAfterLoop);
        return;
      }

      final runningAfterLoop = lastState?['running'] == true;
      if (runningAfterLoop) {
        _didStart = true;
        _clearStartupTimeout();
        if (mounted && generation == _startGeneration) {
          setState(() {
            _logPinballStatus('게임 진행 중...');
          });
        }
        _startWinnerMonitor(generation);
        return;
      }

      _didStart = false;
      if (mounted && generation == _startGeneration) {
        setState(() {
          _hasError = true;
          _logPinballStatus('자동 시작이 실패했습니다. 다시 시도해 주세요.');
        });
        _clearStartupTimeout();
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('핀볼 자동 시작 실패')));
      }
    } catch (error) {
      _didStart = false;
      if (mounted && generation == _startGeneration) {
        setState(() {
          _hasError = true;
          _logPinballStatus('게임 시작 처리 중 오류가 발생했습니다.');
        });
        _clearStartupTimeout();
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('핀볼 시작 오류')));
      }
      debugPrint('[Pinball] start loop failed: $error');
    } finally {
      if (generation == _startGeneration) {
        _isStarting = false;
      }
    }
  }

  Future<Map<String, dynamic>?> _runStartTick() async {
    final js = '''
(() => {
  const payload = window.__appPinballPayload || {};

  const normalizeCandidates = (raw) => {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item) => String(item).trim())
      .map((item) => item.replace(/^\\d+\\s*[`\\.\\-:)]\\s*/, '').trim())
      .filter((item) => item.length > 0);
  };

  const candidates = normalizeCandidates(payload && payload.candidates);
  const selectedMapIndexRaw = Number(payload && payload.selectedMapIndex);
  const selectedMapIndex = Number.isFinite(selectedMapIndexRaw)
    ? Math.floor(selectedMapIndexRaw)
    : -1;
  const imageDataUrls =
    payload && payload.imageDataUrls && typeof payload.imageDataUrls === 'object'
      ? payload.imageDataUrls
      : {};
  const goalLineImageDataUrl =
    payload && typeof payload.goalLineImageDataUrl === 'string'
      ? payload.goalLineImageDataUrl
      : '';
  const candidateKey = candidates.join('\\n');
  const targetWinningRank = Math.max(1, Number(payload && payload.winningRank) || 1);
  const ceremonyDisplayCount = Math.max(1, Math.min(3, targetWinningRank));
  const ceremonyRevealDelayMs = 3000;
  const ceremonyDurationMs = 5000;
  const control = window.__appPinballControl || {};
  window.__appPinballControl = control;

  if (typeof control.prepared !== 'boolean') control.prepared = false;
  if (typeof control.candidateKey !== 'string') control.candidateKey = '';
  if (!Array.isArray(control.lastSample)) control.lastSample = null;
  if (typeof control.movedTicks !== 'number') control.movedTicks = 0;
  if (typeof control.runningTicks !== 'number') control.runningTicks = 0;
  if (typeof control.spinNotified !== 'boolean') control.spinNotified = false;
  if (typeof control.startAttempts !== 'number') control.startAttempts = 0;
  if (typeof control.physicsFrozen !== 'boolean') control.physicsFrozen = false;
  if (typeof control.uiObjectsCleared !== 'boolean') control.uiObjectsCleared = false;
  if (typeof control.uiObjectAddPatched !== 'boolean') control.uiObjectAddPatched = false;
  if (!control.foodImages || typeof control.foodImages !== 'object') control.foodImages = {};
  if (!control.foodImageSources || typeof control.foodImageSources !== 'object') control.foodImageSources = {};
  if (typeof control.foodImagesReady !== 'boolean') control.foodImagesReady = false;
  if (typeof control.foodImagesEnsureStartedAt !== 'number') control.foodImagesEnsureStartedAt = 0;
  if (typeof control.rendererPatched !== 'boolean') control.rendererPatched = false;
  if (typeof control.marbleRenderPatched !== 'boolean') control.marbleRenderPatched = false;
  if (typeof control.skillFxPatched !== 'boolean') control.skillFxPatched = false;
  if (typeof control.skillFxColor !== 'string') control.skillFxColor = '';
  if (typeof control.cameraZoomPatched !== 'boolean') control.cameraZoomPatched = false;
  if (typeof control.winnerOverlayMuted !== 'boolean') control.winnerOverlayMuted = false;
  if (typeof control.goalFxMuted !== 'boolean') control.goalFxMuted = false;
  if (typeof control.ceremonyScheduled !== 'boolean') control.ceremonyScheduled = false;
  if (typeof control.ceremonyDone !== 'boolean') control.ceremonyDone = false;
  if (typeof control.ceremonyFxActive !== 'boolean') control.ceremonyFxActive = false;
  if (typeof control.ceremonyFxRaf !== 'number') control.ceremonyFxRaf = 0;
  if (!('ceremonyFxResizeHandler' in control)) control.ceremonyFxResizeHandler = null;
  if (!Array.isArray(control.top3)) control.top3 = [];
  if (typeof control.finalWinner !== 'string') control.finalWinner = '';
  if (typeof control.finalTop3Key !== 'string') control.finalTop3Key = '';
  if (!control.boundaryMask || typeof control.boundaryMask !== 'object') control.boundaryMask = null;
  if (typeof control.mapVariantId !== 'string') control.mapVariantId = '';
  if (typeof control.mapLabel !== 'string') control.mapLabel = '';
  if (typeof control.lastMapIndex !== 'number') control.lastMapIndex = -1;
  if (typeof control.fixedMapIndex !== 'number') control.fixedMapIndex = -1;
  if (typeof control.fixedMapTitle !== 'string') control.fixedMapTitle = '';
  if (typeof control.mapReady !== 'boolean') control.mapReady = false;
  if (typeof control.lastVariantSignature !== 'string') control.lastVariantSignature = '';
  if (!Array.isArray(control.bombTraps)) control.bombTraps = [];
  if (!Array.isArray(control.bombPulses)) control.bombPulses = [];
  if (!control.launchChamber || typeof control.launchChamber !== 'object') control.launchChamber = null;
  if (!control.finishLine || typeof control.finishLine !== 'object') control.finishLine = null;
  if (typeof control.goalLineImageReady !== 'boolean') control.goalLineImageReady = false;
  if (typeof control.goalLineImageLoading !== 'boolean') control.goalLineImageLoading = false;
  if (typeof control.goalLineImageFailed !== 'boolean') control.goalLineImageFailed = false;
  if (!('goalLineImage' in control)) control.goalLineImage = null;
  if (typeof control.runStartedAt !== 'number') control.runStartedAt = 0;
  if (typeof control.lastProgressAt !== 'number') control.lastProgressAt = 0;
  if (typeof control.lastWinnerCount !== 'number') control.lastWinnerCount = 0;
  if (typeof control.lastLeadingY !== 'number') control.lastLeadingY = -1;
  if (typeof control.lastRescueAt !== 'number') control.lastRescueAt = 0;
  if (typeof control.rescueCount !== 'number') control.rescueCount = 0;
  if (typeof control.timeoutResolved !== 'boolean') control.timeoutResolved = false;
  if (typeof control.mapPresetCode !== 'string') control.mapPresetCode = '';
  if (typeof control.map5SpawnAligned !== 'boolean') control.map5SpawnAligned = false;
  if (typeof control.requestedMapToken !== 'string') control.requestedMapToken = '';
  if (typeof control.requestedMapSlot !== 'number') control.requestedMapSlot = -1;
  if (typeof control.map3SkillLockUntil !== 'number') control.map3SkillLockUntil = 0;
  if (typeof control.skillLockUntil !== 'number') control.skillLockUntil = 0;
  if (typeof control.skillBlockedBySlowMo !== 'boolean') control.skillBlockedBySlowMo = false;
  if (typeof control.populateRetryTick !== 'number') control.populateRetryTick = 0;
  if (typeof control.lastPopulateError !== 'string') control.lastPopulateError = '';
  if (typeof control.map5StallTicks !== 'number') control.map5StallTicks = 0;
  if (typeof control.map5RecoveryCount !== 'number') control.map5RecoveryCount = 0;
  if (typeof control.lastMap5RecoveryAt !== 'number') control.lastMap5RecoveryAt = 0;
  if (!control.trapScaleSummary || typeof control.trapScaleSummary !== 'object') control.trapScaleSummary = null;
  if (typeof control.layoutRevision !== 'string') control.layoutRevision = '';
  const layoutRevision = 'map5-layout-r20260225-19';
  if (control.layoutRevision !== layoutRevision) {
    control.layoutRevision = layoutRevision;
    control.prepared = false;
    control.mapReady = false;
    control.map5SpawnAligned = false;
    control.map5StallTicks = 0;
    control.map5RecoveryCount = 0;
    control.lastMap5RecoveryAt = 0;
  }
  const diamondTrapScale = 1.3;
  const diagonalBarTrapScale = 1.3;
  const cameraMinZoom = 1.5;
  const goalLineImageSrc =
    goalLineImageDataUrl && goalLineImageDataUrl.startsWith('data:')
      ? goalLineImageDataUrl
      : './goal_line_tab1.png?v=20260226';

  const postBridge = (eventName, eventPayload) => {
    try {
      if (window.PinballBridge && typeof window.PinballBridge.postMessage === 'function') {
        window.PinballBridge.postMessage(JSON.stringify({
          source: 'pinball-embed',
          event: eventName,
          payload: eventPayload || {},
          timestamp: new Date().toISOString(),
        }));
      }
    } catch (_) {
    }
  };

  const hideForApp = () => {
    [
      '#settings',
      '#donate',
      '#notice',
      '#btnNotice',
      '.toast',
      '.result',
      '.history',
      '.copyright',
      '#in_names',
      '.winner',
      '.winner-box',
      '.winner-panel',
      '.winner-popup',
      '.winner-text',
      '.winner-image',
      '#winner',
      '#winnerImage',
      '#winnerName'
    ].forEach((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return;
      }
      element.style.display = 'none';
      element.style.pointerEvents = 'none';
    });
    if (document.body) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }
  };

  const muteWinnerDomUi = () => {
    if (document.getElementById('__appPinballWinnerMuteStyle')) {
      return;
    }
    const style = document.createElement('style');
    style.id = '__appPinballWinnerMuteStyle';
    style.textContent = `
      .winner,
      .winner-box,
      .winner-panel,
      .winner-popup,
      .winner-text,
      .winner-image,
      #winner,
      #winnerImage,
      #winnerName {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  };

  const disableRecording = () => {
    if (window.options && typeof window.options === 'object') {
      window.options.autoRecording = false;
    }
    const checkbox = document.querySelector('#chkAutoRecording');
    if (checkbox && checkbox.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (window.roulette && typeof window.roulette.setAutoRecording === 'function') {
      window.roulette.setAutoRecording(false);
    }
  };

  const ensureFoodImages = () => {
    const names = Object.keys(imageDataUrls).filter((name) => {
      const src = imageDataUrls[name];
      return typeof src === 'string' && !!src;
    });
    if (names.length === 0) {
      control.foodImagesReady = true;
      control.foodImagesEnsureStartedAt = 0;
      return true;
    }
    if (!Number.isFinite(control.foodImagesEnsureStartedAt) || control.foodImagesEnsureStartedAt <= 0) {
      control.foodImagesEnsureStartedAt = Date.now();
    }

    let readyCount = 0;
    names.forEach((name) => {
      const src = imageDataUrls[name];
      let image = control.foodImages[name];
      const sameSrc = control.foodImageSources[name] === src;
      if (!image || !sameSrc) {
        image = new Image();
        image.decoding = 'async';
        image.src = src;
        image.__appFoodReady = false;
        image.__appFoodTracked = false;
        control.foodImageSources[name] = src;
        control.foodImages[name] = image;
      }
      if (!image) {
        return;
      }

      const loaded = image.complete === true && Number(image.naturalWidth) > 0;
      if (loaded) {
        image.__appFoodReady = true;
      } else if (image.__appFoodTracked !== true) {
        image.__appFoodTracked = true;
        image.addEventListener('load', () => {
          image.__appFoodReady = true;
        }, { once: true });
        image.addEventListener('error', () => {
          // Do not block forever on a broken asset.
          image.__appFoodReady = true;
        }, { once: true });
      }

      if (image.__appFoodReady === true) {
        readyCount += 1;
      }
    });

    let ready = readyCount >= names.length;
    if (
      !ready &&
      Number.isFinite(control.foodImagesEnsureStartedAt) &&
      control.foodImagesEnsureStartedAt > 0 &&
      Date.now() - control.foodImagesEnsureStartedAt > 8000
    ) {
      ready = true;
    }
    control.foodImagesReady = ready;
    if (ready) {
      control.foodImagesEnsureStartedAt = 0;
    }
    return ready;
  };

  const clearAuxUiObjects = () => {
    if (!window.roulette || !Array.isArray(window.roulette._uiObjects)) {
      return;
    }
    if (window.roulette._uiObjects.length > 0) {
      window.roulette._uiObjects = [];
    }
    if (!control.uiObjectAddPatched && typeof window.roulette.addUiObject === 'function') {
      window.roulette.addUiObject = () => {};
      control.uiObjectAddPatched = true;
    }
    control.uiObjectsCleared = true;
  };

  const imageForName = (name) => {
    if (typeof name !== 'string' || !name) {
      return null;
    }
    if (control.foodImages && control.foodImages[name]) {
      return control.foodImages[name];
    }
    return null;
  };

  const patchRenderer = () => {
    if (control.rendererPatched) {
      return;
    }
    const renderer = window.roulette && window.roulette._renderer;
    if (!renderer) {
      return;
    }
    const originalGet =
      typeof renderer.getMarbleImage === 'function'
        ? renderer.getMarbleImage.bind(renderer)
        : null;
    renderer.getMarbleImage = function(name) {
      const fromFood = imageForName(name);
      if (fromFood) {
        return fromFood;
      }
      if (originalGet) {
        return originalGet(name);
      }
      return undefined;
    };
    const ensureGoalLineImage = () => {
      if (control.goalLineImageReady || control.goalLineImageLoading || control.goalLineImageFailed) {
        return;
      }
      if (typeof Image !== 'function') {
        control.goalLineImageFailed = true;
        return;
      }
      const img = new Image();
      control.goalLineImage = img;
      control.goalLineImageLoading = true;
      img.onload = () => {
        control.goalLineImageReady = true;
        control.goalLineImageLoading = false;
      };
      img.onerror = () => {
        control.goalLineImageFailed = true;
        control.goalLineImageLoading = false;
        postBridge('goalLineImageError', { src: goalLineImageSrc });
      };
      img.src = goalLineImageSrc;
    };
    const drawOutsideMask = (ctx) => {
      const mask = control.boundaryMask;
      if (
        !mask ||
        !Array.isArray(mask.leftPath) ||
        !Array.isArray(mask.rightPath) ||
        mask.leftPath.length < 2 ||
        mask.rightPath.length < 2
      ) {
        return;
      }
      const topY = Number(mask.topY);
      const bottomY = Number(mask.bottomY);
      const farLeftX = Number(mask.farLeftX);
      const farRightX = Number(mask.farRightX);
      if (
        !Number.isFinite(topY) ||
        !Number.isFinite(bottomY) ||
        !Number.isFinite(farLeftX) ||
        !Number.isFinite(farRightX)
      ) {
        return;
      }

      const leftPath = mask.leftPath
        .map((pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : null))
        .filter((pt) => pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      const rightPath = mask.rightPath
        .map((pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : null))
        .filter((pt) => pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      if (leftPath.length < 2 || rightPath.length < 2) {
        return;
      }

      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 170, 0.24)';
      ctx.strokeStyle = 'rgba(255, 124, 224, 0.58)';
      ctx.shadowColor = 'rgba(255, 20, 176, 0.42)';
      ctx.shadowBlur = 0.5;
      ctx.lineWidth = 0.08;

      ctx.beginPath();
      ctx.moveTo(farLeftX, topY);
      ctx.lineTo(leftPath[0][0], leftPath[0][1]);
      for (let i = 1; i < leftPath.length; i++) {
        ctx.lineTo(leftPath[i][0], leftPath[i][1]);
      }
      ctx.lineTo(farLeftX, bottomY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(farRightX, topY);
      ctx.lineTo(rightPath[0][0], rightPath[0][1]);
      for (let i = 1; i < rightPath.length; i++) {
        ctx.lineTo(rightPath[i][0], rightPath[i][1]);
      }
      ctx.lineTo(farRightX, bottomY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    const drawFinishLine = (ctx) => {
      const finish = control.finishLine;
      if (!finish || typeof finish !== 'object') {
        return;
      }
      const cx = Number(finish.x);
      const cy = Number(finish.y);
      const width = Number(finish.width);
      const height = Number(finish.height);
      if (
        !Number.isFinite(cx) ||
        !Number.isFinite(cy) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return;
      }

      ctx.save();
      ctx.translate(cx, cy);
      ensureGoalLineImage();
      const image = control.goalLineImage;
      const imageReady = !!(
        control.goalLineImageReady &&
        image &&
        typeof image === 'object' &&
        image.complete === true &&
        Number(image.naturalWidth) > 0 &&
        Number(image.naturalHeight) > 0
      );

      if (!imageReady) {
        ctx.restore();
        return;
      }
      const targetSize = Math.max(1.5, Math.min(3.0, width * 0.48));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.98;
      ctx.drawImage(
        image,
        -targetSize / 2,
        -targetSize / 2,
        targetSize,
        targetSize,
      );
      ctx.globalAlpha = 1;
      ctx.restore();
    };
    renderer.renderEntities = function(entities) {
      const ctx = this.ctx;
      if (!ctx || !Array.isArray(entities)) {
        return;
      }
      const isDiamondLikeBox = (shape) => {
        if (!shape || shape.type !== 'box') {
          return false;
        }
        const width = Math.abs(Number(shape.width));
        const height = Math.abs(Number(shape.height));
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          return false;
        }
        const major = Math.max(width, height);
        const minor = Math.min(width, height);
        if (!Number.isFinite(major) || !Number.isFinite(minor) || minor <= 0) {
          return false;
        }
        const ratio = major / minor;
        let tilt = Math.abs(Number(shape.rotation) || 0) % Math.PI;
        if (tilt > Math.PI / 2) {
          tilt = Math.PI - tilt;
        }
        return ratio <= 1.3 && major <= 1.9 && tilt >= 0.34 && tilt <= 1.24;
      };

      const typeStyle = (entity, shapeType) => {
        const isBomb = entity && entity.__appBomb === true;
        const isBurstBumper = entity && entity.__appBurstBumper === true;
        const isKinematic = entity && entity.type === 'kinematic';
        if (isBurstBumper) {
          return {
            stroke: 'rgba(138, 255, 247, 0.99)',
            fill: 'rgba(24, 208, 255, 0.46)',
            glow: 'rgba(78, 255, 224, 0.97)',
            glowBlur: 0.86,
            lineWidth: 0.09,
          };
        }
        if (isBomb) {
          return {
            stroke: 'rgba(255, 182, 245, 0.99)',
            fill: 'rgba(62, 10, 80, 0.92)',
            glow: 'rgba(255, 70, 222, 0.97)',
            glowBlur: 0.82,
            lineWidth: 0.085,
          };
        }
        if (shapeType === 'polyline') {
          return {
            stroke: isKinematic ? 'rgba(228, 132, 255, 0.98)' : 'rgba(255, 92, 224, 0.97)',
            fill: isKinematic ? 'rgba(168, 46, 255, 0.16)' : 'rgba(255, 34, 188, 0.18)',
            glow: isKinematic ? 'rgba(210, 102, 255, 0.93)' : 'rgba(255, 72, 214, 0.88)',
            glowBlur: isKinematic ? 0.62 : 0.5,
            lineWidth: 0.09,
          };
        }
        if (shapeType === 'box') {
          const finish = control.finishLine && typeof control.finishLine === 'object'
            ? control.finishLine
            : null;
          const finishY = finish ? Number(finish.y) : NaN;
          const entityY = Number(entity && entity.y);
          const isBottomGoalRotor =
            isKinematic &&
            Number.isFinite(entityY) &&
            Number.isFinite(finishY) &&
            entityY >= finishY - 4.8;
          if (isBottomGoalRotor) {
            return {
              stroke: 'rgba(255, 235, 162, 0.99)',
              fill: 'rgba(212, 150, 28, 0.64)',
              glow: 'rgba(255, 203, 84, 0.94)',
              glowBlur: 0.78,
              lineWidth: 0.078,
            };
          }
          const isDiamondTrap = isDiamondLikeBox(entity && entity.shape);
          if (isDiamondTrap) {
            return {
              stroke: 'rgba(150, 255, 247, 0.99)',
              fill: 'rgba(34, 228, 255, 0.52)',
              glow: 'rgba(92, 255, 224, 0.96)',
              glowBlur: 0.76,
              lineWidth: 0.076,
            };
          }
          return {
            stroke: isKinematic ? 'rgba(214, 140, 255, 0.99)' : 'rgba(255, 122, 232, 0.97)',
            fill: isKinematic ? 'rgba(146, 40, 255, 0.5)' : 'rgba(255, 36, 186, 0.44)',
            glow: isKinematic ? 'rgba(194, 98, 255, 0.94)' : 'rgba(255, 86, 220, 0.85)',
            glowBlur: isKinematic ? 0.68 : 0.54,
            lineWidth: 0.07,
          };
        }
        return {
          stroke: 'rgba(255, 170, 238, 0.99)',
          fill: 'rgba(170, 40, 255, 0.44)',
          glow: 'rgba(232, 110, 255, 0.93)',
          glowBlur: 0.64,
          lineWidth: 0.08,
        };
      };

      ctx.save();
      drawOutsideMask(ctx);
      if (control && typeof control.updateDiamondTrapMotion === 'function') {
        control.updateDiamondTrapMotion();
      }
      entities.forEach((entity) => {
        if (!entity || !entity.shape) {
          return;
        }
        const shape = entity.shape;
        const isBomb = entity.__appBomb === true;
        const style = typeStyle(entity, shape.type);
        const previous = ctx.getTransform();
        ctx.translate(Number(entity.x) || 0, Number(entity.y) || 0);
        ctx.rotate(Number(entity.angle) || 0);
        ctx.fillStyle = style.fill;
        ctx.strokeStyle = style.stroke;
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = style.glowBlur;
        ctx.lineWidth = style.lineWidth;

        if (shape.type === 'polyline' && Array.isArray(shape.points) && shape.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(Number(shape.points[0][0]) || 0, Number(shape.points[0][1]) || 0);
          for (let i = 1; i < shape.points.length; i++) {
            const pt = shape.points[i];
            ctx.lineTo(Number(pt[0]) || 0, Number(pt[1]) || 0);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(228, 182, 255, 0.76)';
          ctx.lineWidth = style.lineWidth * 0.5;
          ctx.stroke();
        } else if (shape.type === 'box') {
          const w = (Number(shape.width) || 0) * 2;
          const h = (Number(shape.height) || 0) * 2;
          ctx.rotate(Number(shape.rotation) || 0);
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        } else if (shape.type === 'circle') {
          const r = Number(shape.radius) || 0;
          if (isBomb) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2, false);
            ctx.fill();
            ctx.stroke();

            ctx.save();
            ctx.shadowBlur = 0;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 236, 247, 0.98)';
            ctx.font = `\${Math.max(0.5, r * 2.9)}pt "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.fillText('💣', 0, r * 0.02);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2, false);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.setTransform(previous);
      });

      if (Array.isArray(control.bombPulses) && control.bombPulses.length > 0) {
        const nowTs = Date.now();
        control.bombPulses = control.bombPulses.filter(
          (pulse) => pulse && nowTs - (pulse.startedAt || 0) <= (pulse.ttl || 520),
        );
        control.bombPulses.forEach((pulse) => {
          const life = nowTs - (pulse.startedAt || 0);
          const ttl = Math.max(120, Number(pulse.ttl) || 520);
          const progress = Math.min(1, Math.max(0, life / ttl));
          const kind = typeof pulse.kind === 'string' ? pulse.kind : 'bomb';
          const isSkill = kind === 'skill';
          let radius = Math.max(0.12, Number(pulse.radius) || 2.2) * (0.36 + progress * 0.86);
          if (kind === 'burst-hit') {
            radius *= 0.82;
          } else if (isSkill) {
            radius *= 1.08;
          }
          const alpha = 1 - progress;
          const px = Number(pulse.x) || 0;
          const py = Number(pulse.y) || 0;
          const bombStroke = `rgba(255, 132, 236, \${(0.8 * alpha).toFixed(3)})`;
          const bombFill = `rgba(178, 32, 255, \${(0.2 * alpha).toFixed(3)})`;
          const bombGlow = `rgba(245, 88, 255, \${(0.9 * alpha).toFixed(3)})`;
          const burstStroke = `rgba(120, 255, 247, \${(0.84 * alpha).toFixed(3)})`;
          const burstFill = `rgba(24, 210, 255, \${(0.18 * alpha).toFixed(3)})`;
          const burstGlow = `rgba(70, 255, 224, \${(0.94 * alpha).toFixed(3)})`;
          const skillStroke = `rgba(76, 255, 36, \${(0.96 * alpha).toFixed(3)})`;
          const skillFill = `rgba(42, 220, 30, \${(0.24 * alpha).toFixed(3)})`;
          const skillGlow = `rgba(128, 255, 58, \${(0.99 * alpha).toFixed(3)})`;

          ctx.save();
          ctx.strokeStyle = kind === 'bomb'
            ? bombStroke
            : (isSkill ? skillStroke : burstStroke);
          ctx.fillStyle = kind === 'bomb'
            ? bombFill
            : (isSkill ? skillFill : burstFill);
          ctx.shadowColor = kind === 'bomb'
            ? bombGlow
            : (isSkill ? skillGlow : burstGlow);
          ctx.shadowBlur = 0.72;
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2, false);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }
      drawFinishLine(ctx);
      ctx.restore();
    };
    if (typeof renderer.renderWinner === 'function') {
      renderer.renderWinner = () => {};
    }
    control.rendererPatched = true;
    control.winnerOverlayMuted = true;
  };

  const patchGoalFx = () => {
    if (control.goalFxMuted) {
      return;
    }
    const manager = window.roulette && window.roulette._particleManager;
    if (!manager || typeof manager.shot !== 'function') {
      return;
    }
    manager.shot = () => {};
    control.goalFxMuted = true;
  };

  const applySkillUsageGate = () => {
    if (!window.options || typeof window.options !== 'object') {
      return;
    }

    const isSlowMotionActive = () => {
      const nowTs = Date.now();
      const roulette =
        window.roulette && typeof window.roulette === 'object' ? window.roulette : null;
      const physics =
        roulette && roulette.physics && typeof roulette.physics === 'object'
          ? roulette.physics
          : null;
      const options =
        window.options && typeof window.options === 'object' ? window.options : null;

      const slowFlags = [
        control.slowMotionActive,
        control.isSlowMotion,
        roulette && roulette._isSlowMotion,
        roulette && roulette.isSlowMotion,
        roulette && roulette._slowMotion,
        roulette && roulette.slowMotion,
        roulette && roulette._slowMode,
        roulette && roulette.slowMode,
        physics && physics._isSlowMotion,
        physics && physics.isSlowMotion,
        physics && physics._slowMotion,
        physics && physics.slowMotion,
        options && options.isSlowMotion,
        options && options.slowMotion,
      ];
      for (let i = 0; i < slowFlags.length; i++) {
        if (slowFlags[i] === true) {
          return true;
        }
      }

      const slowUntilCandidates = [
        Number(control.slowMotionUntil),
        Number(control.slowMoUntil),
        Number(roulette && roulette._slowMotionUntil),
        Number(roulette && roulette.slowMotionUntil),
        Number(physics && physics._slowMotionUntil),
        Number(physics && physics.slowMotionUntil),
        Number(options && options.slowMotionUntil),
      ];
      for (let i = 0; i < slowUntilCandidates.length; i++) {
        const until = slowUntilCandidates[i];
        if (Number.isFinite(until) && until > nowTs) {
          return true;
        }
      }

      const timeScaleCandidates = [
        Number(roulette && roulette._timeScale),
        Number(roulette && roulette.timeScale),
        Number(roulette && roulette._speedScale),
        Number(roulette && roulette.speedScale),
        Number(physics && physics._timeScale),
        Number(physics && physics.timeScale),
        Number(options && options.timeScale),
      ];
      for (let i = 0; i < timeScaleCandidates.length; i++) {
        const scale = timeScaleCandidates[i];
        if (Number.isFinite(scale) && scale > 0 && scale < 0.92) {
          return true;
        }
      }
      return false;
    };

    const now = Date.now();
    const lockUntil = Number(control.skillLockUntil) || 0;
    const slowBlocked = isSlowMotionActive();
    control.skillBlockedBySlowMo = slowBlocked;
    window.options.useSkills = !(lockUntil > now || slowBlocked);
  };

  const ensureSkillFxColor = () => {
    if (!window.roulette) {
      return;
    }

    const neonHex = '#39ff14';
    const neonStroke = 'rgba(57, 255, 20, 0.99)';
    const neonGlow = 'rgba(87, 255, 36, 0.95)';

    if (window.roulette._theme && typeof window.roulette._theme === 'object') {
      window.roulette._theme.skillColor = neonHex;
      control.skillFxColor = String(window.roulette._theme.skillColor || '');
    } else {
      control.skillFxColor = neonHex;
    }

    const effects = Array.isArray(window.roulette._effects) ? window.roulette._effects : [];
    if (effects.length === 0) {
      return;
    }

    let patchedCount = 0;
    effects.forEach((effect) => {
      if (!effect || typeof effect !== 'object') {
        return;
      }
      const proto = Object.getPrototypeOf(effect);
      if (!proto || typeof proto.render !== 'function') {
        return;
      }
      if (proto.__appSkillFxPatched === true) {
        return;
      }

      const originalRender = proto.render;
      proto.render = function(ctx, zoom, theme) {
        try {
          if (typeof originalRender === 'function') {
            originalRender.call(this, ctx, zoom, theme);
          }
        } catch (_) {
        }

        const safeZoom = Number(zoom) > 0 ? Number(zoom) : 30;
        const elapsed = Number(this && this._elapsed) || 0;
        const lifetime = 500;
        const rate = Math.max(0, Math.min(1, elapsed / lifetime));
        const radius = Math.max(0.05, Number(this && this._size) || 0);
        const px = Number(this && this.position && this.position.x) || 0;
        const py = Number(this && this.position && this.position.y) || 0;

        if (theme && typeof theme === 'object') {
          theme.skillColor = neonHex;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - rate * rate);
        ctx.strokeStyle = neonStroke;
        ctx.shadowColor = neonGlow;
        ctx.shadowBlur = 12;
        ctx.lineWidth = Math.max(0.08, 2.4 / safeZoom);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      try {
        proto.__appSkillFxPatched = true;
      } catch (_) {
      }
      patchedCount += 1;
    });

    if (patchedCount > 0) {
      control.skillFxPatched = true;
      control.skillFxPatchedProto = 'multi:' + String(patchedCount);
    }
  };

  const ensureSkillPulseFallback = () => {
    if (!window.roulette || typeof window.roulette._updateMarbles !== 'function') {
      return;
    }
    if (control.skillPulseFallbackPatched === true) {
      return;
    }
    const originalUpdateMarbles = window.roulette._updateMarbles.bind(window.roulette);
    window.roulette._updateMarbles = function(dt) {
      const result = originalUpdateMarbles(dt);
      const effects = Array.isArray(window.roulette && window.roulette._effects)
        ? window.roulette._effects
        : [];
      effects.forEach((effect) => {
        if (!effect || typeof effect !== 'object') {
          return;
        }
        if (effect.__appSkillPulseMade === true) {
          return;
        }
        const px = Number(effect.position && effect.position.x);
        const py = Number(effect.position && effect.position.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          return;
        }
        effect.__appSkillPulseMade = true;
        if (typeof pushPulse === 'function') {
          pushPulse(
            px,
            py,
            Math.max(0.92, Number(effect._size) || 1.1),
            620,
            'skill',
          );
        }
      });
      return result;
    };
    control.skillPulseFallbackPatched = true;
  };

  const patchMarbleRender = () => {
    if (control.marbleRenderPatched) {
      return;
    }
    if (!window.roulette || !Array.isArray(window.roulette._marbles) || window.roulette._marbles.length === 0) {
      return;
    }
    const marbleSample = window.roulette._marbles[0];
    if (!marbleSample) {
      return;
    }
    const proto = Object.getPrototypeOf(marbleSample);
    if (!proto || typeof proto._renderNormal !== 'function') {
      return;
    }
    const originalRenderNormal = proto._renderNormal;
    proto._renderNormal = function(ctx, zoom, outline, skin) {
      if (!skin) {
        return originalRenderNormal.call(this, ctx, zoom, outline, skin);
      }

      const hs = this.size / 2;
      const transform = ctx.getTransform();
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle || 0);
      ctx.beginPath();
      ctx.arc(0, 0, hs, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(skin, -hs, -hs, hs * 2, hs * 2);
      ctx.restore();
      ctx.setTransform(transform);

      if (typeof this._drawName === 'function') {
        this._drawName(ctx, zoom);
      }
      if (outline && typeof this._drawOutline === 'function') {
        this._drawOutline(ctx, 2 / zoom);
      }
    };
    control.marbleRenderPatched = true;
  };

  const ensureCameraZoom = () => {
    if (!window.roulette || !window.roulette._camera) {
      return;
    }
    const camera = window.roulette._camera;
    const patchKey = '__appMinZoomPatched';
    const enforceMinZoom = () => {
      try {
        const current = Number(camera._zoom);
        if (Number.isFinite(current) && current < cameraMinZoom) {
          camera._zoom = cameraMinZoom;
        }
      } catch (_) {
      }
      try {
        const target = Number(camera._targetZoom);
        if (Number.isFinite(target) && target < cameraMinZoom) {
          camera._targetZoom = cameraMinZoom;
        }
      } catch (_) {
      }
      try {
        const applied = Number(camera.zoom);
        if (Number.isFinite(applied) && applied < cameraMinZoom) {
          camera.zoom = cameraMinZoom;
        }
      } catch (_) {
      }
    };
    if (
      camera &&
      camera[patchKey] !== true &&
      typeof camera.initializePosition === 'function'
    ) {
      const originalInitialize = camera.initializePosition.bind(camera);
      camera.initializePosition = function(center, zoom) {
        const requestedZoom = Number(zoom);
        const appliedZoom = Number.isFinite(requestedZoom)
          ? Math.max(cameraMinZoom, requestedZoom)
          : cameraMinZoom;
        return originalInitialize(center, appliedZoom);
      };
      camera[patchKey] = true;
      if (typeof camera.update === 'function') {
        const originalUpdate = camera.update.bind(camera);
        camera.update = function(options) {
          const result = originalUpdate(options);
          enforceMinZoom();
          return result;
        };
      }
      control.cameraZoomPatched = true;
    }
    enforceMinZoom();
  };

  const ensureCameraFollow = (force = false) => {
    if (!window.roulette || !window.roulette._camera) {
      return;
    }
    const running = !!(window.roulette._isRunning === true);
    if (!force && !running) {
      return;
    }
    const camera = window.roulette._camera;
    try {
      if (typeof camera.lock === 'function') {
        camera.lock(false);
      }
    } catch (_) {
    }
    try {
      if (typeof camera.startFollowingMarbles === 'function') {
        camera.startFollowingMarbles();
      }
    } catch (_) {
    }
    if (!force) {
      return;
    }
    try {
      const marbles = Array.isArray(window.roulette._marbles) ? window.roulette._marbles : [];
      if (marbles.length > 0 && typeof camera.setPosition === 'function') {
        const lead = marbles[0];
        const lx = Number(lead && lead.x);
        const ly = Number(lead && lead.y);
        if (Number.isFinite(lx) && Number.isFinite(ly)) {
          camera.setPosition({ x: lx, y: ly });
        }
      }
    } catch (_) {
    }
  };

  const applyCandidates = () => {
    const input = document.querySelector('#in_names');
    if (!input || !candidates.length) {
      return;
    }
    const nextValue = candidates.join('\\n');
    if (input.value !== nextValue) {
      input.value = nextValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    try {
      localStorage.setItem('mbr_names', candidates.join(','));
    } catch (_) {
    }
    const shuffleButton = document.querySelector('#btnShuffle');
    if (shuffleButton && typeof shuffleButton.click === 'function') {
      shuffleButton.click();
    }
  };

  const forceWinningRank = () => {
    const rankInput = document.querySelector('#in_winningRank');
    if (rankInput) {
      rankInput.value = String(targetWinningRank);
      rankInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (window.options && typeof window.options === 'object') {
      window.options.winningRank = targetWinningRank - 1;
    }
    if (window.roulette && typeof window.roulette.setWinningRank === 'function') {
      window.roulette.setWinningRank(targetWinningRank - 1);
    }
  };

  const ensureReady = () => {
    let readyApplied = false;
    if (typeof window.getReady === 'function') {
      try {
        window.getReady();
        readyApplied = true;
      } catch (_) {
      }
    }

    if (
      window.roulette &&
      typeof window.roulette.setMarbles === 'function' &&
      typeof window.roulette.clearMarbles === 'function' &&
      candidates.length
    ) {
      let countAfterReady = -1;
      try {
        if (readyApplied && typeof window.roulette.getCount === 'function') {
          countAfterReady = Number(window.roulette.getCount());
        }
      } catch (_) {
        countAfterReady = -1;
      }

      // Hard fallback: some map/bootstrap states keep count at 0 even after getReady().
      if (!readyApplied || !Number.isFinite(countAfterReady) || countAfterReady <= 0) {
        try {
          window.roulette.setMarbles(candidates.slice());
        } catch (_) {
        }
      }

      try {
        if (typeof window.getReady === 'function') {
          window.getReady();
        }
      } catch (_) {
      }
    }
  };

  const forcePopulateCandidatesHard = () => {
    if (
      !window.roulette ||
      typeof window.roulette.setMarbles !== 'function' ||
      typeof window.roulette.clearMarbles !== 'function' ||
      !Array.isArray(candidates) ||
      candidates.length === 0
    ) {
      return 0;
    }
    control.lastPopulateError = '';

    try {
      const input = document.querySelector('#in_names');
      if (input) {
        input.value = candidates.join('\\n');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_) {
    }
    try {
      localStorage.setItem('mbr_names', candidates.join(','));
    } catch (_) {
    }

    try {
      window.roulette.setMarbles(candidates.slice());
    } catch (error) {
      control.lastPopulateError = '[setMarbles] ' + String(
        error && error.message ? error.message : error,
      );
    }

    try {
      if (typeof window.getReady === 'function') {
        window.getReady();
      }
    } catch (error) {
      if (!control.lastPopulateError) {
        control.lastPopulateError = '[getReady] ' + String(
          error && error.message ? error.message : error,
        );
      }
    }

    try {
      if (typeof window.roulette.getCount === 'function') {
        return Number(window.roulette.getCount()) || 0;
      }
    } catch (_) {
    }
    return 0;
  };

  const resolveCurrentMapIndex = (allowFallback = true) => {
    if (!window.roulette || typeof window.roulette.getMaps !== 'function') {
      return -1;
    }
    const maps = window.roulette.getMaps();
    if (!Array.isArray(maps) || maps.length === 0) {
      return -1;
    }
    const stageTitle =
      window.roulette._stage && typeof window.roulette._stage.title === 'string'
        ? window.roulette._stage.title
        : '';
    if (stageTitle) {
      const matched = maps.find(
        (entry) =>
          entry &&
          typeof entry.title === 'string' &&
          entry.title === stageTitle,
      );
      const idx = Number(matched && matched.index);
      if (Number.isFinite(idx)) {
        return idx;
      }
    }
    return allowFallback && Number.isFinite(control.lastMapIndex)
      ? control.lastMapIndex
      : -1;
  };

  const isFixedMapStillApplied = () => {
    if (!window.roulette || String(control.mapPresetCode || '') !== 'FIXED') {
      return false;
    }
    const stageTitle =
      window.roulette._stage && typeof window.roulette._stage.title === 'string'
        ? window.roulette._stage.title
        : '';
    const expectedTitle = String(control.fixedMapTitle || '');
    const expectedIndex = Number(control.fixedMapIndex);
    if (stageTitle && expectedTitle && stageTitle !== expectedTitle) {
      return false;
    }
    if (
      Number.isFinite(expectedIndex) &&
      typeof window.roulette.getMaps === 'function' &&
      stageTitle
    ) {
      const maps = window.roulette.getMaps();
      if (Array.isArray(maps) && maps.length > 0) {
        const matched = maps.find(
          (entry) =>
            entry &&
            typeof entry.title === 'string' &&
            entry.title === stageTitle,
        );
        const idx = Number(matched && matched.index);
        if (Number.isFinite(idx)) {
          return idx === expectedIndex;
        }
      }
    }
    return !!stageTitle;
  };

  const randomizeMapLayout = () => {
    control.mapReady = false;
    control.lastMapLayoutError = '';
    control.boundaryMask = null;
    control.bombTraps = [];
    control.bombPulses = [];
    control.launchChamber = null;
    control.mapPresetCode = '';
    control.map5SpawnAligned = false;
    control.mapLabel = '';
    control.finishLine = null;
    if (!window.roulette || typeof window.roulette.getMaps !== 'function') {
      return false;
    }

    const maps = window.roulette.getMaps();
    if (!Array.isArray(maps) || maps.length === 0) {
      return false;
    }

    // Fixed-map mode for maps 1~4 only.
    const fixedMaps = maps
      .filter((entry) => Number.isFinite(Number(entry && entry.index)))
      .slice()
      .sort((a, b) => Number(a && a.index) - Number(b && b.index));
    if (fixedMaps.length === 0) {
      return false;
    }
    const normalizeRequestedSlot = (rawIndex) => {
      const parsed = Number(rawIndex);
      if (!Number.isFinite(parsed)) {
        return -1;
      }
      const index = Math.floor(parsed);
      if (index >= 1 && index <= 4) {
        return index; // one-based input
      }
      if (index === 5) {
        return 4; // map5 removed -> map4 fallback
      }
      if (index >= 0 && index < 4) {
        return index + 1; // zero-based input
      }
      if (index === 4) {
        return 4; // zero-based map5 input -> map4 fallback
      }
      return -1;
    };
    const fixedRequestedMap = normalizeRequestedSlot(selectedMapIndex);
    const fixedRequestedMapSafe = fixedRequestedMap;
    const requestedMapToken = 'raw:' + String(selectedMapIndex);
    control.requestedMapToken = requestedMapToken;
    control.requestedMapSlot = fixedRequestedMapSafe;
    if (fixedRequestedMapSafe < 1 || fixedRequestedMapSafe > 4) {
      control.lastMapLayoutError = 'invalid requested map slot: ' + String(selectedMapIndex);
      return false;
    }

    const normalizeHalfTurnRotation = (value) => {
      const raw = Number(value);
      if (!Number.isFinite(raw)) {
        return 0;
      }
      const halfTurn = Math.PI;
      let wrapped = raw % halfTurn;
      if (wrapped < 0) {
        wrapped += halfTurn;
      }
      if (wrapped > halfTurn / 2) {
        wrapped = halfTurn - wrapped;
      }
      return Math.abs(wrapped);
    };

    const scaleFixedTrapShapes = (stage) => {
      if (!stage || !Array.isArray(stage.entities)) {
        return { diamondCount: 0, diagonalCount: 0 };
      }
      let diamondCount = 0;
      let diagonalCount = 0;
      stage.entities.forEach((entity) => {
        if (
          !entity ||
          entity.type !== 'static' ||
          !entity.shape ||
          entity.shape.type !== 'box'
        ) {
          return;
        }
        const width = Math.abs(Number(entity.shape.width));
        const height = Math.abs(Number(entity.shape.height));
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          return;
        }
        const major = Math.max(width, height);
        const minor = Math.min(width, height);
        if (!Number.isFinite(major) || !Number.isFinite(minor) || minor <= 0) {
          return;
        }
        const ratio = major / minor;
        const tilt = normalizeHalfTurnRotation(entity.shape.rotation);

        const isDiamondTrap =
          ratio <= 1.3 &&
          major <= 1.9 &&
          tilt >= 0.34 &&
          tilt <= 1.24;
        if (isDiamondTrap) {
          const scaledWidth = width * diamondTrapScale;
          const scaledHeight = height * diamondTrapScale;
          entity.shape.width = scaledWidth;
          entity.shape.height = scaledHeight;
          const baseXRaw = Number(
            entity.position && Number.isFinite(Number(entity.position.x))
              ? entity.position.x
              : entity.x,
          );
          const baseYRaw = Number(
            entity.position && Number.isFinite(Number(entity.position.y))
              ? entity.position.y
              : entity.y,
          );
          const baseX = Number.isFinite(baseXRaw) ? baseXRaw : 0;
          const baseY = Number.isFinite(baseYRaw) ? baseYRaw : 0;
          const swingAmp = Math.max(0.18, Math.max(scaledWidth, scaledHeight));
          const swingSeed = diamondCount + 1;
          entity.type = 'kinematic';
          if (!entity.props || typeof entity.props !== 'object') {
            entity.props = {};
          }
          if (!Number.isFinite(Number(entity.props.density))) {
            entity.props.density = 1;
          }
          entity.props.angularVelocity = 0;
          entity.__appDiamondSwing = true;
          entity.__appDiamondBaseX = baseX;
          entity.__appDiamondBaseY = baseY;
          entity.__appDiamondAmp = swingAmp;
          entity.__appDiamondOmega = 0.86 + ((swingSeed % 7) * 0.21);
          entity.__appDiamondPhase =
            (swingSeed * 1.61803398875) % (Math.PI * 2);
          diamondCount += 1;
          return;
        }

        const isDiagonalBarTrap =
          ratio >= 2.1 &&
          major <= 6.6 &&
          tilt >= 0.12 &&
          tilt <= 1.32;
        if (isDiagonalBarTrap) {
          entity.shape.width = width * diagonalBarTrapScale;
          entity.shape.height = height * diagonalBarTrapScale;
          diagonalCount += 1;
        }
      });
      return { diamondCount, diagonalCount };
    };

    if (fixedRequestedMapSafe >= 1) {
      const fixedSlotIndex = fixedRequestedMapSafe > 0
        ? Math.min(fixedMaps.length - 1, Math.max(0, fixedRequestedMapSafe - 1))
        : 0;
      const fixedEntry = fixedMaps[fixedSlotIndex];
      const fixedSlot = fixedSlotIndex + 1;
      const fixedTitle =
        fixedEntry && typeof fixedEntry.title === 'string' && fixedEntry.title.trim()
          ? fixedEntry.title.trim()
          : ('MAP_' + String(fixedSlot));
      const fixedMapIndex = Number(fixedEntry && fixedEntry.index);
      if (Number.isFinite(fixedMapIndex) && typeof window.roulette.setMap === 'function') {
        try {
          window.roulette.setMap(fixedMapIndex);
        } catch (_) {
        }
      }
      const fixedStage = window.roulette && window.roulette._stage
        ? window.roulette._stage
        : null;
      if (!fixedStage || !Array.isArray(fixedStage.entities)) {
        return false;
      }
      const fixedGoalY = typeof fixedStage.goalY === 'number' ? fixedStage.goalY : 110;
      control.m3BigDiamondEntityId = null;
      control.map3SkillLockUntil = 0;
      if (fixedSlot === 3) {
        let maxEntityId = 0;
        fixedStage.entities.forEach((entity) => {
          const entityId = Number(entity && entity.id);
          if (Number.isFinite(entityId) && entityId > maxEntityId) {
            maxEntityId = entityId;
          }
        });
        fixedStage.entities = fixedStage.entities.filter(
          (entity) =>
            !entity ||
            (
              entity.__appM3BigDiamond !== true &&
              entity.__appM3MidRotor !== true &&
              entity.__appM3DoubleBumper !== 'OUTER' &&
              entity.__appM3DoubleBumper !== 'INNER'
            ),
        );
        const hasM3StartDiamond = fixedStage.entities.some(
          (entity) => entity && entity.__appM3GateDiamond === 'START',
        );
        const hasM3EndDiamond = fixedStage.entities.some(
          (entity) => entity && entity.__appM3GateDiamond === 'END',
        );
        const hasM3Left80Diamond = fixedStage.entities.some(
          (entity) => entity && entity.__appM3GateDiamond === 'LEFT80',
        );
        const hasM3Right80Diamond = fixedStage.entities.some(
          (entity) => entity && entity.__appM3GateDiamond === 'RIGHT80',
        );
        const hasM3DoubleBumperOuter = fixedStage.entities.some(
          (entity) => entity && entity.__appM3DoubleBumper === 'OUTER',
        );
        const hasM3DoubleBumperInner = fixedStage.entities.some(
          (entity) => entity && entity.__appM3DoubleBumper === 'INNER',
        );
        const shouldAddM3DoubleBumper = candidates.length >= 20;
        const m3DoubleBumperHpScale = candidates.length >= 50 ? 2 : 1;
        control.m3BigDiamondEntityId = null;
        if (!hasM3StartDiamond) {
          const startDiamondId = maxEntityId + 1000;
          fixedStage.entities.push({
            id: startDiamondId,
            type: 'static',
            position: { x: 10.64, y: 84.0 },
            x: 10.64,
            y: 84.0,
            shape: {
              type: 'box',
              width: 1.296,
              height: 1.296,
              rotation: Math.PI * 0.25,
            },
            props: {
              density: 1,
              restitution: 0.4608,
              angularVelocity: 0,
            },
            __appM3GateDiamond: 'START',
          });
          maxEntityId = startDiamondId;
        }
        if (!hasM3EndDiamond) {
          const endDiamondId = maxEntityId + 1;
          fixedStage.entities.push({
            id: endDiamondId,
            type: 'static',
            position: { x: 15.11, y: 84.0 },
            x: 15.11,
            y: 84.0,
            shape: {
              type: 'box',
              width: 1.296,
              height: 1.296,
              rotation: Math.PI * 0.25,
            },
            props: {
              density: 1,
              restitution: 0.4608,
              angularVelocity: 0,
            },
            __appM3GateDiamond: 'END',
          });
          maxEntityId = endDiamondId;
        }
        if (!hasM3Left80Diamond) {
          const left80DiamondId = maxEntityId + 1;
          fixedStage.entities.push({
            id: left80DiamondId,
            type: 'static',
            position: { x: 7.45, y: 80.0 },
            x: 7.45,
            y: 80.0,
            shape: {
              type: 'box',
              width: 1.296,
              height: 1.296,
              rotation: Math.PI * 0.25,
            },
            props: {
              density: 1,
              restitution: 0.57,
              angularVelocity: 0,
            },
            __appM3GateDiamond: 'LEFT80',
          });
          maxEntityId = left80DiamondId;
        }
        if (!hasM3Right80Diamond) {
          const right80DiamondId = maxEntityId + 1;
          fixedStage.entities.push({
            id: right80DiamondId,
            type: 'static',
            position: { x: 18.35, y: 80.0 },
            x: 18.35,
            y: 80.0,
            shape: {
              type: 'box',
              width: 1.296,
              height: 1.296,
              rotation: Math.PI * 0.25,
            },
            props: {
              density: 1,
              restitution: 0.57,
              angularVelocity: 0,
            },
            __appM3GateDiamond: 'RIGHT80',
          });
          maxEntityId = right80DiamondId;
        }
        if (shouldAddM3DoubleBumper && !hasM3DoubleBumperOuter) {
          const outerBumperId = maxEntityId + 1;
          fixedStage.entities.push({
            id: outerBumperId,
            type: 'static',
            position: { x: 13.0, y: 90.0 },
            x: 13.0,
            y: 90.0,
            shape: {
              type: 'circle',
              radius: 0.72,
              rotation: 0,
              color: '#00f4ff',
            },
            props: {
              density: 1,
              angularVelocity: 0,
              restitution: 0.42,
            },
            __appM3DoubleBumper: 'OUTER',
            __appBurstBumper: true,
            __appBurstId: 'map3-double-burst-outer',
            __appBurstHp: 2 * m3DoubleBumperHpScale,
            __appBurstCooldownMs: 220,
            __appBurstArmDelayMs: 90,
            __appBurstTriggerRadius: 1.26,
            __appBurstBlastRadius: 3.1,
          });
          maxEntityId = outerBumperId;
        }
        if (shouldAddM3DoubleBumper && !hasM3DoubleBumperInner) {
          const innerBumperId = maxEntityId + 1;
          fixedStage.entities.push({
            id: innerBumperId,
            type: 'static',
            position: { x: 13.0, y: 90.0 },
            x: 13.0,
            y: 90.0,
            shape: {
              type: 'circle',
              radius: 0.42,
              rotation: 0,
              color: '#7cf9ff',
            },
            props: {
              density: 1,
              angularVelocity: 0,
              restitution: 0.42,
            },
            __appM3DoubleBumper: 'INNER',
            __appBurstBumper: true,
            __appBurstId: 'map3-double-burst-inner',
            __appBurstHp: 1 * m3DoubleBumperHpScale,
            __appBurstCooldownMs: 140,
            __appBurstArmDelayMs: 50,
            __appBurstTriggerRadius: 1.28,
            __appBurstBlastRadius: 2.7,
          });
          maxEntityId = innerBumperId;
        }
        const hasM3UpperLeftRotor = fixedStage.entities.some(
          (entity) => entity && entity.__appM3UpperRotor === 'L',
        );
        const hasM3UpperRightRotor = fixedStage.entities.some(
          (entity) => entity && entity.__appM3UpperRotor === 'R',
        );
        const hasM3GuideWall = fixedStage.entities.some(
          (entity) => entity && entity.__appM3GuideWall === true,
        );
        if (!hasM3UpperLeftRotor) {
          const leftRotorId = maxEntityId + 1;
          fixedStage.entities.push({
            id: leftRotorId,
            type: 'kinematic',
            position: { x: 4.56, y: 37.06 },
            x: 4.56,
            y: 37.06,
            shape: {
              type: 'box',
              width: 0.92,
              height: 0.1,
              rotation: 0.44,
            },
            props: {
              density: 1,
              restitution: 0.74,
              angularVelocity: 7.2,
            },
            __appM3UpperRotor: 'L',
          });
          maxEntityId = leftRotorId;
        }
        if (!hasM3UpperRightRotor) {
          const rightRotorId = maxEntityId + 1;
          fixedStage.entities.push({
            id: rightRotorId,
            type: 'kinematic',
            position: { x: 21.36, y: 37.01 },
            x: 21.36,
            y: 37.01,
            shape: {
              type: 'box',
              width: 0.92,
              height: 0.1,
              rotation: -0.44,
            },
            props: {
              density: 1,
              restitution: 0.74,
              angularVelocity: -7.2,
            },
            __appM3UpperRotor: 'R',
          });
          maxEntityId = rightRotorId;
        }
        if (!hasM3GuideWall) {
          const guideWallId = maxEntityId + 1;
          fixedStage.entities.push({
            id: guideWallId,
            type: 'static',
            position: { x: 0, y: 0 },
            x: 0,
            y: 0,
            shape: {
              type: 'polyline',
              rotation: 0,
              points: [
                [11.0, 70.0],
                [13.0, 68.5],
                [15.0, 70.0],
              ],
              color: '#8ea3bb',
            },
            props: {
              density: 1,
              angularVelocity: 0,
              restitution: 0.06,
            },
            __appM3GuideWall: true,
          });
        }
      }
      if (fixedSlot === 2) {
        const m2Circles = fixedStage.entities
          .map((entity) => {
            if (
              !entity ||
              entity.type !== 'static' ||
              !entity.shape ||
              entity.shape.type !== 'circle'
            ) {
              return null;
            }
            const x = Number(
              entity.position && Number.isFinite(Number(entity.position.x))
                ? entity.position.x
                : entity.x,
            );
            const y = Number(
              entity.position && Number.isFinite(Number(entity.position.y))
                ? entity.position.y
                : entity.y,
            );
            const radius = Math.abs(Number(entity.shape.radius));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0.16) {
              return null;
            }
            const life = Number(entity.props && entity.props.life);
            return {
              entity,
              x,
              y,
              radius,
              life: Number.isFinite(life) ? life : 0,
            };
          })
          .filter((entry) => !!entry);
        const m2BurstTargets = m2Circles.filter((entry) => {
          const nearCenter = Math.abs(entry.x - 12.5) <= 1.2 && Math.abs(entry.y - 80.0) <= 3.2;
          const nearLeft = Math.abs(entry.x - 10.5) <= 1.0 && Math.abs(entry.y - 77.4) <= 2.6;
          const nearRight = Math.abs(entry.x - 14.5) <= 1.0 && Math.abs(entry.y - 77.4) <= 2.6;
          return nearCenter || nearLeft || nearRight;
        });
        m2BurstTargets
          .slice()
          .sort((a, b) => b.radius - a.radius)
          .forEach((entry, index) => {
            const entity = entry.entity;
            const radius = Math.max(0.16, entry.radius);
            if (!entity.props || typeof entity.props !== 'object') {
              entity.props = { density: 1, angularVelocity: 0, restitution: 0.42 };
            }
            if (!Number.isFinite(Number(entity.props.density))) {
              entity.props.density = 1;
            }
            if (!Number.isFinite(Number(entity.props.angularVelocity))) {
              entity.props.angularVelocity = 0;
            }
            if (!Number.isFinite(Number(entity.props.restitution))) {
              entity.props.restitution = 0.42;
            }
            entity.__appM2Burst = true;
            entity.__appBurstBumper = true;
            entity.__appBurstId = 'map2-burst-' + String(index + 1);
            entity.__appBurstHp = Math.max(1, Math.round(Math.max(1, entry.life)) + Math.round(radius / 0.42));
            entity.__appBurstCooldownMs = 220 + (index % 3) * 30;
            entity.__appBurstArmDelayMs = 90 + (index % 2) * 25;
            entity.__appBurstTriggerRadius = Math.max(0.72, radius * 1.9);
            entity.__appBurstBlastRadius = Math.max(2.2, radius * 4.2);
          });
      }
      const fixedTitleUpper = String(fixedTitle || '').toUpperCase();
      const isWheelOfFortuneMap =
        fixedTitleUpper.includes('WHEEL') ||
        fixedTitleUpper.includes('FORTUNE') ||
        fixedTitleUpper.includes('휠');
      if (isWheelOfFortuneMap) {
        fixedStage.entities.forEach((entity) => {
          if (
            !entity ||
            entity.type !== 'kinematic' ||
            !entity.shape ||
            entity.shape.type !== 'box'
          ) {
            return;
          }
          const width = Math.abs(Number(entity.shape.width));
          const rot = Number(entity.shape.rotation);
          const y = Number(
            entity.position && Number.isFinite(Number(entity.position.y))
              ? entity.position.y
              : entity.y,
          );
          const absRot = Math.abs(rot);
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(rot) ||
            !Number.isFinite(y) ||
            width < 2.2 ||
            y < fixedGoalY - 18 ||
            absRot < 0.18 ||
            absRot > 0.72
          ) {
            return;
          }
          entity.shape.rotation = rot >= 0 ? 0.78539816339 : -0.78539816339;
        });
      }
      control.trapScaleSummary = { diamondCount: 0, diagonalCount: 0 };
      let fixedFinishX = 13.7;
      let fixedFinishY = fixedGoalY - 3.2;
      if (fixedSlot === 1) {
        fixedFinishX = 15.5;
        fixedFinishY = 110;
      } else if (fixedSlot === 2) {
        fixedFinishX = 12.5;
        fixedFinishY = 83.5;
      } else if (fixedSlot === 3) {
        fixedFinishX = 13.0;
        fixedFinishY = 110;
      } else if (fixedSlot === 4) {
        fixedFinishX = 11.5;
        fixedFinishY = 230;
      }
      control.finishLine = {
        x: fixedFinishX,
        y: fixedFinishY,
        width: 5.2,
        height: 0.95,
      };
      control.boundaryMask = null;
      const fixedToInt = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? Math.floor(num) : fallback;
      };
      control.bombTraps = fixedStage.entities
        .map((entity, index) => ({ entity, index }))
        .filter(
          ({ entity }) =>
            entity &&
            (entity.__appBomb === true || entity.__appBurstBumper === true) &&
            entity.shape &&
            entity.shape.type === 'circle' &&
            entity.position,
        )
        .map(({ entity, index }) => ({
          kind: entity.__appBurstBumper === true ? 'burst' : 'bomb',
          id: entity.__appBurstBumper === true
            ? (typeof entity.__appBurstId === 'string' && entity.__appBurstId
              ? entity.__appBurstId
              : 'fixed-burst-fallback-' + index)
            : (typeof entity.__appBombId === 'string' && entity.__appBombId
              ? entity.__appBombId
              : 'fixed-bomb-fallback-' + index),
          x: Number(entity.position.x) || 0,
          y: Number(entity.position.y) || 0,
          radius: Math.max(0.1, Number(entity.shape.radius) || 0.18),
          baseRadius: Math.max(0.1, Number(entity.shape.radius) || 0.18),
          entityRef: entity,
          triggerRadius: entity.__appBurstBumper === true
            ? Math.max(0.24, Number(entity.__appBurstTriggerRadius) || 0.36)
            : Math.max(0.26, Number(entity.__appBombTriggerRadius) || 0.42),
          blastRadius: entity.__appBurstBumper === true
            ? Math.max(1.8, Number(entity.__appBurstBlastRadius) || 2.6)
            : Math.max(1.8, Number(entity.__appBombBlastRadius) || 3.1),
          cooldownMs: entity.__appBurstBumper === true
            ? Math.max(260, Number(entity.__appBurstCooldownMs) || 560)
            : Math.max(900, Number(entity.__appBombCooldownMs) || 2400),
          armDelayMs: entity.__appBurstBumper === true
            ? Math.max(180, Number(entity.__appBurstArmDelayMs) || 420)
            : Math.max(350, Number(entity.__appBombArmDelayMs) || 900),
          hitPoints: entity.__appBurstBumper === true
            ? Math.max(1, fixedToInt(entity.__appBurstHp, 3))
            : 1,
          hitsLeft: entity.__appBurstBumper === true
            ? Math.max(1, fixedToInt(entity.__appBurstHp, 3))
            : 1,
          spawnedAt: Date.now(),
          lastTriggeredAt: -1,
          destroyed: false,
        }));
      control.bombPulses = [];
      control.launchChamber = null;
      if (typeof window.roulette.reset === 'function') {
        try {
          window.roulette.reset();
        } catch (_) {
        }
      }
      control.lastMapIndex = Number.isFinite(fixedMapIndex) ? fixedMapIndex : -1;
      control.lastVariantSignature = 'fixed|' + String(control.lastMapIndex);
      control.mapVariantId = 'fixed-m' + String(fixedSlot) + '-i' + String(control.lastMapIndex);
      control.mapLabel = 'M' + String(fixedSlot) + '-' + fixedTitle;
      control.mapPresetCode = 'FIXED';
      control.fixedMapIndex = Number.isFinite(fixedMapIndex) ? fixedMapIndex : -1;
      control.fixedMapTitle = fixedTitle;
      control.map5SpawnAligned = false;
      control.mapReady = true;
      return true;
    }

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    // Preset-only mode: no random map mutation/validation.
    const pToInt = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? Math.floor(num) : fallback;
    };
    const pLerp = (a, b, t) => a + (b - a) * t;
    const pSampleAnchors = (anchors, t) => {
      if (!Array.isArray(anchors) || anchors.length === 0) {
        return 0;
      }
      if (anchors.length === 1) {
        return Number(anchors[0]) || 0;
      }
      const n = anchors.length - 1;
      const pos = clamp(t, 0, 1) * n;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const left = Number(anchors[idx]) || 0;
      const right = Number(anchors[Math.min(n, idx + 1)]) || 0;
      return pLerp(left, right, frac);
    };
    const pClone = (target) => {
      try {
        return JSON.parse(JSON.stringify(target));
      } catch (_) {
        return null;
      }
    };
    const pSaw = (value) => {
      const wrapped = value - Math.floor(value);
      return wrapped < 0.5 ? wrapped * 2 : (1 - wrapped) * 2;
    };
    const basePresetConfigs = [
      { code: 'CANYON_FLOW', center: [0.3, -0.5, 0.4, -0.3, 0.1], width: [13.5, 13.0, 12.5, 11.0, 6.0], rows: 10, style: 'canyon', bombEvery: 0, bumperEvery: 1, splitEvery: 3, centerEvery: 3, goalGap: 5.2, waveAmp: 0.4, waveFreq: 1.4, wiggleAmp: 0.12, widthAmp: 0.45, trapOpen: 0.62, burstEvery: 4, diamondEvery: 0, slowEvery: 0, scatterEvery: 3, rotorEvery: 0, wallBounceEvery: 3 },
      { code: 'BUMPER_PARK', center: [0.2, -0.3, 0.1, -0.2, 0.0], width: [13.8, 13.2, 12.8, 11.5, 6.5], rows: 9, style: 'bumper_garden', bombEvery: 0, bumperEvery: 1, splitEvery: 0, centerEvery: 2, goalGap: 5.5, waveAmp: 0.3, waveFreq: 1.2, wiggleAmp: 0.08, widthAmp: 0.35, trapOpen: 0.65, burstEvery: 2, diamondEvery: 0, slowEvery: 0, scatterEvery: 2, rotorEvery: 3, wallBounceEvery: 2 },
      { code: 'RIBBON_S', center: [0.6, 1.9, -1.9, 1.6, -0.6], width: [12.8, 11.6, 10.2, 8.2, 5.3], rows: 11, style: 'weave', bombEvery: 5, bumperEvery: 2, splitEvery: 2, centerEvery: 3, goalGap: 4.8, waveAmp: 0.8, waveFreq: 2.2, wiggleAmp: 0.35, widthAmp: 0.4, trapOpen: 0.54, burstEvery: 6, diamondEvery: 4, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'CROWN_PEAK', center: [-1.2, 2.0, -1.8, 1.5, -0.8], width: [12.8, 10.8, 9.0, 7.8, 5.0], rows: 12, style: 'crown', bombEvery: 3, bumperEvery: 2, splitEvery: 2, centerEvery: 2, goalGap: 4.5, waveAmp: 0.85, waveFreq: 2.4, wiggleAmp: 0.28, widthAmp: 0.35, trapOpen: 0.56, burstEvery: 3, diamondEvery: 3, slowEvery: 0, scatterEvery: 2, rotorEvery: 0, wallBounceEvery: 2 },
      { code: 'CROWN_ARC', center: [-0.8, 1.8, -0.1, 1.6, -1.1], width: [12.9, 11.5, 9.5, 7.4, 4.8], rows: 13, style: 'crown', bombEvery: 4, bumperEvery: 2, splitEvery: 2, centerEvery: 2, goalGap: 4.2, waveAmp: 0.92, waveFreq: 2.7, wiggleAmp: 0.34, widthAmp: 0.29, trapOpen: 0.46, burstEvery: 4, diamondEvery: 3, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'WAVE_SWL', center: [-2.0, -0.4, 1.7, -0.5, -1.2], width: [12.4, 11.2, 9.9, 7.8, 5.1], rows: 12, style: 'wave', bombEvery: 0, bumperEvery: 2, splitEvery: 2, centerEvery: 3, goalGap: 4.6, waveAmp: 1.02, waveFreq: 3.0, wiggleAmp: 0.27, widthAmp: 0.32, trapOpen: 0.53, burstEvery: 5, diamondEvery: 3, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'WAVE_SWR', center: [2.0, 0.4, -1.7, 0.5, 1.2], width: [12.4, 11.2, 9.9, 7.8, 5.1], rows: 12, style: 'wave_inv', bombEvery: 0, bumperEvery: 2, splitEvery: 2, centerEvery: 3, goalGap: 4.6, waveAmp: 1.02, waveFreq: 3.0, wiggleAmp: 0.27, widthAmp: 0.32, trapOpen: 0.53, burstEvery: 5, diamondEvery: 3, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'RING_SPL', center: [0.1, 1.2, -1.3, 1.0, -0.3], width: [12.0, 10.8, 9.1, 7.1, 4.5], rows: 12, style: 'ring', bombEvery: 4, bumperEvery: 1, splitEvery: 2, centerEvery: 2, goalGap: 4.1, waveAmp: 0.68, waveFreq: 2.4, wiggleAmp: 0.24, widthAmp: 0.21, trapOpen: 0.45, burstEvery: 3, diamondEvery: 2, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'BOMB_STRM', center: [-1.0, 1.2, -1.1, 1.4, -0.8], width: [11.9, 10.6, 9.2, 7.1, 4.4], rows: 12, style: 'bomb_lane', bombEvery: 2, bumperEvery: 3, splitEvery: 2, centerEvery: 3, goalGap: 4.2, waveAmp: 0.64, waveFreq: 2.3, wiggleAmp: 0.18, widthAmp: 0.2, trapOpen: 0.46, burstEvery: 0, diamondEvery: 2, slowEvery: 0, scatterEvery: 1, rotorEvery: 0 },
      { code: 'BUMPER_FD', center: [0.9, -1.4, 1.3, -1.1, 0.7], width: [12.5, 11.2, 9.8, 7.9, 5.0], rows: 11, style: 'bumper_garden', bombEvery: 0, bumperEvery: 1, splitEvery: 2, centerEvery: 2, goalGap: 4.8, waveAmp: 0.78, waveFreq: 2.1, wiggleAmp: 0.2, widthAmp: 0.33, trapOpen: 0.57, burstEvery: 3, diamondEvery: 0, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'ZIG_DNS2', center: [-2.1, 2.0, -1.9, 1.6, -1.2], width: [11.8, 10.2, 8.7, 6.8, 4.3], rows: 14, style: 'zigzag_shift', bombEvery: 5, bumperEvery: 2, splitEvery: 1, centerEvery: 2, goalGap: 4.0, waveAmp: 0.98, waveFreq: 3.2, wiggleAmp: 0.42, widthAmp: 0.25, trapOpen: 0.44, burstEvery: 3, diamondEvery: 2, slowEvery: 0, scatterEvery: 1, rotorEvery: 0 },
      { code: 'SWITCH_X', center: [-0.5, 1.8, -1.9, 1.9, -0.4], width: [12.2, 10.9, 9.5, 7.4, 4.7], rows: 13, style: 'switchback', bombEvery: 4, bumperEvery: 2, splitEvery: 2, centerEvery: 1, goalGap: 4.3, waveAmp: 0.84, waveFreq: 2.9, wiggleAmp: 0.31, widthAmp: 0.24, trapOpen: 0.47, burstEvery: 4, diamondEvery: 2, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'SPLIT_TRI', center: [1.1, -1.1, 1.4, -1.2, 0.2], width: [12.7, 11.2, 9.4, 7.0, 4.4], rows: 12, style: 'splitter', bombEvery: 3, bumperEvery: 2, splitEvery: 1, centerEvery: 3, goalGap: 4.1, waveAmp: 0.73, waveFreq: 2.5, wiggleAmp: 0.3, widthAmp: 0.31, trapOpen: 0.48, burstEvery: 3, diamondEvery: 2, slowEvery: 0, scatterEvery: 2, rotorEvery: 0 },
      { code: 'OVERLORD', center: [-1.8, 1.8, -1.5, 1.8, -1.0], width: [11.6, 10.0, 8.7, 6.6, 4.0], rows: 15, style: 'boss', bombEvery: 2, bumperEvery: 1, splitEvery: 1, centerEvery: 1, goalGap: 3.8, waveAmp: 1.04, waveFreq: 3.3, wiggleAmp: 0.48, widthAmp: 0.2, trapOpen: 0.42, burstEvery: 2, diamondEvery: 1, slowEvery: 0, scatterEvery: 1, rotorEvery: 0 },
    ];
    const styleModes = [
      'helix',
      'spiral',
      'sawtooth',
      'canyon',
      'maze',
      'drift_left',
      'drift_right',
      'reactor',
      'mirror',
      'chaos',
      'trident',
      'snake',
      'orbit',
      'pulse',
      'fork',
    ];
    const remixedPresetConfigs = basePresetConfigs.map((entry, idx) => {
      const rowBoost = idx % 3 === 0 ? 1 : 0;
      const styleSwap = styleModes[idx % styleModes.length];
      return {
        ...entry,
        code: entry.code + '_' + String(styleSwap).toUpperCase(),
        center: entry.center.map((value, i) =>
          value * (i % 2 === 0 ? 1.08 : 0.92) +
          (idx % 2 === 0 ? -0.6 : 0.6) +
          (i - 2) * 0.18,
        ),
        width: entry.width.map((value, i) =>
          clamp(value + (i % 2 === 0 ? 0.9 : -0.7), 7.8, 13.4),
        ),
        rows: Math.min(16, Math.max(10, pToInt(entry.rows, 12) + rowBoost)),
        style: styleSwap,
        goalGap: clamp((Number(entry.goalGap) || 4.4) - 0.2 + (idx % 4) * 0.07, 3.7, 5.1),
        bombEvery: entry.bombEvery > 0 ? Math.max(2, pToInt(entry.bombEvery, 3) - (idx % 2)) : (idx % 3 === 0 ? 4 : 0),
        burstEvery: Math.max(2, pToInt(entry.burstEvery, 3) - (idx % 2)),
        diamondEvery: Math.max(1, pToInt(entry.diamondEvery, 2)),
        slowEvery: idx % 3 === 1 ? 3 : (idx % 4 === 0 ? 4 : 0),
        scatterEvery: Math.max(1, pToInt(entry.scatterEvery, 1)),
        rotorEvery: idx % 4 === 0 ? 4 : (idx % 5 === 0 ? 5 : 0),
        waveAmp: clamp((Number(entry.waveAmp) || 0.7) + 0.22, 0.52, 1.35),
        waveFreq: clamp((Number(entry.waveFreq) || 2.3) + 0.95 + (idx % 4) * 0.25, 2.4, 5.8),
        wiggleAmp: clamp((Number(entry.wiggleAmp) || 0.2) + 0.2, 0.18, 0.85),
        widthAmp: clamp((Number(entry.widthAmp) || 0.22) + 0.18, 0.18, 0.72),
      };
    });
    const presetConfigs = basePresetConfigs
      .concat(remixedPresetConfigs)
      .map((entry, idx) => ({ ...entry, id: idx + 1 }));

    const sourceMaps = fixedMaps
      .slice()
      .sort((a, b) => pToInt(a && a.index) - pToInt(b && b.index));
    if (sourceMaps.length === 0) {
      return false;
    }

    const presetId = 5;
    const preset = presetConfigs[4];
    // Map 5 is a synthetic custom stage; always start from a stable template map.
    const sourceSlotIndex = 0;
    const sourceEntry = sourceMaps[sourceSlotIndex];
    const sourceMapIndex = pToInt(sourceEntry && sourceEntry.index, 0);
    if (Number.isFinite(sourceMapIndex) && sourceMapIndex >= 0 && typeof window.roulette.setMap === 'function') {
      try {
        window.roulette.setMap(sourceMapIndex);
      } catch (_) {
      }
    }

    const baseStage = pClone(window.roulette._stage);
    if (!baseStage || !Array.isArray(baseStage.entities)) {
      return false;
    }
    const goalY = typeof baseStage.goalY === 'number' ? baseStage.goalY : 110;
    const spawnLines = Math.max(1, Math.ceil(Math.max(1, candidates.length) / 10));
    const spawnTopY = 1 - Math.max(0, Math.ceil(spawnLines - 5));
    const defaultSpawnProfile = {
      x: 10.25,
      y: 0,
      columns: 10,
      spacingX: 0.6,
      visibleRows: 5,
    };
    const sourceSpawnRaw =
      baseStage.spawn && typeof baseStage.spawn === 'object'
        ? baseStage.spawn
        : {};
    // Spawn policy (per-map ready): for now maps 1~4 keep same default coordinates.
    if (preset.code !== 'THE_MAZE') {
      baseStage.spawn = {
        x: defaultSpawnProfile.x,
        y: defaultSpawnProfile.y,
        columns: defaultSpawnProfile.columns,
        spacingX: defaultSpawnProfile.spacingX,
        visibleRows: defaultSpawnProfile.visibleRows,
      };
    }

    const pToWorldPoints = (entity) => {
      if (!entity || !entity.shape || !Array.isArray(entity.shape.points)) {
        return [];
      }
      const ox = Number(entity.position && entity.position.x) || 0;
      const oy = Number(entity.position && entity.position.y) || 0;
      return entity.shape.points
        .map((pt) =>
          Array.isArray(pt) && pt.length >= 2
            ? [Number(pt[0]) + ox, Number(pt[1]) + oy]
            : null,
        )
        .filter((pt) => pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
    };
    const pWallStats = (entity) => {
      const pts = pToWorldPoints(entity);
      if (pts.length < 2) {
        return null;
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let sumX = 0;
      pts.forEach((pt) => {
        minX = Math.min(minX, pt[0]);
        maxX = Math.max(maxX, pt[0]);
        minY = Math.min(minY, pt[1]);
        maxY = Math.max(maxY, pt[1]);
        sumX += pt[0];
      });
      return {
        minX,
        maxX,
        minY,
        maxY,
        spanY: maxY - minY,
        spanX: maxX - minX,
        avgX: sumX / pts.length,
      };
    };
    const pFindBoundaryWalls = (entities) => {
      const candidates = [];
      entities.forEach((entity, index) => {
        if (
          !entity ||
          entity.type !== 'static' ||
          !entity.shape ||
          entity.shape.type !== 'polyline'
        ) {
          return;
        }
        const stats = pWallStats(entity);
        if (!stats || stats.spanY < goalY * 0.65 || stats.spanX > 15) {
          return;
        }
        candidates.push({ index, stats });
      });
      if (candidates.length < 2) {
        return null;
      }
      candidates.sort((a, b) => a.stats.avgX - b.stats.avgX);
      return {
        left: candidates[0],
        right: candidates[candidates.length - 1],
      };
    };
    const pIntersectionXsAtY = (entity, yWorld) => {
      const pts = pToWorldPoints(entity);
      const xs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = Number(pts[i][0]);
        const y1 = Number(pts[i][1]);
        const x2 = Number(pts[i + 1][0]);
        const y2 = Number(pts[i + 1][1]);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        if (yWorld < minY || yWorld > maxY) {
          continue;
        }
        const dy = y2 - y1;
        if (Math.abs(dy) < 0.0001) {
          continue;
        }
        const t = (yWorld - y1) / dy;
        xs.push(x1 + (x2 - x1) * t);
      }
      return xs.filter((x) => Number.isFinite(x));
    };
    const pSampleChannelAtY = (leftWall, rightWall, y) => {
      const leftXs = pIntersectionXsAtY(leftWall, y);
      const rightXs = pIntersectionXsAtY(rightWall, y);
      if (leftXs.length === 0 || rightXs.length === 0) {
        return null;
      }
      const left = Math.max(...leftXs);
      const right = Math.min(...rightXs);
      const width = right - left;
      if (!Number.isFinite(width) || width <= 0) {
        return null;
      }
      return { left, right, width, center: (left + right) / 2 };
    };
    const pSetPolylineWorldPoints = (entity, worldPoints) => {
      if (!entity || !entity.shape || !Array.isArray(worldPoints) || worldPoints.length < 2) {
        return;
      }
      if (!entity.position || typeof entity.position !== 'object') {
        entity.position = { x: 0, y: 0 };
      }
      const ox = Number(entity.position.x) || 0;
      const oy = Number(entity.position.y) || 0;
      entity.shape.type = 'polyline';
      entity.shape.points = worldPoints.map((pt) => [pt[0] - ox, pt[1] - oy]);
    };
    const pCreateBomb = (x, y, idSuffix) => ({
      type: 'static',
      position: { x, y },
      props: { density: 1, angularVelocity: 0, restitution: 0.14 },
      shape: { type: 'circle', radius: 0.16, rotation: 0 },
      __appBomb: true,
      __appBombId: 'preset-bomb-' + presetId + '-' + idSuffix,
      __appBombCooldownMs: 2100 + ((idSuffix * 137) % 1000),
      __appBombArmDelayMs: 760 + ((idSuffix * 91) % 620),
      __appBombTriggerRadius: 0.45,
      __appBombBlastRadius: 3.25,
    });
    const pCreateBurstBumper = (x, y, idSuffix, hitPoints) => ({
      type: 'static',
      position: { x, y },
      props: { density: 1, angularVelocity: 0, restitution: 0.42 },
      shape: { type: 'circle', radius: 0.19, rotation: 0 },
      __appBurstBumper: true,
      __appBurstId: 'preset-burst-' + presetId + '-' + idSuffix,
      __appBurstHp: Math.max(1, pToInt(hitPoints, 3)),
      __appBurstCooldownMs: 540 + ((idSuffix * 73) % 240),
      __appBurstArmDelayMs: 380 + ((idSuffix * 49) % 260),
      __appBurstTriggerRadius: 0.36,
      __appBurstBlastRadius: 2.6,
    });
    const pPushDiamond = (traps, x, y, size, tilt = 0, restitution = 0.15) => {
      const arm = clamp(size, 0.42, 0.82);
      const spinSpeed = 2.2 + (Math.sin(x * 3.7 + y * 2.1) + 1) * 1.5;
      const spinDir = Math.sin(x * 1.3 + y * 0.7) > 0 ? 1 : -1;
      traps.push({
        type: 'kinematic',
        position: { x, y },
        props: { density: 1, angularVelocity: spinSpeed * spinDir, restitution: clamp(restitution + 0.15, 0.2, 0.5) },
        shape: { type: 'box', width: arm, height: 0.07, rotation: tilt },
      });
    };
    const pRowNoise = (row, seed) => {
      const raw = Math.sin(row * 12.9898 + seed * 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const pCorridorWarp = (style, t, id) => {
      const phase = id * 0.17;
      const saw = pSaw(t * 7.2 + phase) - 0.5;
      let centerTerm = 0;
      let widthTerm = 0;

      switch (style) {
        case 'zigzag_dense':
          centerTerm = saw * 1.65;
          widthTerm = Math.sin(t * Math.PI * 8.6 + phase) * 0.24;
          break;
        case 'zigzag_shift':
          centerTerm = (pSaw(t * 8.8 + phase) - 0.5) * 1.6 + Math.sin(t * Math.PI * 3.6 + phase) * 0.44;
          widthTerm = -0.08 + Math.cos(t * Math.PI * 6.6 - phase) * 0.18;
          break;
        case 'double_gate':
          centerTerm = Math.sin(t * Math.PI * 4.2 + phase) * 0.72;
          widthTerm = Math.sin(t * Math.PI * 2.6 - phase) * 0.18;
          break;
        case 'weave':
          centerTerm = Math.sin(t * Math.PI * 6.8 + phase) * 0.96;
          widthTerm = Math.sin(t * Math.PI * 3.2 + phase) * 0.26;
          break;
        case 'left_stair':
          centerTerm = -1.05 + t * 1.2;
          widthTerm = -0.05 + Math.sin(t * Math.PI * 1.8) * 0.08;
          break;
        case 'right_stair':
          centerTerm = 1.05 - t * 1.2;
          widthTerm = -0.05 + Math.sin(t * Math.PI * 1.8) * 0.08;
          break;
        case 'crown':
          centerTerm = Math.sin(t * Math.PI * 3.0 + phase) * 0.82;
          widthTerm = (Math.sin(t * Math.PI * 2.0) + 1) * 0.12;
          break;
        case 'wave':
          centerTerm = Math.sin(t * Math.PI * 5.0 + phase) * 1.14;
          widthTerm = Math.cos(t * Math.PI * 2.0 + phase) * 0.16;
          break;
        case 'wave_inv':
          centerTerm = -Math.sin(t * Math.PI * 5.0 + phase) * 1.14;
          widthTerm = Math.cos(t * Math.PI * 2.0 + phase) * 0.16;
          break;
        case 'ring':
          centerTerm = Math.sin(t * Math.PI * 7.8 + phase) * 0.68;
          widthTerm = -Math.abs(Math.sin(t * Math.PI * 4.2 + phase)) * 0.22;
          break;
        case 'bomb_lane':
          centerTerm = Math.sin(t * Math.PI * 2.4 + phase) * 0.52;
          widthTerm = -0.18;
          break;
        case 'bumper_garden':
          centerTerm = Math.sin(t * Math.PI * 3.4 + phase) * 0.44;
          widthTerm = Math.sin(t * Math.PI * 5.8 + phase) * 0.18;
          break;
        case 'switchback':
          centerTerm = Math.sign(Math.sin(t * Math.PI * 6.1 + phase)) * 0.96;
          widthTerm = -0.1 + Math.sin(t * Math.PI * 4.1) * 0.1;
          break;
        case 'splitter':
          centerTerm = Math.sin(t * Math.PI * 4.6 + phase) * 0.62;
          widthTerm = -Math.sin(t * Math.PI * 2.3 + phase) * 0.22;
          break;
        case 'boss':
          centerTerm = Math.sin(t * Math.PI * 8.4 + phase) * 0.88;
          widthTerm = -0.2 + Math.sin(t * Math.PI * 6.4 + phase) * 0.08;
          break;
        case 'helix':
          centerTerm = Math.sin(t * Math.PI * 9.8 + phase) * 1.18;
          widthTerm = Math.sin(t * Math.PI * 8.8 + phase) * 0.22;
          break;
        case 'spiral':
          centerTerm = Math.sin(t * Math.PI * (2.4 + t * 8.0) + phase) * 1.22;
          widthTerm = Math.cos(t * Math.PI * (2.0 + t * 5.2) - phase) * 0.2;
          break;
        case 'sawtooth':
          centerTerm = saw * 1.85;
          widthTerm = -0.14 + (pSaw(t * 10.0 + phase) - 0.5) * 0.2;
          break;
        case 'canyon':
          centerTerm = Math.sin(t * Math.PI * 1.6 + phase) * 0.44;
          widthTerm = Math.sin(t * Math.PI * 2.2 + phase) * 0.42;
          break;
        case 'maze':
          centerTerm = Math.sign(Math.sin(t * Math.PI * 10.0 + phase)) * 0.7;
          widthTerm = (Math.sign(Math.cos(t * Math.PI * 6.0 + phase)) * 0.12);
          break;
        case 'drift_left':
          centerTerm = -1.25 + t * 0.85 + Math.sin(t * Math.PI * 4.2) * 0.22;
          widthTerm = -0.06;
          break;
        case 'drift_right':
          centerTerm = 1.25 - t * 0.85 - Math.sin(t * Math.PI * 4.2) * 0.22;
          widthTerm = -0.06;
          break;
        case 'reactor':
          centerTerm = Math.sin(t * Math.PI * 11.6 + phase) * 0.98;
          widthTerm = -0.16 + Math.sin(t * Math.PI * 9.0 + phase) * 0.14;
          break;
        case 'mirror':
          centerTerm = Math.sin((t < 0.5 ? t : 1 - t) * Math.PI * 8.0 + phase) * 0.94;
          widthTerm = (t < 0.5 ? 1 : -1) * 0.14;
          break;
        case 'chaos':
          centerTerm = (Math.sin(t * Math.PI * 5.2 + phase) + Math.cos(t * Math.PI * 13.0 - phase)) * 0.62;
          widthTerm = (Math.sin(t * Math.PI * 9.4 + phase) - Math.cos(t * Math.PI * 4.1 - phase)) * 0.14;
          break;
        case 'trident':
          centerTerm = Math.sin(t * Math.PI * 5.8 + phase) * 0.56 + Math.sign(Math.sin(t * Math.PI * 2.6 + phase)) * 0.42;
          widthTerm = -Math.abs(Math.sin(t * Math.PI * 3.6 + phase)) * 0.18;
          break;
        case 'snake':
          centerTerm = Math.sin(t * Math.PI * 12.2 + phase) * 0.8;
          widthTerm = Math.cos(t * Math.PI * 6.0 + phase) * 0.16;
          break;
        case 'orbit':
          centerTerm = Math.sin(t * Math.PI * 3.4 + phase) * (0.5 + t * 0.9);
          widthTerm = Math.sin(t * Math.PI * 7.6 + phase) * 0.12;
          break;
        case 'pulse':
          centerTerm = Math.sin(t * Math.PI * 4.8 + phase) * 0.48;
          widthTerm = (Math.sign(Math.sin(t * Math.PI * 9.2 + phase)) * 0.2);
          break;
        case 'fork':
          centerTerm = t < 0.45
            ? -0.8
            : (t < 0.72 ? 0.8 : -0.25);
          widthTerm = -0.12;
          break;
      }
      return { centerTerm, widthTerm };
    };
    const pRelaxCorridor = (leftPts, rightPts, passes = 2) => {
      if (
        !Array.isArray(leftPts) ||
        !Array.isArray(rightPts) ||
        leftPts.length !== rightPts.length ||
        leftPts.length < 3
      ) {
        return;
      }
      const passCount = Math.max(1, pToInt(passes, 2));
      for (let pass = 0; pass < passCount; pass++) {
        const blend = pass === 0 ? 0.42 : 0.28;
        for (let i = 1; i < leftPts.length - 1; i++) {
          const left = Number(leftPts[i][0]);
          const right = Number(rightPts[i][0]);
          if (!Number.isFinite(left) || !Number.isFinite(right)) {
            continue;
          }
          const leftAvg =
            (Number(leftPts[i - 1][0]) + left + Number(leftPts[i + 1][0])) / 3;
          const rightAvg =
            (Number(rightPts[i - 1][0]) + right + Number(rightPts[i + 1][0])) / 3;
          let nextLeft = pLerp(left, leftAvg, blend);
          let nextRight = pLerp(right, rightAvg, blend);
          if (nextRight - nextLeft < 4.9) {
            const add = (4.9 - (nextRight - nextLeft)) / 2;
            nextLeft -= add;
            nextRight += add;
          }
          leftPts[i][0] = clamp(nextLeft, 1.2, 14.8);
          rightPts[i][0] = clamp(nextRight, 15.2, 28.8);
        }
      }
    };
    const pEnforceSpawnEnvelope = (leftPts, rightPts, topY, bottomY) => {
      if (!Array.isArray(leftPts) || !Array.isArray(rightPts) || leftPts.length !== rightPts.length) {
        return;
      }
      const zoneTop = Math.max(topY + 0.8, spawnTopY - 2.4);
      const zoneBottom = Math.min(bottomY - 1.2, spawnTopY + 8.6);
      if (!Number.isFinite(zoneTop) || !Number.isFinite(zoneBottom) || zoneBottom <= zoneTop + 0.4) {
        return;
      }
      const safeMinX = 6.5;
      const safeMaxX = 19.5;
      const safeWidth = 12.6;
      for (let i = 0; i < leftPts.length; i++) {
        const y = Number(leftPts[i][1]);
        if (!Number.isFinite(y)) {
          continue;
        }
        if (y < zoneTop || y > zoneBottom) {
          continue;
        }
        let left = Number(leftPts[i][0]);
        let right = Number(rightPts[i][0]);
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          continue;
        }
        const zoneT = (y - zoneTop) / (zoneBottom - zoneTop);
        const strength = clamp(1 - Math.abs(zoneT - 0.38) * 1.45, 0.2, 1);
        if (left > safeMinX) {
          left = pLerp(left, safeMinX, 0.84 * strength);
        }
        if (right < safeMaxX) {
          right = pLerp(right, safeMaxX, 0.84 * strength);
        }
        const center = (left + right) / 2;
        const shift = (13.0 - center) * 0.62 * strength;
        left += shift;
        right += shift;
        if (right - left < safeWidth) {
          const add = (safeWidth - (right - left)) / 2;
          left -= add;
          right += add;
        }
        left = clamp(left, 0.8, 10.0);
        right = clamp(right, 16.0, 29.2);
        if (right - left < safeWidth) {
          const centerFix = clamp((left + right) / 2, 12.7, 13.3);
          left = centerFix - safeWidth / 2;
          right = centerFix + safeWidth / 2;
        }
        leftPts[i][0] = left;
        rightPts[i][0] = right;
      }
    };

    const pBuildMazeFallbackWalls = () => {
      const fallbackTopY = Math.min(-8.5, spawnTopY - 9.4);
      const fallbackBottomY = Math.max(goalY + 2.4, 114);
      const leftWall = {
        type: 'static',
        position: { x: 0, y: 0 },
        props: { density: 1, angularVelocity: 0, restitution: 0.05 },
        shape: {
          type: 'polyline',
          points: [
            [3.1, fallbackTopY + 1.6],
            [2.9, fallbackTopY + 7.8],
            [2.9, fallbackTopY + 14.8],
            [4.7, fallbackTopY + 16.2],
            [6.9, fallbackTopY + 18.9],
            [9.9, fallbackTopY + 22.0],
            [13.0, fallbackTopY + 24.3],
            [14.9, fallbackTopY + 25.8],
            [12.1, fallbackTopY + 29.6],
            [9.9, fallbackTopY + 36.4],
            [8.7, fallbackTopY + 46.0],
            [8.3, fallbackBottomY - 34.0],
            [8.3, fallbackBottomY - 14.0],
            [10.6, fallbackBottomY - 6.8],
            [13.6, fallbackBottomY - 1.8],
            [14.8, fallbackBottomY + 3.3],
            [14.8, fallbackBottomY + 12.0],
          ],
        },
      };
      const rightWall = {
        type: 'static',
        position: { x: 0, y: 0 },
        props: { density: 1, angularVelocity: 0, restitution: 0.05 },
        shape: {
          type: 'polyline',
          points: [
            [6.2, fallbackTopY + 1.8],
            [6.2, fallbackTopY + 8.0],
            [6.2, fallbackTopY + 14.0],
            [7.4, fallbackTopY + 15.2],
            [9.1, fallbackTopY + 17.8],
            [12.2, fallbackTopY + 20.8],
            [15.8, fallbackTopY + 23.6],
            [19.3, fallbackTopY + 26.2],
            [22.1, fallbackTopY + 30.8],
            [23.7, fallbackTopY + 37.6],
            [24.6, fallbackTopY + 48.0],
            [24.8, fallbackBottomY - 34.0],
            [24.8, fallbackBottomY - 14.0],
            [22.4, fallbackBottomY - 7.0],
            [19.2, fallbackBottomY - 2.0],
            [18.0, fallbackBottomY + 3.0],
            [18.0, fallbackBottomY + 12.0],
          ],
        },
      };
      return { leftWall, rightWall };
    };

    let boundary = pFindBoundaryWalls(baseStage.entities);
    if (preset.code === 'THE_MAZE') {
      // Map 5 must always use a stable outer wall template.
      // Picking boundary walls from source maps can latch onto inner rails.
      const fallbackWalls = pBuildMazeFallbackWalls();
      baseStage.entities = [fallbackWalls.leftWall, fallbackWalls.rightWall];
      const leftStats = pWallStats(fallbackWalls.leftWall);
      const rightStats = pWallStats(fallbackWalls.rightWall);
      if (leftStats && rightStats) {
        boundary = {
          left: { index: 0, stats: leftStats },
          right: { index: 1, stats: rightStats },
        };
      } else {
        boundary = null;
      }
    }

    if (!boundary) {
      return false;
    }

    if (boundary) {
      const leftWall = pClone(baseStage.entities[boundary.left.index]);
      const rightWall = pClone(baseStage.entities[boundary.right.index]);
      if (!leftWall || !rightWall) {
        return false;
      }
      baseStage.entities = [leftWall, rightWall];
      const leftStats = pWallStats(leftWall);
      const rightStats = pWallStats(rightWall);
      if (leftStats && rightStats) {
        const rawTopY = clamp(
          Math.min(leftStats.minY, rightStats.minY) - 2.8,
          -26,
          -1.2,
        );
        const topY = clamp(Math.min(rawTopY, spawnTopY - 5.0), -26, -1.8);
        const bottomY = Math.max(
          goalY + 1.8,
          Math.max(leftStats.maxY, rightStats.maxY) + 0.8,
        );
        const pointCount = 42;
        const isMazePreset = preset.code === 'THE_MAZE';
        const centerBase = isMazePreset ? 12.9 : 15;
        const leftPts = [];
        const rightPts = [];
        for (let i = 0; i < pointCount; i++) {
          const t = i / (pointCount - 1);
          const y = pLerp(topY, bottomY, t);
          const waveAmp = Number(preset.waveAmp) || 0.72;
          const waveFreq = Number(preset.waveFreq) || 2.2;
          const wiggleAmp = Number(preset.wiggleAmp) || 0.16;
          const widthAmp = Number(preset.widthAmp) || 0.24;
          const phase = preset.id * 0.17;
          const warp = pCorridorWarp(preset.style, t, preset.id);
          const microTerm = (pSaw(t * (5.2 + (preset.id % 6) * 0.55) + phase) - 0.5) * 0.22;
          let centerShift =
            pSampleAnchors(preset.center, t) +
            Math.sin(t * Math.PI * (waveFreq + preset.id * 0.05) + phase) * waveAmp +
            Math.sin(t * Math.PI * (waveFreq * 2.4) + preset.id * 0.2) * wiggleAmp +
            warp.centerTerm * (0.92 + (preset.id % 5) * 0.05) +
            microTerm;
          let width =
            pSampleAnchors(preset.width, t) +
            Math.sin(t * Math.PI * (3.2 + preset.id * 0.05) - phase) * widthAmp +
            warp.widthTerm * (1 + (preset.id % 4) * 0.05);
          if (preset.style === 'maze' || preset.style === 'chaos') {
            width += (pRowNoise(i + 13.7, preset.id) - 0.5) * 0.42;
            centerShift += (pRowNoise(i + 31.2, preset.id * 1.7) - 0.5) * 0.74;
          }
          if (t < 0.15) {
            width += (0.15 - t) * 3.0;
          }
          if (isMazePreset) {
            const tubeBlend = clamp(t / 0.24, 0, 1);
            const bodyBlend = clamp((t - 0.22) / 0.42, 0, 1);
            const neckBlend = clamp((t - 0.72) / 0.28, 0, 1);
            const tubeCurve = Math.sin(tubeBlend * Math.PI * 0.55);
            const tubeCenter = pLerp(4.6, 16.6, tubeCurve);
            const bodyCenter = 16.6 + Math.sin((t - 0.36) * Math.PI * 1.3) * 0.55;
            centerShift = pLerp(tubeCenter - centerBase, bodyCenter - centerBase, bodyBlend);
            centerShift = pLerp(centerShift, 16.4 - centerBase, neckBlend);
            const tubeWidth = pLerp(3.1, 4.0, tubeBlend);
            const bodyWidth = pLerp(6.6, 16.5, bodyBlend);
            const neckWidth = pLerp(bodyWidth, 3.2, neckBlend);
            width = Math.max(width * 0.35, neckWidth + tubeWidth * 0.22);
          }
          if (t > 0.78) {
            const goalGap = isMazePreset
              ? 3.2
              : preset.goalGap;
            width = pLerp(width, goalGap, (t - 0.78) / 0.22);
          }
          width = isMazePreset
            ? clamp(width, 2.8, 17.4)
            : clamp(width, preset.goalGap, 18.0);
          const centerX = isMazePreset
            ? clamp(centerBase + centerShift, 4.4, 20.6)
            : clamp(centerBase + centerShift, 9.0, 21.0);
          const half = width / 2;
          const leftX = clamp(centerX - half, isMazePreset ? 0.6 : 1.6, centerX - 1.85);
          const rightX = clamp(centerX + half, centerX + 1.85, isMazePreset ? 29.4 : 28.4);
          leftPts.push([leftX, y]);
          rightPts.push([rightX, y]);
        }
        pRelaxCorridor(leftPts, rightPts, 3);
        // MAP 5 (THE_MAZE) 는 발사관 스폰 구역이 다르므로 기본 SpawnEnvelope 스킵
        if (preset.code !== 'THE_MAZE') {
          pEnforceSpawnEnvelope(leftPts, rightPts, topY, bottomY);
        }
        pRelaxCorridor(leftPts, rightPts, 2);

        // V-trap elimination: prevent concave wall pockets that trap balls
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 1; i < leftPts.length - 1; i++) {
            const prevL = Number(leftPts[i - 1][0]);
            const currL = Number(leftPts[i][0]);
            const nextL = Number(leftPts[i + 1][0]);
            const prevR = Number(rightPts[i - 1][0]);
            const currR = Number(rightPts[i][0]);
            const nextR = Number(rightPts[i + 1][0]);
            // Left wall: if current point juts RIGHT more than both neighbors → V-trap
            const maxNeighborL = Math.max(prevL, nextL);
            if (currL > maxNeighborL + 0.15) {
              leftPts[i][0] = maxNeighborL + 0.1;
            }
            // Right wall: if current point juts LEFT more than both neighbors → V-trap
            const minNeighborR = Math.min(prevR, nextR);
            if (currR < minNeighborR - 0.15) {
              rightPts[i][0] = minNeighborR - 0.1;
            }
          }
        }
        pSetPolylineWorldPoints(leftWall, leftPts);
        pSetPolylineWorldPoints(rightWall, rightPts);

        const traps = [];
        const outerLeftX = 0.16;
        const outerRightX = 29.84;
        const spawnSample =
          pSampleChannelAtY(leftWall, rightWall, spawnTopY + 2.2) ||
          pSampleChannelAtY(leftWall, rightWall, spawnTopY + 3.0) ||
          pSampleChannelAtY(leftWall, rightWall, topY + 3.2);
        if (spawnSample && preset.code !== 'THE_MAZE') {
          const roofY = spawnTopY - 2.05;
          const roofHalfWidth = clamp(spawnSample.width / 2 + 0.36, 5.0, 8.5);
          const sideDepth = 2.7 + clamp(spawnLines * 0.26, 0, 2.6);
          const sideCenterY = roofY + sideDepth + 0.12;
          const leftWallX = spawnSample.left + 0.06;
          const rightWallX = spawnSample.right - 0.06;
          traps.push({
            type: 'static',
            position: { x: spawnSample.center, y: roofY },
            props: { density: 1, angularVelocity: 0, restitution: 0.08 },
            shape: { type: 'box', width: roofHalfWidth, height: 0.1, rotation: 0 },
          });
          traps.push({
            type: 'static',
            position: { x: leftWallX, y: sideCenterY },
            props: { density: 1, angularVelocity: 0, restitution: 0.08 },
            shape: { type: 'box', width: 0.09, height: sideDepth, rotation: 0.03 },
          });
          traps.push({
            type: 'static',
            position: { x: rightWallX, y: sideCenterY },
            props: { density: 1, angularVelocity: 0, restitution: 0.08 },
            shape: { type: 'box', width: 0.09, height: sideDepth, rotation: -0.03 },
          });
          traps.push({
            type: 'static',
            position: { x: leftWallX + 0.2, y: roofY + 0.26 },
            props: { density: 1, angularVelocity: 0, restitution: 0.12 },
            shape: { type: 'box', width: 0.34, height: 0.07, rotation: 0.46 },
          });
          traps.push({
            type: 'static',
            position: { x: rightWallX - 0.2, y: roofY + 0.26 },
            props: { density: 1, angularVelocity: 0, restitution: 0.12 },
            shape: { type: 'box', width: 0.34, height: 0.07, rotation: -0.46 },
          });
          traps.push({
            type: 'static',
            position: { x: spawnSample.center - 1.35, y: roofY + 1.1 },
            props: { density: 1, angularVelocity: 0, restitution: 0.16 },
            shape: { type: 'box', width: 1.0, height: 0.08, rotation: 0.58 },
          });
          traps.push({
            type: 'static',
            position: { x: spawnSample.center + 1.35, y: roofY + 1.1 },
            props: { density: 1, angularVelocity: 0, restitution: 0.16 },
            shape: { type: 'box', width: 1.0, height: 0.08, rotation: -0.58 },
          });
          for (let k = -2; k <= 2; k++) {
            traps.push({
              type: 'static',
              position: { x: clamp(spawnSample.center + k * 0.62, spawnSample.left + 0.65, spawnSample.right - 0.65), y: roofY + 1.8 + Math.abs(k) * 0.04 },
              props: { density: 1, angularVelocity: 0, restitution: 0.2 },
              shape: { type: 'circle', radius: 0.1, rotation: 0 },
            });
          }
          const exitY = spawnTopY + 6.35;
          const exitGap = clamp(spawnSample.width * 0.62, 5.4, 8.0);
          const sideSpan = Math.max(0, (spawnSample.width - exitGap) / 2 - 0.12);
          if (sideSpan > 0.18) {
            const leftSpanCenter = spawnSample.left + sideSpan / 2 + 0.06;
            const rightSpanCenter = spawnSample.right - sideSpan / 2 - 0.06;
            traps.push({
              type: 'static',
              position: { x: leftSpanCenter, y: exitY },
              props: { density: 1, angularVelocity: 0, restitution: 0.09 },
              shape: { type: 'box', width: clamp(sideSpan / 2, 0.22, 1.7), height: 0.08, rotation: 0.22 },
            });
            traps.push({
              type: 'static',
              position: { x: rightSpanCenter, y: exitY },
              props: { density: 1, angularVelocity: 0, restitution: 0.09 },
              shape: { type: 'box', width: clamp(sideSpan / 2, 0.22, 1.7), height: 0.08, rotation: -0.22 },
            });
          }
        }
        if (preset.code === 'THE_MAZE') {
          const bodyMidY = pLerp(topY, bottomY, 0.56);
          const lowerBodyY = pLerp(topY, bottomY, 0.72);
          const flipperY = pLerp(topY, bottomY, 0.9);
          traps.push({
            type: 'static',
            position: { x: 4.8, y: topY + 15.9 },
            props: { density: 1, angularVelocity: 0, restitution: 1.2 },
            shape: { type: 'box', width: 2.05, height: 0.14, rotation: -0.62 },
          });
          traps.push({
            type: 'static',
            position: { x: 0, y: 0 },
            props: { density: 1, angularVelocity: 0, restitution: 0.84 },
            shape: {
              type: 'polyline',
              points: [
                [11.1, topY + 36.4],
                [10.2, topY + 49.6],
                [10.3, topY + 63.4],
                [11.5, topY + 76.0],
              ],
            },
          });
          traps.push({
            type: 'static',
            position: { x: 0, y: 0 },
            props: { density: 1, angularVelocity: 0, restitution: 0.84 },
            shape: {
              type: 'polyline',
              points: [
                [21.9, topY + 36.4],
                [22.8, topY + 49.6],
                [22.7, topY + 63.4],
                [21.5, topY + 76.0],
              ],
            },
          });
          traps.push({
            type: 'static',
            position: { x: 15.8, y: topY + 32.0 },
            props: { density: 1, angularVelocity: 0, restitution: 1.16 },
            shape: { type: 'circle', radius: 0.74 },
          });
          traps.push({
            type: 'static',
            position: { x: 18.4, y: topY + 33.4 },
            props: { density: 1, angularVelocity: 0, restitution: 1.16 },
            shape: { type: 'circle', radius: 0.72 },
          });
          traps.push({
            type: 'static',
            position: { x: 16.9, y: topY + 36.3 },
            props: { density: 1, angularVelocity: 0, restitution: 1.16 },
            shape: { type: 'circle', radius: 0.72 },
          });
          traps.push({
            type: 'static',
            position: { x: 12.0, y: bodyMidY },
            props: { density: 1, angularVelocity: 0, restitution: 1.08 },
            shape: { type: 'circle', radius: 0.66 },
          });
          traps.push({
            type: 'static',
            position: { x: 20.8, y: bodyMidY },
            props: { density: 1, angularVelocity: 0, restitution: 1.08 },
            shape: { type: 'circle', radius: 0.66 },
          });
          traps.push({
            type: 'static',
            position: { x: 13.5, y: lowerBodyY + 8.1 },
            props: { density: 1, angularVelocity: 0, restitution: 1.12 },
            shape: { type: 'box', width: 2.7, height: 0.24, rotation: -0.3 },
          });
          traps.push({
            type: 'static',
            position: { x: 19.3, y: lowerBodyY + 8.1 },
            props: { density: 1, angularVelocity: 0, restitution: 1.12 },
            shape: { type: 'box', width: 2.7, height: 0.24, rotation: 0.3 },
          });
          traps.push({
            type: 'static',
            position: { x: 15.5, y: flipperY - 1.4 },
            props: { density: 1, angularVelocity: 0, restitution: 1.12 },
            shape: { type: 'circle', radius: 0.5 },
          });
          traps.push({
            type: 'static',
            position: { x: 17.3, y: flipperY - 1.4 },
            props: { density: 1, angularVelocity: 0, restitution: 1.12 },
            shape: { type: 'circle', radius: 0.5 },
          });
        }
        const entrySample =
          pSampleChannelAtY(leftWall, rightWall, topY + 1.8) ||
          pSampleChannelAtY(leftWall, rightWall, topY + 2.4);
        if (entrySample && preset.code !== 'THE_MAZE') {
          const leftCapSpan = Math.max(0, (entrySample.left - 0.28) - outerLeftX);
          const rightCapSpan = Math.max(0, outerRightX - (entrySample.right + 0.28));
          const lidY = topY + 0.65;
          if (leftCapSpan > 0.22) {
            traps.push({
              type: 'static',
              position: { x: outerLeftX + leftCapSpan / 2, y: lidY },
              props: { density: 1, angularVelocity: 0, restitution: 0.04 },
              shape: {
                type: 'box',
                width: clamp(leftCapSpan / 2, 0.22, 7.4),
                height: 0.09,
                rotation: 0,
              },
            });
          }
          if (rightCapSpan > 0.22) {
            traps.push({
              type: 'static',
              position: { x: (entrySample.right + 0.28) + rightCapSpan / 2, y: lidY },
              props: { density: 1, angularVelocity: 0, restitution: 0.04 },
              shape: {
                type: 'box',
                width: clamp(rightCapSpan / 2, 0.22, 7.4),
                height: 0.09,
                rotation: 0,
              },
            });
          }
        }

        const rowCount = Math.max(11, pToInt(preset.rows, 12));
        const trapsTopY = Math.max(topY + 10.2, spawnTopY + 8.4, 6.4);
        const trapsBottomY = clamp(goalY * 0.81, trapsTopY + 28, goalY - 9);
        const rowStep = (trapsBottomY - trapsTopY) / Math.max(1, rowCount - 1);
        for (let row = 0; row < rowCount; row++) {
          const y = trapsTopY + rowStep * row;
          const channel = pSampleChannelAtY(leftWall, rightWall, y);
          if (!channel || channel.width < 6.0) {
            continue;
          }
          let fromLeft = row % 2 === 0;
          switch (preset.style) {
            case 'left_stair':
            case 'drift_left':
              fromLeft = true;
              break;
            case 'right_stair':
            case 'drift_right':
              fromLeft = false;
              break;
            case 'switchback':
            case 'trident':
              fromLeft = row % 3 !== 1;
              break;
            case 'wave':
              fromLeft = Math.sin(row * 0.9) > 0;
              break;
            case 'wave_inv':
              fromLeft = Math.sin(row * 0.9) <= 0;
              break;
            case 'zigzag_dense':
              fromLeft = row % 3 === 0;
              break;
            case 'zigzag_shift':
              fromLeft = row % 4 <= 1;
              break;
            case 'helix':
              fromLeft = Math.sin(row * 1.17 + preset.id * 0.23) > 0;
              break;
            case 'spiral':
              fromLeft = (row + Math.floor(row / 2)) % 4 < 2;
              break;
            case 'sawtooth':
              fromLeft = row % 5 <= 1;
              break;
            case 'canyon':
              fromLeft =
                row % 2 === 0
                  ? Math.sin(row * 0.3 + preset.id) > -0.2
                  : Math.sin(row * 0.3 + preset.id) < 0.2;
              break;
            case 'maze':
              fromLeft = pRowNoise(row + 0.5, preset.id) > 0.45;
              break;
            case 'reactor':
              fromLeft = Math.cos(row * 1.46 + preset.id * 0.3) > 0;
              break;
            case 'mirror':
              fromLeft = row < rowCount / 2;
              break;
            case 'chaos':
              fromLeft = pRowNoise(row * 1.77 + 2.1, preset.id * 2.3) > 0.5;
              break;
            case 'snake':
              fromLeft = Math.sin(row * 0.62 + preset.id * 0.31) > -0.12;
              break;
            case 'orbit':
              fromLeft = Math.sin(row * 0.44 + row * row * 0.018 + preset.id * 0.4) > 0;
              break;
            case 'pulse':
              fromLeft = row % 4 < 2;
              break;
            case 'fork':
              fromLeft = row < rowCount * 0.44 ? true : row % 2 === 0;
              break;
          }
          const rowNoise =
            Math.sin(row * 0.78 + preset.id * 0.17) * 0.7 +
            (pRowNoise(row + 19.1, preset.id * 1.9) - 0.5) * 0.6;
          let openRatioBase = Number(preset.trapOpen) || (preset.style === 'boss' ? 0.47 : 0.53);
          if (preset.style === 'boss' || preset.style === 'reactor') openRatioBase -= 0.03;
          if (preset.style === 'maze' || preset.style === 'chaos') openRatioBase -= 0.05;
          if (preset.style === 'canyon' || preset.style === 'fork') openRatioBase += 0.04;
          if (preset.style === 'pulse') openRatioBase += row % 2 === 0 ? 0.05 : -0.03;
          if (preset.style === 'drift_left' || preset.style === 'drift_right') openRatioBase += 0.02;
          if (preset.style === 'zigzag_shift' || preset.style === 'sawtooth') openRatioBase -= 0.02;
          const openRatio = clamp(openRatioBase + rowNoise * 0.05, 0.4, 0.64);
          const opening = clamp(channel.width * openRatio, 3.9, 7.4);
          const usable = channel.width - opening;
          if (usable < 1.8) {
            continue;
          }
          // 음수 패딩 → 바가 벽을 관통하여 틈새(홈) 완전 제거
          const edgePadding = -0.18;
          const barLength = clamp(usable - (preset.style === 'canyon' ? 0.3 : 0.5) + 0.18, 1.15, channel.width - 4.6);
          const startX = fromLeft
            ? channel.left + edgePadding
            : channel.right - edgePadding;
          const endX = fromLeft ? startX + barLength : startX - barLength;
          const centerX = clamp((startX + endX) / 2, channel.left + 0.8, channel.right - 0.8);
          let mainRotation = fromLeft ? 0.34 : -0.34;
          if (preset.style === 'maze' || preset.style === 'chaos') {
            mainRotation += (pRowNoise(row + 17.7, preset.id) - 0.5) * 0.34;
          }
          if (preset.style === 'sawtooth' || preset.style === 'zigzag_shift') {
            mainRotation += fromLeft ? 0.16 : -0.16;
          }
          if (preset.style === 'canyon' || preset.style === 'fork') {
            mainRotation *= 0.65;
          }
          if (preset.style === 'drift_left' || preset.style === 'drift_right') {
            mainRotation = fromLeft ? 0.24 : -0.24;
          }
          if (preset.style === 'mirror' && row >= rowCount / 2) {
            mainRotation *= -1;
          }
          traps.push({
            type: 'static',
            position: { x: centerX, y },
            props: { density: 1, angularVelocity: 0, restitution: 0.12 },
            shape: {
              type: 'box',
              width: clamp(Math.abs(endX - startX) / 2, 0.62, 2.5),
              height: 0.09,
              rotation: mainRotation,
            },
          });

          if (
            preset.scatterEvery > 0 &&
            row % preset.scatterEvery === 0 &&
            opening > 4.1
          ) {
            const offset = clamp(opening * 0.22, 0.36, 1.0);
            traps.push({
              type: 'static',
              position: { x: channel.center - offset, y: y + 0.22 },
              props: { density: 1, angularVelocity: 0, restitution: 0.16 },
              shape: { type: 'box', width: 0.38, height: 0.07, rotation: fromLeft ? 0.78 : -0.78 },
            });
            traps.push({
              type: 'static',
              position: { x: channel.center + offset, y: y + 0.22 },
              props: { density: 1, angularVelocity: 0, restitution: 0.16 },
              shape: { type: 'box', width: 0.38, height: 0.07, rotation: fromLeft ? -0.78 : 0.78 },
            });
          }
          if ((preset.style === 'maze' || preset.style === 'chaos') && row % 2 === 1 && channel.width > 7.1) {
            const crossTilt = pRowNoise(row + 8.1, preset.id) > 0.5 ? 0.74 : -0.74;
            traps.push({
              type: 'static',
              position: { x: channel.center - 0.34, y: y + 0.14 },
              props: { density: 1, angularVelocity: 0, restitution: 0.18 },
              shape: { type: 'box', width: 0.46, height: 0.07, rotation: crossTilt },
            });
            traps.push({
              type: 'static',
              position: { x: channel.center + 0.34, y: y + 0.14 },
              props: { density: 1, angularVelocity: 0, restitution: 0.18 },
              shape: { type: 'box', width: 0.46, height: 0.07, rotation: -crossTilt },
            });
          }
          if (
            (preset.style === 'helix' || preset.style === 'spiral' || preset.style === 'orbit') &&
            row % 3 === 0 &&
            channel.width > 7.0
          ) {
            const orbX = clamp(
              channel.center + Math.sin(row * 0.7 + preset.id) * 0.75,
              channel.left + 0.95,
              channel.right - 0.95,
            );
            pPushDiamond(
              traps,
              orbX,
              y + 0.14,
              clamp(channel.width * 0.105, 0.56, 0.98),
              Math.sin(row * 0.45 + preset.id * 0.2) * 0.24,
              0.18,
            );
          }
          if ((preset.style === 'canyon' || preset.style === 'pulse') && row % 3 === 1) {
            const sideOffset = clamp(opening * 0.24, 0.5, 1.12);
            traps.push({
              type: 'static',
              position: { x: clamp(channel.center - sideOffset, channel.left + 0.9, channel.right - 0.9), y: y + 0.16 },
              props: { density: 1, angularVelocity: 0, restitution: 0.06 },
              shape: { type: 'circle', radius: 0.12, rotation: 0 },
            });
            traps.push({
              type: 'static',
              position: { x: clamp(channel.center + sideOffset, channel.left + 0.9, channel.right - 0.9), y: y + 0.16 },
              props: { density: 1, angularVelocity: 0, restitution: 0.06 },
              shape: { type: 'circle', radius: 0.12, rotation: 0 },
            });
          }
          if (preset.style === 'fork' && row === Math.floor(rowCount * 0.44) && channel.width > 7.4) {
            traps.push({
              type: 'static',
              position: { x: channel.center, y: y + 0.32 },
              props: { density: 1, angularVelocity: 0, restitution: 0.15 },
              shape: { type: 'box', width: 1.12, height: 0.08, rotation: 0 },
            });
            traps.push({
              type: 'static',
              position: { x: channel.center - 0.84, y: y + 0.6 },
              props: { density: 1, angularVelocity: 0, restitution: 0.16 },
              shape: { type: 'box', width: 0.9, height: 0.08, rotation: 0.42 },
            });
            traps.push({
              type: 'static',
              position: { x: channel.center + 0.84, y: y + 0.6 },
              props: { density: 1, angularVelocity: 0, restitution: 0.16 },
              shape: { type: 'box', width: 0.9, height: 0.08, rotation: -0.42 },
            });
          }

          if (preset.splitEvery > 0 && row % preset.splitEvery === 1 && channel.width > 7.4) {
            traps.push({
              type: 'static',
              position: { x: channel.center, y: y + 0.28 },
              props: { density: 1, angularVelocity: 0, restitution: 0.15 },
              shape: { type: 'box', width: 0.9, height: 0.08, rotation: fromLeft ? -0.3 : 0.3 },
            });
          }

          if (preset.diamondEvery > 0 && row % preset.diamondEvery === 2 && channel.width > 7.2) {
            const diamondX = clamp(channel.center + (fromLeft ? 0.55 : -0.55), channel.left + 1.0, channel.right - 1.0);
            pPushDiamond(
              traps,
              diamondX,
              y + 0.16,
              clamp(channel.width * 0.11, 0.58, 1.05),
              fromLeft ? 0.18 : -0.18,
              0.17,
            );
          }

          if (preset.slowEvery > 0 && row % preset.slowEvery === 0) {
            for (let k = -1; k <= 1; k++) {
              const sx = clamp(channel.center + k * 0.56, channel.left + 0.85, channel.right - 0.85);
              traps.push({
                type: 'static',
                position: { x: sx, y: y + 0.1 },
                props: { density: 1, angularVelocity: 0, restitution: 0.45 },
                shape: { type: 'circle', radius: 0.11, rotation: 0 },
              });
            }
            traps.push({
              type: 'static',
              position: { x: channel.center, y: y + 0.36 },
              props: { density: 1, angularVelocity: 0, restitution: 0.4 },
              shape: { type: 'box', width: 0.72, height: 0.06, rotation: 0.25 },
            });
          }

          if (preset.bumperEvery > 0 && row % preset.bumperEvery === 0) {
            const bumperX = fromLeft
              ? endX + 0.42
              : endX - 0.42;
            if (bumperX > channel.left + 1.1 && bumperX < channel.right - 1.1) {
              traps.push({
                type: 'static',
                position: { x: bumperX, y: y + 0.18 },
                props: { density: 1, angularVelocity: 0, restitution: 0.44 },
                shape: { type: 'circle', radius: 0.16, rotation: 0 },
              });
            }
          }

          if (preset.rotorEvery > 0 && row >= 2 && row % preset.rotorEvery === 0 && channel.width > 7.0) {
            traps.push({
              type: 'kinematic',
              position: { x: clamp(channel.center + (fromLeft ? -0.35 : 0.35), channel.left + 1.1, channel.right - 1.1), y: y + 0.24 },
              props: { density: 1, angularVelocity: fromLeft ? 4.4 : -4.4, restitution: 0.26 },
              shape: { type: 'box', width: 0.72, height: 0.08, rotation: 0 },
            });
          }

          if (preset.wallBounceEvery > 0 && row >= 1 && row % preset.wallBounceEvery === 0 && channel.width > 7.5) {
            const wallSide = row % 2 === 0;
            const wbX = wallSide ? channel.left + 0.85 : channel.right - 0.85;
            const wbTilt = wallSide ? 0.52 : -0.52;
            traps.push({
              type: 'kinematic',
              position: { x: wbX, y: y + 0.12 },
              props: { density: 1, angularVelocity: wallSide ? 3.0 : -3.0, restitution: 0.65 },
              shape: { type: 'box', width: 0.55, height: 0.08, rotation: wbTilt },
            });
            const oppX = wallSide ? channel.right - 1.0 : channel.left + 1.0;
            traps.push({
              type: 'static',
              position: { x: oppX, y: y + 0.22 },
              props: { density: 1, angularVelocity: 0, restitution: 0.55 },
              shape: { type: 'circle', radius: 0.18, rotation: 0 },
            });
          }

          if (preset.centerEvery > 0 && row % preset.centerEvery === 0) {
            traps.push({
              type: 'static',
              position: { x: channel.center, y: y - 0.22 },
              props: { density: 1, angularVelocity: 0, restitution: 0.55 },
              shape: { type: 'circle', radius: 0.12, rotation: 0 },
            });
          }

          if (preset.burstEvery > 0 && row >= 2 && row % preset.burstEvery === 0) {
            const burstX = clamp(channel.center + (fromLeft ? 0.85 : -0.85), channel.left + 1.1, channel.right - 1.1);
            traps.push(pCreateBurstBumper(burstX, y + 0.22, row + 17, 2 + ((row + preset.id) % 3)));
          }

          if (preset.bombEvery > 0 && row >= 3 && row % preset.bombEvery === 0) {
            const bombX = clamp(channel.center + (fromLeft ? -0.72 : 0.72), channel.left + 1.2, channel.right - 1.2);
            traps.push(pCreateBomb(bombX, y + 0.34, row + 1));
          }
        }

        // Goal funnel: always narrow near finish.
        const funnelStartY = goalY - 21;
        for (let i = 0; i < 6; i++) {
          const y = funnelStartY + i * 3.4;
          const channel = pSampleChannelAtY(leftWall, rightWall, y);
          if (!channel) {
            continue;
          }
          const targetGap = clamp(preset.goalGap + i * 0.12, 3.6, 5.5);
          const sideSpan = Math.max(0.9, (channel.width - targetGap) / 2 - 0.12);
          const leftX = channel.left + sideSpan / 2 + 0.08;
          const rightX = channel.right - sideSpan / 2 - 0.08;
          traps.push({
            type: 'static',
            position: { x: leftX, y },
            props: { density: 1, angularVelocity: 0, restitution: 0.11 },
            shape: { type: 'box', width: clamp(sideSpan / 2, 0.7, 2.45), height: 0.09, rotation: 0.12 },
          });
          traps.push({
            type: 'static',
            position: { x: rightX, y },
            props: { density: 1, angularVelocity: 0, restitution: 0.11 },
            shape: { type: 'box', width: clamp(sideSpan / 2, 0.7, 2.45), height: 0.09, rotation: -0.12 },
          });
          if (i >= 2) {
            traps.push({
              type: 'static',
              position: { x: channel.center, y: y - 0.16 },
              props: { density: 1, angularVelocity: 0, restitution: 0.26 },
              shape: { type: 'circle', radius: 0.11, rotation: 0 },
            });
          }
        }
        // ============ MAP-SPECIFIC UNIQUE FEATURES ============
        const pCode = preset.code;

        if (pCode === 'CANYON_FLOW') {
          // ㄹ PATH: Horizontal barriers with alternating gaps + wall pushers
          const zigCount = Math.max(4, Math.min(8, Math.floor((trapsBottomY - trapsTopY) / 8)));
          const zigStartY = trapsTopY + 4;
          const zigStep = (trapsBottomY - zigStartY - 4) / Math.max(1, zigCount - 1);
          for (let i = 0; i < zigCount; i++) {
            const zy = zigStartY + zigStep * i;
            const ch = pSampleChannelAtY(leftWall, rightWall, zy);
            if (!ch || ch.width < 6) continue;
            const gapRight = i % 2 === 0;
            const gapW = clamp(ch.width * 0.38, 3.2, 5.5);
            const barW = (ch.width - gapW) * 0.48;
            const barX = gapRight
              ? ch.left + barW + 0.3
              : ch.right - barW - 0.3;
            // Horizontal barrier (slight downward tilt toward gap)
            traps.push({
              type: 'static',
              position: { x: barX, y: zy },
              props: { density: 1, angularVelocity: 0, restitution: 0.3 },
              shape: { type: 'box', width: barW, height: 0.08, rotation: gapRight ? 0.06 : -0.06 },
            });
            // Wall-mounted PUSHER ARM near gap side — kinematic spinner that sweeps balls through
            const pushX = gapRight ? ch.right - 1.0 : ch.left + 1.0;
            traps.push({
              type: 'kinematic',
              position: { x: pushX, y: zy + 0.5 },
              props: { density: 1, angularVelocity: gapRight ? -3.8 : 3.8, restitution: 0.55 },
              shape: { type: 'box', width: 0.7, height: 0.08, rotation: 0 },
            });
            // Guide bumper on opposite wall to redirect
            const guideX = gapRight ? ch.left + 1.2 : ch.right - 1.2;
            traps.push({
              type: 'static',
              position: { x: guideX, y: zy + 0.9 },
              props: { density: 1, angularVelocity: 0, restitution: 0.6 },
              shape: { type: 'circle', radius: 0.2, rotation: 0 },
            });
          }
        }

        if (pCode === 'BUMPER_PARK') {
          // PINBALL BUMPER FIELD: Triangle bumper formations + flippers
          const formCount = Math.max(3, Math.min(6, Math.floor((trapsBottomY - trapsTopY) / 12)));
          const formStartY = trapsTopY + 5;
          const formStep = (trapsBottomY - formStartY - 3) / Math.max(1, formCount - 1);
          for (let i = 0; i < formCount; i++) {
            const fy = formStartY + formStep * i;
            const ch = pSampleChannelAtY(leftWall, rightWall, fy);
            if (!ch || ch.width < 7) continue;
            // Triangle of 3 HIGH-BOUNCE bumpers
            const cx = ch.center + (i % 2 === 0 ? -1.2 : 1.2);
            const sp = 1.1;
            traps.push({ type: 'static', position: { x: cx, y: fy - sp * 0.4 },
              props: { density: 1, angularVelocity: 0, restitution: 0.75 },
              shape: { type: 'circle', radius: 0.24, rotation: 0 } });
            traps.push({ type: 'static', position: { x: cx - sp * 0.5, y: fy + sp * 0.3 },
              props: { density: 1, angularVelocity: 0, restitution: 0.75 },
              shape: { type: 'circle', radius: 0.24, rotation: 0 } });
            traps.push({ type: 'static', position: { x: cx + sp * 0.5, y: fy + sp * 0.3 },
              props: { density: 1, angularVelocity: 0, restitution: 0.75 },
              shape: { type: 'circle', radius: 0.24, rotation: 0 } });
            // Mirror triangle on opposite side
            const cx2 = ch.center + (i % 2 === 0 ? 1.2 : -1.2);
            traps.push({ type: 'static', position: { x: cx2, y: fy + sp * 0.1 },
              props: { density: 1, angularVelocity: 0, restitution: 0.75 },
              shape: { type: 'circle', radius: 0.2, rotation: 0 } });
            traps.push({ type: 'static', position: { x: cx2 - sp * 0.4, y: fy + sp * 0.6 },
              props: { density: 1, angularVelocity: 0, restitution: 0.75 },
              shape: { type: 'circle', radius: 0.2, rotation: 0 } });
            traps.push({ type: 'static', position: { x: cx2 + sp * 0.4, y: fy + sp * 0.6 },
              props: { density: 1, angularVelocity: 0, restitution: 0.75 },
              shape: { type: 'circle', radius: 0.2, rotation: 0 } });
            // FLIPPER arm between formations — fast spinning launcher
            if (i > 0) {
              const flipSide = i % 2 === 0;
              const flipX = flipSide ? ch.left + 1.4 : ch.right - 1.4;
              traps.push({
                type: 'kinematic',
                position: { x: flipX, y: fy - formStep * 0.35 },
                props: { density: 1, angularVelocity: flipSide ? 5.5 : -5.5, restitution: 0.6 },
                shape: { type: 'box', width: 0.9, height: 0.09, rotation: flipSide ? 0.35 : -0.35 },
              });
            }
          }
        }

        if (pCode === 'CROWN_PEAK') {
          // WAVE LAUNCHER GAUNTLET: Paired kinematic arms sweeping opposite directions
          const waveCount = Math.max(4, Math.min(7, Math.floor((trapsBottomY - trapsTopY) / 9)));
          const waveStartY = trapsTopY + 4;
          const waveStep = (trapsBottomY - waveStartY - 3) / Math.max(1, waveCount - 1);
          for (let i = 0; i < waveCount; i++) {
            const wy = waveStartY + waveStep * i;
            const ch = pSampleChannelAtY(leftWall, rightWall, wy);
            if (!ch || ch.width < 6.5) continue;
            // LEFT wall launcher — spins and launches balls RIGHT
            traps.push({
              type: 'kinematic',
              position: { x: ch.left + 1.0, y: wy },
              props: { density: 1, angularVelocity: 4.0 + (i % 3) * 0.8, restitution: 0.6 },
              shape: { type: 'box', width: 0.75, height: 0.08, rotation: 0.3 },
            });
            // RIGHT wall launcher — spins and launches balls LEFT
            traps.push({
              type: 'kinematic',
              position: { x: ch.right - 1.0, y: wy + waveStep * 0.3 },
              props: { density: 1, angularVelocity: -(4.0 + (i % 3) * 0.8), restitution: 0.6 },
              shape: { type: 'box', width: 0.75, height: 0.08, rotation: -0.3 },
            });
            // Center bouncy bumper between launchers
            traps.push({
              type: 'static',
              position: { x: ch.center + (i % 2 === 0 ? 0.5 : -0.5), y: wy + waveStep * 0.15 },
              props: { density: 1, angularVelocity: 0, restitution: 0.65 },
              shape: { type: 'circle', radius: 0.22, rotation: 0 },
            });
          }
        }

        if (pCode === 'THE_MAZE') {
          // SPINNING GATES: Kinematic bars that block/unblock like rotating doors
          const gateCount = Math.max(4, Math.min(8, Math.floor((trapsBottomY - trapsTopY) / 7)));
          const gateStartY = trapsTopY + 5;
          const gateStep = (trapsBottomY - gateStartY - 3) / Math.max(1, gateCount - 1);
          for (let i = 0; i < gateCount; i++) {
            const gy = gateStartY + gateStep * i;
            const ch = pSampleChannelAtY(leftWall, rightWall, gy);
            if (!ch || ch.width < 6.5) continue;
            // SPINNING GATE in left third
            const gateSpeed = 2.0 + (i % 4) * 0.7;
            traps.push({
              type: 'kinematic',
              position: { x: ch.left + ch.width * 0.3, y: gy },
              props: { density: 1, angularVelocity: gateSpeed, restitution: 0.35 },
              shape: { type: 'box', width: 0.65, height: 0.08, rotation: i * 0.5 },
            });
            // SPINNING GATE in right third (opposite direction)
            traps.push({
              type: 'kinematic',
              position: { x: ch.right - ch.width * 0.3, y: gy + gateStep * 0.2 },
              props: { density: 1, angularVelocity: -gateSpeed, restitution: 0.35 },
              shape: { type: 'box', width: 0.65, height: 0.08, rotation: -i * 0.5 },
            });
            // Random direction-change wall (short barrier forcing detour)
            const wallSide = (i + Math.floor(Math.sin(i * 2.3) * 2)) % 3;
            if (wallSide === 0) {
              traps.push({
                type: 'static',
                position: { x: ch.center, y: gy + gateStep * 0.5 },
                props: { density: 1, angularVelocity: 0, restitution: 0.4 },
                shape: { type: 'box', width: ch.width * 0.15, height: 0.07, rotation: 0 },
              });
            } else if (wallSide === 1) {
              traps.push({
                type: 'static',
                position: { x: ch.left + ch.width * 0.25, y: gy + gateStep * 0.4 },
                props: { density: 1, angularVelocity: 0, restitution: 0.4 },
                shape: { type: 'box', width: ch.width * 0.12, height: 0.07, rotation: 0.3 },
              });
            }
          }
        }

        // =====================================================
        // MAP 5 (THE_MAZE) – 유리병 진입형 핀볼 레이아웃
        // =====================================================
        if (preset.code === 'THE_MAZE') {
          traps.length = 0;

          // Absolute-coordinate rebuild (map 5 only).
          // Shape: start chamber -> straw U-turn tunnel -> bottle body -> neck -> flippers.
          const chamberLeftX = 2.9;
          const chamberRightX = 5.9;
          const chamberTopY = 9.2;
          const chamberBottomY = 22.4;
          const bottleCenterX = 17.5;
          const neckY = 201.8;

          const mazeLeftWallPts = [
            [2.40, 23.0],
            [2.40, 10.0],
            [7.20, 10.0],
            [10.80, 10.0],
            [13.80, 12.0],
            [16.40, 16.0],
            [17.20, 22.0],
            [15.40, 28.0],
            [13.80, 32.0],
            [11.80, 43.0],
            [11.70, 88.0],
            [11.80, 134.0],
            [12.40, 168.0],
            [13.90, 185.8],
            [15.10, 192.8],
            [15.70, 200.0],
            [15.80, 207.0],
            [15.80, 214.0],
          ];
          const mazeRightWallPts = [
            [6.40, 23.0],
            [6.40, 17.0],
            [9.60, 13.0],
            [11.20, 10.0],
            [14.20, 10.0],
            [17.20, 12.0],
            [19.60, 16.0],
            [21.00, 22.0],
            [22.80, 28.0],
            [24.20, 32.0],
            [24.70, 43.0],
            [24.90, 88.0],
            [24.80, 134.0],
            [24.30, 168.0],
            [22.70, 185.8],
            [20.90, 192.8],
            [19.60, 200.0],
            [19.40, 207.0],
            [19.40, 214.0],
          ];
          pSetPolylineWorldPoints(leftWall, mazeLeftWallPts);
          pSetPolylineWorldPoints(rightWall, mazeRightWallPts);

          const spawnCount = Math.max(1, candidates.length);
          const spawnColumns = Math.max(3, Math.min(4, Math.ceil(Math.sqrt(spawnCount))));
          const spawnRows = Math.max(1, Math.ceil(spawnCount / spawnColumns));
          baseStage.spawn = {
            x: (chamberLeftX + chamberRightX) / 2 - (spawnColumns - 1) * 0.36 * 0.5,
            y: chamberTopY + 3.2 + Math.min(2, spawnRows) * 0.06,
            columns: spawnColumns,
            spacingX: 0.36,
            visibleRows: clamp(Math.max(1, spawnRows), 4, 7),
          };

          // 시작 챔버 바닥 발사대
          traps.push(
            {
              type: 'kinematic',
              position: { x: 4.35, y: chamberBottomY - 0.18 },
              props: { density: 3.2, angularVelocity: 0, restitution: 1.08 },
              shape: { type: 'box', width: 1.36, height: 0.16, rotation: 0 },
            },
            {
              type: 'static',
              position: { x: 4.35, y: chamberBottomY + 0.56 },
              props: { density: 1, angularVelocity: 0, restitution: 0.10 },
              shape: { type: 'box', width: 3.2, height: 0.24, rotation: 0 },
            },
            {
              type: 'static',
              position: { x: chamberLeftX + 0.28, y: chamberBottomY + 0.22 },
              props: { density: 1, angularVelocity: 0, restitution: 0.18 },
              shape: { type: 'box', width: 0.44, height: 0.10, rotation: 0.58 },
            },
            {
              type: 'static',
              position: { x: chamberRightX - 0.28, y: chamberBottomY + 0.22 },
              props: { density: 1, angularVelocity: 0, restitution: 0.18 },
              shape: { type: 'box', width: 0.44, height: 0.10, rotation: -0.58 },
            },
          );

          // 본체 내부 곡선 레일(좌/우)
          traps.push({
            type: 'static',
            position: { x: 0, y: 0 },
            props: { density: 1, angularVelocity: 0, restitution: 0.88 },
            shape: {
              type: 'polyline',
              points: [
                [13.8, 45.0],
                [12.7, 63.0],
                [12.8, 82.0],
                [13.8, 101.0],
              ],
            },
          });
          traps.push({
            type: 'static',
            position: { x: 0, y: 0 },
            props: { density: 1, angularVelocity: 0, restitution: 0.88 },
            shape: {
              type: 'polyline',
              points: [
                [22.8, 45.0],
                [23.9, 63.0],
                [23.8, 82.0],
                [22.8, 101.0],
              ],
            },
          });

          // 상단/중단 범퍼
          traps.push(
            {
              type: 'static',
              position: { x: 17.2, y: 37.8 },
              props: { density: 1, angularVelocity: 0, restitution: 1.18 },
              shape: { type: 'circle', radius: 0.74 },
            },
            {
              type: 'static',
              position: { x: 19.2, y: 39.0 },
              props: { density: 1, angularVelocity: 0, restitution: 1.18 },
              shape: { type: 'circle', radius: 0.72 },
            },
            {
              type: 'static',
              position: { x: 18.0, y: 41.4 },
              props: { density: 1, angularVelocity: 0, restitution: 1.18 },
              shape: { type: 'circle', radius: 0.70 },
            },
            {
              type: 'static',
              position: { x: 14.4, y: 121.5 },
              props: { density: 1, angularVelocity: 0, restitution: 1.12 },
              shape: { type: 'circle', radius: 0.64 },
            },
            {
              type: 'static',
              position: { x: 22.1, y: 121.5 },
              props: { density: 1, angularVelocity: 0, restitution: 1.12 },
              shape: { type: 'circle', radius: 0.64 },
            },
          );

          // 중하단 경사 바(스케치의 2단 사선 바 느낌)
          traps.push(
            {
              type: 'static',
              position: { x: 14.8, y: 136.8 },
              props: { density: 1, angularVelocity: 0, restitution: 1.15 },
              shape: { type: 'box', width: 2.9, height: 0.24, rotation: -0.30 },
            },
            {
              type: 'static',
              position: { x: 21.7, y: 136.8 },
              props: { density: 1, angularVelocity: 0, restitution: 1.15 },
              shape: { type: 'box', width: 2.9, height: 0.24, rotation: 0.30 },
            },
            {
              type: 'static',
              position: { x: 14.8, y: 165.8 },
              props: { density: 1, angularVelocity: 0, restitution: 1.08 },
              shape: { type: 'box', width: 2.7, height: 0.22, rotation: -0.54 },
            },
            {
              type: 'static',
              position: { x: 21.7, y: 165.8 },
              props: { density: 1, angularVelocity: 0, restitution: 1.08 },
              shape: { type: 'box', width: 2.7, height: 0.22, rotation: 0.54 },
            },
            {
              type: 'static',
              type: 'static',
              position: { x: 0, y: 0 },
              props: { density: 1, angularVelocity: 0, restitution: 0.9 },
              shape: {
                type: 'polyline',
                points: [
                  [13.2, 178.0],
                  [14.8, 186.0],
                  [15.6, 194.0],
                  [15.8, 201.0],
                ],
              },
            },
            {
              type: 'static',
              position: { x: 0, y: 0 },
              props: { density: 1, angularVelocity: 0, restitution: 0.9 },
              shape: {
                type: 'polyline',
                points: [
                  [22.8, 178.0],
                  [21.2, 186.0],
                  [20.0, 194.0],
                  [19.4, 201.0],
                ],
              },
            },
          );

          // 하단 플리퍼(삼각형 느낌)
          const flipperLen = 2.05;
          traps.push(
            {
              type: 'kinematic',
              position: { x: 16.65, y: neckY },
              props: { density: 2.5, angularVelocity: 5.3, restitution: 1.08 },
              shape: {
                type: 'polyline',
                rotation: 0.34,
                points: [
                  [0, 0],
                  [flipperLen, 0.04],
                  [flipperLen * 0.30, -0.96],
                ],
              },
            },
            {
              type: 'kinematic',
              position: { x: 18.55, y: neckY },
              props: { density: 2.5, angularVelocity: -5.3, restitution: 1.08 },
              shape: {
                type: 'polyline',
                rotation: -0.34,
                points: [
                  [0, 0],
                  [-flipperLen, 0.04],
                  [-flipperLen * 0.30, -0.96],
                ],
              },
            },
            {
              type: 'static',
              position: { x: 16.65, y: neckY - 0.64 },
              props: { density: 1, angularVelocity: 0, restitution: 1.18 },
              shape: { type: 'circle', radius: 0.44 },
            },
            {
              type: 'static',
              position: { x: 18.55, y: neckY - 0.64 },
              props: { density: 1, angularVelocity: 0, restitution: 1.18 },
              shape: { type: 'circle', radius: 0.44 },
            },
          );

          // 최하단 받침 바(과도한 이탈 방지)
          traps.push({
            type: 'static',
            position: { x: bottleCenterX, y: 217.6 },
            props: { density: 1, angularVelocity: 0, restitution: 0.32 },
            shape: { type: 'box', width: 3.2, height: 0.2, rotation: 0.03 },
          });

          control.launchChamber = {
            left: chamberLeftX,
            right: chamberRightX,
            top: chamberTopY,
            bottom: chamberBottomY + 0.64,
            intervalMs: 1240,
            impulseX: 8.6,
            impulseY: 34.0,
            launchVelocityX: 6.6,
            launchVelocityY: 15.2,
            lastPulseAt: Date.now() - 1600,
          };
        }
        // =====================================================
        // END MAP 5 CUSTOM LAYOUT
        // ======================

        baseStage.entities = baseStage.entities.concat(traps);
        control.trapScaleSummary = scaleFixedTrapShapes(baseStage);


        const leftPath = pToWorldPoints(leftWall);
        const rightPath = pToWorldPoints(rightWall);
        if (leftPath.length >= 2 && rightPath.length >= 2) {
          const xs = leftPath.map((pt) => pt[0]).concat(rightPath.map((pt) => pt[0]));
          const ys = leftPath.map((pt) => pt[1]).concat(rightPath.map((pt) => pt[1]));
          control.boundaryMask = {
            leftPath,
            rightPath,
            farLeftX: Math.min(...xs) - 18,
            farRightX: Math.max(...xs) + 18,
            topY: Math.min(...ys) - 10,
            bottomY: Math.max(...ys) + 10,
          };
        } else {
          control.boundaryMask = null;
        }

        const finishSample = pSampleChannelAtY(leftWall, rightWall, goalY - 5) ||
          pSampleChannelAtY(leftWall, rightWall, goalY - 8);
        if (finishSample) {
          control.finishLine = {
            x: finishSample.center,
            y: goalY - 3.2,
            width: clamp(finishSample.width * 0.66, 4.3, 7.2),
            height: 0.95,
          };
        } else {
          control.finishLine = { x: 15, y: goalY - 3.2, width: 5.2, height: 0.95 };
        }
      }
    } else {
      control.boundaryMask = null;
      control.finishLine = { x: 15, y: goalY - 3.2, width: 5.2, height: 0.95 };
    }

    control.bombTraps = baseStage.entities
      .map((entity, index) => ({ entity, index }))
      .filter(
        ({ entity }) =>
          entity &&
          (entity.__appBomb === true || entity.__appBurstBumper === true) &&
          entity.shape &&
          entity.shape.type === 'circle' &&
          entity.position,
      )
      .map(({ entity, index }) => ({
        kind: entity.__appBurstBumper === true ? 'burst' : 'bomb',
        id: entity.__appBurstBumper === true
          ? (typeof entity.__appBurstId === 'string' && entity.__appBurstId
            ? entity.__appBurstId
            : 'preset-burst-fallback-' + index)
          : (typeof entity.__appBombId === 'string' && entity.__appBombId
            ? entity.__appBombId
            : 'preset-bomb-fallback-' + index),
        x: Number(entity.position.x) || 0,
        y: Number(entity.position.y) || 0,
        radius: Math.max(0.1, Number(entity.shape.radius) || 0.18),
        baseRadius: Math.max(0.1, Number(entity.shape.radius) || 0.18),
        entityRef: entity,
        triggerRadius: entity.__appBurstBumper === true
          ? Math.max(0.24, Number(entity.__appBurstTriggerRadius) || 0.36)
          : Math.max(0.26, Number(entity.__appBombTriggerRadius) || 0.42),
        blastRadius: entity.__appBurstBumper === true
          ? Math.max(1.8, Number(entity.__appBurstBlastRadius) || 2.6)
          : Math.max(1.8, Number(entity.__appBombBlastRadius) || 3.1),
        cooldownMs: entity.__appBurstBumper === true
          ? Math.max(260, Number(entity.__appBurstCooldownMs) || 560)
          : Math.max(900, Number(entity.__appBombCooldownMs) || 2400),
        armDelayMs: entity.__appBurstBumper === true
          ? Math.max(180, Number(entity.__appBurstArmDelayMs) || 420)
          : Math.max(350, Number(entity.__appBombArmDelayMs) || 900),
        hitPoints: entity.__appBurstBumper === true
          ? Math.max(1, pToInt(entity.__appBurstHp, 3))
          : 1,
        hitsLeft: entity.__appBurstBumper === true
          ? Math.max(1, pToInt(entity.__appBurstHp, 3))
          : 1,
        spawnedAt: Date.now(),
        lastTriggeredAt: -1,
        destroyed: false,
      }));
    if (String(preset.code || '') === 'THE_MAZE') {
      // Map 5 uses launcher gameplay only; disable bomb/burst trap side effects.
      control.bombTraps = [];
    }
    control.bombPulses = [];
    baseStage.__appPinballPreset = String(preset.code || '');
    baseStage.__appPinballMap5 = String(preset.code || '') === 'THE_MAZE';
    window.roulette._stage = baseStage;
    if (typeof window.roulette.reset === 'function') {
      try {
        window.roulette.reset();
      } catch (_) {
      }
    }
    if (window.roulette._isRunning === true) {
      window.roulette._isRunning = false;
    }
    const appliedMapIndex = resolveCurrentMapIndex(false);
    control.lastMapIndex =
      fixedRequestedMapSafe > 0
        ? fixedRequestedMapSafe
        : (appliedMapIndex > 0 ? appliedMapIndex : (sourceMapIndex > 0 ? sourceMapIndex : -1));
    const presetTag = 'P' + String(presetId).padStart(2, '0');
    control.lastVariantSignature = 'preset|' + presetTag;
    control.mapVariantId = 'preset-' + presetTag + '-m' + String(control.lastMapIndex);
    control.mapLabel = presetTag + '-' + preset.code;
    control.mapPresetCode = preset.code;
    if (preset.code === 'THE_MAZE') {
      control.fixedMapIndex = -1;
      control.fixedMapTitle = '';
    }
    control.map5SpawnAligned = false;
    control.mapReady = true;
    return true;

  };

  const safeRandomizeMapLayout = () => {
    try {
      return randomizeMapLayout();
    } catch (error) {
      control.mapReady = false;
      control.lastMapLayoutError = String(
        error && error.message ? error.message : error,
      );
      return false;
    }
  };

  const ensurePodiumStyle = () => {
    if (document.getElementById('__appPinballPodiumStyle')) {
      return;
    }
    const style = document.createElement('style');
    style.id = '__appPinballPodiumStyle';
    style.textContent = `
      #__appPinballPodium {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        background:
          linear-gradient(180deg, rgba(0, 0, 0, 0) 25%, rgba(0, 0, 0, 0.6) 100%);
      }
      #__appPinballPodium .stage {
        width: min(92vw, 640px);
        height: min(44vh, 340px);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 14px;
        padding-bottom: 12px;
      }
      #__appPinballPodium .stage.single {
        width: min(72vw, 420px);
        justify-content: center;
      }
      #__appPinballPodium .slot {
        width: 30%;
        max-width: 190px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
      }
      #__appPinballPodium .stage.single .slot {
        width: min(54vw, 230px);
        max-width: 230px;
      }
      #__appPinballPodium .name {
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        text-align: center;
        margin-bottom: 6px;
        text-shadow: 0 1px 4px rgba(0,0,0,0.85);
      }
      #__appPinballPodium .food {
        width: 76px;
        height: 76px;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.9);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        margin-bottom: 8px;
      }
      #__appPinballPodium .pillar {
        width: 100%;
        border-radius: 14px 14px 0 0;
        background: linear-gradient(180deg, #ffd76a 0%, #e0a92f 100%);
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.4);
        position: relative;
      }
      #__appPinballPodium .rank {
        position: absolute;
        inset: 10px 0 auto 0;
        text-align: center;
        color: rgba(0, 0, 0, 0.72);
        font-size: 24px;
        font-weight: 900;
      }
    `;
    document.head.appendChild(style);
  };

  const clearCeremonyFx = () => {
    if (control.ceremonyFxRaf) {
      try {
        window.cancelAnimationFrame(control.ceremonyFxRaf);
      } catch (_) {
      }
      control.ceremonyFxRaf = 0;
    }
    if (control.ceremonyFxResizeHandler) {
      try {
        window.removeEventListener('resize', control.ceremonyFxResizeHandler);
      } catch (_) {
      }
      control.ceremonyFxResizeHandler = null;
    }
    const prev = document.getElementById('__appPinballCeremonyFx');
    if (prev && prev.parentNode) {
      prev.parentNode.removeChild(prev);
    }
    control.ceremonyFxActive = false;
  };

  const runCeremonyFx = () => {
    clearCeremonyFx();

    const canvas = document.createElement('canvas');
    canvas.id = '__appPinballCeremonyFx';
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '2147483647';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      clearCeremonyFx();
      return;
    }

    control.ceremonyFxActive = true;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const state = {
      confetti: [],
      sparks: [],
      startTs: performance.now(),
      lastTs: performance.now(),
      lastBurstTs: 0,
      lastConfettiTs: 0,
      width: 0,
      height: 0,
    };
    const palette = ['#ffd166', '#fff3bf', '#f8f9fa', '#7dd3fc', '#ff8a65', '#ffe8a3'];
    const randomBetween = (min, max) => min + Math.random() * (max - min);
    const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const resize = () => {
      state.width = Math.max(1, Math.floor(window.innerWidth));
      state.height = Math.max(1, Math.floor(window.innerHeight));
      canvas.width = Math.max(1, Math.floor(state.width * dpr));
      canvas.height = Math.max(1, Math.floor(state.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    control.ceremonyFxResizeHandler = resize;
    window.addEventListener('resize', resize, { passive: true });

    const spawnConfetti = (count, centerX, spread) => {
      for (let i = 0; i < count; i++) {
        state.confetti.push({
          x: centerX + randomBetween(-spread, spread),
          y: randomBetween(-80, -20),
          vx: randomBetween(-1.9, 1.9),
          vy: randomBetween(1.4, 4.2),
          gravity: randomBetween(0.012, 0.028),
          drag: randomBetween(0.988, 0.996),
          sizeW: randomBetween(4, 10),
          sizeH: randomBetween(8, 16),
          angle: randomBetween(0, Math.PI * 2),
          spin: randomBetween(-0.12, 0.12),
          life: 0,
          ttl: randomBetween(1700, 2800),
          color: choose(palette),
        });
      }
    };

    const spawnBurst = (x, y, power) => {
      const count = Math.floor(48 + randomBetween(0, 32));
      for (let i = 0; i < count; i++) {
        const angle = randomBetween(0, Math.PI * 2);
        const speed = randomBetween(1.8, 4.2) * power;
        state.sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: randomBetween(0.004, 0.02),
          drag: randomBetween(0.965, 0.985),
          size: randomBetween(1.4, 3.2),
          life: 0,
          ttl: randomBetween(800, 1500),
          color: choose(palette),
        });
      }
    };

    spawnConfetti(120, state.width * 0.5, state.width * 0.42);
    spawnBurst(state.width * 0.5, state.height * 0.35, 1.9);
    spawnBurst(state.width * 0.26, state.height * 0.28, 1.45);
    spawnBurst(state.width * 0.74, state.height * 0.28, 1.45);

    const frame = (now) => {
      const dt = Math.min(42, Math.max(8, now - state.lastTs));
      state.lastTs = now;
      const elapsed = now - state.startTs;
      const width = state.width;
      const height = state.height;

      ctx.clearRect(0, 0, width, height);

      if (elapsed < 3000 && now - state.lastBurstTs > 420) {
        spawnBurst(
          randomBetween(width * 0.18, width * 0.82),
          randomBetween(height * 0.16, height * 0.42),
          randomBetween(1.25, 1.8),
        );
        state.lastBurstTs = now;
      }
      if (elapsed < 3600 && now - state.lastConfettiTs > 220) {
        spawnConfetti(
          32,
          randomBetween(width * 0.12, width * 0.88),
          width * 0.16,
        );
        state.lastConfettiTs = now;
      }

      for (let i = state.confetti.length - 1; i >= 0; i--) {
        const piece = state.confetti[i];
        piece.life += dt;
        piece.vx *= piece.drag;
        piece.vy += piece.gravity * dt;
        piece.x += piece.vx * (dt / 16);
        piece.y += piece.vy * (dt / 16);
        piece.angle += piece.spin * (dt / 16);

        if (piece.life > piece.ttl || piece.y > height + 40) {
          state.confetti.splice(i, 1);
          continue;
        }

        const alpha = Math.max(0, 1 - piece.life / piece.ttl);
        const shimmer = 0.45 + 0.55 * Math.abs(Math.sin(piece.angle * 1.8));
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.angle);
        ctx.globalAlpha = alpha * shimmer;
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.sizeW / 2, -piece.sizeH / 2, piece.sizeW, piece.sizeH);
        ctx.restore();
      }

      for (let i = state.sparks.length - 1; i >= 0; i--) {
        const spark = state.sparks[i];
        spark.life += dt;
        spark.vx *= spark.drag;
        spark.vy = spark.vy * spark.drag + spark.gravity * dt;
        spark.x += spark.vx * (dt / 16);
        spark.y += spark.vy * (dt / 16);

        if (spark.life > spark.ttl) {
          state.sparks.splice(i, 1);
          continue;
        }

        const alpha = Math.max(0, 1 - spark.life / spark.ttl);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = spark.color;
        ctx.shadowColor = spark.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (
        elapsed > ceremonyDurationMs + 200 &&
        state.confetti.length === 0 &&
        state.sparks.length === 0
      ) {
        clearCeremonyFx();
        return;
      }

      control.ceremonyFxRaf = window.requestAnimationFrame(frame);
    };

    control.ceremonyFxRaf = window.requestAnimationFrame(frame);
  };

  const renderPodium = (top3) => {
    ensurePodiumStyle();

    const entries =
      ceremonyDisplayCount === 1
        ? [{ rank: 1, name: top3[0] || '', height: 240 }]
        : [
            { rank: 2, name: top3[1] || '', height: 150 },
            { rank: 1, name: top3[0] || '', height: 220 },
            { rank: 3, name: top3[2] || '', height: 120 },
          ];

    let overlay = document.getElementById('__appPinballPodium');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '__appPinballPodium';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'stage';
    if (ceremonyDisplayCount === 1) {
      stage.classList.add('single');
    }
    overlay.appendChild(stage);

    entries.forEach((entry) => {
      const slot = document.createElement('div');
      slot.className = 'slot';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = entry.name;
      slot.appendChild(name);

      const food = document.createElement('div');
      food.className = 'food';
      const src = control.foodImageSources && control.foodImageSources[entry.name]
        ? control.foodImageSources[entry.name]
        : '';
      if (src) {
        food.style.backgroundImage = `url("\${src.replace(/"/g, '%22')}")`;
      } else {
        food.style.backgroundImage = 'linear-gradient(135deg, #ffe082 0%, #ff8a65 100%)';
      }
      slot.appendChild(food);

      const pillar = document.createElement('div');
      pillar.className = 'pillar';
      pillar.style.height = `\${entry.height}px`;

      const rank = document.createElement('div');
      rank.className = 'rank';
      rank.textContent = `\${entry.rank}`;
      pillar.appendChild(rank);

      slot.appendChild(pillar);
      stage.appendChild(slot);
    });
  };

  const scheduleCeremonyIfReady = (top3) => {
    if (!Array.isArray(top3) || top3.length < ceremonyDisplayCount) {
      return;
    }
    const top3Key = top3.slice(0, ceremonyDisplayCount).join('\\n');
    control.top3 = top3.slice(0, ceremonyDisplayCount);
    control.finalWinner = control.top3[0] || '';

    if (control.ceremonyDone || control.ceremonyScheduled) {
      return;
    }
  if (control.finalTop3Key && control.finalTop3Key !== top3Key) {
    return;
  }
  control.finalTop3Key = top3Key;
  control.ceremonyScheduled = true;
  control.ceremonyDone = true;

  const winnerTop = control.top3.slice(0, ceremonyDisplayCount);
  postBridge('winnerResolved', {
    winner: control.finalWinner,
    top3: winnerTop,
  });
  };

  const tryBridgeStart = () => {
    if (typeof window.startPinballRoulette !== 'function') {
      return false;
    }
    try {
      const result = window.startPinballRoulette(payload);
      if (result && typeof result === 'object') {
        if (typeof result.started === 'boolean') {
          return result.started;
        }
        if (result.queued === true) {
          return false;
        }
      }
      return result === true;
    } catch (_) {
      return false;
    }
  };

  const tryButtonStart = () => {
    const button = document.querySelector('#btnStart');
    if (!button || typeof button.click !== 'function') {
      return false;
    }
    const runningBefore = !!(
      window.roulette &&
      window.roulette._isRunning === true
    );
    button.click();
    const runningAfter = !!(
      window.roulette &&
      window.roulette._isRunning === true
    );
    return runningBefore || runningAfter;
  };

  const tryDirectStart = () => {
    if (!window.roulette || typeof window.roulette.start !== 'function') {
      return false;
    }
    if (window.roulette._isRunning === true) {
      return true;
    }
    try {
      window.roulette.start();
      return window.roulette._isRunning === true;
    } catch (_) {
      return false;
    }
  };

  const forcePhysics = () => {
    if (!window.roulette) {
      return [];
    }
    const marbles = Array.isArray(window.roulette._marbles) ? window.roulette._marbles : [];
    if (control.physicsFrozen) {
      return marbles;
    }
    try {
      if (window.roulette.physics && typeof window.roulette.physics.start === 'function') {
        window.roulette.physics.start();
      }
    } catch (_) {
    }
    marbles.forEach((marble) => {
      if (!marble || typeof marble !== 'object') {
        return;
      }
      marble.isActive = true;
    });

    if (
      marbles.length > 0 &&
      window.roulette.physics &&
      typeof window.roulette.physics.shakeMarble === 'function' &&
      window.roulette._isRunning !== true
    ) {
      try {
        const marble = marbles[0];
        if (marble && typeof marble.id === 'number') {
          window.roulette.physics.shakeMarble(marble.id);
        }
      } catch (_) {
      }
    }

    return marbles;
  };

  const updateDiamondTrapMotion = () => {
    if (
      control.physicsFrozen ||
      !window.roulette ||
      !window.roulette._stage ||
      !Array.isArray(window.roulette._stage.entities)
    ) {
      return;
    }
    const entities = window.roulette._stage.entities;
    const m3BaseX = 12.875;
    const m3BaseY = 84.0;
    const isFixedM3Map =
      Number(control.requestedMapSlot) === 3 ||
      Number(control.fixedMapIndex) === 2 ||
      (typeof control.mapLabel === 'string' && control.mapLabel.startsWith('M3-'));
    const trackedM3BigDiamondId = Number(control.m3BigDiamondEntityId);
    const physics = window.roulette.physics;
    const Box2D = physics && physics.Box2D ? physics.Box2D : null;
    const hasVec2 = !!(Box2D && typeof Box2D.b2Vec2 === 'function');
    const mapSources = physics && typeof physics === 'object'
      ? Object.keys(physics)
          .map((key) => physics[key])
          .filter((value) => !!value && typeof value === 'object')
      : [];

    const resolveBody = (entity) => {
      if (!entity || typeof entity !== 'object') {
        return null;
      }
      const directBodies = [
        entity.body,
        entity._body,
        entity.b2Body,
        entity.__body,
      ];
      for (let i = 0; i < directBodies.length; i++) {
        const body = directBodies[i];
        if (body && typeof body.SetTransform === 'function') {
          return body;
        }
      }
      const id = Number(entity.id);
      if (!Number.isFinite(id)) {
        return null;
      }
      for (let i = 0; i < mapSources.length; i++) {
        const src = mapSources[i];
        if (!src || typeof src !== 'object') {
          continue;
        }
        const candidate =
          typeof src.get === 'function'
            ? src.get(id)
            : src[id];
        if (candidate && typeof candidate.SetTransform === 'function') {
          return candidate;
        }
      }
      return null;
    };

    const nowSec = Date.now() / 1000;
    const enableM3MovingDiamond = false;
    const hasAnyM3Marker = entities.some(
      (entity) =>
        !!entity &&
        (
          entity.__appM3BigDiamond === true ||
          Number(entity.props && entity.props.__appM3BigDiamond) === 1
        ),
    );
    let forcedM3Diamond = null;
    if (enableM3MovingDiamond && (isFixedM3Map || Number.isFinite(trackedM3BigDiamondId) || hasAnyM3Marker)) {
      entities.forEach((entity) => {
        if (
          !entity ||
          !entity.shape ||
          entity.shape.type !== 'box'
        ) {
          return;
        }
        const hasMarker =
          entity.__appM3BigDiamond === true ||
          Number(entity.props && entity.props.__appM3BigDiamond) === 1;
        const width = Math.abs(Number(entity.shape.width));
        const height = Math.abs(Number(entity.shape.height));
        const rot = Math.abs(Number(entity.shape.rotation));
        const x = Number(
          entity.position && Number.isFinite(Number(entity.position.x))
            ? entity.position.x
            : entity.x,
        );
        const y = Number(
          entity.position && Number.isFinite(Number(entity.position.y))
            ? entity.position.y
            : entity.y,
        );
        const nearSignature =
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          Number.isFinite(rot) &&
          width >= 1.42 &&
          width <= 1.92 &&
          height >= 1.42 &&
          height <= 1.92 &&
          rot >= 0.62 &&
          rot <= 0.95 &&
          Math.abs(x - m3BaseX) <= 8.5 &&
          Math.abs(y - m3BaseY) <= 32.0;
        const isTracked =
          Number.isFinite(trackedM3BigDiamondId) &&
          Number(entity.id) === trackedM3BigDiamondId;
        if (!hasMarker && !nearSignature && !isTracked) {
          return;
        }
        forcedM3Diamond = entity;
        entity.__appM3BigDiamond = true;
        entity.__appDiamondSwing = true;
        entity.__appDiamondBaseX = m3BaseX;
        entity.__appDiamondBaseY = m3BaseY;
        entity.__appDiamondAmp = 2.235;
        entity.__appDiamondOmega = 3.6;
        entity.__appDiamondPhase = 0.34;
      });
    }
    if (enableM3MovingDiamond && !forcedM3Diamond && (isFixedM3Map || hasAnyM3Marker)) {
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      entities.forEach((entity) => {
        if (!entity || !entity.shape || entity.shape.type !== 'box') {
          return;
        }
        const width = Math.abs(Number(entity.shape.width));
        const height = Math.abs(Number(entity.shape.height));
        const rot = Math.abs(Number(entity.shape.rotation));
        const x = Number(
          entity.position && Number.isFinite(Number(entity.position.x))
            ? entity.position.x
            : entity.x,
        );
        const y = Number(
          entity.position && Number.isFinite(Number(entity.position.y))
            ? entity.position.y
            : entity.y,
        );
        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          !Number.isFinite(rot) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        ) {
          return;
        }
        if (width < 1.35 || width > 2.1 || height < 1.35 || height > 2.1 || rot < 0.58 || rot > 1.02) {
          return;
        }
        const score = Math.abs(x - m3BaseX) * 0.9 + Math.abs(y - m3BaseY) * 0.35;
        if (score < bestScore) {
          bestScore = score;
          best = entity;
        }
      });
      if (best) {
        forcedM3Diamond = best;
        best.__appM3BigDiamond = true;
        best.__appDiamondSwing = true;
        best.__appDiamondBaseX = m3BaseX;
        best.__appDiamondBaseY = m3BaseY;
        best.__appDiamondAmp = 2.235;
        best.__appDiamondOmega = 3.6;
        best.__appDiamondPhase = 0.34;
      }
    }
    if (forcedM3Diamond && Number.isFinite(Number(forcedM3Diamond.id))) {
      control.m3BigDiamondEntityId = Number(forcedM3Diamond.id);
    }
    if (forcedM3Diamond) {
      const minX = 10.64;
      const maxX = 15.11;
      const y = 84.0;
      const span = Math.max(0.001, maxX - minX);
      const speed = 3.8;
      const travel = (nowSec * speed) % (span * 2);
      const forcedX = travel <= span
        ? (minX + travel)
        : (maxX - (travel - span));
      if (forcedM3Diamond.position && typeof forcedM3Diamond.position === 'object') {
        forcedM3Diamond.position.x = forcedX;
        forcedM3Diamond.position.y = y;
      }
      forcedM3Diamond.x = forcedX;
      forcedM3Diamond.y = y;
      if (hasVec2) {
        const body = resolveBody(forcedM3Diamond);
        if (body) {
          try {
            if (typeof body.SetAwake === 'function') {
              body.SetAwake(true);
            }
            const angle =
              typeof body.GetAngle === 'function'
                ? body.GetAngle()
                : Number(forcedM3Diamond.angle) || 0;
            body.SetTransform(new Box2D.b2Vec2(forcedX, y), angle);
            if (typeof body.SetLinearVelocity === 'function') {
              body.SetLinearVelocity(new Box2D.b2Vec2(0, 0));
            }
            if (typeof body.SetAngularVelocity === 'function') {
              body.SetAngularVelocity(0);
            }
          } catch (_) {
          }
        }
      }
    }
    entities.forEach((entity, index) => {
      if (
        !entity ||
        entity.__appDiamondSwing !== true ||
        (forcedM3Diamond && entity === forcedM3Diamond)
      ) {
        return;
      }
      const baseX = Number(entity.__appDiamondBaseX);
      const baseY = Number(entity.__appDiamondBaseY);
      const amp = Math.max(0.12, Number(entity.__appDiamondAmp) || 0.26);
      const omega = Math.max(0.45, Number(entity.__appDiamondOmega) || 1.1);
      const phaseRaw = Number(entity.__appDiamondPhase);
      const phase = Number.isFinite(phaseRaw) ? phaseRaw : (index * 0.73);
      if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) {
        return;
      }

      const nextX = baseX + Math.sin(nowSec * omega + phase) * amp;
      const nextY = baseY;
      if (entity.position && typeof entity.position === 'object') {
        entity.position.x = nextX;
        entity.position.y = nextY;
      }
      entity.x = nextX;
      entity.y = nextY;

      if (!hasVec2) {
        return;
      }
      const body = resolveBody(entity);
      if (!body) {
        return;
      }
      try {
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        const angle =
          typeof body.GetAngle === 'function'
            ? body.GetAngle()
            : Number(entity.angle) || 0;
        body.SetTransform(new Box2D.b2Vec2(nextX, nextY), angle);
        if (typeof body.SetLinearVelocity === 'function') {
          body.SetLinearVelocity(new Box2D.b2Vec2(0, 0));
        }
        if (typeof body.SetAngularVelocity === 'function') {
          body.SetAngularVelocity(0);
        }
      } catch (_) {
      }
    });
  };
  control.updateDiamondTrapMotion = updateDiamondTrapMotion;

  const alignMap5SpawnToLaunchChamber = (marbles) => {
    if (
      !window.roulette ||
      !window.roulette.physics ||
      !Array.isArray(marbles) ||
      marbles.length === 0 ||
      !control.launchChamber ||
      typeof control.launchChamber !== 'object' ||
      !String(control.mapPresetCode || '').startsWith('THE_MAZE')
    ) {
      return;
    }
    if (
      window.roulette._isRunning === true &&
      control.map5SpawnAligned === true
    ) {
      return;
    }
    const chamber = control.launchChamber;
    const left = Number(chamber.left);
    const right = Number(chamber.right);
    const top = Number(chamber.top);
    const bottom = Number(chamber.bottom);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(right) ||
      !Number.isFinite(top) ||
      !Number.isFinite(bottom) ||
      right - left < 0.8 ||
      bottom - top < 0.8
    ) {
      return;
    }
    const physics = window.roulette.physics;
    const marbleMap =
      physics && physics.marbleMap && typeof physics.marbleMap === 'object'
        ? physics.marbleMap
        : null;
    const Box2D = physics && physics.Box2D ? physics.Box2D : null;
    if (!marbleMap || !Box2D || typeof Box2D.b2Vec2 !== 'function') {
      return;
    }
    const clampNum = (value, min, max) => Math.min(max, Math.max(min, value));
    const minX = left + 0.16;
    const maxX = right - 0.16;
    const minY = top + 0.56;
    const maxY = bottom - 0.62;
    if (maxX <= minX || maxY <= minY) {
      return;
    }

    let outsideCount = 0;
    for (let i = 0; i < marbles.length; i++) {
      const marble = marbles[i];
      const mx = Number(marble && marble.x);
      const my = Number(marble && marble.y);
      if (!Number.isFinite(mx) || !Number.isFinite(my)) {
        continue;
      }
      if (mx < minX || mx > maxX || my < minY || my > maxY) {
        outsideCount += 1;
      }
    }
    const needRealign =
      control.map5SpawnAligned !== true ||
      outsideCount >= Math.max(1, Math.floor(marbles.length * 0.24));
    if (!needRealign) {
      return;
    }

    const list = marbles
      .filter((marble) => marble && typeof marble.id === 'number')
      .slice()
      .sort((a, b) => a.id - b.id);
    if (list.length === 0) {
      return;
    }

    const chamberW = maxX - minX;
    const chamberH = maxY - minY;
    const columns = Math.max(
      3,
      Math.min(
        list.length,
        Math.max(3, Math.floor(chamberW / 0.42) + 1),
      ),
    );
    const rows = Math.max(1, Math.ceil(list.length / columns));
    const spacingX = columns <= 1
      ? 0
      : clampNum(chamberW / Math.max(1, columns - 1), 0.24, 0.54);
    const rowStep = rows <= 1
      ? 0
      : clampNum(chamberH / Math.max(1, rows - 1), 0.32, 0.82);
    const rowStartY = maxY;

    let adjusted = 0;
    for (let i = 0; i < list.length; i++) {
      const marble = list[i];
      const body = marbleMap[marble.id];
      if (!body || typeof body.SetTransform !== 'function') {
        continue;
      }
      const col = i % columns;
      const row = Math.floor(i / columns);
      const targetX = clampNum(minX + col * spacingX, minX, maxX);
      const targetY = clampNum(rowStartY - row * rowStep, minY, maxY);
      try {
        if (typeof body.SetEnabled === 'function') {
          body.SetEnabled(true);
        }
        if (typeof body.SetAwake === 'function') {
          body.SetAwake(true);
        }
        const nextPos = new Box2D.b2Vec2(targetX, targetY);
        const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
        body.SetTransform(nextPos, angle);
        if (typeof body.SetLinearVelocity === 'function') {
          body.SetLinearVelocity(new Box2D.b2Vec2(0, 0));
        }
        if (typeof body.SetAngularVelocity === 'function') {
          body.SetAngularVelocity(0);
        }
        marble.x = targetX;
        marble.y = targetY;
        adjusted += 1;
      } catch (_) {
      }
    }

    if (adjusted > 0) {
      control.map5SpawnAligned = true;
      postBridge('map5SpawnAligned', { adjusted, outsideCount });
    }
  };

  const updateLaunchChamberPulse = (marbles) => {
    if (
      control.physicsFrozen ||
      !window.roulette ||
      !window.roulette.physics ||
      !Array.isArray(marbles) ||
      marbles.length === 0 ||
      !control.launchChamber ||
      typeof control.launchChamber !== 'object' ||
      window.roulette._isRunning !== true
    ) {
      return;
    }

    const chamber = control.launchChamber;
    const left = Number(chamber.left);
    const right = Number(chamber.right);
    const top = Number(chamber.top);
    const bottom = Number(chamber.bottom);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(right) ||
      !Number.isFinite(top) ||
      !Number.isFinite(bottom) ||
      right - left < 0.8 ||
      bottom - top < 0.8
    ) {
      return;
    }

    const now = Date.now();
    const intervalMs = Math.max(800, Number(chamber.intervalMs) || 2000);
    if (!Number.isFinite(chamber.lastPulseAt)) {
      chamber.lastPulseAt = now;
    }
    if (now - chamber.lastPulseAt < intervalMs) {
      return;
    }

    const physics = window.roulette.physics;
    const marbleMap =
      physics && physics.marbleMap && typeof physics.marbleMap === 'object'
        ? physics.marbleMap
        : null;
    const baseImpulseX = Number(chamber.impulseX) || -2.8;
    const baseImpulseY = Math.max(18, Math.abs(Number(chamber.impulseY) || 34));
    const baseVelocityX = Number(chamber.launchVelocityX) || baseImpulseX * 0.9;
    const baseVelocityY = Math.max(14, Math.abs(Number(chamber.launchVelocityY) || (baseImpulseY * 0.45)));

    let launched = 0;
    marbles.forEach((marble) => {
      if (!marble || typeof marble.id !== 'number') {
        return;
      }
      const mx = Number(marble.x);
      const my = Number(marble.y);
      if (!Number.isFinite(mx) || !Number.isFinite(my)) {
        return;
      }
      if (mx < left || mx > right || my < top || my > bottom) {
        return;
      }

      let fired = false;
      try {
        const body = marbleMap ? marbleMap[marble.id] : null;
        if (body && typeof body.ApplyLinearImpulseToCenter === 'function') {
          const Box2D = physics.Box2D;
          if (Box2D && typeof Box2D.b2Vec2 === 'function') {
            if (typeof body.SetEnabled === 'function') {
              body.SetEnabled(true);
            }
            if (typeof body.SetAwake === 'function') {
              body.SetAwake(true);
            }
            const velocity = new Box2D.b2Vec2(baseVelocityX, -baseVelocityY);
            if (typeof body.SetLinearVelocity === 'function') {
              body.SetLinearVelocity(velocity);
            }
            const impulse = new Box2D.b2Vec2(baseImpulseX, -baseImpulseY);
            body.ApplyLinearImpulseToCenter(impulse, true);
            if (typeof body.ApplyForceToCenter === 'function') {
              const force = new Box2D.b2Vec2(baseImpulseX * 8.5, -baseImpulseY * 8.5);
              body.ApplyForceToCenter(force, true);
            }
            fired = true;
          }
        }
      } catch (_) {
      }

      if (!fired) {
        try {
          if (typeof physics.shakeMarble === 'function') {
            physics.shakeMarble(marble.id);
            physics.shakeMarble(marble.id);
            physics.shakeMarble(marble.id);
            fired = true;
          }
        } catch (_) {
        }
      }

      if (fired) {
        launched += 1;
      }
    });

    if (launched > 0) {
      chamber.lastPulseAt = now;
      if (!Array.isArray(control.bombPulses)) {
        control.bombPulses = [];
      }
      control.bombPulses.push({
        x: (left + right) / 2,
        y: bottom - 0.45,
        startedAt: now,
        ttl: 420,
        radius: Math.max(1.2, (right - left) * 0.42),
        kind: 'launch',
      });
      postBridge('launchPulse', { launched });
    }
  };

  const updateBombTraps = (marbles) => {
    if (
      control.physicsFrozen ||
      !window.roulette ||
      !window.roulette.physics ||
      !Array.isArray(marbles) ||
      marbles.length === 0 ||
      !Array.isArray(control.bombTraps) ||
      control.bombTraps.length === 0
    ) {
      return;
    }
    const toInt = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? Math.floor(num) : fallback;
    };
    const physics = window.roulette.physics;
    const Box2D = physics && physics.Box2D ? physics.Box2D : null;
    const hasVec2 = !!(Box2D && typeof Box2D.b2Vec2 === 'function');
    const mapSources = physics && typeof physics === 'object'
      ? Object.keys(physics)
          .map((key) => physics[key])
          .filter((value) => !!value && typeof value === 'object')
      : [];
    const now = Date.now();
    const pulses = Array.isArray(control.bombPulses) ? control.bombPulses : [];
    control.bombPulses = pulses
      .filter((pulse) => pulse && now - (pulse.startedAt || 0) <= (pulse.ttl || 460))
      .slice(-48);

    const pushPulse = (x, y, radius, ttl, kind = 'bomb') => {
      control.bombPulses.push({
        x,
        y,
        startedAt: now,
        ttl,
        radius,
        kind,
      });
    };
    const resolveTrapBody = (trap) => {
      const entity = trap && trap.entityRef && typeof trap.entityRef === 'object'
        ? trap.entityRef
        : null;
      if (!entity) {
        return null;
      }
      const directBodies = [
        entity.body,
        entity._body,
        entity.b2Body,
        entity.__body,
      ];
      for (let i = 0; i < directBodies.length; i++) {
        const body = directBodies[i];
        if (body && typeof body.SetEnabled === 'function') {
          return body;
        }
      }
      const id = Number(entity.id);
      if (!Number.isFinite(id)) {
        return null;
      }
      for (let i = 0; i < mapSources.length; i++) {
        const src = mapSources[i];
        if (!src || typeof src !== 'object') {
          continue;
        }
        const candidate =
          typeof src.get === 'function'
            ? src.get(id)
            : src[id];
        if (candidate && typeof candidate.SetEnabled === 'function') {
          return candidate;
        }
      }
      return null;
    };
    const disableTrapCollider = (trap) => {
      if (!trap || trap.colliderDisabled === true) {
        return;
      }
      const disableBody = (body) => {
        if (!body) {
          return;
        }
        try {
          if (typeof body.SetEnabled === 'function') {
            body.SetEnabled(false);
          }
          if (typeof body.SetAwake === 'function') {
            body.SetAwake(false);
          }
          if (hasVec2 && typeof body.SetTransform === 'function') {
            const offPos = new Box2D.b2Vec2(-9999, -9999);
            const angle = typeof body.GetAngle === 'function' ? body.GetAngle() : 0;
            body.SetTransform(offPos, angle);
          }
        } catch (_) {
        }
      };
      const body = resolveTrapBody(trap);
      disableBody(body);
      const tx = Number(trap.x);
      const ty = Number(trap.y);
      const baseRadius = Math.max(0.05, Number(trap.baseRadius) || Number(trap.radius) || 0.2);
      const trapShapeRef =
        trap.entityRef &&
        trap.entityRef.shape &&
        typeof trap.entityRef.shape === 'object'
          ? trap.entityRef.shape
          : null;
      const matchedBodies = new Set();
      const processEntry = (entry) => {
        if (!entry || typeof entry !== 'object' || !entry.shape || entry.shape.type !== 'circle') {
          return;
        }
        let matched = false;
        if (trapShapeRef && entry.shape === trapShapeRef) {
          matched = true;
        }
        if (!matched) {
          const ex = Number(entry.x);
          const ey = Number(entry.y);
          if (Number.isFinite(ex) && Number.isFinite(ey)) {
            const dx = ex - tx;
            const dy = ey - ty;
            const distSq = dx * dx + dy * dy;
            const distLimit = Math.max(0.35, baseRadius + 0.28);
            if (distSq <= distLimit * distLimit) {
              const er = Math.abs(Number(entry.shape && entry.shape.radius));
              if (
                !Number.isFinite(er) ||
                Math.abs(er - baseRadius) <= Math.max(0.5, baseRadius * 0.9)
              ) {
                matched = true;
              }
            }
          }
        }
        if (!matched) {
          return;
        }
        disableBody(entry.body);
        entry.x = -9999;
        entry.y = -9999;
        if (entry.shape && entry.shape.type === 'circle') {
          entry.shape.radius = 0.001;
        }
      };
      if (Array.isArray(physics && physics.entities)) {
        physics.entities.forEach((entry) => processEntry(entry));
      }
      const entity = trap.entityRef;
      if (entity && typeof entity === 'object') {
        entity.x = -9999;
        entity.y = -9999;
        if (!entity.position || typeof entity.position !== 'object') {
          entity.position = { x: -9999, y: -9999 };
        } else {
          entity.position.x = -9999;
          entity.position.y = -9999;
        }
        if (entity.shape && entity.shape.type === 'circle') {
          entity.shape.radius = 0.001;
        }
      }
      trap.colliderDisabled = true;
    };

    control.bombTraps.forEach((trap) => {
      if (!trap || typeof trap !== 'object') {
        return;
      }
      const kind = trap.kind === 'burst' ? 'burst' : 'bomb';
      if (kind === 'burst' && trap.destroyed) {
        disableTrapCollider(trap);
        return;
      }
      const tx = Number(trap.x);
      const ty = Number(trap.y);
      const triggerRadius = Math.max(0.22, Number(trap.triggerRadius) || 0.36);
      const blastRadius = Math.max(triggerRadius + 0.5, Number(trap.blastRadius) || 2.2);
      const cooldownMs = kind === 'burst'
        ? Math.max(260, Number(trap.cooldownMs) || 560)
        : Math.max(900, Number(trap.cooldownMs) || 2400);
      const armDelayMs = kind === 'burst'
        ? Math.max(180, Number(trap.armDelayMs) || 420)
        : Math.max(300, Number(trap.armDelayMs) || 900);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
        return;
      }
      if (!Number.isFinite(trap.spawnedAt)) {
        trap.spawnedAt = now;
      }
      if (now - trap.spawnedAt < armDelayMs) {
        return;
      }
      if (Number.isFinite(trap.lastTriggeredAt) && trap.lastTriggeredAt > 0) {
        if (now - trap.lastTriggeredAt < cooldownMs) {
          return;
        }
      }
      const remainingHits = kind === 'burst'
        ? Math.max(0, toInt(trap.hitsLeft, toInt(trap.hitPoints, 1)))
        : 0;
      const triggerEaseBoost = kind === 'burst'
        ? (remainingHits <= 1 ? 0.62 : 0.28)
        : 0;
      const effectiveTriggerRadius = triggerRadius + triggerEaseBoost;

      let triggerMarble = null;
      const triggerRadiusSq = effectiveTriggerRadius * effectiveTriggerRadius;
      for (let i = 0; i < marbles.length; i++) {
        const marble = marbles[i];
        if (!marble) {
          continue;
        }
        const mx = Number(marble.x);
        const my = Number(marble.y);
        if (!Number.isFinite(mx) || !Number.isFinite(my)) {
          continue;
        }
        const dx = mx - tx;
        const dy = my - ty;
        if (dx * dx + dy * dy <= triggerRadiusSq) {
          triggerMarble = marble;
          break;
        }
      }
      if (!triggerMarble) {
        return;
      }

      trap.lastTriggeredAt = now;

      if (kind === 'burst') {
        const rawHits = toInt(trap.hitsLeft, toInt(trap.hitPoints, 3));
        trap.hitsLeft = Math.max(0, rawHits - 1);
        const totalHits = Math.max(1, toInt(trap.hitPoints, 3));
        if (
          trap.entityRef &&
          trap.entityRef.shape &&
          trap.entityRef.shape.type === 'circle'
        ) {
          const hpRatio = Math.max(0, Math.min(1, trap.hitsLeft / totalHits));
          const peeledScale = trap.hitsLeft > 0 ? (0.36 + hpRatio * 0.64) : 0.08;
          trap.entityRef.shape.radius = Math.max(
            0.02,
            (Math.max(0.1, Number(trap.baseRadius) || 0.18) * peeledScale),
          );
        }
        pushPulse(tx, ty, Math.max(0.72, triggerRadius * 1.8), 360, 'burst-hit');
        const nearSq = Math.pow(Math.max(0.8, effectiveTriggerRadius + 0.38), 2);
        marbles.forEach((marble) => {
          if (!marble || typeof marble.id !== 'number') {
            return;
          }
          const mx = Number(marble.x);
          const my = Number(marble.y);
          if (!Number.isFinite(mx) || !Number.isFinite(my)) {
            return;
          }
          const dx = mx - tx;
          const dy = my - ty;
          if (dx * dx + dy * dy > nearSq) {
            return;
          }
          try {
            if (typeof window.roulette.physics.shakeMarble === 'function') {
              window.roulette.physics.shakeMarble(marble.id);
            }
          } catch (_) {
          }
        });
        if (trap.hitsLeft > 0) {
          postBridge('burstBumperHit', { x: tx, y: ty, hitsLeft: trap.hitsLeft });
          return;
        }
        trap.destroyed = true;
        if (
          trap.entityRef &&
          trap.entityRef.shape &&
          trap.entityRef.shape.type === 'circle'
        ) {
          trap.entityRef.shape.radius = 0.01;
          if (trap.entityRef.props && typeof trap.entityRef.props === 'object') {
            trap.entityRef.props.restitution = 0.04;
          }
        }
        disableTrapCollider(trap);
        const finalBlast = Math.max(blastRadius + 0.6, triggerRadius + 1.2);
        pushPulse(tx, ty, finalBlast, 760, 'burst');
        try {
          if (
            typeof window.roulette.physics.impact === 'function' &&
            triggerMarble &&
            typeof triggerMarble.id === 'number'
          ) {
            window.roulette.physics.impact(triggerMarble.id);
          }
        } catch (_) {
        }
        const burstSq = finalBlast * finalBlast;
        marbles.forEach((marble) => {
          if (!marble || typeof marble.id !== 'number') {
            return;
          }
          const mx = Number(marble.x);
          const my = Number(marble.y);
          if (!Number.isFinite(mx) || !Number.isFinite(my)) {
            return;
          }
          const dx = mx - tx;
          const dy = my - ty;
          if (dx * dx + dy * dy > burstSq) {
            return;
          }
          try {
            if (typeof window.roulette.physics.shakeMarble === 'function') {
              window.roulette.physics.shakeMarble(marble.id);
            }
          } catch (_) {
          }
        });
        postBridge('burstBumperExploded', { x: tx, y: ty, radius: finalBlast });
        return;
      }

      pushPulse(tx, ty, blastRadius, 520, 'bomb');

      try {
        if (
          typeof window.roulette.physics.impact === 'function' &&
          triggerMarble &&
          typeof triggerMarble.id === 'number'
        ) {
          window.roulette.physics.impact(triggerMarble.id);
        }
      } catch (_) {
      }

      const blastRadiusSq = blastRadius * blastRadius;
      marbles.forEach((marble) => {
        if (!marble || typeof marble.id !== 'number') {
          return;
        }
        const mx = Number(marble.x);
        const my = Number(marble.y);
        if (!Number.isFinite(mx) || !Number.isFinite(my)) {
          return;
        }
        const dx = mx - tx;
        const dy = my - ty;
        if (dx * dx + dy * dy > blastRadiusSq) {
          return;
        }
        try {
          if (typeof window.roulette.physics.shakeMarble === 'function') {
            window.roulette.physics.shakeMarble(marble.id);
          }
        } catch (_) {
        }
      });
      postBridge('bombExploded', { x: tx, y: ty, radius: blastRadius });
    });
  };

  const resetProgressWatchdog = () => {
    control.runStartedAt = 0;
    control.lastProgressAt = 0;
    control.lastWinnerCount = 0;
    control.lastLeadingY = -1;
    control.lastRescueAt = 0;
    control.rescueCount = 0;
    control.timeoutResolved = false;
  };

  const extractMarbleName = (marble) => {
    if (!marble || typeof marble !== 'object') {
      return '';
    }
    if (typeof marble.name === 'string' && marble.name.trim()) {
      return marble.name.trim();
    }
    if (typeof marble.title === 'string' && marble.title.trim()) {
      return marble.title.trim();
    }
    return '';
  };

  const applyProgressRescue = (marbles, strong = false) => {
    if (
      !window.roulette ||
      !window.roulette.physics ||
      !Array.isArray(marbles) ||
      marbles.length === 0
    ) {
      return false;
    }
    const physics = window.roulette.physics;
    const shake = typeof physics.shakeMarble === 'function' ? physics.shakeMarble : null;
    const impact = typeof physics.impact === 'function' ? physics.impact : null;
    if (!shake && !impact) {
      return false;
    }

    const sorted = marbles
      .map((marble) => ({
        marble,
        y: Number(marble && marble.y),
      }))
      .filter((entry) => entry.marble && typeof entry.marble.id === 'number' && Number.isFinite(entry.y))
      .sort((a, b) => b.y - a.y)
      .map((entry) => entry.marble);
    if (sorted.length === 0) {
      return false;
    }

    const takeCount = strong ? Math.min(sorted.length, 10) : Math.min(sorted.length, 4);
    for (let i = 0; i < takeCount; i++) {
      const marble = sorted[i];
      try {
        if (shake) {
          shake.call(physics, marble.id);
        }
      } catch (_) {
      }
      if (strong && i === 0) {
        try {
          if (impact) {
            impact.call(physics, marble.id);
          }
        } catch (_) {
        }
      }
    }
    return true;
  };

  const ensureCompletionProgress = (marbles, liveTop3, running) => {
    if (control.physicsFrozen) {
      return;
    }
    const now = Date.now();
    const winnerCount = Array.isArray(window.roulette && window.roulette._winners)
      ? window.roulette._winners.length
      : 0;

    if (!running) {
      resetProgressWatchdog();
      control.lastWinnerCount = winnerCount;
      return;
    }

    if (!Number.isFinite(control.runStartedAt) || control.runStartedAt <= 0) {
      control.runStartedAt = now;
    }
    if (!Number.isFinite(control.lastProgressAt) || control.lastProgressAt <= 0) {
      control.lastProgressAt = now;
    }

    let leadingY = -1;
    if (Array.isArray(marbles)) {
      for (let i = 0; i < marbles.length; i++) {
        const marble = marbles[i];
        const y = Number(marble && marble.y);
        if (Number.isFinite(y) && y > leadingY) {
          leadingY = y;
        }
      }
    }

    const winnerProgressed = winnerCount > (Number(control.lastWinnerCount) || 0);
    const yProgressed =
      Number.isFinite(leadingY) &&
      leadingY > (Number(control.lastLeadingY) || -1) + 0.16;
    if (winnerProgressed || yProgressed) {
      control.lastProgressAt = now;
    }
    control.lastWinnerCount = winnerCount;
    if (Number.isFinite(leadingY)) {
      control.lastLeadingY = leadingY;
    }

    const rescueBlockedBySlowMo = control.skillBlockedBySlowMo === true;
    if (rescueBlockedBySlowMo) {
      // 슬로우모션 구간에서는 rescue impulse도 금지:
      // 스킬 이펙트 없이 공이 튕겨 나가는 오인 현상을 방지한다.
      control.lastProgressAt = now;
      control.lastRescueAt = now;
    }
    const stuckMs = now - (Number(control.lastProgressAt) || now);
    const sinceRescueMs = now - (Number(control.lastRescueAt) || 0);
    if (!rescueBlockedBySlowMo && stuckMs > 2800 && sinceRescueMs > 1300) {
      const strong = stuckMs > 6800;
      if (applyProgressRescue(marbles, strong)) {
        control.lastRescueAt = now;
        control.rescueCount = (Number(control.rescueCount) || 0) + 1;
      }
    }

    if (control.ceremonyScheduled || control.ceremonyDone || control.timeoutResolved) {
      return;
    }
    // timeout-based forced winner judgement enabled (extended)
    const runMs = now - (Number(control.runStartedAt) || now);
    if (runMs < 150000) {
      return;
    }

    const byProgress = Array.isArray(marbles)
      ? marbles
          .map((marble) => ({
            name: extractMarbleName(marble),
            y: Number(marble && marble.y),
          }))
          .filter((entry) => entry.name && Number.isFinite(entry.y))
          .sort((a, b) => b.y - a.y)
      : [];
    const fallbackTop = [];
    const seen = new Set();
    const seed = Array.isArray(liveTop3) ? liveTop3 : [];
    seed.forEach((name) => {
      if (typeof name === 'string' && name.trim() && !seen.has(name.trim())) {
        seen.add(name.trim());
        fallbackTop.push(name.trim());
      }
    });
    byProgress.forEach((entry) => {
      if (fallbackTop.length >= ceremonyDisplayCount) {
        return;
      }
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        fallbackTop.push(entry.name);
      }
    });

    if (fallbackTop.length >= ceremonyDisplayCount) {
      control.top3 = fallbackTop.slice(0, ceremonyDisplayCount);
      control.finalWinner = control.top3[0] || '';
      control.finalTop3Key = control.top3.join('\\n');
      control.timeoutResolved = true;
      scheduleCeremonyIfReady(control.top3);
      postBridge('forcedCompletion', {
        reason: 'timeout',
        top3: control.top3,
      });
    }
  };

  hideForApp();
  muteWinnerDomUi();
  disableRecording();
  clearAuxUiObjects();
  const foodImagesReadyNow = ensureFoodImages();
  patchRenderer();
  patchGoalFx();
  patchMarbleRender();
  ensureSkillFxColor();
  ensureSkillPulseFallback();
  applySkillUsageGate();
  ensureCameraZoom();
  ensureCameraFollow();

  if (
    String(control.mapPresetCode || '') === 'FIXED' &&
    control.mapReady === true &&
    !isFixedMapStillApplied()
  ) {
    control.mapReady = false;
    control.prepared = false;
  }

  const expectedMapToken = 'raw:' + String(selectedMapIndex);
  const isMazeStageApplied = false;
  const shouldPrepare =
    candidates.length > 0 &&
    (
      !control.prepared ||
      control.candidateKey !== candidateKey ||
      !control.mapReady ||
      control.requestedMapToken !== expectedMapToken
    );

  if (shouldPrepare) {
    clearCeremonyFx();
    const mapPrepared = safeRandomizeMapLayout();
    if (mapPrepared) {
      applyCandidates();
      ensureReady();
      forceWinningRank();
      control.prepared = true;
      control.candidateKey = candidateKey;
      control.lastSample = null;
      control.movedTicks = 0;
      control.runningTicks = 0;
      control.spinNotified = false;
      resetProgressWatchdog();
    } else {
      control.prepared = false;
      control.candidateKey = '';
      resetProgressWatchdog();
    }
  }

  const currentMapIndexBeforeStart = resolveCurrentMapIndex();
  if (
    candidates.length > 0 &&
    !control.ceremonyScheduled &&
    !control.ceremonyDone &&
    control.mapReady !== true
  ) {
    const retriedMapReady = safeRandomizeMapLayout();
    if (retriedMapReady) {
      applyCandidates();
      ensureReady();
      forceWinningRank();
      control.prepared = true;
      control.candidateKey = candidateKey;
      resetProgressWatchdog();
    } else {
      control.prepared = false;
      control.candidateKey = '';
      resetProgressWatchdog();
    }
  }

  clearAuxUiObjects();
  const currentMapIndex = resolveCurrentMapIndex();
  const mapReadyNow = control.mapReady === true;

  let count =
    window.roulette && typeof window.roulette.getCount === 'function'
      ? window.roulette.getCount()
      : candidates.length;

  // Recovery: if marbles were not populated yet, retry candidate -> marble sync.
  if (
    mapReadyNow &&
    count === 0 &&
    candidates.length > 0 &&
    !control.ceremonyScheduled &&
    !control.ceremonyDone
  ) {
    try {
      applyCandidates();
      ensureReady();
      forceWinningRank();
      const recovered = forcePopulateCandidatesHard();
      if (Number.isFinite(recovered) && recovered > 0) {
        count = recovered;
        control.populateRetryTick = 0;
      } else {
        control.populateRetryTick = (Number(control.populateRetryTick) || 0) + 1;
      }
    } catch (_) {
      control.populateRetryTick = (Number(control.populateRetryTick) || 0) + 1;
    }
  }

  let runningBefore = !!(window.roulette && window.roulette._isRunning === true);
  if (runningBefore && count === 0 && candidates.length > 0) {
    // If started with empty marbles, reset running flag and repopulate.
    try {
      window.roulette._isRunning = false;
    } catch (_) {
    }
    runningBefore = false;
  }

  if (count === 0 && candidates.length > 0) {
    const retryTick = (Number(control.populateRetryTick) || 0) + 1;
    control.populateRetryTick = retryTick;
    if (retryTick % 6 === 0) {
      try {
        applyCandidates();
        ensureReady();
        forceWinningRank();
        const recovered = forcePopulateCandidatesHard();
        if (Number.isFinite(recovered) && recovered > 0) {
          count = recovered;
          control.populateRetryTick = 0;
        }
      } catch (_) {
      }
    }
  } else {
    control.populateRetryTick = 0;
  }

  const winnersSoFar = Array.isArray(window.roulette && window.roulette._winners)
    ? window.roulette._winners.length
    : 0;
  const mapSelectionReady =
    control.mapReady === true &&
    String(control.mapPresetCode || '') === 'FIXED' &&
    control.requestedMapToken === expectedMapToken &&
    isFixedMapStillApplied();
  if (runningBefore && !mapSelectionReady) {
    try {
      window.roulette._isRunning = false;
    } catch (_) {
    }
    runningBefore = false;
  }
  let startMethod = 'none';
  if (
    !runningBefore &&
    count > 0 &&
    mapSelectionReady &&
    foodImagesReadyNow &&
    winnersSoFar === 0 &&
    !control.ceremonyScheduled &&
    !control.ceremonyDone
  ) {
    const rouletteMissing = !window.roulette;
    if (startMethod === 'none' && tryDirectStart()) {
      startMethod = 'direct';
    }
    // Button click path can trigger host-side map reset/race conditions.
    // Keep direct start as the primary path for map consistency.
    if (startMethod === 'none' && rouletteMissing && tryBridgeStart()) {
      startMethod = 'bridge';
    }
    if (startMethod !== 'none') {
      control.startAttempts += 1;
      control.skillLockUntil = Date.now() + 7000;
      if (window.options && typeof window.options === 'object') {
        window.options.useSkills = false;
      }
      ensureCameraFollow(true);
    }
  }

  const marbles = forcePhysics();
  updateDiamondTrapMotion();
  alignMap5SpawnToLaunchChamber(marbles);
  updateLaunchChamberPulse(marbles);
  updateBombTraps(marbles);
  const sample = marbles.slice(0, 5).map((marble) => ({
    x: marble && typeof marble.x === 'number' ? marble.x : null,
    y: marble && typeof marble.y === 'number' ? marble.y : null,
  }));

  let moved = false;
  if (Array.isArray(control.lastSample)) {
    for (let i = 0; i < sample.length; i++) {
    const prev = control.lastSample[i];
    const current = sample[i];
    if (
      prev &&
      current &&
      typeof prev.x === 'number' &&
      typeof current.x === 'number' &&
      typeof prev.y === 'number' &&
      typeof current.y === 'number' &&
      (Math.abs(current.x - prev.x) > 0.0005 || Math.abs(current.y - prev.y) > 0.0005)
    ) {
      moved = true;
      break;
    }
    }
  }

  control.lastSample = sample;

  const running = !!(window.roulette && window.roulette._isRunning === true);

  if (moved) {
    control.movedTicks = (control.movedTicks || 0) + 1;
  } else if (!running) {
    control.movedTicks = 0;
  }

  if (running) {
    control.runningTicks = (control.runningTicks || 0) + 1;
  } else {
    control.runningTicks = 0;
  }

  control.map5StallTicks = 0;
  control.map5RecoveryCount = 0;

  const top3 = Array.isArray(window.roulette && window.roulette._winners)
    ? window.roulette._winners
        .slice(0, ceremonyDisplayCount)
        .map((marble) => (marble && typeof marble.name === 'string' ? marble.name.trim() : ''))
        .filter((name) => !!name)
    : [];
  if (top3.length > 0) {
    control.finalWinner = top3[0];
    control.top3 = top3.slice(0, ceremonyDisplayCount);
  }

  ensureCompletionProgress(marbles, top3, running);

  const ceremonyTop3 = Array.isArray(control.top3)
    ? control.top3
        .slice(0, ceremonyDisplayCount)
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter((name) => !!name)
    : [];
  if (ceremonyTop3.length >= ceremonyDisplayCount) {
    scheduleCeremonyIfReady(ceremonyTop3);
  }

  // Fixed-map mode: disable forced progress/timeout judgement logic.
  // ensureCompletionProgress(marbles, top3, running);

  const winner =
    control.finalWinner ||
    (window.roulette &&
    window.roulette._winner &&
    typeof window.roulette._winner.name === 'string'
      ? window.roulette._winner.name.trim()
      : '');

  if (running && ((control.movedTicks || 0) >= 2 || (control.runningTicks || 0) >= 18)) {
    if (!control.spinNotified) {
      control.spinNotified = true;
      postBridge('spinStarted', { trigger: 'controller', startMethod });
    }
  } else {
    control.spinNotified = false;
  }

  const mapIndexForUi =
    Number.isFinite(control.requestedMapSlot) && Number(control.requestedMapSlot) > 0
      ? Number(control.requestedMapSlot)
      : currentMapIndex;

  return JSON.stringify({
    hasRoulette: !!window.roulette,
    bridgeStartFn: typeof window.startPinballRoulette === 'function',
    prepared: !!control.prepared,
    mapReady: mapReadyNow,
    foodImagesReady: !!foodImagesReadyNow,
    mapIndex: mapIndexForUi,
    mapLabel: typeof control.mapLabel === 'string' ? control.mapLabel : '',
    mapVariantId: typeof control.mapVariantId === 'string' ? control.mapVariantId : '',
    running,
    movedTicks: control.movedTicks || 0,
    runningTicks: control.runningTicks || 0,
    sampleSize: sample.length,
    count,
    startMethod,
    top3,
    winner,
    startAttempts: control.startAttempts || 0,
    rescueCount: control.rescueCount || 0,
    timeoutResolved: !!control.timeoutResolved,
    populateRetryTick: Number(control.populateRetryTick) || 0,
    populateError: typeof control.lastPopulateError === 'string' ? control.lastPopulateError : '',
    mapLayoutError: typeof control.lastMapLayoutError === 'string' ? control.lastMapLayoutError : '',
    map5StallTicks: Number(control.map5StallTicks) || 0,
    map5RecoveryCount: Number(control.map5RecoveryCount) || 0,
    ceremonyScheduled: !!control.ceremonyScheduled,
    ceremonyDone: !!control.ceremonyDone,
    skillFxPatched: !!control.skillFxPatched,
    skillFxColor: typeof control.skillFxColor === 'string' ? control.skillFxColor : '',
    slowMotionActive: !!control.skillBlockedBySlowMo,
  });
})();
''';

    try {
      final raw = await _controller.runJavaScriptReturningResult(js);
      return _decodeJsMap(raw);
    } catch (error) {
      debugPrint('[Pinball] tick failed: $error');
      return <String, dynamic>{
        'tickError': error.toString(),
        'hasRoulette': false,
        'running': false,
        'count': 0,
      };
    }
  }

  Map<String, dynamic>? _decodeJsMap(Object? raw) {
    dynamic current = raw;
    for (var i = 0; i < 3; i++) {
      if (current is Map) {
        return current.map<String, dynamic>(
          (key, value) => MapEntry(key.toString(), value),
        );
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

  int _toInt(Object? value, {int fallback = 0}) {
    if (value is int) {
      return value;
    }
    if (value is double) {
      return value.round();
    }
    if (value is String) {
      return int.tryParse(value) ?? fallback;
    }
    return fallback;
  }

  List<String> _extractStringList(Object? raw) {
    if (raw is List) {
      return raw
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toList(growable: false);
    }
    if (raw is String) {
      final value = raw.trim();
      if (value.isNotEmpty) {
        return <String>[value];
      }
    }
    if (raw is Map) {
      return _extractStringList(raw['top3']);
    }
    return const <String>[];
  }

  String _extractWinnerName(Object? raw) {
    if (raw is String) {
      final winner = raw.trim();
      return winner;
    }
    if (raw is Map) {
      final direct = _extractWinnerName(raw['winner']);
      if (direct.isNotEmpty) {
        return direct;
      }
      final top3 = _extractStringList(raw['top3']);
      if (top3.isNotEmpty) {
        return top3.first;
      }
      return '';
    }
    final fromList = _extractStringList(raw);
    if (fromList.isNotEmpty) {
      return fromList.first;
    }
    return '';
  }

  List<String> _normalizeRankingForResult(
    List<String> rawRanking, {
    required String winner,
  }) {
    final seen = <String>{};
    final normalized = <String>[];
    final winnerName = winner.trim();
    if (winnerName.isNotEmpty) {
      seen.add(winnerName);
      normalized.add(winnerName);
    }
    for (final item in rawRanking) {
      final value = item.trim();
      if (value.isEmpty || seen.contains(value)) {
        continue;
      }
      seen.add(value);
      normalized.add(value);
    }
    if (_waitForFullRanking) {
      for (final candidate in _candidates) {
        final value = candidate.trim();
        if (value.isEmpty || seen.contains(value)) {
          continue;
        }
        seen.add(value);
        normalized.add(value);
      }
      final expected = _expectedRankingCount;
      if (expected > 0 && normalized.length > expected) {
        return normalized.take(expected).toList(growable: false);
      }
    }
    return normalized;
  }

  String _extractMapLabel(Map<String, dynamic>? state) {
    if (state == null) {
      return '';
    }
    final direct = state['mapLabel'];
    if (direct is String) {
      final value = direct.trim();
      if (value.isNotEmpty) {
        return value;
      }
    }

    final mapIndex = _toInt(state['mapIndex'], fallback: -1);
    final variantIdRaw = state['mapVariantId'];
    if (variantIdRaw is String) {
      final variantId = variantIdRaw.trim();
      if (variantId.isNotEmpty) {
        final compact = variantId
            .replaceAll(RegExp(r'^map'), '')
            .replaceAll(RegExp(r'-[a-z0-9]{4,}$'), '')
            .replaceAll(RegExp(r'[^A-Za-z0-9\\-]'), '')
            .toUpperCase();
        if (compact.isNotEmpty) {
          return compact.length > 22 ? compact.substring(0, 22) : compact;
        }
      }
    }
    if (mapIndex > 0) {
      return 'M$mapIndex';
    }
    return '';
  }

  void _syncMapLabel(Map<String, dynamic>? state) {
    final next = _extractMapLabel(state);
    if (next.isEmpty) {
      return;
    }
    if (next == _mapLabel) {
      return;
    }
    _clearMapLabelOverlayTimer();
    final shouldShow = !_didShowMapLabelOverlayOnce;
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
    if (shouldShow) {
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

    final uniqueAssets = candidateToAsset.values.toSet();
    final assetDataUrl = <String, String>{};
    for (final assetPath in uniqueAssets) {
      var dataUrl = await _loadAssetAsDataUrl(assetPath);
      if (dataUrl.isEmpty && assetPath.startsWith('assets/ballimages/')) {
        final fallbackAsset = assetPath.replaceFirst(
          'assets/ballimages/',
          'assets/foodimages/',
        );
        dataUrl = await _loadAssetAsDataUrl(fallbackAsset);
      }
      assetDataUrl[assetPath] = dataUrl;
    }

    final result = <String, String>{};
    for (final entry in candidateToAsset.entries) {
      final dataUrl = assetDataUrl[entry.value];
      if (dataUrl != null && dataUrl.isNotEmpty) {
        result[entry.key] = dataUrl;
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
    var dataUrl = await _loadAssetAsDataUrl('assets/background/finish.png');
    if (dataUrl.isEmpty) {
      dataUrl = await _loadAssetAsDataUrl(
        'assets/ui/pinball/goal_line_tab1.png',
      );
    }
    if (dataUrl.isEmpty) {
      dataUrl = await _loadAssetAsDataUrl(
        'assets/ui/pinball/goal_line_tab1.svg',
      );
    }
    _goalLineImageDataUrl = dataUrl;
    return dataUrl;
  }

  Future<String> _loadAssetAsDataUrl(String assetPath) async {
    try {
      final byteData = await rootBundle.load(assetPath);
      final bytes = byteData.buffer.asUint8List();
      final base64Data = base64Encode(bytes);
      final mimeType = _mimeTypeForAsset(assetPath);
      return 'data:$mimeType;base64,$base64Data';
    } catch (_) {
      return '';
    }
  }

  String _mimeTypeForAsset(String assetPath) {
    final lower = assetPath.toLowerCase();
    if (lower.endsWith('.svg')) {
      return 'image/svg+xml';
    }
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.webp')) {
      return 'image/webp';
    }
    if (lower.endsWith('.gif')) {
      return 'image/gif';
    }
    return 'image/jpeg';
  }

  void _startWinnerMonitor(int generation) {
    _ensureCountdownStarted();
    _startAmbientBannerLoop();
    final ticket = ++_winnerMonitorTicket;
    unawaited(_monitorWinnerFallback(generation, ticket));
  }

  Future<void> _monitorWinnerFallback(int generation, int ticket) async {
    final maxTicks = _waitForFullRanking ? 1250 : 500;
    for (var i = 0; i < maxTicks; i++) {
      if (!mounted ||
          _isFinishing ||
          generation != _startGeneration ||
          ticket != _winnerMonitorTicket) {
        return;
      }

      final tickState = await _runStartTick();
      final runtime = tickState ?? await _readRuntimeResult();
      _updateSlowMotionBanner(runtime);
      _syncMapLabel(runtime);
      final winner = _extractWinnerName(runtime?['winner']);
      final top3 = _extractStringList(runtime?['top3']);
      final ranking = _extractStringList(runtime?['ranking']);
      final finalRanking = _normalizeRankingForResult(
        ranking.isNotEmpty ? ranking : top3,
        winner: winner,
      );
      final running = runtime?['running'] == true;
      final count = _toInt(runtime?['count']);
      final movedTicks = _toInt(runtime?['movedTicks']);
      final recoveryCount = _toInt(runtime?['map5RecoveryCount']);
      final stallTicks = _toInt(runtime?['map5StallTicks']);

      if (i % 25 == 0) {
        debugPrint(
          '[Pinball][watch] map=$_mapLabel running=$running count=$count moved=$movedTicks recovery=$recoveryCount stall=$stallTicks',
        );
      }

      if (_waitForFullRanking) {
        if (winner.isNotEmpty && !running) {
          _finish(winner, ranking: finalRanking);
          return;
        }
        if (winner.isNotEmpty && i % 20 == 0 && mounted && !_isFinishing) {
          setState(() {
            _logPinballStatus(
              '순위 집계 중... (${finalRanking.length}/$_expectedRankingCount)',
            );
          });
        }
        if (i > 1000 && winner.isNotEmpty) {
          _finish(winner, ranking: finalRanking);
          return;
        }
        if (i > 1160 && finalRanking.isNotEmpty) {
          _finish(finalRanking.first, ranking: finalRanking);
          return;
        }
      } else if (winner.isNotEmpty) {
        _finish(winner, ranking: finalRanking);
        return;
      }
      if (top3.isNotEmpty && i % 10 == 0 && mounted && !_isFinishing) {
        setState(() {
          _logPinballStatus('결과 확정 처리 중...');
        });
      }
      if (!_waitForFullRanking && i > 250 && top3.isNotEmpty) {
        _finish(top3.first, ranking: finalRanking);
        return;
      }

      await Future<void>.delayed(const Duration(milliseconds: 120));
    }
  }

  Future<Map<String, dynamic>?> _readRuntimeResult() async {
    const js = '''
(() => {
  const control = window.__appPinballControl || {};
  const liveRanking = Array.isArray(window.roulette && window.roulette._winners)
    ? window.roulette._winners
        .map((marble) => (marble && typeof marble.name === 'string' ? marble.name.trim() : ''))
        .filter((name) => !!name)
    : [];
  const fallbackRanking = Array.isArray(window.roulette && window.roulette._marbles)
    ? window.roulette._marbles
        .slice()
        .sort((left, right) => Number((right && right.y) || 0) - Number((left && left.y) || 0))
        .map((marble) => (marble && typeof marble.name === 'string' ? marble.name.trim() : ''))
        .filter((name) => !!name)
    : [];
  const ranking = [];
  const seen = new Set();
  for (const name of liveRanking) {
    if (!seen.has(name)) {
      seen.add(name);
      ranking.push(name);
    }
  }
  for (const name of fallbackRanking) {
    if (!seen.has(name)) {
      seen.add(name);
      ranking.push(name);
    }
  }
  const top3 = ranking.length > 0
    ? ranking.slice(0, 3)
    : (Array.isArray(control.top3)
      ? control.top3.filter((name) => typeof name === 'string' && name.trim().length > 0)
      : []);
  const winner =
    typeof control.finalWinner === 'string' && control.finalWinner.trim().length > 0
      ? control.finalWinner.trim()
      : (top3.length > 0 ? top3[0] : (
        window.roulette &&
        window.roulette._winner &&
        typeof window.roulette._winner.name === 'string'
          ? window.roulette._winner.name.trim()
          : ''
      ));
  return JSON.stringify({
    winner,
    top3,
    ranking,
    mapLabel: typeof control.mapLabel === 'string' ? control.mapLabel : '',
    mapIndex: Number.isFinite(control.lastMapIndex) ? control.lastMapIndex : -1,
    mapVariantId: typeof control.mapVariantId === 'string' ? control.mapVariantId : '',
    running: !!(window.roulette && window.roulette._isRunning === true),
    count: window.roulette && typeof window.roulette.getCount === 'function'
      ? window.roulette.getCount()
      : 0,
    movedTicks: Number(control.movedTicks) || 0,
    map5StallTicks: Number(control.map5StallTicks) || 0,
    map5RecoveryCount: Number(control.map5RecoveryCount) || 0,
    ceremonyDone: !!control.ceremonyDone,
    ceremonyScheduled: !!control.ceremonyScheduled,
    slowMotionActive: !!control.skillBlockedBySlowMo,
  });
})();
''';

    try {
      final raw = await _controller.runJavaScriptReturningResult(js);
      return _decodeJsMap(raw);
    } catch (_) {
      return null;
    }
  }

  Future<String> _readWinnerFromRuntime() async {
    final runtime = await _readRuntimeResult();
    final winner = _extractWinnerName(runtime?['winner']);
    if (winner.isNotEmpty) {
      return winner;
    }
    final top3 = _extractStringList(runtime?['top3']);
    if (top3.isNotEmpty) {
      return top3.first;
    }
    return '';
  }

  Future<void> _suppressAppChrome() async {
    final js = '''
(() => {
  const selectors = [
    '#settings',
    '#donate',
    '#notice',
    '#btnNotice',
    '#notice .btn',
    '.toast',
    '.result',
    '.history',
    '.copyright',
    '#in_names',
    '.btn-toggle-settings',
    '.row-toggles',
    '#btnShuffle',
    '.btn-winner',
    '#sltMap',
    '.winner',
    '.winner-box',
    '.winner-panel',
    '.winner-popup',
    '.winner-text',
    '.winner-image',
    '#winner',
    '#winnerImage',
    '#winnerName',
  ];
  const hideForApp = () => {
    selectors.forEach((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return;
      }
      element.style.pointerEvents = 'none';
      element.style.display = 'none';
    });
    if (document.body) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }
    const root = document.documentElement;
    if (root) {
      root.style.overflow = 'hidden';
      if (root.classList && typeof root.classList.add === 'function') {
        root.classList.add('from-app');
      }
    }
  };
  hideForApp();
  let pass = 0;
  const timer = window.setInterval(() => {
    hideForApp();
    if (++pass >= 60) {
      window.clearInterval(timer);
    }
  }, 120);
  // Do not force notification localStorage state here.
  // Some host versions throw early DOM init errors on this path.
})();
''';
    try {
      await _controller.runJavaScript(js);
    } catch (_) {
      // ignore pre-start chrome suppression errors, retry in the main bootstrap path.
    }
  }

  Future<void> _onBridgeMessage(JavaScriptMessage message) async {
    final parsed = _parseBridgeMessage(message.message);
    if (parsed == null || !mounted) {
      return;
    }

    final event = parsed['event'];
    if (event == 'goal') {
      final winnerFromPayload = _extractWinnerName(parsed['payload']);
      final rankingFromPayload = _extractStringList(parsed['payload']);
      if (winnerFromPayload.isNotEmpty) {
        _clearStartupTimeout();
        if (!_waitForFullRanking) {
          _finish(winnerFromPayload, ranking: rankingFromPayload);
          return;
        }
      }
      setState(() {
        _logPinballStatus(
          _waitForFullRanking
              ? '1등 확정. 최종 순위 집계 중...'
              : '1등 확정. 결과 화면으로 이동합니다...',
        );
      });
      _didStart = true;
      _clearStartupTimeout();
      _startWinnerMonitor(_startGeneration);
      return;
    }

    if (event == 'spinStarted') {
      _didStart = true;
      _clearStartupTimeout();
      setState(() {
        _logPinballStatus('게임 진행 중...');
      });
      _startWinnerMonitor(_startGeneration);
      return;
    }

    if (event == 'map5Recovery') {
      final payload = parsed['payload'];
      final recoveryCount = _toInt(
        payload is Map ? payload['recoveryCount'] : null,
      );
      setState(() {
        _logPinballStatus('맵5 정체 복구 중... ($recoveryCount)');
      });
      return;
    }

    if (event == 'goalLineImageError') {
      final payload = parsed['payload'];
      final src = payload is Map ? (payload['src']?.toString() ?? '') : '';
      debugPrint('[Pinball] goal line image load failed: $src');
      return;
    }

    if (event == 'winnerResolved' || event == 'ceremonyComplete') {
      final winner = _extractWinnerName(parsed['payload']);
      final rankingFromPayload = _extractStringList(parsed['payload']);
      if (winner.isNotEmpty) {
        if (!_waitForFullRanking) {
          _finish(winner, ranking: rankingFromPayload);
          return;
        }
      }
      final fallbackWinner = await _readWinnerFromRuntime();
      if (fallbackWinner.isNotEmpty) {
        if (!_waitForFullRanking) {
          _finish(fallbackWinner);
        } else {
          _startWinnerMonitor(_startGeneration);
        }
      }
      return;
    }

    if (event == 'ready') {
      if (!_didStart) {
        setState(() {
          _logPinballStatus('게임 대기 중...');
        });
      }
      if (!_isFinishing && !_didStart) {
        await _startPinball();
      }
      return;
    }

    if (event == 'startRejected') {
      _didStart = false;
      setState(() {
        _logPinballStatus('시작이 거절되어 재시도합니다.');
      });
      await _startPinball();
    }
  }

  Map<String, dynamic>? _parseBridgeMessage(String message) {
    dynamic current = message;
    for (var i = 0; i < 3; i++) {
      if (current is Map) {
        return current.map<String, dynamic>(
          (key, value) => MapEntry(key.toString(), value),
        );
      }
      if (current is String) {
        final normalized = current.trim();
        if (normalized.isEmpty ||
            normalized == 'null' ||
            normalized == 'undefined') {
          return null;
        }
        try {
          current = jsonDecode(normalized);
          continue;
        } catch (_) {
          return null;
        }
      }
      return null;
    }
    return null;
  }

  String _normalizeCandidate(String candidate) {
    final trimmed = candidate.trim();
    if (trimmed.isEmpty) {
      return '';
    }

    var value = trimmed.replaceAll('\r', '').replaceAll('\n', '').trim();
    final numberedPrefixPattern = RegExp(r'^\d+\s*[`\.\-:)]\s*');
    if (numberedPrefixPattern.hasMatch(value)) {
      value = value.replaceFirst(numberedPrefixPattern, '').trim();
    }
    return value;
  }

  void _finish(String winner, {List<String> ranking = const <String>[]}) {
    if (_isFinishing) {
      return;
    }
    _isFinishing = true;
    _clearCountdownTimer();
    _clearStartupTimeout();
    _clearSlowMotionBannerTimer();
    _clearAmbientBannerTimer();
    _winnerMonitorTicket += 1;
    final normalizedWinner = winner.trim();
    final normalizedRanking = _normalizeRankingForResult(
      ranking,
      winner: normalizedWinner,
    );
    final payload = <String, dynamic>{
      'winner': normalizedWinner,
      'ranking': normalizedRanking,
      'top3': normalizedRanking.take(3).toList(growable: false),
    };
    if (mounted) {
      if (_waitForFullRanking || normalizedRanking.length > 1) {
        Navigator.pop<Map<String, dynamic>>(context, payload);
      } else {
        Navigator.pop<String>(context, normalizedWinner);
      }
    }
  }

  Future<void> _retry() async {
    _resetCountdown();
    _resetSlowMotionBannerState();
    setState(() {
      _hasError = false;
      _logPinballStatus('핀볼 게임 페이지 로딩 중...');
      _mapLabel = '';
      _showMapLabelOverlay = false;
      _didShowMapLabelOverlayOnce = false;
      _pageLoaded = false;
      _didStart = false;
      _isStarting = false;
      _startGeneration += 1;
      _winnerMonitorTicket += 1;
    });
    _clearStartupTimeout();
    await _loadPinballPage(clearCache: true);
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

  @override
  void dispose() {
    _clearCountdownTimer();
    _clearStartupTimeout();
    _clearMapLabelOverlayTimer();
    _clearLicenseHoldTimer();
    _clearSlowMotionBannerTimer();
    _clearAmbientBannerTimer();
    _isFinishing = true;
    _localPinballBaseUri = null;
    final server = _localPinballServer;
    _localPinballServer = null;
    if (server != null) {
      unawaited(server.close(force: true));
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bannerCacheWidth = max(
      1,
      (MediaQuery.sizeOf(context).width *
              MediaQuery.devicePixelRatioOf(context))
          .round(),
    );
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            WebViewWidget(controller: _controller),
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
              Container(
                alignment: Alignment.center,
                color: Colors.black87,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.wifi_off_rounded,
                        color: Colors.white70,
                        size: 44,
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        '로딩중',
                        style: TextStyle(color: Colors.white),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _retry,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('재시도'),
                      ),
                    ],
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
                        child: Image.asset(
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
                              if (_slowMotionBannerAsset != null) {
                                setState(() {
                                  _slowMotionBannerAsset = null;
                                  _queuedSlowMotionBannerAsset = null;
                                  _slowMotionBannerOffset = Offset.zero;
                                });
                              }
                            });
                            return const SizedBox.shrink();
                          },
                        ),
                      ),
                    ),
                  ),
                ),
              ),
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
      ),
    );
  }
}
