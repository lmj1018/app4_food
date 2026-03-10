import 'dart:math';
import 'package:flutter/material.dart';
import 'dart:developer' as developer;

import '../../core/config/app_env.dart';
import '../../data/models/place_sort.dart';
import '../../data/models/ranked_place.dart';
import '../../services/exceptions.dart';
import '../../services/google_meta_cache.dart';
import '../../services/google_places_client.dart';
import '../../services/hybrid_ranking_service.dart';
import '../../services/kakao_place_search_client.dart';
import '../../services/naver_local_cache.dart';
import '../../services/naver_local_search_client.dart';
import '../../services/naver_usage_guard.dart';
import '../../services/shared_preferences_cache_store.dart';
import '../../services/device_location_service.dart';
import '../widgets/place_card.dart';
import '../widgets/stacked_place_deck.dart';

class NearbySearchArgs {
  const NearbySearchArgs({
    this.initialQuery,
    this.autoSearch = false,
    this.stackedDeck = false,
    this.sourceTitle,
    this.initialRadiusMeters = 1000,
    this.initialPrioritizePopular = false,
  });

  final String? initialQuery;
  final bool autoSearch;
  final bool stackedDeck;
  final String? sourceTitle;
  final int initialRadiusMeters;
  final bool initialPrioritizePopular;
}

class NearbySearchScreen extends StatefulWidget {
  const NearbySearchScreen({this.args = const NearbySearchArgs(), super.key});

  static const String routeName = '/search';
  final NearbySearchArgs args;

  @override
  State<NearbySearchScreen> createState() => _NearbySearchScreenState();
}

class _NearbySearchScreenState extends State<NearbySearchScreen> {
  final TextEditingController _queryController = TextEditingController();
  final SharedPreferencesCacheStore _cacheStore = SharedPreferencesCacheStore();
  final DeviceLocationService _locationService = DeviceLocationService();

  late final HybridRankingService _hybridService = HybridRankingService(
    kakaoClient: KakaoPlaceSearchClient(apiKey: AppEnv.kakaoRestApiKey),
    googleClient: GooglePlacesHttpClient(apiKey: AppEnv.googlePlacesApiKey),
    naverClient:
        AppEnv.naverClientId.isNotEmpty && AppEnv.naverClientSecret.isNotEmpty
        ? NaverLocalSearchClient(
            clientId: AppEnv.naverClientId,
            clientSecret: AppEnv.naverClientSecret,
            cache: NaverLocalCache(store: _cacheStore),
            usageGuard: NaverUsageGuard(
              store: _cacheStore,
              dailyQuota: AppEnv.naverDailyQuota,
            ),
            enableDebugLogs: AppEnv.enableHybridDebugLogs,
          )
        : null,
    cache: GoogleMetaCache(store: _cacheStore),
    enableDebugLogs: AppEnv.enableHybridDebugLogs,
    enableGoogleSignal: false,
  );

  List<RankedPlace> _items = const <RankedPlace>[];
  bool _prioritizePopularPlaces = false;
  bool _reviewSignalsLoaded = false;
  bool _isLoading = false;
  bool _hasSearched = false;
  String? _errorText;

  double _lat = 0;
  double _lng = 0;
  String _locationLabel = '현재 위치 확인 중';
  int _searchRadiusM = 1000;
  static const List<int> _radiusOptions = [300, 500, 1000, 2000, 3000];

  bool get _isRecommendationList =>
      widget.args.autoSearch && widget.args.stackedDeck;

  List<RankedPlace> get _displayItems {
    if (!_isRecommendationList) {
      return _items;
    }
    final items = List<RankedPlace>.from(_items);
    final popularPlaceRanks = _resolvePopularPlaceRanks(items);
    items.sort((a, b) {
      if (_prioritizePopularPlaces) {
        final rankA = popularPlaceRanks[a.kakao.id];
        final rankB = popularPlaceRanks[b.kakao.id];
        if (rankA != null && rankB == null) {
          return -1;
        }
        if (rankA == null && rankB != null) {
          return 1;
        }
        if (rankA != null && rankB != null) {
          final topCompare = rankA.compareTo(rankB);
          if (topCompare != 0) {
            return topCompare;
          }
        }
      }
      final distanceCompare = a.kakao.distanceForSort.compareTo(
        b.kakao.distanceForSort,
      );
      if (distanceCompare != 0) {
        return distanceCompare;
      }
      return a.kakao.name.compareTo(b.kakao.name);
    });
    return items;
  }

  Map<String, int> _resolvePopularPlaceRanks(List<RankedPlace> items) {
    final withSignal =
        items.where((item) {
          final rank = item.naverReviewRank;
          return rank != null && rank > 0;
        }).toList()..sort((a, b) {
          final rankA = a.naverReviewRank ?? 1 << 30;
          final rankB = b.naverReviewRank ?? 1 << 30;
          final rankCompare = rankA.compareTo(rankB);
          if (rankCompare != 0) {
            return rankCompare;
          }
          final distanceCompare = a.kakao.distanceForSort.compareTo(
            b.kakao.distanceForSort,
          );
          if (distanceCompare != 0) {
            return distanceCompare;
          }
          return a.kakao.name.compareTo(b.kakao.name);
        });

    final result = <String, int>{};
    for (final item in withSignal) {
      final rank = item.naverReviewRank;
      if (rank != null) {
        result[item.kakao.id] = rank;
      }
    }
    return result;
  }

  @override
  void initState() {
    super.initState();
    final initialQuery = widget.args.initialQuery?.trim();
    _searchRadiusM = widget.args.initialRadiusMeters.clamp(300, 20000).toInt();
    _prioritizePopularPlaces = widget.args.initialPrioritizePopular;
    if (initialQuery != null && initialQuery.isNotEmpty) {
      _queryController.text = initialQuery;
    }
    _loadCurrentLocation(silentFail: true);

    if (widget.args.autoSearch &&
        initialQuery != null &&
        initialQuery.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _performSearch();
      });
    }
  }

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  Future<bool> _loadCurrentLocation({bool silentFail = false}) async {
    final position = await _locationService.getCurrentPosition();
    if (!mounted) {
      return false;
    }
    if (position == null) {
      final hasCached = _lat.abs() > 0.000001 || _lng.abs() > 0.000001;
      if (hasCached) {
        setState(() {
          _locationLabel = '최근 위치 기준';
        });
        return true;
      }
      setState(() {
        _locationLabel = '현재 위치 확인 필요';
      });
      if (!silentFail) {
        setState(() {
          _errorText = '현재 위치를 확인할 수 없습니다. 위치 권한을 허용해 주세요.';
        });
      }
      return false;
    }
    setState(() {
      _lat = position.latitude;
      _lng = position.longitude;
      _locationLabel = '현재 위치 기준';
    });
    return true;
  }

  Future<void> _performSearch() async {
    FocusManager.instance.primaryFocus?.unfocus();
    return _performSearchInternal(enableReviewSignal: _prioritizePopularPlaces);
  }

  Future<void> _performSearchInternal({
    required bool enableReviewSignal,
  }) async {
    final query = _queryController.text.trim();
    if (query.isEmpty) {
      setState(() {
        _errorText = '음식명, 메뉴명, 상호명 중 하나를 입력해 주세요.';
      });
      return;
    }
    final hasLocation = await _loadCurrentLocation();
    if (!hasLocation) {
      return;
    }

    setState(() {
      _isLoading = true;
      _hasSearched = true;
      _errorText = null;
      if (_isRecommendationList && !enableReviewSignal) {
        _reviewSignalsLoaded = false;
      }
    });

    try {
      final sortMode = PlaceSort.distance;
      final shouldUseNaverSignal = _isRecommendationList
          ? (_prioritizePopularPlaces && enableReviewSignal)
          : true;
      final ranked = await _hybridService.searchHybrid(
        query: query,
        lat: _lat,
        lng: _lng,
        radius: _searchRadiusM,
        sort: sortMode,
        enableNaverSignal: shouldUseNaverSignal,
      );
      if (AppEnv.enableHybridDebugLogs) {
        final topMap = _resolvePopularPlaceRanks(ranked);
        final naverRanks = ranked
            .where((item) => item.naverReviewRank != null)
            .take(20)
            .map((item) => '${item.kakao.name}:${item.naverReviewRank}')
            .join(', ');
        developer.log(
          'UI summary query="$query" naverRanks=[$naverRanks] localTopMap=$topMap',
          name: 'NearbySearchScreen',
        );
      }
      if (!mounted) {
        return;
      }
      setState(() {
        _items = ranked;
        if (_isRecommendationList && shouldUseNaverSignal) {
          _reviewSignalsLoaded = ranked.any(
            (item) => item.hasNaverReviewSignal,
          );
        }
      });
    } on MissingApiKeyException {
      setState(() {
        _errorText = '필수 설정값이 누락되었습니다. 실행 옵션을 확인해 주세요.';
      });
    } on ApiRequestException catch (e) {
      setState(() {
        if (e.statusCode == 429 && e.message.isNotEmpty) {
          _errorText = e.message;
          return;
        }
        final codeText = e.statusCode == null ? '' : ' (오류코드: ${e.statusCode})';
        _errorText = '검색 요청에 실패했습니다.$codeText 잠시 후 다시 시도해 주세요.';
      });
    } catch (_) {
      setState(() {
        _errorText = '검색 중 오류가 발생했습니다. 다시 시도해 주세요.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final displayItems = _displayItems;
    final localTopRanks = _prioritizePopularPlaces
        ? _resolvePopularPlaceRanks(displayItems)
        : const <String, int>{};
    final showDefaultStateImage =
        !_isLoading && displayItems.isEmpty && !_hasSearched;
    final showEmptyStateImage =
        !_isLoading && displayItems.isEmpty && _hasSearched;

    return Scaffold(
      extendBody: true,
      extendBodyBehindAppBar: true,
      body: SafeArea(
        top: false,
        bottom: false,
        child: Stack(
          children: [
            if (showDefaultStateImage || showEmptyStateImage)
              Positioned(
                bottom: 20,
                left: -20,
                right: -20,
                child: IgnorePointer(
                  child: Center(
                    child: _AnimatedStateImage(
                      assetPath: showEmptyStateImage
                          ? 'assets/background/empty.png'
                          : 'assets/background/search.png',
                    ),
                  ),
                ),
              ),
            ListView(
              padding: const EdgeInsets.fromLTRB(16, 94, 16, 100),
              children: [
                if (!_isRecommendationList) ...[
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 600),
                    curve: Curves.easeOutCubic,
                    height: (_hasSearched && displayItems.isNotEmpty)
                        ? 0
                        : MediaQuery.of(context).size.height * 0.17,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      0,
                      10,
                      0,
                      14,
                    ), // 네온 글로우를 위아래 여백만 확보 (양옆은 리스트뷰 여백 활용)
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Card(
                          color: const Color(0xFFE8ECEE),
                          elevation: 0,
                          margin: EdgeInsets.zero,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                            side: const BorderSide(
                              color: Color(0xFFD8E0E2),
                              width: 1,
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: TextField(
                                        controller: _queryController,
                                        textInputAction: TextInputAction.search,
                                        onSubmitted: (_) => _performSearch(),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFF1D4E57),
                                        ),
                                        decoration: InputDecoration(
                                          isDense: true,
                                          contentPadding:
                                              const EdgeInsets.symmetric(
                                                horizontal: 16,
                                                vertical: 12,
                                              ),
                                          hintText: '예) 피자, 중식, 길동분식',
                                          hintStyle: TextStyle(
                                            color: Colors.grey.withValues(
                                              alpha: 0.5,
                                            ),
                                            fontSize: 12,
                                          ),
                                          filled: true,
                                          fillColor: Colors.white,
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(
                                              24,
                                            ),
                                            borderSide: const BorderSide(
                                              color: Color(0xFFD8E0E2),
                                            ),
                                          ),
                                          enabledBorder: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(
                                              24,
                                            ),
                                            borderSide: const BorderSide(
                                              color: Color(0xFFD8E0E2),
                                            ),
                                          ),
                                          focusedBorder: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(
                                              24,
                                            ),
                                            borderSide: const BorderSide(
                                              color: Color(0xFFD81A60),
                                              width: 1.5,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    SizedBox(
                                      width: 90,
                                      child: _GlowingSearchButton(
                                        onTap: _performSearch,
                                        isSearching: _isLoading,
                                        label: _isLoading ? '검색중' : '검색',
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                _AnimatedSegmentedControl<int>(
                                  items: _radiusOptions,
                                  selectedItem: _searchRadiusM,
                                  itemLabelBuilder: (radius) =>
                                      _radiusLabel(radius),
                                  onItemSelected: (radius) {
                                    setState(() {
                                      _searchRadiusM = radius;
                                    });
                                  },
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    ActionChip(
                                      avatar: const Icon(
                                        Icons.my_location_rounded,
                                        size: 18,
                                        color: Color(0xFFD81A60), // 네온 핑크
                                      ),
                                      label: Text(_locationLabel),
                                      onPressed: () {
                                        _loadCurrentLocation();
                                      },
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        Positioned.fill(
                          child: IgnorePointer(
                            child: CustomPaint(painter: _NeonPainter()),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (_errorText != null) ...[
                  const SizedBox(height: 12),
                  Center(
                    child: Text(
                      _errorText!,
                      textAlign: TextAlign.center,
                      style: textTheme.bodyMedium?.copyWith(
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                if (_isLoading)
                  const Padding(
                    padding: EdgeInsets.only(top: 10),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (displayItems.isNotEmpty) ...[
                  if (widget.args.stackedDeck) ...[
                    StackedPlaceDeck(
                      items: displayItems,
                      originLat: _lat,
                      originLng: _lng,
                      originLabel: _locationLabel,
                      localTopRanks: localTopRanks,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (_isRecommendationList) ...[
                    _AnimatedSegmentedControl<bool>(
                      items: const [false, true],
                      selectedItem: _prioritizePopularPlaces,
                      itemLabelBuilder: (prioritizePopular) =>
                          prioritizePopular ? '많이찾는곳 우선' : '거리 우선',
                      onItemSelected: (prioritizePopular) {
                        if (_prioritizePopularPlaces == prioritizePopular) {
                          return;
                        }
                        final shouldFetchReviewSignal =
                            prioritizePopular && !_reviewSignalsLoaded;
                        setState(() {
                          _prioritizePopularPlaces = prioritizePopular;
                          if (!prioritizePopular) {
                            _reviewSignalsLoaded = false;
                          }
                        });
                        if (_isLoading) {
                          return;
                        }
                        if (shouldFetchReviewSignal) {
                          _performSearchInternal(enableReviewSignal: true);
                          return;
                        }
                        if (!prioritizePopular) {
                          _performSearchInternal(enableReviewSignal: false);
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                  ],
                  ...displayItems.map(
                    (item) => PlaceCard(
                      place: item,
                      localTopRank: localTopRanks[item.kakao.id],
                      showMapButtons: true,
                      originLat: _lat,
                      originLng: _lng,
                      originLabel: _locationLabel,
                      cardTapOpensKakao: true,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _radiusLabel(int meters) {
    if (meters >= 1000) {
      final km = meters / 1000;
      final kmText = km == km.roundToDouble()
          ? km.toStringAsFixed(0)
          : km.toStringAsFixed(1);
      return '${kmText}km';
    }
    return '${meters}m';
  }
}

class _GlowingSearchButton extends StatefulWidget {
  const _GlowingSearchButton({
    required this.onTap,
    required this.isSearching,
    required this.label,
  });

  final VoidCallback? onTap;
  final bool isSearching;
  final String label;

  @override
  State<_GlowingSearchButton> createState() => _GlowingSearchButtonState();
}

class _GlowingSearchButtonState extends State<_GlowingSearchButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4000),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) {
      return Container(
        width: double.infinity,
        height: 48,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          color: const Color(0xFF2B2B2D),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.1),
            width: 1.0,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.travel_explore_rounded,
              color: Colors.white.withValues(alpha: 0.3),
              size: 20,
            ),
            const SizedBox(width: 6),
            Text(
              widget.label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.3),
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: widget.isSearching ? null : widget.onTap,
      child: SizedBox(
        height: 48,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Transform.scale(
              scale: widget.isSearching ? 0.95 : 1.0,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: double.infinity,
                    height: 48,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(
                            0xFFC764D6,
                          ).withValues(alpha: 0.35),
                          blurRadius: 8,
                          spreadRadius: 0,
                        ),
                        BoxShadow(
                          color: const Color(0xFF6328A0).withValues(alpha: 0.3),
                          blurRadius: 8,
                          spreadRadius: 0,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: double.infinity,
                    height: 48,
                    clipBehavior: Clip.hardEdge,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      gradient: const LinearGradient(
                        colors: [
                          Color(0xFFFF0055),
                          Color(0xFFC2125D),
                          Color(0xFF381060),
                        ],
                        stops: [0.0, 0.4, 1.0],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.3),
                        width: 1.0,
                      ),
                    ),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: Transform.rotate(
                            angle: _controller.value * 2 * pi,
                            child: Transform.scale(
                              scale: 15.0,
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: SweepGradient(
                                    colors: [
                                      Colors.white.withValues(alpha: 0.0),
                                      const Color(
                                        0xFFFF3D00,
                                      ).withValues(alpha: 0.2),
                                      const Color(
                                        0xFFFF007F,
                                      ).withValues(alpha: 0.3),
                                      const Color(
                                        0xFFFFC107,
                                      ).withValues(alpha: 0.4),
                                      Colors.white.withValues(alpha: 0.0),
                                    ],
                                    stops: const [0.0, 0.2, 0.5, 0.8, 1.0],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (widget.isSearching)
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      else
                        const Icon(
                          Icons.travel_explore_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      const SizedBox(width: 4),
                      Text(
                        widget.label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.0,
                          shadows: [
                            Shadow(
                              color: Colors.black45,
                              blurRadius: 3,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _NeonPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final double h = size.height;
    final double w = size.width;
    const double r = 16.0;

    // 카드의 실제 경계선(0~w, 0~h)에 완벽히 맞닿는 기본 패스
    final Path path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, w, h),
          const Radius.circular(r),
        ),
      );

    final Rect bounds = Rect.fromLTWH(0, 0, w, h);
    final neonGradient = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0xFFE040FB), Color(0xFFFF4081), Color(0xFF18FFFF)],
      stops: [0.0, 0.5, 1.0],
    ).createShader(bounds);

    // 1. 바깥쪽 풍성한 광채
    // 아주 넓은 블러를 사용하되, 카드 안쪽으로는 들어오지 못하도록 카드의 내부를 잘라냅니다(Clip).
    // 투명도를 주어 바깥쪽 네온이 너무 강하지 않게 부드럽게 퍼지도록 조절합니다.
    canvas.save();
    final Path clipOuter = Path()
      ..addRect(Rect.fromLTWH(-200, -200, w + 400, h + 400)) // 바깥쪽 넉넉한 영역
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, w, h),
          const Radius.circular(r),
        ),
      ) // 안쪽 카드 영역
      ..fillType = PathFillType.evenOdd; // 도넛 형태로 안쪽을 뚫어줌
    canvas.clipPath(clipOuter);

    final neonGradientOuter = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFFE040FB).withValues(alpha: 0.55),
        const Color(0xFFFF4081).withValues(alpha: 0.55),
        const Color(0xFF18FFFF).withValues(alpha: 0.55),
      ],
      stops: const [0.0, 0.5, 1.0],
    ).createShader(bounds);

    final outerGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth =
          12 // 빛의 확산 두께를 약간 줄임
      ..shader = neonGradientOuter
      ..maskFilter = const MaskFilter.blur(
        BlurStyle.normal,
        8,
      ); // 확산(번짐) 정도 설정 축소
    canvas.drawPath(path, outerGlow);
    canvas.restore(); // 클리핑 해제

    // 2. 안쪽 짧은 광채 (이건 클리핑 없이 그려서 안쪽으로 살짝만 스며들게 합니다)
    // BlurStyle.normal 을 사용하여 안쪽/바깥쪽 모두 자연스럽게 번짐 (반경 2로 아주 짧게)
    final innerGlowShort = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..shader = neonGradient
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);

    final coreGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFFFCE4EC), // 아주 옅은 파스텔 핑크
        const Color(
          0xFFF8BBD0,
        ).withValues(alpha: 0.95), // 핑크/마젠타 느낌의 화사한 채도 약간 추가
        const Color(0xFFE0FFFF).withValues(alpha: 0.9), // 시안빛 하단 스며듦
      ],
      stops: const [0.0, 0.6, 1.0],
    ).createShader(bounds);

    final core = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth =
          2.8 // 경계선에 딱 맞물리도록 두께 조절 (1.4px씩 반반 걸침)
      ..shader = coreGradient;

    canvas.drawPath(path, innerGlowShort);
    canvas.drawPath(path, core);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

class _AnimatedSegmentedControl<T> extends StatelessWidget {
  const _AnimatedSegmentedControl({
    required this.items,
    required this.selectedItem,
    required this.onItemSelected,
    required this.itemLabelBuilder,
  });

  final List<T> items;
  final T selectedItem;
  final void Function(T) onItemSelected;
  final String Function(T) itemLabelBuilder;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    final selectedIndex = items
        .indexOf(selectedItem)
        .clamp(0, items.length - 1);
    final count = items.length;

    final bgColor = const Color(0xFF2B2B2D);
    final activeBgColor = const Color(0xFFD81A60);
    final textTheme = Theme.of(context).textTheme;

    return Container(
      height: 38,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(19),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOutCubic,
            alignment: Alignment(
              -1.0 + (selectedIndex / (count - 1 > 0 ? count - 1 : 1)) * 2.0,
              0,
            ),
            child: FractionallySizedBox(
              widthFactor: 1.0 / count,
              heightFactor: 1.0,
              child: Container(
                decoration: BoxDecoration(
                  color: activeBgColor,
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
          Row(
            children: items.map((item) {
              final isSelected = item == selectedItem;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onItemSelected(item),
                  child: Center(
                    child: AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 250),
                      style: textTheme.bodyMedium!.copyWith(
                        fontWeight: isSelected
                            ? FontWeight.w800
                            : FontWeight.w600,
                        color: isSelected
                            ? Colors.white
                            : const Color(0xFF8B9298),
                      ),
                      child: Text(itemLabelBuilder(item)),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _AnimatedStateImage extends StatefulWidget {
  const _AnimatedStateImage({required this.assetPath});

  final String assetPath;

  @override
  State<_AnimatedStateImage> createState() => _AnimatedStateImageState();
}

class _AnimatedStateImageState extends State<_AnimatedStateImage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scaleAnimation;
  late final Animation<double> _rotateAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    // Bouncy scale ('두둥' effect)
    _scaleAnimation = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.1,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 40,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.1,
          end: 0.95,
        ).chain(CurveTween(curve: Curves.easeInOut)),
        weight: 20,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 0.95,
          end: 1.05,
        ).chain(CurveTween(curve: Curves.easeInOut)),
        weight: 20,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.05,
          end: 1.0,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 20,
      ),
    ]).animate(_controller);

    // Quick slight wobble left and right
    _rotateAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: -0.05), weight: 25),
      TweenSequenceItem(tween: Tween(begin: -0.05, end: 0.05), weight: 25),
      TweenSequenceItem(tween: Tween(begin: 0.05, end: -0.03), weight: 25),
      TweenSequenceItem(tween: Tween(begin: -0.03, end: 0.0), weight: 25),
    ]).animate(_controller);

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: Transform.rotate(angle: _rotateAnimation.value, child: child),
        );
      },
      child: Image.asset(
        widget.assetPath,
        height: MediaQuery.of(context).size.width * 1.144, // 0.88 * 1.3
        fit: BoxFit.contain,
      ),
    );
  }
}
