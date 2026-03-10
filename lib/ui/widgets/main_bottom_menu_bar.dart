import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';

enum MainMenuTab { nearby, roulette, theme }

class MainBottomMenuBar extends StatelessWidget {
  const MainBottomMenuBar({
    required this.currentTab,
    required this.onTabSelected,
    this.onRouletteLongPress,
    super.key,
  });

  final MainMenuTab currentTab;
  final ValueChanged<MainMenuTab> onTabSelected;
  final VoidCallback? onRouletteLongPress;

  @override
  Widget build(BuildContext context) {
    const unifiedGradient = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Color(0xFFFF70CC),
        Color(0xFFFF55C2),
        Color(0xFFEF6BE7),
      ],
      stops: [0.0, 0.5, 1.0],
    );

    return SizedBox(
      height: 112,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Menu Bar Background (Black Glassmorphism)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 92,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                ClipPath(
                  clipper: _MenuBarClipper(),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 16.0, sigmaY: 16.0),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.94),
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.4),
                            Colors.transparent,
                            Colors.black.withValues(alpha: 0.2),
                          ],
                          stops: const [0.0, 0.3, 1.0],
                        ),
                      ),
                    ),
                  ),
                ),
                // Glassmorphism Border Highlight
                CustomPaint(
                  painter: _MenuBarBorderPainter(),
                  size: Size.infinite,
                ),
              ],
            ),
          ),
          Positioned(
            left: 14,
            right: 14,
            bottom: 9,
            child: Row(
              children: [
                Expanded(
                  child: _SideMenuButton(
                    icon: Icons.near_me_rounded,
                    label: '통합검색',
                    iconGradient: unifiedGradient,
                    selected: currentTab == MainMenuTab.nearby,
                    onTap: () => onTabSelected(MainMenuTab.nearby),
                  ),
                ),
                const SizedBox(width: 116),
                Expanded(
                  child: _SideMenuButton(
                    icon: Icons.auto_awesome_rounded,
                    label: '테마추천',
                    iconGradient: unifiedGradient,
                    selected: currentTab == MainMenuTab.theme,
                    onTap: () => onTabSelected(MainMenuTab.theme),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Center(
              child: _GlowingOrbButton(
                onTap: () => onTabSelected(MainMenuTab.roulette),
                onLongPress: onRouletteLongPress,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SideMenuButton extends StatelessWidget {
  const _SideMenuButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.iconGradient,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final LinearGradient? iconGradient;

  @override
  Widget build(BuildContext context) {
    final textColor = selected ? Colors.white : Colors.white70;
    final iconOpacity = selected ? 1.0 : 0.72;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        splashFactory: NoSplash.splashFactory,
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        splashColor: Colors.transparent,
        highlightColor: Colors.transparent,
        hoverColor: Colors.transparent,
        focusColor: Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _GradientMenuIcon(
                icon: icon,
                opacity: iconOpacity,
                gradient: iconGradient,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: textColor,
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GradientMenuIcon extends StatelessWidget {
  const _GradientMenuIcon({
    required this.icon,
    required this.opacity,
    this.gradient,
  });

  final IconData icon;
  final double opacity;
  final LinearGradient? gradient;

  static const LinearGradient _neonPinkGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFF71C8), Color(0xFFFF2AA4), Color(0xFFB45CFF)],
  );

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: opacity,
      child: ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (bounds) =>
            (gradient ?? _neonPinkGradient).createShader(bounds),
        child: Icon(icon, color: Colors.white, size: 21),
      ),
    );
  }
}

class _MenuBarPath {
  static Path getPath(Size size) {
    final w = size.width;
    final h = size.height;
    final path = Path();

    final sx = w / 430.0;
    final sy = h / 120.0;

    path.moveTo(0 * sx, 34 * sy);
    path.lineTo(130 * sx, 34 * sy);
    path.cubicTo(145 * sx, 34 * sy, 155 * sx, 46 * sy, 158 * sx, 52 * sy);
    path.arcToPoint(
      Offset(272 * sx, 52 * sy),
      radius: Radius.elliptical(60 * sx, 72 * sy),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path.cubicTo(275 * sx, 46 * sy, 285 * sx, 34 * sy, 300 * sx, 34 * sy);
    path.lineTo(430 * sx, 34 * sy);
    path.lineTo(430 * sx, 120 * sy);
    path.lineTo(0 * sx, 120 * sy);
    path.close();

    return path;
  }
}

class _MenuBarClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) => _MenuBarPath.getPath(size);

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _MenuBarBorderPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = _MenuBarPath.getPath(size);

    // 1. 글로우 효과 (두꺼운 블러 라인)
    final glowPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..color = Colors.white.withValues(alpha: 0.12)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.0);
    canvas.drawPath(path, glowPaint);

    // 2. 선명한 메인 테두리 라인
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.white.withValues(alpha: 0.45),
          Colors.pinkAccent.withValues(alpha: 0.3), // 중앙부 연한 핑크 힌트
          Colors.white.withValues(alpha: 0.1),
          Colors.transparent,
        ],
        stops: const [0.0, 0.2, 0.4, 1.0],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    canvas.drawPath(path, paint);

    // 3. 중앙 연핑크 글로우 (네온 효과)
    final pinkGlowPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.transparent,
          Colors.pinkAccent.withValues(alpha: 0.6), // 중앙 연핑크 강조
          Colors.transparent,
        ],
        stops: const [0.2, 0.5, 0.8],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height))
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8.0);

    canvas.drawPath(path, pinkGlowPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _GlowingOrbButton extends StatefulWidget {
  const _GlowingOrbButton({required this.onTap, this.onLongPress});

  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  State<_GlowingOrbButton> createState() => _GlowingOrbButtonState();
}

class _GlowingOrbButtonState extends State<_GlowingOrbButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  Timer? _longPressTimer;
  bool _longPressTriggered = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000), // 요청하신 빠른 애니메이션 속도
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _longPressTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _startLongPressTrigger() {
    _longPressTimer?.cancel();
    _longPressTriggered = false;
    _longPressTimer = Timer(const Duration(seconds: 4), () {
      _longPressTriggered = true;
      widget.onLongPress?.call();
    });
  }

  void _cancelLongPressTrigger() {
    _longPressTimer?.cancel();
    _longPressTimer = null;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (_longPressTriggered) {
          _longPressTriggered = false;
          return;
        }
        widget.onTap();
      },
      onLongPressStart: widget.onLongPress == null
          ? null
          : (_) => _startLongPressTrigger(),
      onLongPressEnd: widget.onLongPress == null
          ? null
          : (_) => _cancelLongPressTrigger(),
      onLongPressCancel: widget.onLongPress == null
          ? null
          : _cancelLongPressTrigger,
      child: SizedBox(
        width: 104,
        height: 104,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            // 심장 박동/숨 쉬는 듯한 스케일 조절
            final scale = 0.98 + (_controller.value * 0.05);
            // 구체 내부/외부 선형 애니메이션 각도
            final rotation1 = _controller.value * math.pi * 0.4;
            final rotation2 = -_controller.value * math.pi * 0.6;
            final rotation3 = _controller.value * math.pi * 0.8;

            return Transform.scale(
              scale: scale,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // 1. 외곽 빛 번짐 효과 (Glow)
                  Container(
                    width: 80, // 90에서 10% 축소
                    height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: const Color(
                            0xFFC764D6,
                          ).withValues(alpha: 0.3 + (_controller.value * 0.3)),
                          blurRadius: 20 + (_controller.value * 15),
                          spreadRadius: 2 + (_controller.value * 4),
                        ),
                        BoxShadow(
                          color: const Color(0xFF6328A0).withValues(alpha: 0.4),
                          blurRadius: 30,
                          spreadRadius: 8,
                        ),
                      ],
                    ),
                  ),
                  // 2. 메인 오브젝트 (그라데이션 및 와이어프레임)
                  Container(
                    width: 80, // 90에서 10% 축소
                    height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(
                        colors: [
                          Color(0xFFFF0055), // 보라빛이 살짝 섞인 매혹적인 붉은색 (Crimson)
                          Color(0xFFC2125D), // 자줏빛이 더 감도는 중간 영역
                          Color(0xFF381060), // 어두운 보라색 베이스
                        ],
                        stops: [0.3, 0.67, 1.0], // 전체 면적의 약 67% 가량을 붉은빛이 덮도록 수정
                        center: Alignment(-0.5, -0.5),
                        radius: 0.75, // 그라데이션 반경을 조금 줄여 비율에 맞춤
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.3),
                        width: 1.0,
                      ),
                    ),
                  ),
                  // 3. 내부 빛 굴절/와이어 링 (행성이나 음악 파동 느낌)
                  Transform.rotate(
                    angle: rotation1,
                    child: _buildRing(77, 83, 0.7, 1.2),
                  ),
                  Transform.rotate(
                    angle: rotation2,
                    child: _buildRing(83, 72, 0.5, 1.0),
                  ),
                  Transform.rotate(
                    angle: rotation3,
                    child: _buildRing(74, 79, 0.4, 0.8),
                  ),
                  // 4. 아이콘 (GIF 이미지로 교체)
                  Transform.scale(
                    // 컨트롤러 값을 활용해 0.95 ~ 1.2 범위로 리드미컬하게 커졌다 작아지는 숨쉬기 효과 적용
                    scale: 0.95 + (_controller.value * 0.25),
                    child: Image.asset(
                      'assets/background/dice.gif',
                      width: 40,
                      height: 40,
                      fit: BoxFit.contain,
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildRing(
    double width,
    double height,
    double opacity,
    double thickness,
  ) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(
          Radius.elliptical(width / 2, height / 2),
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: opacity),
          width: thickness,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: opacity * 0.6),
            blurRadius: 6,
            spreadRadius: 0,
          ),
        ],
      ),
    );
  }
}
