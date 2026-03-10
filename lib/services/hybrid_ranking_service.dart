import 'dart:async';
import 'dart:developer' as developer;

import '../core/utils/name_similarity.dart';
import '../data/models/google_place_meta.dart';
import '../data/models/hybrid_search_result.dart';
import '../data/models/kakao_place.dart';
import '../data/models/naver_local_item.dart';
import '../data/models/place_sort.dart';
import '../data/models/quality_gate.dart';
import '../data/models/ranked_place.dart';
import '../data/repositories/place_search_client.dart';
import 'exceptions.dart';
import 'google_meta_cache.dart';
import 'google_places_client.dart';
import 'kakao_place_search_client.dart';
import 'naver_local_search_client.dart';

class HybridRankingService implements PlaceSearchClient {
  HybridRankingService({
    required KakaoPlaceSearchClient kakaoClient,
    required GooglePlacesClient googleClient,
    required GoogleMetaCache cache,
    NaverLocalSearchClient? naverClient,
    QualityGate gate = const QualityGate(),
    this.maxKakaoCandidates = 30,
    this.maxGoogleEnrichment = 20,
    this.maxNaverSignals = 5,
    this.maxNaverCandidates = 30,
    this.maxNaverQueryFanout = 4,
    this.naverEarlyStopMatchRatio = 0.10,
    this.maxNaverPerPlaceLookups = 0,
    this.enableDebugLogs = false,
    this.enableGoogleSignal = false,
  }) : _kakaoClient = kakaoClient,
       _googleClient = googleClient,
       _cache = cache,
       _naverClient = naverClient,
       _gate = gate;

  final KakaoPlaceSearchClient _kakaoClient;
  final GooglePlacesClient _googleClient;
  final GoogleMetaCache _cache;
  final NaverLocalSearchClient? _naverClient;
  final QualityGate _gate;
  final int maxKakaoCandidates;
  final int maxGoogleEnrichment;
  final int maxNaverSignals;
  final int maxNaverCandidates;
  final int maxNaverQueryFanout;
  final double naverEarlyStopMatchRatio;
  final int maxNaverPerPlaceLookups;
  final bool enableDebugLogs;
  final bool enableGoogleSignal;

  HybridSearchResult _lastResult = const HybridSearchResult(
    items: <RankedPlace>[],
    notice: '',
    usedGoogleData: false,
    hadGoogleFailure: false,
  );

  String get lastNotice => _lastResult.notice;

  bool get lastUsedGoogleData => _lastResult.usedGoogleData;

  bool get lastHadGoogleFailure => _lastResult.hadGoogleFailure;

  @override
  Future<List<KakaoPlace>> searchKakao({
    required String query,
    required double lat,
    required double lng,
    required int radius,
    required PlaceSort sort,
    int maxResults = 30,
  }) {
    return _kakaoClient.search(
      query: query,
      lat: lat,
      lng: lng,
      radius: radius,
      sort: sort,
      maxResults: maxResults,
    );
  }

  @override
  Future<List<RankedPlace>> searchHybrid({
    required String query,
    required double lat,
    required double lng,
    required int radius,
    required PlaceSort sort,
    bool enableNaverSignal = true,
  }) async {
    final detailed = await searchHybridDetailed(
      query: query,
      lat: lat,
      lng: lng,
      radius: radius,
      sort: sort,
      enableNaverSignal: enableNaverSignal,
    );
    _lastResult = detailed;
    return detailed.items;
  }

  Future<HybridSearchResult> searchHybridDetailed({
    required String query,
    required double lat,
    required double lng,
    required int radius,
    required PlaceSort sort,
    bool enableNaverSignal = true,
  }) async {
    _debug(
      'START query="$query" lat=$lat lng=$lng radius=$radius sort=${sort.name} naverEnabled=$enableNaverSignal',
    );
    final kakaoCandidates = await searchKakao(
      query: query,
      lat: lat,
      lng: lng,
      radius: radius,
      sort: sort,
      maxResults: maxKakaoCandidates,
    );
    _debug(
      'KAKAO candidates=${kakaoCandidates.length} sample=${_sampleKakao(kakaoCandidates)}',
    );
    if (kakaoCandidates.isEmpty) {
      _debug('END no kakao candidates');
      return const HybridSearchResult(
        items: <RankedPlace>[],
        notice: '검색 결과가 없습니다.',
        usedGoogleData: false,
        hadGoogleFailure: false,
      );
    }

    final googleMetaByPlaceId = <String, GooglePlaceMeta>{};
    final naverReviewRanksByPlaceId = <String, int>{};
    var hadGoogleFailure = false;
    var usedGoogleData = false;
    var hadMissingGoogleKey = false;
    var usedNaverReviewData = false;
    var hadNaverFailure = false;
    var hadMissingNaverKey = false;
    String? naverGuardNotice;
    String? naverFailureMessage;
    int? naverFailureStatusCode;

    if (enableGoogleSignal) {
      for (final place in kakaoCandidates.take(maxGoogleEnrichment)) {
        final cacheKey = GoogleMetaCache.buildCacheKey(
          name: place.name,
          lat: place.lat,
          lng: place.lng,
        );
        final cached = await _cache.get(cacheKey);
        if (cached != null) {
          googleMetaByPlaceId[place.id] = cached;
          usedGoogleData = true;
          _debug('GOOGLE cache hit place="${place.name}"');
          continue;
        }

        try {
          final enriched = await _googleClient.enrichPlace(
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            address: place.displayAddress,
          );
          if (enriched != null) {
            googleMetaByPlaceId[place.id] = enriched;
            usedGoogleData = true;
            await _cache.set(cacheKey, enriched);
            _debug(
              'GOOGLE matched place="${place.name}" rating=${enriched.rating} reviews=${enriched.userRatingCount}',
            );
          }
        } on MissingApiKeyException {
          hadGoogleFailure = true;
          hadMissingGoogleKey = true;
          _debug('GOOGLE missing key');
          break;
        } on TimeoutException {
          hadGoogleFailure = true;
          _debug('GOOGLE timeout place="${place.name}"');
        } on ApiRequestException {
          hadGoogleFailure = true;
          _debug('GOOGLE api error place="${place.name}"');
        } catch (_) {
          hadGoogleFailure = true;
          _debug('GOOGLE unknown error place="${place.name}"');
        }
      }
    } else {
      _debug('GOOGLE enrichment disabled');
    }

    if (enableNaverSignal && _naverClient != null) {
      _naverClient.clearLastGuardNotice();
      final collectedNaverItems = <NaverLocalItem>[];
      final seenNaverItems = <String>{};
      final queryPlan = _buildNaverQueryPlan(
        query: query,
        kakaoCandidates: kakaoCandidates,
      );
      final earlyStopRequiredMatches = _resolveEarlyStopRequiredMatches(
        kakaoCandidates.length,
      );
      var strictResolved = <String, int>{};
      _debug(
        'NAVER query plan count=${queryPlan.length} maxFanout=$maxNaverQueryFanout maxCandidates=$maxNaverCandidates earlyStopRequired=$earlyStopRequiredMatches ratio=$naverEarlyStopMatchRatio',
      );

      for (final naverQuery in queryPlan.take(maxNaverQueryFanout)) {
        if (collectedNaverItems.length >= maxNaverCandidates) {
          break;
        }
        try {
          final naverItems = await _naverClient.searchByComment(
            query: naverQuery,
            display: maxNaverSignals,
          );
          _debug(
            'NAVER query="$naverQuery" items=${naverItems.length} titles=${naverItems.map((item) => item.title).toList()}',
          );
          for (final item in naverItems) {
            final key = _naverItemKey(item);
            if (!seenNaverItems.add(key)) {
              continue;
            }
            collectedNaverItems.add(item);
            if (collectedNaverItems.length >= maxNaverCandidates) {
              break;
            }
          }
        } on MissingApiKeyException {
          hadNaverFailure = true;
          hadMissingNaverKey = true;
          _debug('NAVER missing key');
          break;
        } on TimeoutException {
          hadNaverFailure = true;
          _debug('NAVER timeout query="$naverQuery"');
        } on ApiRequestException catch (e) {
          hadNaverFailure = true;
          naverFailureStatusCode ??= e.statusCode;
          _debug(
            'NAVER api error query="$naverQuery" status=${e.statusCode} message="${e.message}"',
          );
          if (e.statusCode == 429 && e.message.isNotEmpty) {
            naverFailureMessage ??= e.message;
            break;
          }
        } catch (_) {
          hadNaverFailure = true;
          _debug('NAVER unknown error query="$naverQuery"');
        }

        if (collectedNaverItems.isEmpty) {
          continue;
        }

        strictResolved = _resolveNaverReviewRanks(
          kakaoCandidates: kakaoCandidates,
          naverItems: collectedNaverItems,
          similarityThreshold: 0.24,
        );
        if (strictResolved.length >= earlyStopRequiredMatches) {
          _debug(
            'NAVER early stop: matched=${strictResolved.length} required=$earlyStopRequiredMatches after query="$naverQuery"',
          );
          break;
        }
      }

      if (collectedNaverItems.isNotEmpty) {
        var resolved = strictResolved;
        if (resolved.isEmpty) {
          resolved = _resolveNaverReviewRanks(
            kakaoCandidates: kakaoCandidates,
            naverItems: collectedNaverItems,
            similarityThreshold: 0.24,
          );
        }
        if (resolved.isEmpty) {
          _debug('NAVER strict match empty -> retry relaxed threshold 0.12');
          resolved = _resolveNaverReviewRanks(
            kakaoCandidates: kakaoCandidates,
            naverItems: collectedNaverItems,
            similarityThreshold: 0.12,
          );
        }
        naverReviewRanksByPlaceId.addAll(resolved);
        _debug(
          'NAVER resolved=${resolved.length} mergedItems=${collectedNaverItems.length} map=$resolved',
        );
      } else {
        _debug('NAVER collected items empty');
      }

      usedNaverReviewData = naverReviewRanksByPlaceId.isNotEmpty;
      naverGuardNotice = _naverClient.lastGuardNotice;
      _debug(
        'NAVER summary used=$usedNaverReviewData matchedCount=${naverReviewRanksByPlaceId.length} map=$naverReviewRanksByPlaceId',
      );
    }

    final ranked = rank(
      kakao: kakaoCandidates,
      googleMeta: googleMetaByPlaceId,
      naverReviewRanks: naverReviewRanksByPlaceId,
      gate: _gate,
    );

    final notice = _resolveNotice(
      usedGoogleData: usedGoogleData,
      hadGoogleFailure: hadGoogleFailure,
      hadMissingGoogleKey: hadMissingGoogleKey,
      usedNaverReviewData: usedNaverReviewData,
      hadNaverFailure: hadNaverFailure,
      hadMissingNaverKey: hadMissingNaverKey,
      naverGuardNotice: naverGuardNotice,
      naverFailureMessage: naverFailureMessage,
      naverFailureStatusCode: naverFailureStatusCode,
    );
    _debug(
      'END notice="$notice" usedGoogle=$usedGoogleData usedNaver=$usedNaverReviewData rankedTop=${_sampleRanked(ranked)}',
    );

    return HybridSearchResult(
      items: ranked,
      notice: notice,
      usedGoogleData: usedGoogleData,
      hadGoogleFailure: hadGoogleFailure,
    );
  }

  List<RankedPlace> rank({
    required List<KakaoPlace> kakao,
    required Map<String, GooglePlaceMeta> googleMeta,
    Map<String, int> naverReviewRanks = const <String, int>{},
    required QualityGate gate,
  }) {
    final ranked = kakao.map((place) {
      final meta = googleMeta[place.id];
      final passed = meta != null && gate.passes(meta);
      final reason = meta == null
          ? RankReason.noGoogleData
          : (passed ? RankReason.qualityPassed : RankReason.qualityFailed);
      return RankedPlace(
        kakao: place,
        googleMeta: meta,
        passedGate: passed,
        rankReason: reason,
        naverReviewRank: naverReviewRanks[place.id],
      );
    }).toList();

    ranked.sort((a, b) {
      if (a.passedGate != b.passedGate) {
        return a.passedGate ? -1 : 1;
      }

      final scoreA = _hybridScore(a);
      final scoreB = _hybridScore(b);
      final scoreCompare = scoreB.compareTo(scoreA);
      if (scoreCompare != 0) {
        return scoreCompare;
      }

      final naverCompare = _compareByNaverRank(a, b);
      if (naverCompare != 0) {
        return naverCompare;
      }
      return a.kakao.distanceForSort.compareTo(b.kakao.distanceForSort);
    });

    return ranked;
  }

  String _resolveNotice({
    required bool usedGoogleData,
    required bool hadGoogleFailure,
    required bool hadMissingGoogleKey,
    required bool usedNaverReviewData,
    required bool hadNaverFailure,
    required bool hadMissingNaverKey,
    String? naverGuardNotice,
    String? naverFailureMessage,
    int? naverFailureStatusCode,
  }) {
    if (naverGuardNotice != null && naverGuardNotice.isNotEmpty) {
      return naverGuardNotice;
    }
    if (naverFailureMessage != null && naverFailureMessage.isNotEmpty) {
      return naverFailureMessage;
    }
    if (hadMissingGoogleKey && hadMissingNaverKey) {
      return '일부 설정값이 없어 기본 검색 결과만 표시합니다.';
    }
    if (hadMissingGoogleKey && !usedNaverReviewData) {
      return '평점 설정값이 없어 기본 검색 결과만 표시합니다.';
    }
    if (hadMissingNaverKey && !usedGoogleData) {
      return '리뷰 신호 설정값이 없어 거리순으로 표시합니다.';
    }
    if (!usedGoogleData && hadGoogleFailure) {
      return '검색 결과를 표시합니다.';
    }
    if (!usedNaverReviewData && hadNaverFailure && !usedGoogleData) {
      if (naverFailureStatusCode == 429) {
        return '리뷰 보강 사용량 제한으로 기본 검색 결과만 제공합니다.';
      }
      if (naverFailureStatusCode == 401) {
        return '인증 실패(401)로 리뷰 신호를 적용하지 못했습니다. 키 설정을 확인해 주세요.';
      }
      return '리뷰 신호를 불러오지 못해 거리순으로 표시합니다.';
    }
    if (usedGoogleData && usedNaverReviewData) {
      if (hadGoogleFailure || hadNaverFailure) {
        return '일부 장소는 보강 정보를 가져오지 못했습니다.';
      }
      return '리뷰/평점 보강 기준으로 정렬했습니다.';
    }
    if (usedGoogleData && hadGoogleFailure) {
      return '일부 장소는 평점 정보를 가져오지 못했습니다.';
    }
    if (usedGoogleData) {
      return '평점 보강 기준으로 정렬했습니다.';
    }
    if (usedNaverReviewData && hadNaverFailure) {
      return '일부 장소는 리뷰 신호를 가져오지 못했습니다.';
    }
    if (hadNaverFailure && naverFailureStatusCode == 401) {
      return '인증 실패(401)로 리뷰 신호가 적용되지 않았습니다.';
    }
    if (hadNaverFailure && naverFailureStatusCode == 429) {
      return '리뷰 보강 사용량 제한으로 기본 검색 결과만 제공합니다.';
    }
    if (usedNaverReviewData) {
      return '리뷰 신호 기준으로 정렬했습니다.';
    }
    return '기본 검색 결과입니다.';
  }

  int _compareByNaverRank(RankedPlace a, RankedPlace b) {
    final aRank = a.naverReviewRank;
    final bRank = b.naverReviewRank;
    if (aRank == null && bRank == null) {
      return 0;
    }
    if (aRank == null) {
      return 1;
    }
    if (bRank == null) {
      return -1;
    }
    return aRank.compareTo(bRank);
  }

  double _hybridScore(RankedPlace item) {
    final rating = item.googleMeta?.rating ?? 0;
    final reviews = item.googleMeta?.userRatingCount ?? 0;
    final reviewBoost = reviews >= 200
        ? 22
        : reviews >= 100
        ? 16
        : reviews >= 50
        ? 10
        : reviews >= 30
        ? 6
        : reviews > 0
        ? 3
        : 0;

    final naverRank = item.naverReviewRank;
    final naverBoost = naverRank == null
        ? 0
        : ((maxNaverSignals - naverRank + 1).clamp(0, maxNaverSignals) * 4.5);

    final distance = item.kakao.distanceForSort;
    final distancePenalty = distance.isFinite
        ? (distance / 250).clamp(0, 16).toDouble()
        : 16;

    return (rating * 12) + reviewBoost + naverBoost - distancePenalty;
  }

  Map<String, int> _resolveNaverReviewRanks({
    required List<KakaoPlace> kakaoCandidates,
    required List<NaverLocalItem> naverItems,
    double similarityThreshold = 0.45,
  }) {
    final result = <String, int>{};
    if (kakaoCandidates.isEmpty || naverItems.isEmpty) {
      return result;
    }

    final remaining = List<KakaoPlace>.from(kakaoCandidates);
    for (int i = 0; i < naverItems.length; i++) {
      final naver = naverItems[i];
      KakaoPlace? bestPlace;
      double bestScore = 0;
      double bestNameScore = 0;

      for (final kakao in remaining) {
        final nameScore = nameSimilarity(kakao.name, naver.title);
        var score = nameScore;
        final kakaoAddress = kakao.displayAddress.trim();
        final naverAddress = naver.displayAddress.trim();
        if (kakaoAddress.isNotEmpty && naverAddress.isNotEmpty) {
          if (kakaoAddress.contains(naverAddress) ||
              naverAddress.contains(kakaoAddress)) {
            score += 0.30;
          } else {
            final kakaoTokens = kakaoAddress.split(' ').take(2).toSet();
            final naverTokens = naverAddress.split(' ').take(2).toSet();
            final overlap = kakaoTokens.intersection(naverTokens).length;
            if (overlap > 0) {
              score += overlap * 0.12;
            }
          }
        }

        if (score > bestScore ||
            (score == bestScore && nameScore > bestNameScore)) {
          bestScore = score;
          bestNameScore = nameScore;
          bestPlace = kakao;
        }
      }

      final passedScore = bestScore >= similarityThreshold;
      final passedNameFloor = bestNameScore >= 0.10;
      if (bestPlace != null && passedScore && passedNameFloor) {
        final matchedPlace = bestPlace;
        result[matchedPlace.id] = i + 1;
        remaining.removeWhere((item) => item.id == matchedPlace.id);
        _debug(
          'MATCH rank=${i + 1} naver="${naver.title}" -> kakao="${matchedPlace.name}" score=${bestScore.toStringAsFixed(3)} name=${bestNameScore.toStringAsFixed(3)} threshold=${similarityThreshold.toStringAsFixed(2)}',
        );
      } else {
        _debug(
          'NO_MATCH rank=${i + 1} naver="${naver.title}" best="${bestPlace?.name ?? '-'}" score=${bestScore.toStringAsFixed(3)} name=${bestNameScore.toStringAsFixed(3)} threshold=${similarityThreshold.toStringAsFixed(2)}',
        );
      }
    }
    return result;
  }

  List<String> _buildNaverQueryPlan({
    required String query,
    required List<KakaoPlace> kakaoCandidates,
  }) {
    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty) {
      return const <String>[];
    }

    final plan = <String>[normalizedQuery];
    final seen = <String>{normalizeName(normalizedQuery)};
    for (final place in kakaoCandidates.take(12)) {
      for (final hint in _extractRegionHints(place.displayAddress)) {
        final candidate = '$normalizedQuery $hint'.trim();
        final key = normalizeName(candidate);
        if (candidate.isEmpty || !seen.add(key)) {
          continue;
        }
        plan.add(candidate);
        if (plan.length >= maxNaverQueryFanout) {
          return plan;
        }
      }
    }
    return plan;
  }

  List<String> _extractRegionHints(String address) {
    final tokens = address
        .split(RegExp(r'\s+'))
        .map((token) => token.trim())
        .where((token) => token.isNotEmpty)
        .where((token) => RegExp(r'[a-zA-Z가-힣]').hasMatch(token))
        .toList();
    if (tokens.length < 2) {
      return const <String>[];
    }

    final hints = <String>[
      '${tokens[0]} ${tokens[1]}',
      tokens[1],
    ];
    if (tokens.length >= 3) {
      hints.add('${tokens[1]} ${tokens[2]}');
    }
    return hints;
  }

  String _naverItemKey(NaverLocalItem item) {
    return '${normalizeName(item.title)}|${normalizeName(item.displayAddress)}';
  }

  int _resolveEarlyStopRequiredMatches(int kakaoCount) {
    if (kakaoCount <= 0) {
      return 1;
    }
    final boundedRatio = naverEarlyStopMatchRatio.clamp(0.01, 1.0);
    final required = (kakaoCount * boundedRatio).ceil();
    return required.clamp(1, kakaoCount);
  }

  void _debug(String message) {
    if (!enableDebugLogs) {
      return;
    }
    developer.log(message, name: 'HybridRankingService');
  }

  String _sampleKakao(List<KakaoPlace> items) {
    return items
        .take(8)
        .map(
          (item) => '${item.name}(${item.distanceForSort.toStringAsFixed(0)}m)',
        )
        .join(', ');
  }

  String _sampleRanked(List<RankedPlace> items) {
    return items
        .take(8)
        .map(
          (item) =>
              '${item.kakao.name}[d=${item.kakao.distanceForSort.toStringAsFixed(0)}|n=${item.naverReviewRank ?? '-'}]',
        )
        .join(', ');
  }
}
