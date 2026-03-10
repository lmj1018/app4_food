import 'ranked_place.dart';

class HybridSearchResult {
  const HybridSearchResult({
    required this.items,
    required this.notice,
    required this.usedGoogleData,
    required this.hadGoogleFailure,
  });

  final List<RankedPlace> items;
  final String notice;
  final bool usedGoogleData;
  final bool hadGoogleFailure;
}
