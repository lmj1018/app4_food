import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/food_image_catalog.dart';
import '../../data/models/ranked_place.dart';
import 'place_map_actions.dart';

const LinearGradient _menuIconGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFFE666B4), Color(0xFFE62694), Color(0xFFE6006E)],
);

class StackedPlaceDeck extends StatefulWidget {
  const StackedPlaceDeck({
    required this.items,
    required this.originLat,
    required this.originLng,
    required this.originLabel,
    this.localTopRanks = const <String, int>{},
    super.key,
  });

  final List<RankedPlace> items;
  final double originLat;
  final double originLng;
  final String originLabel;
  final Map<String, int> localTopRanks;

  @override
  State<StackedPlaceDeck> createState() => _StackedPlaceDeckState();
}

class _StackedPlaceDeckState extends State<StackedPlaceDeck> {
  int _frontIndex = 0;
  late final PageController _pageController;
  double _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: _frontIndex);
    _currentPage = _frontIndex.toDouble();
    _pageController.addListener(_handlePageScroll);
  }

  @override
  void didUpdateWidget(covariant StackedPlaceDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.items.isEmpty) {
      _frontIndex = 0;
      _currentPage = 0;
      return;
    }
    if (_frontIndex >= widget.items.length || _frontIndex < 0) {
      _frontIndex = widget.items.length - 1;
      _currentPage = _frontIndex.toDouble();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_pageController.hasClients) return;
        _pageController.jumpToPage(_frontIndex);
      });
    }
  }

  void _handlePageScroll() {
    if (!_pageController.hasClients) return;
    final page = _pageController.page ?? _frontIndex.toDouble();
    if ((page - _currentPage).abs() < 0.0001) return;
    setState(() {
      _currentPage = page;
    });
  }

  @override
  void dispose() {
    _pageController.removeListener(_handlePageScroll);
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalCount = widget.items.length;
    if (totalCount == 0) {
      return const SizedBox.shrink();
    }

    final currentPlace = widget.items[_frontIndex.clamp(0, totalCount - 1)];

    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(26),
          child: Stack(
            fit: StackFit.expand,
            children: [
              PageView.builder(
                controller: _pageController,
                physics: const BouncingScrollPhysics(),
                itemCount: totalCount,
                onPageChanged: (index) {
                  setState(() {
                    _frontIndex = index;
                    _currentPage = index.toDouble();
                  });
                },
                itemBuilder: (context, index) {
                  final place = widget.items[index];
                  return _DeckBackdrop(
                    seed: place.kakao.id,
                    placeName: place.kakao.name,
                    categoryName: place.kakao.categoryName,
                  );
                },
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 14,
                child: _DeckInfoPanel(
                  place: currentPlace,
                  totalCount: totalCount,
                  currentPage: _currentPage,
                  originLat: widget.originLat,
                  originLng: widget.originLng,
                  originLabel: widget.originLabel,
                  localTopRank: widget.localTopRanks[currentPlace.kakao.id],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DeckInfoPanel extends StatelessWidget {
  const _DeckInfoPanel({
    required this.place,
    required this.totalCount,
    required this.currentPage,
    required this.originLat,
    required this.originLng,
    required this.originLabel,
    required this.localTopRank,
  });

  final RankedPlace place;
  final int totalCount;
  final double currentPage;
  final double originLat;
  final double originLng;
  final String originLabel;
  final int? localTopRank;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final distanceM = place.kakao.distanceMeters;
    final distanceText = distanceM == null
        ? '거리 정보 없음'
        : distanceM >= 1000
        ? '${(distanceM / 1000).toStringAsFixed(1)}km'
        : '${distanceM.toStringAsFixed(0)}m';
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => PlaceMapLauncher.openKakaoPlacePage(place),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white.withValues(alpha: 0.20)),
              ),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (localTopRank != null) ...[
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 9,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xE6F5C242),
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(
                                        color: const Color(0xFFF7DE8A),
                                      ),
                                    ),
                                    child: Text(
                                      '많이 찾는곳',
                                      style: textTheme.labelSmall?.copyWith(
                                        color: const Color(0xFF6A4700),
                                        fontWeight: FontWeight.w800,
                                        fontSize: 11,
                                        height: 1.0,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 7),
                            ],
                            _GradientTitleText(
                              text: place.kakao.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.2,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              place.kakao.displayAddress,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: textTheme.bodySmall?.copyWith(
                                color: Colors.white.withValues(alpha: 0.96),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Icon(
                                  Icons.near_me_rounded,
                                  color: Colors.white.withValues(alpha: 0.85),
                                  size: 14,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '남은거리 $distanceText',
                                  style: textTheme.labelSmall?.copyWith(
                                    color: Colors.white.withValues(alpha: 0.9),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      PlaceMapActionButtons(
                        compact: true,
                        width: 82,
                        onNaverTap: () => PlaceMapLauncher.openNaverRoute(
                          originLat: originLat,
                          originLng: originLng,
                          originName: originLabel,
                          destination: place,
                        ),
                        onKakaoTap: () => PlaceMapLauncher.openKakaoRoute(
                          originLat: originLat,
                          originLng: originLng,
                          originName: originLabel,
                          destination: place,
                        ),
                      ),
                    ],
                  ),
                  if (totalCount > 1) ...[
                    const SizedBox(height: 8),
                    _DeckDotNavigator(
                      totalCount: totalCount,
                      currentPage: currentPage,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
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

class _DeckDotNavigator extends StatelessWidget {
  const _DeckDotNavigator({
    required this.totalCount,
    required this.currentPage,
  });

  final int totalCount;
  final double currentPage;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 12,
      child: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minWidth: constraints.maxWidth),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(totalCount, (index) {
                  final distance = (index - currentPage).abs();
                  final t = (1.0 - distance).clamp(0.0, 1.0);
                  final size = lerpDouble(6, 8.5, t)!;
                  final dotColor = Color.lerp(
                    const Color(0xFF5A5F66),
                    const Color(0xFFFF2AA4),
                    t,
                  )!;
                  final glowBlur = lerpDouble(0, 8, t)!;
                  final glowSpread = lerpDouble(0, 1, t)!;
                  final glowAlpha = lerpDouble(0, 0.55, t)!;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Container(
                      width: size,
                      height: size,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: dotColor,
                        boxShadow: t > 0
                            ? [
                                BoxShadow(
                                  color: const Color(
                                    0xFFFF2AA4,
                                  ).withValues(alpha: glowAlpha),
                                  blurRadius: glowBlur,
                                  spreadRadius: glowSpread,
                                ),
                              ]
                            : null,
                      ),
                    ),
                  );
                }),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DeckBackdrop extends StatelessWidget {
  const _DeckBackdrop({
    required this.seed,
    required this.placeName,
    required this.categoryName,
  });

  final String seed;
  final String placeName;
  final String categoryName;

  @override
  Widget build(BuildContext context) {
    final categoryAsset = FoodImageCatalog.categoryAssetFromTexts(<String?>[
      categoryName,
    ]);
    if (categoryAsset != null) {
      return Image.asset(categoryAsset, fit: BoxFit.cover);
    }

    final menuAssets = FoodImageCatalog.assetsFromTexts(<String?>[
      placeName,
      categoryName,
    ], limit: 1);
    final asset = menuAssets.isNotEmpty
        ? menuAssets.first
        : FoodImageCatalog.fallbackAssetsForSeed(seed, count: 1).first;
    return Image.asset(asset, fit: BoxFit.cover);
  }
}
