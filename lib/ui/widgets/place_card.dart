import 'package:flutter/material.dart';

import '../../data/models/ranked_place.dart';
import 'place_map_actions.dart';

class PlaceCard extends StatelessWidget {
  const PlaceCard({
    required this.place,
    this.localTopRank,
    this.showMapButtons = false,
    this.originLat,
    this.originLng,
    this.originLabel,
    this.cardTapOpensKakao = false,
    super.key,
  });

  final RankedPlace place;
  final int? localTopRank;
  final bool showMapButtons;
  final double? originLat;
  final double? originLng;
  final String? originLabel;
  final bool cardTapOpensKakao;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final distanceM = place.kakao.distanceMeters;
    final distanceText = distanceM == null
        ? '거리 정보 없음'
        : distanceM >= 1000
        ? '${(distanceM / 1000).toStringAsFixed(1)}km'
        : '${distanceM.toStringAsFixed(0)}m';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: cardTapOpensKakao
            ? () => PlaceMapLauncher.openKakaoPlacePage(place)
            : null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            place.kakao.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          alignment: WrapAlignment.end,
                          children: [
                            if (localTopRank != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 9,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0x33F8C74D),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: const Color(0x99D79B19),
                                  ),
                                ),
                                child: Text(
                                  '많이 찾는곳',
                                  style: textTheme.labelSmall?.copyWith(
                                    color: const Color(0xFF7B5600),
                                    fontWeight: FontWeight.w800,
                                    fontSize: 11,
                                    height: 1.0,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      place.kakao.displayAddress,
                      style: textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF506871),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(
                          Icons.near_me_rounded,
                          color: const Color(0xFF4F6972),
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          distanceText,
                          style: textTheme.labelMedium?.copyWith(
                            color: const Color(0xFF4F6972),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (showMapButtons) ...[
                const SizedBox(width: 12),
                PlaceMapActionButtons(
                  compact: true,
                  width: 82,
                  onNaverTap: () => PlaceMapLauncher.openNaverRoute(
                    originLat: originLat ?? place.kakao.lat,
                    originLng: originLng ?? place.kakao.lng,
                    originName: originLabel ?? '현재 위치',
                    destination: place,
                  ),
                  onKakaoTap: () => PlaceMapLauncher.openKakaoRoute(
                    originLat: originLat ?? place.kakao.lat,
                    originLng: originLng ?? place.kakao.lng,
                    originName: originLabel ?? '현재 위치',
                    destination: place,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
