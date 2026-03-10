import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/models/ranked_place.dart';

class PlaceMapActionButtons extends StatelessWidget {
  const PlaceMapActionButtons({
    required this.onNaverTap,
    required this.onKakaoTap,
    this.width = 82,
    this.compact = false,
    super.key,
  });

  final VoidCallback onNaverTap;
  final VoidCallback onKakaoTap;
  final double width;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: SizedBox(
        width: width,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 14,
              child: Center(
                child: Icon(
                  Icons.more_vert,
                  size: 18,
                  color: const Color(0xFF5E636B),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _MapActionButton(
                    compact: compact,
                    accentLetter: 'N',
                    accentColor: const Color(0xFF03C75A),
                    label: '지도',
                    onTap: onNaverTap,
                  ),
                  const SizedBox(height: 7),
                  _MapActionButton(
                    compact: compact,
                    accentLetter: 'K',
                    accentColor: const Color(0xFFE0B200),
                    label: '지도',
                    onTap: onKakaoTap,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapActionButton extends StatelessWidget {
  const _MapActionButton({
    required this.accentLetter,
    required this.accentColor,
    required this.label,
    required this.onTap,
    required this.compact,
  });

  final String accentLetter;
  final Color accentColor;
  final String label;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 5 : 6,
          vertical: compact ? 4 : 5,
        ),
        minimumSize: Size(0, compact ? 34 : 36),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
        backgroundColor: const Color(0xFFE6E7EA),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Text(
            accentLetter,
            style: textTheme.labelLarge?.copyWith(
              color: accentColor,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.labelMedium?.copyWith(
                color: const Color(0xFF2F3237),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PlaceMapLauncher {
  static const String _naverAppName = 'com.foodpicker.app';

  static Future<void> openKakaoPlacePage(RankedPlace place) async {
    final direct = Uri.tryParse(place.kakao.placeUrl);
    if (direct != null) {
      final opened = await _safeLaunchExternal(direct);
      if (opened) {
        return;
      }
    }
    await openKakaoRoute(
      originLat: place.kakao.lat,
      originLng: place.kakao.lng,
      originName: '현재 위치',
      destination: place,
    );
  }

  static Future<void> openNaverRoute({
    required double originLat,
    required double originLng,
    required String originName,
    required RankedPlace destination,
  }) async {
    final appUri = Uri.parse(
      'nmap://route/public'
      '?slat=${_coord(originLat)}'
      '&slng=${_coord(originLng)}'
      '&sname=${Uri.encodeComponent(originName)}'
      '&dlat=${_coord(destination.kakao.lat)}'
      '&dlng=${_coord(destination.kakao.lng)}'
      '&dname=${Uri.encodeComponent(destination.kakao.name)}'
      '&appname=$_naverAppName',
    );
    final openedInApp = await _safeLaunchExternal(appUri);
    if (openedInApp) {
      return;
    }

    final webUri = Uri.parse(
      'https://map.naver.com/v5/search/'
      '${Uri.encodeComponent(destination.kakao.name)}',
    );
    await _safeLaunchExternal(webUri);
  }

  static Future<void> openKakaoRoute({
    required double originLat,
    required double originLng,
    required String originName,
    required RankedPlace destination,
  }) async {
    final appUri = Uri.parse(
      'kakaomap://route'
      '?sp=${_coord(originLat)},${_coord(originLng)}'
      '&ep=${_coord(destination.kakao.lat)},${_coord(destination.kakao.lng)}'
      '&by=FOOT',
    );
    final openedInApp = await _safeLaunchExternal(appUri);
    if (openedInApp) {
      return;
    }

    final webUri = Uri.parse(
      'https://map.kakao.com/link/from/'
      '${Uri.encodeComponent(originName)},${_coord(originLat)},${_coord(originLng)}'
      '/to/${Uri.encodeComponent(destination.kakao.name)},'
      '${_coord(destination.kakao.lat)},${_coord(destination.kakao.lng)}',
    );
    await _safeLaunchExternal(webUri);
  }

  static String _coord(double value) => value.toStringAsFixed(6);

  static Future<bool> _safeLaunchExternal(Uri uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}
