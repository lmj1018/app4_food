import 'package:flutter/material.dart';

class AppBackground extends StatelessWidget {
  const AppBackground({required this.child, super.key});

  static const Color backgroundColor = Color(0xFF050505); // 완전히 묵직하고 깨끗한 딥 블랙
  static const String _backgroundImagePath = 'assets/background/main1.jpg';
  static const AssetImage _backgroundProvider = AssetImage(
    _backgroundImagePath,
  );

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppBackground.backgroundColor,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const Positioned.fill(
            child: IgnorePointer(
              child: Image(
                image: _backgroundProvider,
                fit: BoxFit.fitHeight,
                alignment: Alignment.center,
                filterQuality: FilterQuality.medium,
                gaplessPlayback: true,
              ),
            ),
          ),
          // Gradient overlay to darken the bottom
          Positioned.fill(
            child: IgnorePointer(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      backgroundColor.withValues(alpha: 0.0),
                      backgroundColor.withValues(alpha: 0.45),
                      backgroundColor.withValues(alpha: 0.8),
                    ],
                    stops: const [0.0, 0.66, 0.88, 1.0], // 2/3(0.66) 지점부터 어두워짐
                  ),
                ),
              ),
            ),
          ),
          Positioned.fill(child: child),
        ],
      ),
    );
  }
}
