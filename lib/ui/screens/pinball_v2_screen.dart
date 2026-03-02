import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/food_image_catalog.dart';

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
  static const String _thirdPartyNoticesAssetPath =
      'assets/licenses/THIRD_PARTY_NOTICES.txt';
  static const List<String> _slowMotionBannerAssets = <String>[
    'assets/background/p1_1.png',
    'assets/background/p2_1.png',
  ];
  static const Duration _slowMotionFirstTrigger = Duration(seconds: 4);
  static const Duration _slowMotionSecondTrigger = Duration(seconds: 8);
  static const Duration _slowMotionBannerDuration = Duration(seconds: 3);
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
  String _mapLabel = '';
  bool _showMapLabelOverlay = false;
  bool _didShowMapLabelOverlayOnce = false;
  Timer? _mapLabelOverlayTimer;
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
  String? _candidateImageKey;
  Map<String, String>? _candidateImageDataUrls;
  String? _goalLineImageDataUrl;
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
  }

  void _clearMapLabelOverlayTimer() {
    _mapLabelOverlayTimer?.cancel();
    _mapLabelOverlayTimer = null;
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
    _pushRuntimeDebug('load_page_begin', <String, Object>{
      'clearCache': clearCache,
      'mapId': widget.args.mapId.trim().isEmpty
          ? 'v2_default'
          : widget.args.mapId.trim(),
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
      'mapId': widget.args.mapId.trim().isEmpty
          ? 'v2_default'
          : widget.args.mapId.trim(),
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
    final fallback = widget.args.mapId.trim();
    return fallback.isEmpty ? 'v2_default' : fallback;
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

    _pushRuntimeDebug('start_pinball_requested', <String, Object>{
      'pageLoaded': _pageLoaded,
      'candidateCount': _candidates.length,
      'autoStart': widget.args.autoStart,
      'mapId': widget.args.mapId.trim().isEmpty
          ? 'v2_default'
          : widget.args.mapId.trim(),
    });
    _isStarting = true;
    _resetSlowMotionBannerState();
    _startStartupTimer();
    _setStatus('V2 초기화 중...', clearError: true);

    final imageDataUrls = await _resolveCandidateImageDataUrls();
    final goalLineImageDataUrl = await _resolveGoalLineImageDataUrl();
    if (!mounted || _isFinishing) {
      _isStarting = false;
      return;
    }

    final payload = <String, Object>{
      'mapId': widget.args.mapId.trim().isEmpty
          ? 'v2_default'
          : widget.args.mapId.trim(),
      'candidates': _candidates,
      'winningRank': 1,
      'autoStart': widget.args.autoStart,
      'fromApp': true,
      'isPinballApp': true,
      'imageDataUrls': imageDataUrls,
      'goalLineImageDataUrl': goalLineImageDataUrl,
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
        _pushRuntimeDebug('start_pinball_failed', parsed ?? reason);
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
          _syncMapLabel(_coerceStringKeyMap(state));
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
    if (event == 'debug') {
      _pushRuntimeDebug('runtime', parsed['payload']);
      return;
    }
    if (event == 'goal') {
      final winner = _extractWinnerName(parsed['payload']);
      if (winner.isNotEmpty) {
        _pushRuntimeDebug('goal', parsed['payload']);
        _finish(winner);
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
            setState(() {
              _pageLoaded = false;
              _didStart = false;
              _isStarting = false;
              _hasError = false;
              _statusText = 'V2 엔진 로딩 중...';
              _mapLabel = '';
              _showMapLabelOverlay = false;
              _didShowMapLabelOverlayOnce = false;
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
    _clearStartupTimer();
    _clearWinnerMonitor();
    _clearMapLabelOverlayTimer();
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
                    onTap: _showLicenseNotice,
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
