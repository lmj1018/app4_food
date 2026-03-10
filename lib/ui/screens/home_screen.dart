import 'dart:math' as math;
import 'package:flutter/material.dart';

import 'mood_screen.dart';
import 'nearby_search_screen.dart';
import 'roulette_screen.dart';

class _BannerInfo {
  final String line1;
  final String line2;
  final String routeName;
  const _BannerInfo(this.line1, this.line2, this.routeName);
}

const List<_BannerInfo> _banners = [
  _BannerInfo('오늘 뭐 먹을지', '아직도 고민 중인가요?', RouletteScreen.routeName),
  _BannerInfo('매일 똑같은 점심은 그만!', '어디로 갈지 운명에 맡겨보세요', RouletteScreen.routeName),
  _BannerInfo('혼밥, 데이트, 회식 예약까지', '메뉴 고르기가 쉬워지는 마법', RouletteScreen.routeName),
  _BannerInfo('우리 동네에 이런 곳이?', '당신만 몰랐던 로컬 찐맛집', NearbySearchScreen.routeName),
  _BannerInfo(
    '실패 없는 한 끼를 원한다면',
    '지금 내 주변 가장 핫한 식당',
    NearbySearchScreen.routeName,
  ),
  _BannerInfo('멀리 가지 마세요', '당신이 서 있는 바로 그곳에서', NearbySearchScreen.routeName),
  _BannerInfo('스트레스 팍! 풀리는 얼큰함부터', '현재 기분에 맞춘 찰떡 메뉴', MoodScreen.routeName),
  _BannerInfo(
    '비 오는 날엔 파전? 눈 오는 날엔 국물!',
    '오늘 날씨에 딱 맞는 스페셜 메뉴',
    MoodScreen.routeName,
  ),
  _BannerInfo('다이어트는 내일부터 확실하게!', '눈과 입이 호강하는 오늘의 푸드', MoodScreen.routeName),
  _BannerInfo('아무거나 먹기엔 소중한 시간', '상상만 하던 완벽한 식탁', RouletteScreen.routeName),
];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _floatController;
  late final Animation<Offset> _floatAnimation;
  final _BannerInfo _activeBanner =
      _banners[math.Random().nextInt(_banners.length)];

  @override
  void initState() {
    super.initState();
    _floatController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _floatAnimation =
        Tween<Offset>(
          begin: const Offset(0, 0),
          end: const Offset(0, -10),
        ).animate(
          CurvedAnimation(parent: _floatController, curve: Curves.easeInOut),
        );
  }

  @override
  void dispose() {
    _floatController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      extendBodyBehindAppBar: true,
      body: SafeArea(
        top: false,
        bottom: false,
        child: Align(
          alignment: const Alignment(0, 0.4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 30),
            child: AnimatedBuilder(
              animation: _floatAnimation,
              builder: (context, child) {
                return Transform.translate(
                  offset: _floatAnimation.value,
                    child: Stack(
                      alignment: Alignment.center,
                      clipBehavior: Clip.none,
                      children: [
                      SizedBox(
                        width: double.infinity,
                        child: AspectRatio(
                          aspectRatio: 0.72,
                          child: GestureDetector(
                            onTap: () => Navigator.pushNamed(
                              context,
                              RouletteScreen.routeName,
                            ),
                            child: ClipPath(
                              clipper: _NeonShapeClipper(),
                              child: Image.asset(
                                'assets/background/mainimg.png',
                                fit: BoxFit.cover,
                                alignment: Alignment.center,
                                gaplessPlayback: true,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned.fill(
                        child: IgnorePointer(
                          child: CustomPaint(painter: _NeonPainter()),
                        ),
                      ),
                      Positioned(
                        top: -95,
                        left: 0,
                        right: 0,
                        child: GestureDetector(
                          // 텍스트를 터치하면 해당 라우트로 이동
                          onTap: () => Navigator.pushNamed(
                            context,
                            _activeBanner.routeName,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _activeBanner.line1,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w400,
                                  color: Colors.white,
                                  letterSpacing: -0.5,
                                  shadows: [
                                    Shadow(
                                      color: Colors.black54,
                                      blurRadius: 4,
                                      offset: Offset(0, 2),
                                    ),
                                  ],
                                ),
                                textAlign: TextAlign.left,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _activeBanner.line2,
                                style: const TextStyle(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: -1.0,
                                  height: 1.2,
                                  shadows: [
                                    Shadow(
                                      color: Colors.black54,
                                      blurRadius: 6,
                                      offset: Offset(0, 3),
                                    ),
                                  ],
                                ),
                                textAlign: TextAlign.left,
                              ),
                            ],
                          ),
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
    );
  }
}

class _NeonPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final double w = size.width;
    const double arrowH = 50.0;
    final double rectH = size.height - arrowH;
    const double arrowBaseW = 32.0;
    const double arrowWingExt = 14.0;
    final double arrowMidY = rectH + 20.0;
    final double arrowTipY = rectH + 48.0;
    final double cX = w / 2;
    final path = _buildNeonSignPath(size);

    final Rect bounds = Rect.fromLTWH(0, 0, w, size.height);
    final neonGradient = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0xFFE040FB), Color(0xFFFF4081), Color(0xFF18FFFF)],
      stops: [0.0, 0.5, 1.0],
    ).createShader(bounds);

    final outerGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..shader = neonGradient
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12);

    final innerGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..shader = neonGradient
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    final innerSideGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..shader = neonGradient
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

    final coreGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        Colors.white.withValues(alpha: 0.9),
        Colors.white.withValues(alpha: 0.9),
        const Color(0xFFE0FFFF).withValues(alpha: 0.9),
      ],
      stops: const [0.0, 0.6, 1.0],
    ).createShader(bounds);

    final core = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..shader = coreGradient;

    canvas.drawPath(path, outerGlow);
    canvas.drawPath(path, innerGlow);
    canvas.save();
    canvas.clipPath(path);
    canvas.drawPath(path, innerSideGlow);
    canvas.restore();
    canvas.drawPath(path, core);

    void drawHighlight(Offset offset) {
      final highlightGlow = Paint()
        ..color = Colors.white
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
      final highlightCore = Paint()..color = Colors.white;
      canvas.drawCircle(offset, 4, highlightGlow);
      canvas.drawCircle(offset, 2, highlightCore);
    }

    drawHighlight(Offset(cX - arrowBaseW / 2 - arrowWingExt, arrowMidY));
    drawHighlight(Offset(cX + arrowBaseW / 2 + arrowWingExt, arrowMidY));
    drawHighlight(Offset(cX, arrowTipY));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

Path _buildNeonSignPath(Size size) {
  const double arrowH = 50.0;
  final double rectH = size.height - arrowH;
  final double w = size.width;
  const double r = 24.0;

  const double arrowBaseW = 32.0;
  const double arrowWingExt = 14.0;
  final double arrowMidY = rectH + 20.0;
  final double arrowTipY = rectH + 48.0;
  final double cX = w / 2;

  final path = Path();
  path.moveTo(r, 0);
  path.lineTo(w - r, 0);
  path.quadraticBezierTo(w, 0, w, r);
  path.lineTo(w, rectH - r);
  path.quadraticBezierTo(w, rectH, w - r, rectH);

  path.lineTo(cX + arrowBaseW / 2, rectH);
  path.lineTo(cX + arrowBaseW / 2, arrowMidY);
  path.lineTo(cX + arrowBaseW / 2 + arrowWingExt, arrowMidY);
  path.lineTo(cX, arrowTipY);
  path.lineTo(cX - (arrowBaseW / 2 + arrowWingExt), arrowMidY);
  path.lineTo(cX - arrowBaseW / 2, arrowMidY);
  path.lineTo(cX - arrowBaseW / 2, rectH);

  path.lineTo(r, rectH);
  path.quadraticBezierTo(0, rectH, 0, rectH - r);
  path.lineTo(0, r);
  path.quadraticBezierTo(0, 0, r, 0);
  path.close();
  return path;
}

class _NeonShapeClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) => _buildNeonSignPath(size);

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}
