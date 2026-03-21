import 'dart:convert';

import 'package:flutter/material.dart';

class CustomMarbleImageFactory {
  static Map<String, String> buildDataUrls(Iterable<String> candidates) {
    final result = <String, String>{};
    var index = 0;
    for (final rawCandidate in candidates) {
      final candidate = rawCandidate.trim();
      if (candidate.isEmpty) {
        continue;
      }
      result[candidate] = _buildSingleDataUrl(candidate, index);
      index += 1;
    }
    return result;
  }

  static String _buildSingleDataUrl(String candidate, int index) {
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
    final shadowGlowColor = HSLColor.fromAHSL(
      1,
      hue,
      (saturation * 0.7).clamp(0.0, 1.0),
      0.18,
    ).toColor();
    final rimColor = HSLColor.fromAHSL(
      1,
      hue,
      (saturation * 0.6).clamp(0.0, 1.0),
      0.94,
    ).toColor();
    final svg =
        '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <defs>
    <radialGradient id="body" cx="33%" cy="27%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="16%" stop-color="${_colorToHex(highlightColor)}" stop-opacity="0.98"/>
      <stop offset="58%" stop-color="${_colorToHex(baseColor)}"/>
      <stop offset="100%" stop-color="${_colorToHex(shadowColor)}"/>
    </radialGradient>
    <radialGradient id="rim" cx="50%" cy="50%" r="56%">
      <stop offset="68%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.26"/>
    </radialGradient>
    <linearGradient id="streak" x1="20%" y1="14%" x2="82%" y2="88%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.78"/>
      <stop offset="58%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="80" cy="80" r="74" fill="url(#body)"/>
  <circle cx="80" cy="80" r="74" fill="url(#rim)"/>
  <ellipse cx="55" cy="48" rx="27" ry="18" fill="#ffffff" fill-opacity="0.36" transform="rotate(-18 55 48)"/>
  <ellipse cx="98" cy="108" rx="44" ry="24" fill="${_colorToHex(shadowGlowColor)}" fill-opacity="0.16" transform="rotate(22 98 108)"/>
  <path d="M45 56c15-18 39-26 62-22" fill="none" stroke="url(#streak)" stroke-width="12" stroke-linecap="round"/>
  <circle cx="80" cy="80" r="73" fill="none" stroke="${_colorToHex(rimColor)}" stroke-opacity="0.3" stroke-width="2"/>
</svg>
''';
    return Uri.dataFromString(
      svg,
      mimeType: 'image/svg+xml',
      encoding: utf8,
    ).toString();
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

  static String _colorToHex(Color color) {
    final argb = color.toARGB32();
    final rgb = argb & 0x00ffffff;
    return '#${rgb.toRadixString(16).padLeft(6, '0')}';
  }
}
