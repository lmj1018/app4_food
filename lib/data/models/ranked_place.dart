import 'google_place_meta.dart';
import 'kakao_place.dart';

enum RankReason { qualityPassed, qualityFailed, noGoogleData }

class RankedPlace {
  const RankedPlace({
    required this.kakao,
    required this.googleMeta,
    required this.passedGate,
    required this.rankReason,
    this.naverReviewRank,
  });

  final KakaoPlace kakao;
  final GooglePlaceMeta? googleMeta;
  final bool passedGate;
  final RankReason rankReason;
  final int? naverReviewRank;

  bool get hasNaverReviewSignal => naverReviewRank != null;

  bool get isNaverTop5 => naverReviewRank != null && naverReviewRank! <= 5;
}
