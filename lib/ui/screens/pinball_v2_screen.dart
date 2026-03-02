import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

class PinballV2ScreenArgs {
  const PinballV2ScreenArgs({
    required this.candidates,
    required this.mapId,
    this.autoStart = true,
  });

  final List<String> candidates;
  final String mapId;
  final bool autoStart;
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
  static const Duration _startupTimeout = Duration(seconds: 30);
  static const List<String> _slowMotionBannerAssets = <String>[
    'assets/background/p1_1.png',
    'assets/background/p2_1.png',
  ];
  static const Duration _slowMotionFirstTrigger = Duration(seconds: 4);
  static const Duration _slowMotionSecondTrigger = Duration(seconds: 8);
  static const Duration _slowMotionBannerDuration = Duration(seconds: 3);

  late final WebViewController _controller;
  HttpServer? _localServer;
  Uri? _localBaseUri;
  Directory? _cachedLocalMapsDir;
  Timer? _startupTimer;
  Timer? _winnerMonitorTimer;

  bool _pageLoaded = false;
  bool _isStarting = false;
  bool _didStart = false;
  bool _isFinishing = false;
  bool _hasError = false;
  String _statusText = 'V2 엔진 로딩 중...';
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

  List<String>? _cachedCandidates;

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

  String _normalizeCandidate(String value) {
    var out = value.trim();
    if (out.isEmpty) {
      return '';
    }
    out = out.replaceAll('\r', '').replaceAll('\n', '').trim();
    out = out.replaceFirst(RegExp(r'^\d+\s*[`\.\-:)]\s*'), '').trim();
    return out;
  }

  void _setStatus(String text, {bool error = false}) {
    if (!mounted) {
      return;
    }
    setState(() {
      _statusText = text;
      if (error) {
        _hasError = true;
      }
    });
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
  }

  void _clearSlowMotionBannerTimer() {
    _slowMotionBannerTimer?.cancel();
    _slowMotionBannerTimer = null;
  }

  void _resetSlowMotionBannerState() {
    _clearSlowMotionBannerTimer();
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
    return remaining[Random().nextInt(remaining.length)];
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
    if (!mounted || !_slowMotionAvailableAssets.contains(assetPath)) {
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
          var bytes = await _tryReadLocalMapBytes(relativePath);
          if (bytes == null) {
            final assetPath = '$_pinballAssetDir/$relativePath';
            final data = await rootBundle.load(assetPath);
            bytes = data.buffer.asUint8List(
              data.offsetInBytes,
              data.lengthInBytes,
            );
          }
          request.response.headers.contentType = _contentTypeForPath(
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

    return _localBaseUri!;
  }

  Future<void> _loadPage({bool clearCache = false}) async {
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
      'mapId': widget.args.mapId.trim().isEmpty
          ? 'v2_default'
          : widget.args.mapId.trim(),
      'appCacheBust': '${DateTime.now().microsecondsSinceEpoch}',
    };
    final uri = baseUri.replace(path: '/index_v2.html', queryParameters: query);
    await _controller.loadRequest(uri);
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

    _isStarting = true;
    _resetSlowMotionBannerState();
    _startStartupTimer();
    _setStatus('V2 초기화 중...');

    final payload = <String, Object>{
      'mapId': widget.args.mapId.trim().isEmpty
          ? 'v2_default'
          : widget.args.mapId.trim(),
      'candidates': _candidates,
      'winningRank': 1,
      'autoStart': widget.args.autoStart,
      'fromApp': true,
      'isPinballApp': true,
    };
    final encodedPayload = jsonEncode(payload);

    try {
      final result = await _controller.runJavaScriptReturningResult('''
(() => {
  const payload = $encodedPayload;
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
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
    for (let attempt = 0; attempt < 280; attempt += 1) {
      suppressUi();
      const api = window.__appPinballV2;
      if (api && typeof api.init === 'function') {
        try {
          const initResult = await api.init(payload);
          suppressUi();
          const state = typeof api.getState === 'function' ? api.getState() : null;
          return JSON.stringify({ ok: initResult && initResult.ok === true, initResult, state });
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
        _setStatus(reason, error: true);
        return;
      }
      _didStart = true;
      _clearStartupTimer();
      _setStatus('게임 진행 중...');
      _startWinnerMonitor();
    } catch (error) {
      _setStatus('V2 초기화 오류: $error', error: true);
    } finally {
      _isStarting = false;
    }
  }

  void _startWinnerMonitor() {
    _clearWinnerMonitor();
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
  const state = api && typeof api.getState === 'function' ? api.getState() : null;
  const running = !!(state && state.running === true);
  const timeScale = Number(roulette && roulette._timeScale);
  const goalDist = Number(roulette && roulette._goalDist);
  const slowMotionActive = !!(
    running
    && ((Number.isFinite(timeScale) && timeScale < 0.999) || (Number.isFinite(goalDist) && goalDist < 5))
  );
  return JSON.stringify({ winner, state, slowMotionActive, timeScale, goalDist });
})()
''');
        final parsed = _decodeJsMap(raw);
        final winner = (parsed?['winner'] ?? '').toString().trim();
        final slowMotionActive = parsed?['slowMotionActive'] == true;
        _updateSlowMotionBanner(slowMotionActive);
        if (winner.isNotEmpty) {
          _finish(winner);
          return;
        }
        final state = parsed?['state'];
        if (state is Map && mounted) {
          final running = state['running'] == true;
          if (!running && !_hasError) {
            final text = (state['statusText'] ?? '').toString().trim();
            if (text.isNotEmpty) {
              _setStatus(text);
            }
          }
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

  void _finish(String winner) {
    if (_isFinishing || !mounted) {
      return;
    }
    _isFinishing = true;
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearSlowMotionBannerTimer();
    Navigator.pop<String>(context, winner);
  }

  Future<void> _onBridgeMessage(JavaScriptMessage message) async {
    final parsed = _parseBridgeMessage(message.message);
    if (parsed == null || !mounted) {
      return;
    }
    final event = parsed['event']?.toString() ?? '';
    if (event == 'goal') {
      final winner = _extractWinnerName(parsed['payload']);
      if (winner.isNotEmpty) {
        _finish(winner);
      }
      return;
    }
    if (event == 'ready') {
      if (!_didStart && !_isStarting) {
        await _startPinball();
      }
      return;
    }
    if (event == 'spinStarted') {
      _didStart = true;
      _clearStartupTimer();
      _setStatus('게임 진행 중...');
    }
  }

  Future<void> _retry() async {
    _clearStartupTimer();
    _clearWinnerMonitor();
    _resetSlowMotionBannerState();
    setState(() {
      _hasError = false;
      _didStart = false;
      _isStarting = false;
      _pageLoaded = false;
      _statusText = 'V2 엔진 다시 로딩 중...';
    });
    await _loadPage(clearCache: true);
  }

  @override
  void initState() {
    super.initState();
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
            if (!mounted) {
              return;
            }
            setState(() {
              _pageLoaded = false;
              _didStart = false;
              _isStarting = false;
              _hasError = false;
              _statusText = 'V2 엔진 로딩 중...';
            });
          },
          onPageFinished: (_) async {
            if (!mounted) {
              return;
            }
            setState(() {
              _pageLoaded = true;
              _statusText = '엔진 연결 대기 중...';
            });
            await _startPinball();
          },
          onWebResourceError: (_) {
            _setStatus('V2 페이지 로드 실패', error: true);
          },
        ),
      );
    unawaited(_loadPage(clearCache: true));
  }

  @override
  void dispose() {
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearSlowMotionBannerTimer();
    final server = _localServer;
    _localServer = null;
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
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(child: WebViewWidget(controller: _controller)),
          Positioned(
            top: 28,
            left: 12,
            right: 12,
            child: IgnorePointer(
              ignoring: true,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xA0101420),
                  border: Border.all(
                    color: _hasError
                        ? const Color(0xFFCC4A5A)
                        : const Color(0xFF2D4C76),
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _statusText,
                  style: TextStyle(
                    color: _hasError
                        ? const Color(0xFFFFA3B1)
                        : const Color(0xFF9EC0FF),
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          if (_hasError)
            Positioned.fill(
              child: Center(
                child: ElevatedButton(
                  onPressed: _retry,
                  child: const Text('다시 시도'),
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
        ],
      ),
    );
  }
}
