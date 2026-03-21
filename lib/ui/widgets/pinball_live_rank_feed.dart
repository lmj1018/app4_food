import 'package:flutter/material.dart';

import 'pinball_ranking_ticker.dart';

class PinballLiveRankFeedEntry {
  const PinballLiveRankFeedEntry({
    required this.id,
    required this.name,
    required this.rank,
  });

  final int id;
  final String name;
  final int rank;
}

class PinballLiveRankFeed extends StatelessWidget {
  const PinballLiveRankFeed({required this.entries, super.key});

  final List<PinballLiveRankFeedEntry> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final entry in entries)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: DecoratedBox(
              decoration: buildPinballOverlayBadgeDecoration(),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                child: Text(
                  '${entry.name} ${entry.rank}등',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
