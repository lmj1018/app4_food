import 'package:app4_food/data/models/google_place_meta.dart';
import 'package:app4_food/data/models/quality_gate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const gate = QualityGate(minRating: 4.0, minReviews: 30);

  test('passes at boundary 4.0 and 30', () {
    final meta = GooglePlaceMeta(
      placeId: 'p1',
      rating: 4.0,
      userRatingCount: 30,
      matchedDistanceM: 33,
      fetchedAt: DateTime(2026, 2, 21),
      matchedName: '테스트식당',
    );
    expect(gate.passes(meta), isTrue);
  });

  test('fails when reviews are 29', () {
    final meta = GooglePlaceMeta(
      placeId: 'p2',
      rating: 4.4,
      userRatingCount: 29,
      matchedDistanceM: 42,
      fetchedAt: DateTime(2026, 2, 21),
      matchedName: '테스트식당',
    );
    expect(gate.passes(meta), isFalse);
  });
}
