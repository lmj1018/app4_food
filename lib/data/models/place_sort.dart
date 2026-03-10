enum PlaceSort { distance, accuracy }

extension PlaceSortX on PlaceSort {
  String get kakaoParam {
    switch (this) {
      case PlaceSort.distance:
        return 'distance';
      case PlaceSort.accuracy:
        return 'accuracy';
    }
  }

  String get label {
    switch (this) {
      case PlaceSort.distance:
        return '거리순';
      case PlaceSort.accuracy:
        return '정확도순';
    }
  }
}
