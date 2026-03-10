import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../data/models/mood_models.dart';
import '../../services/device_location_service.dart';
import '../../services/mood_recommendation_service.dart';
import '../../services/open_meteo_weather_service.dart';
import 'nearby_search_screen.dart';
import 'roulette_screen.dart';

class MoodScreen extends StatefulWidget {
  const MoodScreen({super.key});

  static const String routeName = '/mood';

  @override
  State<MoodScreen> createState() => _MoodScreenState();
}

class _MoodScreenState extends State<MoodScreen> with TickerProviderStateMixin {
  final MoodRecommendationService _recommendationService =
      MoodRecommendationService();
  final OpenMeteoWeatherService _weatherService = OpenMeteoWeatherService();
  final DeviceLocationService _locationService = DeviceLocationService();
  final NumberFormat _numberFormat = NumberFormat('#,###');

  late final TabController _tabController;

  MoodOptionId? _selectedSituation;
  MoodOptionId? _selectedEmotion;
  List<MoodRecommendation> _recommendations = const <MoodRecommendation>[];

  final int _peopleCount = 2;
  double _budgetWon = 15000;
  final bool _quickMealPreferred = false;

  CurrentWeatherSnapshot? _weather;

  String? _weatherError;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this)
      ..addListener(() {
        if (_tabController.indexIsChanging) {
          return;
        }
        _refreshRecommendations();
      });
    _refreshWeather();
    _refreshRecommendations();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  MoodOptionId? get _activeOptionId {
    return _tabController.index == 0 ? _selectedSituation : _selectedEmotion;
  }

  MoodOption? get _activeOption {
    final activeId = _activeOptionId;
    if (activeId == null) return null;
    return _allOptions.firstWhere((option) => option.id == activeId);
  }

  Future<void> _refreshWeather() async {
    setState(() {
      _weatherError = null;
    });

    try {
      final position = await _locationService.getCurrentPosition();
      if (position == null) {
        if (!mounted) {
          return;
        }
        setState(() {
          _weatherError = '현재 위치를 확인할 수 없습니다. 위치 권한을 허용해 주세요.';
        });
        return;
      }
      final lat = position.latitude;
      final lng = position.longitude;
      final weather = await _weatherService.fetchCurrent(lat: lat, lng: lng);
      if (!mounted) {
        return;
      }
      setState(() {
        _weather = weather;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _weatherError = '날씨 정보를 가져오지 못했습니다.';
      });
    } finally {
      if (mounted) {
        _refreshRecommendations();
      }
    }
  }

  void _refreshRecommendations() {
    final contextData = MoodContext(
      now: DateTime.now(),
      peopleCount: _peopleCount,
      budgetWon: _budgetWon.round(),
      quickMealPreferred: _quickMealPreferred,
      weatherCode: _weather?.weatherCode,
      temperatureC: _weather?.temperatureC,
    );

    final activeId = _activeOptionId;
    if (activeId == null) {
      if (mounted) {
        setState(() {
          _recommendations = const <MoodRecommendation>[];
        });
      }
      return;
    }

    final result = _recommendationService.recommend(
      optionId: activeId,
      context: contextData,
      limit: 10,
    );

    if (!mounted) {
      return;
    }
    setState(() {
      _recommendations = result;
    });
  }

  void _openNearbyByMenu(String menu) {
    Navigator.pushNamed(
      context,
      NearbySearchScreen.routeName,
      arguments: NearbySearchArgs(
        initialQuery: menu,
        autoSearch: true,
        stackedDeck: true,
        sourceTitle: '${_activeOption?.label ?? ''} · $menu',
      ),
    );
  }

  void _openRouletteByRecommendations() {
    final menus = _recommendations.map((item) => item.menu).toSet().toList();
    if (menus.isEmpty) {
      return;
    }
    Navigator.pushNamed(
      context,
      RouletteScreen.routeName,
      arguments: RouletteScreenArgs(
        initialMode: RouletteMode.food,
        presetCandidates: menus,
        sourceTitle: '${_activeOption?.label ?? ''} 추천 후보',
        autoStart: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final activeGroup = _tabController.index == 0
        ? MoodGroup.situation
        : MoodGroup.emotion;
    final options = _allOptions.where((item) => item.group == activeGroup);
    final showDefaultStateImage = _activeOptionId == null;
    final showEmptyStateImage =
        _activeOptionId != null && _recommendations.isEmpty;

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
                          : 'assets/background/theme.png',
                    ),
                  ),
                ),
              ),
            ListView(
              padding: const EdgeInsets.fromLTRB(16, 170, 16, 100),
              children: [
            // (hidden text) _MoodHeroCard is removed per user request
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
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
                      padding: const EdgeInsets.all(12.0),
                      child: Column(
                        children: [
                          _AnimatedSegmentedControl<int>(
                            items: const [0, 1],
                            selectedItem: _tabController.index,
                            itemLabelBuilder: (idx) =>
                                idx == 0 ? '상황 기반' : '감정 기반',
                            onItemSelected: (idx) {
                              setState(() {
                                _tabController.animateTo(idx);
                              });
                              _refreshRecommendations();
                            },
                          ),
                          const SizedBox(height: 16),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Left column
                              Expanded(
                                child: Column(
                                  children: options
                                      .toList()
                                      .sublist(0, (options.length / 2).ceil())
                                      .map((option) {
                                        final selected =
                                            _activeOptionId == option.id;
                                        return _FilterToggleTile(
                                          label: option.label,
                                          selected: selected,
                                          onTap: () {
                                            if (option.group ==
                                                MoodGroup.situation) {
                                              setState(
                                                () => _selectedSituation =
                                                    option.id,
                                              );
                                            } else {
                                              setState(
                                                () => _selectedEmotion =
                                                    option.id,
                                              );
                                            }
                                            _refreshRecommendations();
                                          },
                                        );
                                      })
                                      .toList(),
                                ),
                              ),
                              const SizedBox(width: 8),
                              // Right column
                              Expanded(
                                child: Column(
                                  children: options
                                      .toList()
                                      .sublist((options.length / 2).ceil())
                                      .map((option) {
                                        final selected =
                                            _activeOptionId == option.id;
                                        return _FilterToggleTile(
                                          label: option.label,
                                          selected: selected,
                                          onTap: () {
                                            if (option.group ==
                                                MoodGroup.situation) {
                                              setState(
                                                () => _selectedSituation =
                                                    option.id,
                                              );
                                            } else {
                                              setState(
                                                () => _selectedEmotion =
                                                    option.id,
                                              );
                                            }
                                            _refreshRecommendations();
                                          },
                                        );
                                      })
                                      .toList(),
                                ),
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
            if (_activeOptionId == MoodOptionId.budget) ...[
              const SizedBox(height: 12),
              Stack(
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
                      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '추천 조건',
                            style: textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            '예산 ${_numberFormat.format(_budgetWon.round())}원',
                            style: textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Slider(
                            min: 6000,
                            max: 50000,
                            divisions: 44,
                            value: _budgetWon,
                            label:
                                '${_numberFormat.format(_budgetWon.round())}원',
                            onChanged: (value) {
                              setState(() => _budgetWon = value);
                              _refreshRecommendations();
                            },
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
            ],
            const SizedBox(height: 12),
            const SizedBox(height: 10),
            _GlowingMoodButton(
              onTap: _recommendations.isEmpty
                  ? null
                  : _openRouletteByRecommendations,
              label: '추천메뉴들로 룰렛',
            ),
            const SizedBox(height: 12),
            if (_recommendations.isNotEmpty)
              ..._recommendations.map((item) {
                return Card(
                  color: const Color(0xFFE8ECEE),
                  elevation: 0,
                  margin: const EdgeInsets.only(bottom: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: const BorderSide(color: Color(0xFFD8E0E2), width: 1),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                    title: Text(
                      item.menu,
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(item.reason),
                    ),
                    trailing: IconButton(
                      tooltip: '주변 맛집 검색',
                      onPressed: () => _openNearbyByMenu(item.menu),
                      icon: const Icon(Icons.travel_explore_rounded),
                    ),
                  ),
                );
              }),
            if (_weatherError != null) ...[
              const SizedBox(height: 4),
              Text(
                _weatherError!,
                style: textTheme.bodySmall?.copyWith(
                  color: Colors.red.shade700,
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
}

const List<MoodOption> _allOptions = <MoodOption>[
  MoodOption(
    id: MoodOptionId.timeSlot,
    group: MoodGroup.situation,
    label: '🕒 지금 시간대 추천',
  ),
  MoodOption(
    id: MoodOptionId.weatherFit,
    group: MoodGroup.situation,
    label: '🌧 날씨 맞춤 추천',
  ),

  MoodOption(
    id: MoodOptionId.budget,
    group: MoodGroup.situation,
    label: '💸 오늘 예산 기반 추천',
  ),

  MoodOption(
    id: MoodOptionId.alcoholSnack,
    group: MoodGroup.situation,
    label: '🍺 술안주 모드',
  ),
  MoodOption(
    id: MoodOptionId.lateNight,
    group: MoodGroup.situation,
    label: '🌙 야식 모드',
  ),
  MoodOption(
    id: MoodOptionId.coupleDate,
    group: MoodGroup.situation,
    label: '💑 커플 데이트 모드',
  ),
  MoodOption(
    id: MoodOptionId.officeLunch,
    group: MoodGroup.situation,
    label: '👔 직장인 점심 모드',
  ),
  MoodOption(
    id: MoodOptionId.dietMode,
    group: MoodGroup.situation,
    label: '🥗 다이어트 모드',
  ),
  MoodOption(
    id: MoodOptionId.stressRelief,
    group: MoodGroup.emotion,
    label: '😫 스트레스 해소 음식',
  ),
  MoodOption(
    id: MoodOptionId.comfortFood,
    group: MoodGroup.emotion,
    label: '🥶 위로 음식',
  ),
  MoodOption(
    id: MoodOptionId.spicyCraving,
    group: MoodGroup.emotion,
    label: '🔥 매운 거 땡길 때',
  ),
  MoodOption(
    id: MoodOptionId.coolCraving,
    group: MoodGroup.emotion,
    label: '🧊 시원한 거',
  ),
  MoodOption(
    id: MoodOptionId.greasyCraving,
    group: MoodGroup.emotion,
    label: '🧈 기름진 거',
  ),
  MoodOption(
    id: MoodOptionId.healthyToday,
    group: MoodGroup.emotion,
    label: '🥗 오늘은 건강하게',
  ),
];

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

class _NeonPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final double h = size.height;
    final double w = size.width;
    const double r = 16.0;

    final Path path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, w, h),
          const Radius.circular(r),
        ),
      );

    final Rect bounds = Rect.fromLTWH(0, 0, w, h);

    final neonGradientOuter = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0x99E040FB), Color(0x99FF4081), Color(0x9918FFFF)],
      stops: [0.0, 0.5, 1.0],
    ).createShader(bounds);

    canvas.save();
    final Path clipOuter = Path()
      ..addRect(Rect.fromLTWH(-100, -100, w + 200, h + 200))
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, w, h),
          const Radius.circular(r),
        ),
      )
      ..fillType = PathFillType.evenOdd;
    canvas.clipPath(clipOuter);

    final outerGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..shader = neonGradientOuter
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawPath(path, outerGlow);
    canvas.restore();

    final innerGlowShort = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFE040FB), Color(0xFFFF4081), Color(0xFF18FFFF)],
        stops: [0.0, 0.5, 1.0],
      ).createShader(bounds)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);

    final coreGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFFFCE4EC),
        const Color(0xFFF8BBD0).withValues(alpha: 0.95),
        const Color(0xFFE0FFFF).withValues(alpha: 0.9),
      ],
      stops: const [0.0, 0.6, 1.0],
    ).createShader(bounds);

    final core = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8
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

class _FilterToggleTile extends StatelessWidget {
  const _FilterToggleTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final activeColor = const Color(0xFF2A1B17);
    final bgColor = selected
        ? const Color(0xFFE8ECEE)
        : const Color(0xFFF1F4F5);
    final borderColor = selected
        ? const Color(0xFFB0C0C4)
        : const Color(0xFFD8E0E2);

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: bgColor,
            border: Border.all(color: borderColor),
          ),
          child: Row(
            children: [
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                size: 16,
                color: selected ? activeColor : const Color(0xFF8EA1A6),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.bodySmall?.copyWith(
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: selected
                        ? const Color(0xFF0F6B78)
                        : const Color(0xFF3E5A62),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlowingMoodButton extends StatefulWidget {
  const _GlowingMoodButton({required this.onTap, required this.label});

  final VoidCallback? onTap;
  final String label;

  @override
  State<_GlowingMoodButton> createState() => _GlowingMoodButtonState();
}

class _GlowingMoodButtonState extends State<_GlowingMoodButton>
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
              Icons.casino_rounded,
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
      onTap: widget.onTap,
      child: SizedBox(
        height: 48,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: double.infinity,
                  height: 48,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFC764D6).withValues(alpha: 0.35),
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
                    const Icon(
                      Icons.casino_rounded,
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
            );
          },
        ),
      ),
    );
  }
}
