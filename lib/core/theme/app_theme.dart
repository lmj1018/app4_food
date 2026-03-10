import 'package:flutter/material.dart';

class _NoAnimationPageTransitionsBuilder extends PageTransitionsBuilder {
  const _NoAnimationPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return child;
  }
}

ThemeData buildAppTheme() {
  final textTheme = ThemeData(brightness: Brightness.light).textTheme;
  const glassBg = Color(0x2EFFFFFF); // alpha 0.18
  const glassBgSelected = Color(0x2EFFFFFF); // alpha 0.18
  const glassBorder = Color(0x4DFFFFFF); // alpha 0.30
  const glassText = Color(0xFF1D140F);
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: Colors.transparent,
    canvasColor: Colors.transparent,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: <TargetPlatform, PageTransitionsBuilder>{
        TargetPlatform.android: _NoAnimationPageTransitionsBuilder(),
        TargetPlatform.iOS: _NoAnimationPageTransitionsBuilder(),
        TargetPlatform.macOS: _NoAnimationPageTransitionsBuilder(),
        TargetPlatform.windows: _NoAnimationPageTransitionsBuilder(),
        TargetPlatform.linux: _NoAnimationPageTransitionsBuilder(),
      },
    ),
    textTheme: textTheme,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF1494A6),
      brightness: Brightness.light,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      foregroundColor: Colors.white,
      titleTextStyle: textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white.withValues(alpha: 0.92),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      elevation: 0,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        elevation: 0,
        foregroundColor: glassText,
        backgroundColor: glassBgSelected,
        side: const BorderSide(color: glassBorder),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        elevation: 0,
        foregroundColor: glassText,
        backgroundColor: glassBg,
        side: const BorderSide(color: glassBorder),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: glassText,
        backgroundColor: glassBg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    chipTheme: ChipThemeData(
      labelStyle: textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w600,
        color: glassText,
      ),
      selectedColor: glassBgSelected,
      backgroundColor: glassBg,
      side: const BorderSide(color: glassBorder),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(40)),
    ),
    toggleButtonsTheme: const ToggleButtonsThemeData(
      borderColor: glassBorder,
      selectedBorderColor: glassBorder,
      fillColor: glassBgSelected,
      color: glassText,
      selectedColor: glassText,
    ),
  );
}
