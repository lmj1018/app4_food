import 'package:app4_food/services/google_places_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'picks nearest candidate when same name appears in multiple branches',
    () {
      final selected = pickBestGoogleCandidate(
        candidates: const [
          GooglePlaceCandidate(
            placeId: 'far',
            name: '홍콩반점 강남점',
            lat: 0,
            lng: 0,
            distanceM: 240,
            nameSimilarity: 0.82,
            rating: 4.3,
            userRatingCount: 150,
          ),
          GooglePlaceCandidate(
            placeId: 'near',
            name: '홍콩반점 강남점',
            lat: 0,
            lng: 0,
            distanceM: 63,
            nameSimilarity: 0.82,
            rating: 4.1,
            userRatingCount: 65,
          ),
        ],
        maxDistanceM: 120,
        minNameSimilarity: 0.45,
      );

      expect(selected, isNotNull);
      expect(selected!.placeId, 'near');
    },
  );

  test(
    'returns null if distance and name similarity do not pass thresholds',
    () {
      final selected = pickBestGoogleCandidate(
        candidates: const [
          GooglePlaceCandidate(
            placeId: 'bad',
            name: '완전히다른가게',
            lat: 0,
            lng: 0,
            distanceM: 35,
            nameSimilarity: 0.2,
          ),
        ],
        maxDistanceM: 120,
        minNameSimilarity: 0.45,
      );
      expect(selected, isNull);
    },
  );
}
