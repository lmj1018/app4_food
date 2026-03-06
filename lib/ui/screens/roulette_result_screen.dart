import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';

import '../../core/food_image_catalog.dart';
import '../../data/models/ranked_place.dart';
import '../widgets/glowing_action_button.dart';
import '../widgets/place_map_actions.dart';
import 'nearby_search_screen.dart';
import 'roulette_screen.dart';

const LinearGradient _menuIconGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFFE666B4), Color(0xFFE62694), Color(0xFFE6006E)],
);

class RouletteResultArgs {
  const RouletteResultArgs({
    required this.resultName,
    required this.query,
    this.mode = RouletteMode.food,
    this.radiusMeters = 300,
    this.selectedStore,
    this.selectedReasonLabel,
    this.preferPopularOnOpen = false,
    this.originLat,
    this.originLng,
    this.originLabel,
    this.showSearchButton = true,
    this.fromMood = false,
    this.rankingNames = const <String>[],
  });

  final String resultName;
  final String query;
  final RouletteMode mode;
  final int radiusMeters;
  final RankedPlace? selectedStore;
  final String? selectedReasonLabel;
  final bool preferPopularOnOpen;
  final double? originLat;
  final double? originLng;
  final String? originLabel;
  final bool showSearchButton;
  final bool fromMood;
  final List<String> rankingNames;
}

class RouletteResultScreen extends StatelessWidget {
  const RouletteResultScreen({required this.args, super.key});

  static const String routeName = '/roulette/result';

  final RouletteResultArgs args;

  @override
  Widget build(BuildContext context) {
    final isRestaurant = args.mode == RouletteMode.store;
    final reasonLabel = args.selectedReasonLabel;
    final storeAddress = args.selectedStore?.kakao.displayAddress;
    final storeDistanceText = _distanceLabel(
      args.selectedStore?.kakao.distanceMeters,
    );
    final foodAsset =
        FoodImageCatalog.assetForKeyword(args.resultName) ??
        FoodImageCatalog.assetForKeyword(args.query) ??
        FoodImageCatalog.fallbackAssetsForSeed(args.resultName, count: 1).first;
    final storeAsset = _resolveStoreAsset();
    final searchButtonLabel = isRestaurant
        ? (reasonLabel == null || reasonLabel.isEmpty
              ? '주변검색'
              : '"$reasonLabel" 주변검색')
        : '해당 맛집 추천 보기';
    final allowSearchButton =
        args.mode == RouletteMode.food || args.showSearchButton;
    final rankingNames = _resolveRankingNames();
    final customRankingItems =
        args.mode == RouletteMode.custom && rankingNames.length > 1
        ? rankingNames.sublist(1)
        : const <String>[];

    return Scaffold(
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 94, 18, 100),
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: _ResultVisualCard(
                badgeText: isRestaurant ? '오늘의 식당' : '오늘의 음식',
                title: args.resultName,
                subtitle: isRestaurant
                    ? ((storeAddress != null && storeAddress.isNotEmpty)
                          ? storeAddress
                          : '주소 정보 없음')
                    : '',
                footerText: isRestaurant ? storeDistanceText : reasonLabel,
                imageAsset: isRestaurant ? storeAsset : foodAsset,
                useFullGradient: !isRestaurant,
                showConfetti: !isRestaurant,
                place: isRestaurant ? args.selectedStore : null,
                originLat: args.originLat,
                originLng: args.originLng,
                originLabel: args.originLabel,
              ),
            ),
            const SizedBox(height: 18),
            if (allowSearchButton) ...[
              GlowingActionButton(
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      settings: const RouteSettings(
                        name: '/search/from_result',
                      ),
                      builder: (_) => NearbySearchScreen(
                        args: NearbySearchArgs(
                          initialQuery: args.query,
                          autoSearch: true,
                          stackedDeck: true,
                          initialRadiusMeters: args.radiusMeters,
                          initialPrioritizePopular: args.preferPopularOnOpen,
                        ),
                      ),
                    ),
                  );
                },
                icon: isRestaurant
                    ? Icons.travel_explore_rounded
                    : Icons.layers_rounded,
                label: searchButtonLabel,
              ),
              const SizedBox(height: 10),
            ],
            if (customRankingItems.isNotEmpty)
              _CustomRankingSection(items: customRankingItems),
          ],
        ),
      ),
    );
  }

  List<String> _resolveRankingNames() {
    final seen = <String>{};
    final ranking = <String>[];
    final winner = args.resultName.trim();
    if (winner.isNotEmpty) {
      seen.add(winner);
      ranking.add(winner);
    }
    for (final item in args.rankingNames) {
      final value = item.trim();
      if (value.isEmpty || seen.contains(value)) {
        continue;
      }
      seen.add(value);
      ranking.add(value);
    }
    return ranking;
  }

  String _resolveStoreAsset() {
    final categoryAsset = FoodImageCatalog.categoryAssetFromTexts(<String?>[
      args.selectedReasonLabel,
      args.selectedStore?.kakao.categoryName,
      args.query,
    ]);
    if (categoryAsset != null) {
      return categoryAsset;
    }

    final textHints = <String?>[
      args.selectedReasonLabel,
      args.query,
      args.selectedStore?.kakao.name,
      args.selectedStore?.kakao.categoryName,
    ];
    final matched = FoodImageCatalog.assetsFromTexts(textHints, limit: 1);
    if (matched.isNotEmpty) {
      return matched.first;
    }
    return FoodImageCatalog.fallbackAssetsForSeed(
      args.resultName,
      count: 1,
    ).first;
  }

  String _distanceLabel(double? distanceM) {
    if (distanceM == null) {
      return '거리 정보 없음';
    }
    if (distanceM >= 1000) {
      return '${(distanceM / 1000).toStringAsFixed(1)}km';
    }
    return '${distanceM.toStringAsFixed(0)}m';
  }
}

class _ResultVisualCard extends StatelessWidget {
  const _ResultVisualCard({
    required this.badgeText,
    required this.title,
    required this.subtitle,
    required this.footerText,
    required this.imageAsset,
    required this.useFullGradient,
    required this.showConfetti,
    this.place,
    this.originLat,
    this.originLng,
    this.originLabel,
  });

  final String badgeText;
  final String title;
  final String subtitle;
  final String? footerText;
  final String imageAsset;
  final bool useFullGradient;
  final bool showConfetti;
  final RankedPlace? place;
  final double? originLat;
  final double? originLng;
  final String? originLabel;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final selectedPlace = place;

    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: Stack(
        fit: StackFit.expand,
        children: [
          _ImageBackdropImage(asset: imageAsset),
          if (showConfetti)
            const _ResultConfettiOverlay(duration: Duration(seconds: 6)),
          if (useFullGradient)
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.04),
                    Colors.black.withValues(alpha: 0.48),
                  ],
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(30),
                        color: Colors.white.withValues(alpha: 0.2),
                      ),
                      child: Text(
                        badgeText,
                        style: textTheme.labelLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Positioned(
                      right: -4,
                      bottom: -5,
                      child: Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: 0.2),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.18),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: selectedPlace == null
                            ? null
                            : () => PlaceMapLauncher.openKakaoPlacePage(
                                selectedPlace,
                              ),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.20),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _GradientTitleText(
                                      text: title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: textTheme.headlineSmall?.copyWith(
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    if (subtitle.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        subtitle,
                                        style: textTheme.bodyMedium?.copyWith(
                                          color: Colors.white.withValues(
                                            alpha: 0.96,
                                          ),
                                        ),
                                      ),
                                    ],
                                    if (footerText != null &&
                                        footerText!.isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      Text(
                                        footerText!,
                                        style: textTheme.bodySmall?.copyWith(
                                          color: Colors.white.withValues(
                                            alpha: 0.98,
                                          ),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              if (selectedPlace != null) ...[
                                const SizedBox(width: 12),
                                PlaceMapActionButtons(
                                  compact: true,
                                  width: 82,
                                  onNaverTap: () =>
                                      PlaceMapLauncher.openNaverRoute(
                                        originLat:
                                            originLat ??
                                            selectedPlace.kakao.lat,
                                        originLng:
                                            originLng ??
                                            selectedPlace.kakao.lng,
                                        originName: originLabel ?? '현재 위치',
                                        destination: selectedPlace,
                                      ),
                                  onKakaoTap: () =>
                                      PlaceMapLauncher.openKakaoRoute(
                                        originLat:
                                            originLat ??
                                            selectedPlace.kakao.lat,
                                        originLng:
                                            originLng ??
                                            selectedPlace.kakao.lng,
                                        originName: originLabel ?? '현재 위치',
                                        destination: selectedPlace,
                                      ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomRankingSection extends StatelessWidget {
  const _CustomRankingSection({required this.items});

  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F1F7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEFD7E7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '최종 순위',
            style: textTheme.titleMedium?.copyWith(
              color: const Color(0xFFE6006E),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          _AnimatedRankingList(items: items),
        ],
      ),
    );
  }
}

class _AnimatedRankingList extends StatefulWidget {
  const _AnimatedRankingList({required this.items});

  final List<String> items;

  @override
  State<_AnimatedRankingList> createState() => _AnimatedRankingListState();
}

class _AnimatedRankingListState extends State<_AnimatedRankingList>
    with SingleTickerProviderStateMixin {
  static const double _rankRevealStepMs = 500;
  static const double _rankRowMotionMs = 320;
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    final count = math.max(1, widget.items.length);
    final totalMs =
        ((count - 1) * _rankRevealStepMs + _rankRowMotionMs).round();
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: totalMs),
    )..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color _nameColorForIndex(int index) {
    const baseColor = Color(0xFFE6006E);
    final hsl = HSLColor.fromColor(baseColor);
    final lightness = (hsl.lightness - 0.07 - (index * 0.022)).clamp(
      0.26,
      0.58,
    );
    final saturation = (hsl.saturation * 0.72).clamp(0.42, 0.88);
    return hsl.withLightness(lightness).withSaturation(saturation).toColor();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final totalMs =
            _controller.duration?.inMilliseconds.toDouble() ??
            (_rankRevealStepMs + _rankRowMotionMs);
        final nowMs = _controller.value * totalMs;
        final rows = <Widget>[];
        for (var i = 0; i < widget.items.length; i++) {
          final rowStartMs = i * _rankRevealStepMs;
          final localProgress =
              ((nowMs - rowStartMs) / _rankRowMotionMs).clamp(0.0, 1.0)
                  .toDouble();
          final progress = Curves.easeOutCubic.transform(localProgress);
          final translateX = (1 - progress) * -42;
          final rank = i + 2;
          rows.add(
            Opacity(
              opacity: progress.clamp(0.0, 1.0),
              child: Transform.translate(
                offset: Offset(translateX, 0),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 34,
                        child: _GradientTitleText(
                          text: '$rank등',
                          style: textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          widget.items[i],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: textTheme.bodyLarge?.copyWith(
                            color: _nameColorForIndex(i),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }
        return Column(children: rows);
      },
    );
  }
}

class _ImageBackdropImage extends StatelessWidget {
  const _ImageBackdropImage({required this.asset});

  final String asset;

  @override
  Widget build(BuildContext context) {
    return Image.asset(asset, fit: BoxFit.cover);
  }
}

class _GradientTitleText extends StatelessWidget {
  const _GradientTitleText({
    required this.text,
    required this.style,
    this.maxLines,
    this.overflow,
  });

  final String text;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (bounds) => _menuIconGradient.createShader(bounds),
      child: Text(
        text,
        maxLines: maxLines,
        overflow: overflow,
        style: style?.copyWith(color: Colors.white),
      ),
    );
  }
}

class _ResultConfettiOverlay extends StatefulWidget {
  const _ResultConfettiOverlay({required this.duration});

  final Duration duration;

  @override
  State<_ResultConfettiOverlay> createState() => _ResultConfettiOverlayState();
}

class _ResultConfettiOverlayState extends State<_ResultConfettiOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_ConfettiPiece> _pieces;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _pieces = _buildPieces();
    _controller = AnimationController(vsync: this, duration: widget.duration)
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed && mounted) {
          setState(() {
            _done = true;
          });
        }
      })
      ..forward();
  }

  List<_ConfettiPiece> _buildPieces() {
    final random = math.Random(250225);
    const palette = <Color>[
      Color(0xFFFF0054),
      Color(0xFFFF6D00),
      Color(0xFFFFD600),
      Color(0xFF76FF03),
      Color(0xFF00E5FF),
      Color(0xFF2979FF),
      Color(0xFF7C4DFF),
      Color(0xFFE040FB),
      Color(0xFFFF4081),
      Color(0xFF00F5D4),
      Color(0xFFFF1744),
      Color(0xFFFFEA00),
    ];
    const emitterXBiases = <double>[-0.18, 0.0, 0.18];
    const burstIntervalMs = 340.0;
    final totalMs = widget.duration.inMilliseconds.toDouble();
    final burstCount = math.max(
      10,
      ((totalMs - 1200.0) / burstIntervalMs).floor(),
    );
    const piecesPerBurst = 22;
    final pieces = <_ConfettiPiece>[];

    for (var burst = 0; burst < burstCount; burst++) {
      final burstStartMs = burst * burstIntervalMs;
      for (var i = 0; i < piecesPerBurst; i++) {
        final emitterSeed = random.nextDouble();
        final emitterIndex = emitterSeed < 0.34
            ? 0
            : (emitterSeed < 0.66 ? 1 : 2);
        final emitterX =
            emitterXBiases[emitterIndex] + (random.nextDouble() * 2 - 1) * 0.03;
        final emitterY = 0.05 + random.nextDouble() * 0.05;

        double vx;
        if (emitterIndex == 0) {
          vx = 90 + random.nextDouble() * 180;
        } else if (emitterIndex == 1) {
          vx = (random.nextDouble() * 2 - 1) * (150 + random.nextDouble() * 80);
        } else {
          vx = -(90 + random.nextDouble() * 180);
        }
        final vy =
            -(350 + random.nextDouble() * 280 + (emitterIndex == 1 ? 70 : 0));

        pieces.add(
          _ConfettiPiece(
            startMs: burstStartMs + random.nextDouble() * 220,
            lifeMs: 2200 + random.nextDouble() * 2300,
            emitterXBias: emitterX,
            emitterYBias: emitterY,
            vx: vx,
            vy: vy,
            gravity: 760 + random.nextDouble() * 440,
            size: 5 + random.nextDouble() * 6,
            wobble: 6 + random.nextDouble() * 10,
            wobbleFreq: 5.4 + random.nextDouble() * 5.0,
            phase: random.nextDouble() * math.pi * 2,
            spin: (random.nextDouble() * 2 - 1) * math.pi * 3.2,
            alpha: 0.74 + random.nextDouble() * 0.26,
            color: palette[random.nextInt(palette.length)],
            isCircle: random.nextDouble() < 0.28,
          ),
        );
      }
    }

    return pieces;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return const SizedBox.shrink();
    }
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return CustomPaint(
            painter: _ResultConfettiPainter(
              pieces: _pieces,
              progress: _controller.value,
              durationMs: widget.duration.inMilliseconds,
            ),
            size: Size.infinite,
          );
        },
      ),
    );
  }
}

class _ConfettiPiece {
  const _ConfettiPiece({
    required this.startMs,
    required this.lifeMs,
    required this.emitterXBias,
    required this.emitterYBias,
    required this.vx,
    required this.vy,
    required this.gravity,
    required this.size,
    required this.wobble,
    required this.wobbleFreq,
    required this.phase,
    required this.spin,
    required this.alpha,
    required this.color,
    required this.isCircle,
  });

  final double startMs;
  final double lifeMs;
  final double emitterXBias;
  final double emitterYBias;
  final double vx;
  final double vy;
  final double gravity;
  final double size;
  final double wobble;
  final double wobbleFreq;
  final double phase;
  final double spin;
  final double alpha;
  final Color color;
  final bool isCircle;
}

class _ResultConfettiPainter extends CustomPainter {
  const _ResultConfettiPainter({
    required this.pieces,
    required this.progress,
    required this.durationMs,
  });

  final List<_ConfettiPiece> pieces;
  final double progress;
  final int durationMs;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) {
      return;
    }
    final t = progress.clamp(0.0, 1.0);
    final nowMs = t * durationMs;
    final tailFade = ((durationMs - nowMs) / 1200).clamp(0.0, 1.0);
    final origin = Offset(size.width * 0.5, size.height * 0.52);
    final scale = (size.shortestSide / 420).clamp(0.78, 1.85);
    final paint = Paint()..style = PaintingStyle.fill;

    for (final piece in pieces) {
      if (nowMs < piece.startMs) {
        continue;
      }
      final lifeMs = nowMs - piece.startMs;
      if (lifeMs > piece.lifeMs) {
        continue;
      }

      final lifeT = (lifeMs / piece.lifeMs).clamp(0.0, 1.0);
      final sec = lifeMs / 1000.0;
      final dx =
          origin.dx +
          piece.emitterXBias * size.width +
          piece.vx * scale * sec +
          math.sin(piece.phase + sec * piece.wobbleFreq) * piece.wobble * scale;
      final dy =
          origin.dy +
          piece.emitterYBias * size.height +
          piece.vy * scale * sec +
          0.5 * piece.gravity * scale * sec * sec;
      if (dy > size.height + 28 || dx < -48 || dx > size.width + 48) {
        continue;
      }

      final lifeFade = math.pow(1.0 - lifeT, 1.12).toDouble();
      final alpha = (piece.alpha * lifeFade * tailFade).clamp(0.0, 1.0);
      if (alpha <= 0.03) {
        continue;
      }

      paint.color = piece.color.withValues(alpha: alpha);
      final glowPaint = Paint()
        ..style = PaintingStyle.fill
        ..color = piece.color.withValues(alpha: alpha * 0.35);
      canvas.save();
      canvas.translate(dx, dy);
      canvas.rotate(piece.spin * sec);
      canvas.drawCircle(Offset.zero, piece.size * 0.7 * scale, glowPaint);
      if (piece.isCircle) {
        canvas.drawCircle(Offset.zero, piece.size * 0.42 * scale, paint);
      } else {
        final rect = Rect.fromCenter(
          center: Offset.zero,
          width: piece.size * scale,
          height: piece.size * 0.56 * scale,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(rect, const Radius.circular(2)),
          paint,
        );
      }
      paint.color = Colors.white.withValues(alpha: alpha * 0.42);
      canvas.drawCircle(
        Offset(piece.size * 0.1 * scale, -piece.size * 0.12 * scale),
        piece.size * 0.14 * scale,
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ResultConfettiPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.durationMs != durationMs ||
        oldDelegate.pieces != pieces;
  }
}
