import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

class CustomMarbleImageFactory {
  static Future<Map<String, String>> buildDataUrls(
    Iterable<String> candidates,
  ) async {
    final result = <String, String>{};
    var index = 0;
    for (final rawCandidate in candidates) {
      final candidate = rawCandidate.trim();
      if (candidate.isEmpty) {
        continue;
      }
      result[candidate] = await _buildSingleDataUrl(candidate, index);
      index += 1;
    }
    return result;
  }

  static Future<String> _buildSingleDataUrl(String candidate, int index) async {
    final hash = _stableHash(candidate);
    final hue = (hash + (index * 137.508)) % 360;
    final saturation = 0.72 + ((hash >> 4) % 10) / 100;
    final lightness = 0.5 + ((hash >> 9) % 8) / 100;
    final baseColor = HSLColor.fromAHSL(
      1,
      hue,
      saturation.clamp(0.0, 1.0),
      lightness.clamp(0.0, 1.0),
    ).toColor();
    final highlightColor = HSLColor.fromAHSL(
      1,
      _wrapHue(hue - 8),
      (saturation * 0.8).clamp(0.0, 1.0),
      0.86,
    ).toColor();
    final shadowColor = HSLColor.fromAHSL(
      1,
      _wrapHue(hue + 10),
      (saturation * 0.92).clamp(0.0, 1.0),
      0.28,
    ).toColor();
    final rimColor = HSLColor.fromAHSL(
      1,
      hue,
      (saturation * 0.6).clamp(0.0, 1.0),
      0.94,
    ).toColor();
    const imageSize = 96.0;
    const center = Offset(imageSize / 2, imageSize / 2);
    const radius = 43.0;

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    final bodyPaint = Paint()
      ..isAntiAlias = true
      ..shader = ui.Gradient.radial(
        center,
        radius,
        <Color>[highlightColor.withValues(alpha: 0.92), baseColor, shadowColor],
        <double>[0.0, 0.54, 1.0],
      );
    canvas.drawCircle(center, radius, bodyPaint);

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..isAntiAlias = true
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = rimColor.withValues(alpha: 0.24),
    );

    final topHighlightPaint = Paint()
      ..isAntiAlias = true
      ..shader = ui.Gradient.radial(
        const Offset(36, 32),
        16,
        <Color>[
          Colors.white.withValues(alpha: 0.28),
          Colors.white.withValues(alpha: 0.0),
        ],
        const <double>[0.0, 1.0],
      );
    canvas.drawCircle(const Offset(36, 32), 16, topHighlightPaint);

    final picture = recorder.endRecording();
    final image = await picture.toImage(imageSize.toInt(), imageSize.toInt());
    try {
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) {
        return '';
      }
      final pngBytes = byteData.buffer.asUint8List();
      return 'data:image/png;base64,${base64Encode(pngBytes)}';
    } finally {
      image.dispose();
    }
  }

  static double _wrapHue(double value) {
    final wrapped = value % 360;
    if (wrapped < 0) {
      return wrapped + 360;
    }
    return wrapped;
  }

  static int _stableHash(String value) {
    var hash = 0x811c9dc5;
    for (final codeUnit in value.codeUnits) {
      hash ^= codeUnit;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return hash;
  }
}
