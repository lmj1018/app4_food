import '../models/kakao_place.dart';
import '../models/place_sort.dart';
import '../models/ranked_place.dart';

abstract class PlaceSearchClient {
  Future<List<KakaoPlace>> searchKakao({
    required String query,
    required double lat,
    required double lng,
    required int radius,
    required PlaceSort sort,
    int maxResults = 30,
  });

  Future<List<RankedPlace>> searchHybrid({
    required String query,
    required double lat,
    required double lng,
    required int radius,
    required PlaceSort sort,
    bool enableNaverSignal = true,
  });
}
