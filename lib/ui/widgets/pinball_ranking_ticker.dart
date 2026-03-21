import 'dart:math' as math;

import 'package:flutter/material.dart';

const EdgeInsets pinballOverlayBadgePadding = EdgeInsets.symmetric(
  horizontal: 7,
  vertical: 4,
);
const double pinballOverlayRightPadding = 8;
const double pinballOverlayBottomPadding = 2;
const double pinballOverlayTickerGap = 6;
const double pinballOverlayLicenseReservedWidth = 66;

const TextStyle pinballOverlayCaptionStyle = TextStyle(
  color: Colors.white70,
  fontSize: 8.5,
  fontWeight: FontWeight.w700,
);

BoxDecoration buildPinballOverlayBadgeDecoration() {
  return BoxDecoration(
    color: Colors.black.withValues(alpha: 0.68),
    borderRadius: BorderRadius.circular(7),
    border: Border.all(color: Colors.white.withValues(alpha: 0.16), width: 0.8),
  );
}

class PinballRankingTicker extends StatefulWidget {
  const PinballRankingTicker({
    required this.entries,
    this.textStyle = pinballOverlayCaptionStyle,
    super.key,
  });

  final List<String> entries;
  final TextStyle textStyle;

  @override
  State<PinballRankingTicker> createState() => _PinballRankingTickerState();
}

class _PinballRankingTickerState extends State<PinballRankingTicker>
    with SingleTickerProviderStateMixin {
  static const double _gapWidth = 28;
  static const double _speedPixelsPerSecond = 28;
  static const int _minLoopDurationMs = 7000;

  late final AnimationController _controller = AnimationController(vsync: this);

  String _tickerText = '';
  double _tickerTextWidth = 1;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncTickerMetrics();
  }

  @override
  void didUpdateWidget(covariant PinballRankingTicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncTickerMetrics();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _buildTickerText(List<String> entries) {
    final segments = <String>[];
    for (var index = 0; index < entries.length; index += 1) {
      final name = entries[index].trim();
      if (name.isEmpty) {
        continue;
      }
      segments.add('${index + 1}등 $name');
    }
    return segments.join('     ');
  }

  void _syncTickerMetrics() {
    final textStyle = DefaultTextStyle.of(
      context,
    ).style.merge(widget.textStyle);
    final nextTickerText = _buildTickerText(widget.entries);
    final textDirection = Directionality.maybeOf(context) ?? TextDirection.ltr;
    double nextTickerTextWidth = 1;
    if (nextTickerText.isNotEmpty) {
      final painter = TextPainter(
        text: TextSpan(text: nextTickerText, style: textStyle),
        maxLines: 1,
        textDirection: textDirection,
      )..layout();
      nextTickerTextWidth = math.max(1.0, painter.width);
    }
    final textChanged =
        nextTickerText != _tickerText ||
        (nextTickerTextWidth - _tickerTextWidth).abs() > 0.5;
    _tickerText = nextTickerText;
    _tickerTextWidth = nextTickerTextWidth;
    if (_tickerText.isEmpty) {
      _controller
        ..stop()
        ..value = 0;
      if (textChanged && mounted) {
        setState(() {});
      }
      return;
    }
    final travelDistance = _tickerTextWidth + _gapWidth;
    final duration = Duration(
      milliseconds: math.max(
        _minLoopDurationMs,
        ((travelDistance / _speedPixelsPerSecond) * 1000).round(),
      ),
    );
    final shouldRestart =
        textChanged ||
        _controller.duration != duration ||
        !_controller.isAnimating;
    _controller.duration = duration;
    if (shouldRestart) {
      _controller
        ..stop()
        ..value = 0
        ..repeat();
    }
    if (textChanged && mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_tickerText.isEmpty) {
      return const SizedBox.shrink();
    }
    final textStyle = DefaultTextStyle.of(
      context,
    ).style.merge(widget.textStyle);
    final travelDistance = _tickerTextWidth + _gapWidth;
    return DecoratedBox(
      decoration: buildPinballOverlayBadgeDecoration(),
      child: Padding(
        padding: pinballOverlayBadgePadding,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final trackWidth = (_tickerTextWidth * 2) + _gapWidth;
            final viewportWidth = constraints.hasBoundedWidth
                ? constraints.maxWidth
                : math.min(trackWidth, 220.0);
            return SizedBox(
              width: math.max(0, viewportWidth),
              child: ClipRect(
                child: AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) {
                    return Transform.translate(
                      offset: Offset(-_controller.value * travelDistance, 0),
                      child: child,
                    );
                  },
                  child: OverflowBox(
                    alignment: Alignment.centerLeft,
                    minWidth: trackWidth,
                    maxWidth: trackWidth,
                    child: SizedBox(
                      width: trackWidth,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _tickerText,
                            maxLines: 1,
                            softWrap: false,
                            overflow: TextOverflow.visible,
                            style: textStyle,
                          ),
                          const SizedBox(width: _gapWidth),
                          Text(
                            _tickerText,
                            maxLines: 1,
                            softWrap: false,
                            overflow: TextOverflow.visible,
                            style: textStyle,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
