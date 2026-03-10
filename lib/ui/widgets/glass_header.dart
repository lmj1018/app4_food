import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';

class GlassHeader extends StatefulWidget implements PreferredSizeWidget {
  const GlassHeader({
    this.title = '',
    this.subtitle,
    this.actions,
    this.height = 50,
    this.onTitleTap,
    this.showBackButton = false,
    this.onBack,
    super.key,
  });

  final String title;
  final String? subtitle;
  final List<Widget>? actions;
  final double height;
  final VoidCallback? onTitleTap;
  final bool showBackButton;
  final VoidCallback? onBack;

  @override
  State<GlassHeader> createState() => _GlassHeaderState();

  @override
  Size get preferredSize => Size.fromHeight(height);
}

class _GlassHeaderState extends State<GlassHeader>
    with SingleTickerProviderStateMixin {
  late AnimationController _flickerController;
  final math.Random _random = math.Random();
  int _currentPatternIndex = 0;

  @override
  void initState() {
    super.initState();
    _flickerController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    );

    _flickerController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        setState(() {
          int nextIndex;
          do {
            nextIndex = _random.nextInt(5);
          } while (nextIndex == _currentPatternIndex);
          _currentPatternIndex = nextIndex;
        });
        _flickerController.forward(from: 0.0);
      }
    });

    _flickerController.forward();
  }

  @override
  void dispose() {
    _flickerController.dispose();
    super.dispose();
  }

  double _calculateOpacity(double t) {
    switch (_currentPatternIndex) {
      case 1:
        return 0.92 + (math.sin(t * 80) * 0.08);
      case 2:
        if (t > 0.4 && t < 0.5) {
          double localT = (t - 0.4) / 0.1;
          return 1.0 - (math.sin(localT * math.pi) * 0.5);
        }
        return 1.0;
      case 3:
        if (t > 0.2 && t < 0.8) {
          return 0.85 + (math.sin(t * 15) * 0.15);
        }
        return 1.0;
      case 4:
        return 0.8 + (math.sin(t * math.pi * 2) * 0.2);
      default:
        if (t > 0.7 && t < 0.73) return 0.6;
        if (t > 0.78 && t < 0.81) return 0.7;
        if (t > 0.85 && t < 0.87) return 0.4;
        return 1.0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.paddingOf(context).top;
    final totalHeight = widget.height + topPadding;

    return SizedBox(
      height: totalHeight,
      child: Stack(
        clipBehavior: Clip.none, // 로고가 영역을 벗어날 수 있도록 허용
        children: [
          Positioned.fill(
            child: ClipRect(
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
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Stack(
              alignment: Alignment.bottomCenter,
              children: [
                Container(
                  height: 1.0,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.white.withValues(alpha: 0.0),
                        Colors.white.withValues(alpha: 0.2),
                        Colors.pinkAccent.withValues(alpha: 0.8),
                        Colors.white.withValues(alpha: 0.2),
                        Colors.white.withValues(alpha: 0.0),
                      ],
                      stops: const [0.0, 0.2, 0.5, 0.8, 1.0],
                    ),
                  ),
                ),
                Container(
                  width: 240,
                  height: 1.0,
                  decoration: BoxDecoration(
                    boxShadow: [
                      BoxShadow(
                        color: Colors.pinkAccent.withValues(alpha: 0.6),
                        blurRadius: 15,
                        spreadRadius: 1,
                        offset: const Offset(0, -1),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: widget.height),
              child: Stack(
                clipBehavior: Clip.none, // 내부 스택도 클리핑 방지
                children: [
                  Center(
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: widget.onTitleTap,
                        borderRadius: BorderRadius.circular(20),
                        splashFactory: NoSplash.splashFactory,
                        overlayColor: WidgetStateProperty.all(
                          Colors.transparent,
                        ),
                        splashColor: Colors.transparent,
                        highlightColor: Colors.transparent,
                        hoverColor: Colors.transparent,
                        focusColor: Colors.transparent,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                          ), // 수직 패딩 제거하여 공간 확보
                          child: Transform.translate(
                            offset: const Offset(0, -6),
                            child: AnimatedBuilder(
                              animation: _flickerController,
                              builder: (context, child) {
                                return Opacity(
                                  opacity: _calculateOpacity(
                                    _flickerController.value,
                                  ),
                                  child: child,
                                );
                              },
                              child: OverflowBox(
                                maxHeight: 80, // 제약 없이 실제 크기대로 표시되도록 허용
                                child: Image.asset(
                                  'assets/background/title.png',
                                  height: 50, // 53에서 50으로 하향 조정
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (widget.title.isNotEmpty ||
                      widget.subtitle != null ||
                      widget.showBackButton)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          if (widget.showBackButton)
                            GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: widget.onBack,
                              child: Padding(
                                padding: const EdgeInsets.only(right: 12),
                                child: Transform.translate(
                                  offset: const Offset(0, -6),
                                  child: Image.asset(
                                    'assets/background/back.png',
                                    width: 28,
                                    height: 28,
                                  ),
                                ),
                              ),
                            ),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (widget.title.isNotEmpty)
                                  Text(
                                    widget.title,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                if (widget.subtitle != null)
                                  Text(
                                    widget.subtitle!,
                                    style: TextStyle(
                                      color: Colors.white.withValues(
                                        alpha: 0.6,
                                      ),
                                      fontSize: 10,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          if (widget.actions != null) ...widget.actions!,
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
