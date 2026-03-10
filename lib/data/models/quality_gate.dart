import 'google_place_meta.dart';

class QualityGate {
  const QualityGate({this.minRating = 4.0, this.minReviews = 30});

  final double minRating;
  final int minReviews;

  bool passes(GooglePlaceMeta meta) {
    final rating = meta.rating;
    final reviews = meta.userRatingCount;
    if (rating == null || reviews == null) {
      return false;
    }
    return rating >= minRating && reviews >= minReviews;
  }
}
