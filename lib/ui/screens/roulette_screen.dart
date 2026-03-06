import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../../core/config/app_env.dart';
import '../../data/models/place_sort.dart';
import '../../data/models/ranked_place.dart';
import '../../services/exceptions.dart';
import '../../services/google_meta_cache.dart';
import '../../services/google_places_client.dart';
import '../../services/hybrid_ranking_service.dart';
import '../../services/kakao_place_search_client.dart';
import '../../services/naver_local_cache.dart';
import '../../services/naver_local_search_client.dart';
import '../../services/naver_usage_guard.dart';
import '../../services/shared_preferences_cache_store.dart';
import '../../services/device_location_service.dart';
import '../widgets/glowing_action_button.dart';
import 'pinball_screen.dart';
import 'pinball_v2_screen.dart';
import 'roulette_result_screen.dart';

enum RouletteMode { food, store, custom }

enum _CuisineType { random, korean, western, chinese, japanese, other }

enum _FoodType { random, rice, bread, noodle, meat, soup, snack, fastFood }

extension RouletteModeX on RouletteMode {
  String get label {
    switch (this) {
      case RouletteMode.food:
        return '음식 기준';
      case RouletteMode.store:
        return '주변식당 기준';
      case RouletteMode.custom:
        return '커스텀';
    }
  }
}

extension _CuisineTypeX on _CuisineType {
  String get label {
    switch (this) {
      case _CuisineType.random:
        return '랜덤';
      case _CuisineType.korean:
        return '한식';
      case _CuisineType.western:
        return '양식';
      case _CuisineType.chinese:
        return '중식';
      case _CuisineType.japanese:
        return '일식';
      case _CuisineType.other:
        return '기타';
    }
  }
}

extension _FoodTypeX on _FoodType {
  String get label {
    switch (this) {
      case _FoodType.random:
        return '랜덤';
      case _FoodType.rice:
        return '밥';
      case _FoodType.bread:
        return '빵';
      case _FoodType.noodle:
        return '면';
      case _FoodType.meat:
        return '고기';
      case _FoodType.soup:
        return '국물';
      case _FoodType.snack:
        return '분식';
      case _FoodType.fastFood:
        return '패스트푸드';
    }
  }
}

class RouletteScreenArgs {
  const RouletteScreenArgs({
    this.initialMode = RouletteMode.food,
    this.presetCandidates = const <String>[],
    this.sourceTitle,
    this.autoStart = false,
  });

  final RouletteMode initialMode;
  final List<String> presetCandidates;
  final String? sourceTitle;
  final bool autoStart;
}

class RouletteScreen extends StatefulWidget {
  const RouletteScreen({this.args = const RouletteScreenArgs(), super.key});

  static const String routeName = '/roulette';
  final RouletteScreenArgs args;

  @override
  State<RouletteScreen> createState() => _RouletteScreenState();
}

class _RouletteScreenState extends State<RouletteScreen> {
  final Random _random = Random();
  final SharedPreferencesCacheStore _cacheStore = SharedPreferencesCacheStore();
  final DeviceLocationService _locationService = DeviceLocationService();
  late final HybridRankingService _hybridService = HybridRankingService(
    kakaoClient: KakaoPlaceSearchClient(apiKey: AppEnv.kakaoRestApiKey),
    googleClient: GooglePlacesHttpClient(apiKey: AppEnv.googlePlacesApiKey),
    naverClient:
        AppEnv.naverClientId.isNotEmpty && AppEnv.naverClientSecret.isNotEmpty
        ? NaverLocalSearchClient(
            clientId: AppEnv.naverClientId,
            clientSecret: AppEnv.naverClientSecret,
            cache: NaverLocalCache(store: _cacheStore),
            usageGuard: NaverUsageGuard(
              store: _cacheStore,
              dailyQuota: AppEnv.naverDailyQuota,
            ),
            enableDebugLogs: AppEnv.enableHybridDebugLogs,
          )
        : null,
    cache: GoogleMetaCache(store: _cacheStore),
    enableDebugLogs: AppEnv.enableHybridDebugLogs,
    enableGoogleSignal: false,
  );

  late RouletteMode _mode;
  late List<String> _presetFoodCandidates;

  bool _isMenuManual = false;
  Set<_CuisineType> _selectedCuisines = <_CuisineType>{};
  Set<_FoodType> _selectedFoodTypes = <_FoodType>{};
  final List<TextEditingController> _customItemControllers =
      <TextEditingController>[];
  static const int _minCustomItemCount = 2;
  static const int _maxCustomItemCount = 20;
  static const Duration _customItemHoldDelay = Duration(seconds: 1);
  static const Duration _customItemHoldRepeatInterval = Duration(
    milliseconds: 90,
  );
  static const int _defaultRadiusM = 2000;
  static const int _kakaoMaxRadiusM = 20000;
  static const int _storeBallCandidatesPerSingleFetch = 15;
  static const Duration _spinCooldownDuration = Duration(hours: 3);
  static const String _spinGateStateCacheKey = 'roulette_spin_gate_state_v1';
  static const String _spinGateCooldownUntilCacheKey =
      'roulette_spin_gate_cooldown_until_v1';
  static const int _spinGateStateReady = 0;
  static const int _spinGateStateAdBonus = 1;
  static const int _spinGateStateCooldown = 2;
  static final String _rewardedAdUnitId =
      AppEnv.adMobRewardedAndroidUnitId.trim().isNotEmpty
      ? AppEnv.adMobRewardedAndroidUnitId
      : 'ca-app-pub-3940256099942544/5224354917';
  static const bool _enableAdSpinGate = false;
  int _selectedRadiusM = _defaultRadiusM;
  bool _popularOnlySearch = false;

  bool _isSpinning = false;
  String? _spinProgressText;
  bool _showAllCustomRankingInResult = false;
  Timer? _customItemHoldDelayTimer;
  Timer? _customItemHoldRepeatTimer;
  bool _customItemHoldTriggered = false;
  int _spinGateState = _spinGateStateReady;
  DateTime? _spinCooldownUntil;
  Timer? _spinCooldownTicker;
  RewardedAd? _rewardedAd;
  bool _isRewardedAdLoading = false;
  bool _isRewardedAdShowing = false;
  bool _isAdBonusIntroShowing = false;

  double _lat = 0;
  double _lng = 0;
  String _locationLabel = '현재 위치 확인 중';
  static const String _cuisineTitle = '국가별 요리';
  static const String _foodTypeTitle = '메뉴 타입';
  int get _effectiveSearchRadiusM => _kakaoMaxRadiusM;

  static const Set<_FoodType> _allFoodTypes = <_FoodType>{
    _FoodType.rice,
    _FoodType.bread,
    _FoodType.noodle,
    _FoodType.meat,
    _FoodType.soup,
    _FoodType.snack,
    _FoodType.fastFood,
  };

  static const List<_RouletteCandidate> _foodCandidates = <_RouletteCandidate>[
    _RouletteCandidate(
      keyword: '김치찌개',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '제육볶음',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '비빔밥',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '냉면',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '국밥',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '삼겹살',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '떡볶이',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.snack},
    ),
    _RouletteCandidate(
      keyword: '순두부찌개',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '갈비탕',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '닭갈비',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '감자탕',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.soup, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '칼국수',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '보쌈',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '불고기',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '파스타',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '피자',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.fastFood},
    ),
    _RouletteCandidate(
      keyword: '햄버거',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{
        _FoodType.bread,
        _FoodType.meat,
        _FoodType.fastFood,
      },
    ),
    _RouletteCandidate(
      keyword: '샌드위치',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
    _RouletteCandidate(
      keyword: '스테이크',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '리조또',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '토마토파스타',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '크림파스타',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '오므라이스',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '브런치',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
    _RouletteCandidate(
      keyword: '핫도그',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.fastFood},
    ),
    _RouletteCandidate(
      keyword: '미트볼스파게티',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '짜장면',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '짬뽕',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '탕수육',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '마라탕',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '마파두부',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '깐풍기',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '훠궈',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.soup, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '양장피',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '초밥',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '라멘',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '우동',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '돈까스',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '규동',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '가츠동',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '텐동',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '카레우동',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '치킨',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.fastFood},
    ),
    _RouletteCandidate(
      keyword: '쌀국수',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '샤브샤브',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '카레',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '족발',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '샐러드',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
    _RouletteCandidate(
      keyword: '된장찌개',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '부대찌개',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '육회비빔밥',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '닭볶음탕',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '쭈꾸미볶음',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '낙지볶음',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '오징어볶음',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '설렁탕',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '뼈해장국',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '닭한마리',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '막국수',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '만둣국',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '알리오올리오',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '까르보나라',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '라자냐',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '리가토니파스타',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '치즈버거',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{
        _FoodType.bread,
        _FoodType.meat,
        _FoodType.fastFood,
      },
    ),
    _RouletteCandidate(
      keyword: '클럽샌드위치',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
    _RouletteCandidate(
      keyword: '바비큐폭립',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '그릴치킨샐러드',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '토스트',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.snack},
    ),
    _RouletteCandidate(
      keyword: '치킨랩',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{
        _FoodType.bread,
        _FoodType.meat,
        _FoodType.fastFood,
      },
    ),
    _RouletteCandidate(
      keyword: '볶음밥',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '마라샹궈',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '고추잡채',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '깐쇼새우',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '유린기',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '계란볶음밥',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '우육면',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '딤섬',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.snack},
    ),
    _RouletteCandidate(
      keyword: '메밀소바',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '카츠카레',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '연어덮밥',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '사케동',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '오코노미야키',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.snack},
    ),
    _RouletteCandidate(
      keyword: '야키토리',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '나가사키짬뽕',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '규카츠',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '타코',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.snack},
    ),
    _RouletteCandidate(
      keyword: '부리또',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '포케',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '인도커리',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '탄두리치킨',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '케밥',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '월남쌈',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.snack, _FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '양꼬치',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '팟타이',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '분짜',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.meat},
    ),
  ];

  static final Map<String, _RouletteCandidate> _foodCandidateByKeyword =
      <String, _RouletteCandidate>{
        for (final candidate in _foodCandidates) candidate.keyword: candidate,
      };

  static const List<_RouletteCandidate> _storeCandidates = <_RouletteCandidate>[
    _RouletteCandidate(
      keyword: '한식당',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '국밥집',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '백반집',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '고깃집',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '분식집',
      cuisine: _CuisineType.korean,
      foodTypes: <_FoodType>{_FoodType.snack},
    ),
    _RouletteCandidate(
      keyword: '중식당',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '마라탕집',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '짬뽕집',
      cuisine: _CuisineType.chinese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '일식당',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '초밥집',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.rice},
    ),
    _RouletteCandidate(
      keyword: '라멘집',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.noodle, _FoodType.soup},
    ),
    _RouletteCandidate(
      keyword: '돈까스집',
      cuisine: _CuisineType.japanese,
      foodTypes: <_FoodType>{_FoodType.meat},
    ),
    _RouletteCandidate(
      keyword: '파스타집',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.noodle},
    ),
    _RouletteCandidate(
      keyword: '피자집',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.fastFood},
    ),
    _RouletteCandidate(
      keyword: '햄버거집',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread, _FoodType.fastFood},
    ),
    _RouletteCandidate(
      keyword: '브런치카페',
      cuisine: _CuisineType.western,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
    _RouletteCandidate(
      keyword: '치킨집',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.meat, _FoodType.fastFood},
    ),
    _RouletteCandidate(
      keyword: '베이커리',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
    _RouletteCandidate(
      keyword: '샌드위치 전문점',
      cuisine: _CuisineType.other,
      foodTypes: <_FoodType>{_FoodType.bread},
    ),
  ];

  @override
  void initState() {
    super.initState();
    _mode = widget.args.initialMode;
    _initCustomItems();
    _presetFoodCandidates = widget.args.presetCandidates
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList();
    _loadCurrentLocation(silentFail: true);
    unawaited(_restoreSpinGateState());

    if (widget.args.autoStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        setState(() {
          _selectedRadiusM = _defaultRadiusM;
        });
        _onSpinButtonPressed();
      });
    }
  }

  @override
  void dispose() {
    _spinCooldownTicker?.cancel();
    _disposeRewardedAd();
    _clearCustomItemHoldTimers();
    for (final controller in _customItemControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<bool> _loadCurrentLocation({bool silentFail = false}) async {
    final position = await _locationService.getCurrentPosition();
    if (!mounted) {
      return false;
    }
    if (position == null) {
      final hasCached = _lat.abs() > 0.000001 || _lng.abs() > 0.000001;
      if (hasCached) {
        setState(() {
          _locationLabel = '최근 위치 기준';
        });
        return true;
      }
      setState(() {
        _locationLabel = '현재 위치 확인 필요';
      });
      if (!silentFail) {
        _showSnack('현재 위치를 확인할 수 없습니다. 위치 권한을 허용해 주세요.');
      }
      return false;
    }
    setState(() {
      _lat = position.latitude;
      _lng = position.longitude;
      _locationLabel = '현재 위치 기준';
    });
    return true;
  }

  void _initCustomItems() {
    for (int i = 0; i < _minCustomItemCount; i++) {
      _customItemControllers.add(TextEditingController());
    }
  }

  int get _customItemCount => _customItemControllers.length;

  List<String> get _customEntries {
    final entries = <String>[];
    for (int i = 0; i < _customItemControllers.length; i++) {
      final text = _customItemControllers[i].text.trim();
      entries.add(text.isEmpty ? '후보${i + 1}' : text);
    }
    return entries;
  }

  bool get _hasValidCustomEntries =>
      _customItemCount >= _minCustomItemCount; // 이제 비어있어도 대안 이름으로 돌아가므로 항상 유효함

  void _changeCustomItemCount(int delta) {
    final nextCount = (_customItemCount + delta).clamp(
      _minCustomItemCount,
      _maxCustomItemCount,
    );
    if (nextCount == _customItemCount) {
      return;
    }
    setState(() {
      if (nextCount > _customItemCount) {
        for (int i = _customItemCount; i < nextCount; i++) {
          _customItemControllers.add(TextEditingController());
        }
      } else {
        while (_customItemControllers.length > nextCount) {
          _customItemControllers.removeLast().dispose();
        }
      }
    });
  }

  void _clearCustomItemHoldTimers() {
    _customItemHoldDelayTimer?.cancel();
    _customItemHoldDelayTimer = null;
    _customItemHoldRepeatTimer?.cancel();
    _customItemHoldRepeatTimer = null;
  }

  void _startCustomItemHold(int delta) {
    _clearCustomItemHoldTimers();
    _customItemHoldTriggered = false;
    _customItemHoldDelayTimer = Timer(_customItemHoldDelay, () {
      if (!mounted) {
        return;
      }
      _customItemHoldTriggered = true;
      _changeCustomItemCount(delta);
      _customItemHoldRepeatTimer = Timer.periodic(
        _customItemHoldRepeatInterval,
        (_) {
          if (!mounted) {
            _clearCustomItemHoldTimers();
            return;
          }
          _changeCustomItemCount(delta);
        },
      );
    });
  }

  void _finishCustomItemHold(int delta) {
    final wasHoldTriggered = _customItemHoldTriggered;
    _clearCustomItemHoldTimers();
    _customItemHoldTriggered = false;
    if (wasHoldTriggered) {
      return;
    }
    _changeCustomItemCount(delta);
  }

  void _cancelCustomItemHold() {
    _clearCustomItemHoldTimers();
    _customItemHoldTriggered = false;
  }

  Widget _buildCustomCountAdjustButton({
    required int delta,
    required IconData icon,
  }) {
    return Semantics(
      button: true,
      label: delta > 0 ? '커스텀 항목 증가' : '커스텀 항목 감소',
      child: Listener(
        behavior: HitTestBehavior.opaque,
        onPointerDown: (_) => _startCustomItemHold(delta),
        onPointerUp: (_) => _finishCustomItemHold(delta),
        onPointerCancel: (_) => _cancelCustomItemHold(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            icon,
            size: 28,
            color: const Color(0xFF6A7E85),
          ),
        ),
      ),
    );
  }

  List<_RouletteCandidate> get _activeCandidates {
    if (_mode == RouletteMode.custom) {
      return const <_RouletteCandidate>[];
    }
    final candidates = _baseCandidatesForMode;
    if (!_isMenuManual) {
      return candidates;
    }
    return candidates.where(_matchesManualFilter).toList();
  }

  List<_RouletteCandidate> get _baseCandidatesForMode {
    switch (_mode) {
      case RouletteMode.food:
        return _foodCandidatesForCurrentMode;
      case RouletteMode.store:
        return _storeCandidates;
      case RouletteMode.custom:
        return const <_RouletteCandidate>[];
    }
  }

  List<_RouletteCandidate> get _foodCandidatesForCurrentMode {
    if (_presetFoodCandidates.isEmpty) {
      return _foodCandidates;
    }
    return _presetFoodCandidates.map((keyword) {
      final known = _foodCandidateByKeyword[keyword];
      if (known != null) {
        return known;
      }
      return _RouletteCandidate(
        keyword: keyword,
        cuisine: _CuisineType.other,
        foodTypes: _allFoodTypes,
      );
    }).toList();
  }

  bool _matchesManualFilter(_RouletteCandidate candidate) {
    final cuisineMatched = _selectedCuisines.contains(candidate.cuisine);
    final foodTypeMatched = candidate.foodTypes.any(
      _selectedFoodTypes.contains,
    );
    return cuisineMatched || foodTypeMatched;
  }

  bool get _hasValidGroupSelection {
    if (_mode == RouletteMode.custom) {
      return true;
    }
    if (!_isMenuManual) {
      return true;
    }
    return _selectedCuisines.isNotEmpty || _selectedFoodTypes.isNotEmpty;
  }

  List<_ManualGroupPool> _manualGroupPools() {
    if (!_isMenuManual) {
      return const <_ManualGroupPool>[];
    }
    return <_ManualGroupPool>[
      ..._selectedCuisines.map(
        (cuisine) => _ManualGroupPool(
          label: cuisine.label,
          candidates: _baseCandidatesForMode
              .where((candidate) => candidate.cuisine == cuisine)
              .toList(),
        ),
      ),
      ..._selectedFoodTypes.map(
        (foodType) => _ManualGroupPool(
          label: foodType.label,
          candidates: _baseCandidatesForMode
              .where((candidate) => candidate.foodTypes.contains(foodType))
              .toList(),
        ),
      ),
    ];
  }

  String _candidateKey(_RouletteCandidate candidate) {
    return '${candidate.keyword}|${candidate.cuisine.name}';
  }

  List<_RouletteCandidate>? _sampleUniqueBalancedCandidates({
    required List<_ManualGroupPool> pools,
    required int takePerPool,
  }) {
    for (int attempt = 0; attempt < 24; attempt++) {
      final usedKeys = <String>{};
      final pickedByPoolIndex = <int, List<_RouletteCandidate>>{};
      final poolOrder = List<int>.generate(pools.length, (index) => index)
        ..sort(
          (a, b) =>
              pools[a].candidates.length.compareTo(pools[b].candidates.length),
        );

      var feasible = true;
      for (final poolIndex in poolOrder) {
        final shuffled = List<_RouletteCandidate>.from(
          pools[poolIndex].candidates,
        )..shuffle(_random);
        final available = shuffled
            .where((candidate) => !usedKeys.contains(_candidateKey(candidate)))
            .toList();
        if (available.length < takePerPool) {
          feasible = false;
          break;
        }
        final picked = available.take(takePerPool).toList();
        pickedByPoolIndex[poolIndex] = picked;
        usedKeys.addAll(picked.map(_candidateKey));
      }
      if (!feasible) {
        continue;
      }

      final result = <_RouletteCandidate>[];
      for (int poolIndex = 0; poolIndex < pools.length; poolIndex++) {
        final picked = pickedByPoolIndex[poolIndex];
        if (picked == null || picked.length < takePerPool) {
          feasible = false;
          break;
        }
        result.addAll(picked);
      }
      if (feasible) {
        return result;
      }
    }

    return null;
  }

  List<_RouletteCandidate> _spinCandidates() {
    final filtered = _activeCandidates;
    if (!_isMenuManual || filtered.isEmpty) {
      return filtered;
    }

    final pools = _manualGroupPools();
    if (pools.isEmpty) {
      return const <_RouletteCandidate>[];
    }
    var takePerPool = pools.map((pool) => pool.candidates.length).reduce(min);
    if (takePerPool < 1) {
      return const <_RouletteCandidate>[];
    }

    while (takePerPool > 0) {
      final sampled = _sampleUniqueBalancedCandidates(
        pools: pools,
        takePerPool: takePerPool,
      );
      if (sampled != null && sampled.isNotEmpty) {
        return sampled;
      }
      takePerPool -= 1;
    }

    return const <_RouletteCandidate>[];
  }

  static final List<_PinballMapChoice> _pinballMapChoices = [
    _PinballMapChoice(mapIndex: 1, title: 'Wheel of fortune'),
    _PinballMapChoice(mapIndex: 2, title: 'BubblePop'),
    _PinballMapChoice(mapIndex: 3, title: 'Pot of greed'),
    _PinballMapChoice(
      mapIndex: 4,
      title: 'Into The Night',
    ),
  ];
  static const List<_V2MapChoice> _preferredV2MapChoices = <_V2MapChoice>[
    _V2MapChoice(id: 'm5_Cosmic_Odyssey', title: 'Cosmic Odyssey', sort: 110),
    _V2MapChoice(id: 'm7_PinBall', title: 'PinBall', sort: 120),
    _V2MapChoice(
      id: 'm6_Spacetime_Labyrinth',
      title: 'Spacetime Labyrinth',
      sort: 130,
    ),
    _V2MapChoice(id: 'm8_Sticky_Hell', title: 'Sticky Hell', sort: 140),
  ];
  static int? _lastAutoPinballMapIndex;
  static final Map<int, int> _autoPinballMapPickCounts = <int, int>{
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  };

  void _recordAutoPinballMapSelection(int mapIndex) {
    _lastAutoPinballMapIndex = mapIndex;
    _autoPinballMapPickCounts[mapIndex] =
        (_autoPinballMapPickCounts[mapIndex] ?? 0) + 1;
  }

  int _pickAutoPinballMapIndex({bool disallowMap4 = false}) {
    final all = _pinballMapChoices
        .map((choice) => choice.mapIndex)
        .where((index) => !disallowMap4 || index != 4)
        .toList(growable: false);
    if (all.isEmpty) {
      return 1;
    }
    final last = _lastAutoPinballMapIndex;
    final candidates = all
        .where((index) => index != last)
        .toList(growable: false);
    final pool = candidates.isEmpty ? all : candidates;
    final minCount = pool
        .map((index) => _autoPinballMapPickCounts[index] ?? 0)
        .reduce(min);
    final leastUsed = pool
        .where((index) => (_autoPinballMapPickCounts[index] ?? 0) == minCount)
        .toList(growable: false);
    final pickedPool = leastUsed.isNotEmpty ? leastUsed : pool;
    final picked = pickedPool[_random.nextInt(pickedPool.length)];
    return picked;
  }

  int _pinballPreviewCandidateCount() {
    if (_mode == RouletteMode.custom) {
      return _customEntries.length;
    }
    return _spinCandidates().length;
  }

  Future<File?> _resolveLocalV2ManifestFile() async {
    final sep = Platform.pathSeparator;
    final candidates = <String>[
      <String>[
        Directory.current.path,
        'assets',
        'ui',
        'pinball',
        'maps',
        'manifest.json',
      ].join(sep),
      <String>[
        Directory.current.path,
        '..',
        'assets',
        'ui',
        'pinball',
        'maps',
        'manifest.json',
      ].join(sep),
    ];
    for (final path in candidates) {
      try {
        final file = File(path);
        if (await file.exists()) {
          return file;
        }
      } catch (_) {}
    }
    return null;
  }

  Future<List<Directory>> _resolveLocalV2MapsDirs() async {
    final sep = Platform.pathSeparator;
    final candidates = <String>[
      <String>[
        Directory.current.path,
        'assets',
        'ui',
        'pinball',
        'maps',
      ].join(sep),
      <String>[
        Directory.current.path,
        '..',
        'assets',
        'ui',
        'pinball',
        'maps',
      ].join(sep),
    ];
    final dirs = <Directory>[];
    for (final path in candidates) {
      try {
        final dir = Directory(path);
        if (await dir.exists()) {
          dirs.add(dir);
        }
      } catch (_) {}
    }
    return dirs;
  }

  Future<List<_V2MapChoice>> _loadLocalV2MapFileChoices() async {
    final dirs = await _resolveLocalV2MapsDirs();
    if (dirs.isEmpty) {
      return const <_V2MapChoice>[];
    }
    final seen = <String>{};
    final parsed = <_V2MapChoice>[];
    for (final dir in dirs) {
      try {
        await for (final entity in dir.list(followLinks: false)) {
          if (entity is! File) {
            continue;
          }
          final fileName = entity.uri.pathSegments.isNotEmpty
              ? entity.uri.pathSegments.last
              : '';
          final lower = fileName.toLowerCase();
          if (!lower.endsWith('.json') || lower == 'manifest.json') {
            continue;
          }
          final id = fileName.substring(0, fileName.length - 5).trim();
          if (id.isEmpty || !seen.add(id)) {
            continue;
          }
          parsed.add(
            _V2MapChoice(id: id, title: id, sort: 8000 + parsed.length),
          );
        }
      } catch (_) {}
    }
    return parsed;
  }

  List<_V2MapChoice> _parseBundledV2MapChoices(dynamic rawAssetManifest) {
    final keys = rawAssetManifest is Map
        ? rawAssetManifest.keys
        : (rawAssetManifest is Iterable ? rawAssetManifest : null);
    if (keys == null) {
      return const <_V2MapChoice>[];
    }
    const prefix = 'assets/ui/pinball/maps/';
    final seen = <String>{};
    final parsed = <_V2MapChoice>[];
    for (final key in keys) {
      if (key is! String || !key.startsWith(prefix)) {
        continue;
      }
      final fileName = key.substring(prefix.length);
      final lower = fileName.toLowerCase();
      if (!lower.endsWith('.json') || lower == 'manifest.json') {
        continue;
      }
      if (fileName.contains('/')) {
        continue;
      }
      final id = fileName.substring(0, fileName.length - 5).trim();
      if (id.isEmpty || !seen.add(id)) {
        continue;
      }
      parsed.add(_V2MapChoice(id: id, title: id, sort: 8500 + parsed.length));
    }
    return parsed;
  }

  Future<List<_V2MapChoice>> _loadBundledV2MapChoices() async {
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      final parsed = _parseBundledV2MapChoices(manifest.listAssets());
      if (parsed.isNotEmpty) {
        return parsed;
      }
    } catch (_) {}
    try {
      final text = await rootBundle.loadString('AssetManifest.json');
      final raw = jsonDecode(text);
      return _parseBundledV2MapChoices(raw);
    } catch (_) {
      return const <_V2MapChoice>[];
    }
  }

  List<_V2MapChoice> _parseV2MapChoices(dynamic rawManifest) {
    if (rawManifest is! Map) {
      return const <_V2MapChoice>[];
    }
    final maps = rawManifest['maps'];
    if (maps is! List) {
      return const <_V2MapChoice>[];
    }
    final parsed = <_V2MapChoice>[];
    for (final item in maps) {
      if (item is! Map) {
        continue;
      }
      final engine = (item['engine'] ?? 'v2').toString().trim();
      if (engine.isNotEmpty && engine != 'v2') {
        continue;
      }
      if (item['enabled'] == false) {
        continue;
      }
      final id = (item['id'] ?? '').toString().trim();
      if (id.isEmpty) {
        continue;
      }
      final title = (item['title'] ?? id).toString().trim();
      final sortRaw = item['sort'];
      final sort = sortRaw is num
          ? sortRaw.toInt()
          : int.tryParse('$sortRaw') ?? 9999;
      parsed.add(
        _V2MapChoice(id: id, title: title.isEmpty ? id : title, sort: sort),
      );
    }
    parsed.sort((left, right) {
      final sortCmp = left.sort.compareTo(right.sort);
      if (sortCmp != 0) {
        return sortCmp;
      }
      return left.id.compareTo(right.id);
    });
    return parsed;
  }

  Future<List<_V2MapChoice>> _loadV2MapChoices() async {
    dynamic rawManifest;
    final localFile = await _resolveLocalV2ManifestFile();
    if (localFile != null) {
      try {
        final text = await localFile.readAsString();
        rawManifest = jsonDecode(text);
      } catch (_) {}
    }
    if (rawManifest == null) {
      try {
        final text = await rootBundle.loadString(
          'assets/ui/pinball/maps/manifest.json',
        );
        rawManifest = jsonDecode(text);
      } catch (_) {}
    }
    final choices = _parseV2MapChoices(rawManifest);
    final merged = <String, _V2MapChoice>{
      for (final choice in choices) choice.id: choice,
    };
    for (final choice in await _loadLocalV2MapFileChoices()) {
      merged.putIfAbsent(choice.id, () => choice);
    }
    for (final choice in await _loadBundledV2MapChoices()) {
      merged.putIfAbsent(choice.id, () => choice);
    }
    final resolved = merged.values.toList(growable: false)
      ..sort((left, right) {
        final sortCmp = left.sort.compareTo(right.sort);
        if (sortCmp != 0) {
          return sortCmp;
        }
        return left.id.compareTo(right.id);
      });
    if (resolved.isNotEmpty) {
      return resolved;
    }
    return const <_V2MapChoice>[
      _V2MapChoice(id: 'v2_default', title: 'v2_default', sort: 100),
    ];
  }

  Future<_PinballLaunchConfig?> _showPinballLaunchPicker({
    required int suggestedMapIndex,
  }) async {
    final loadedV2Maps = await _loadV2MapChoices();
    final v2ById = <String, _V2MapChoice>{
      for (final map in loadedV2Maps) map.id: map,
    };
    final resolvedV2Maps = <_V2MapChoice>[
      for (final preferred in _preferredV2MapChoices)
        v2ById[preferred.id] ?? preferred,
    ];
    for (final map in loadedV2Maps) {
      final duplicated = resolvedV2Maps.any((item) => item.id == map.id);
      if (!duplicated) {
        resolvedV2Maps.add(map);
      }
      if (resolvedV2Maps.length >= 4) {
        break;
      }
    }
    final selectedV2Maps = resolvedV2Maps.take(4).toList(growable: false);
    final launchOptions = <_MapLaunchOption>[
      ..._pinballMapChoices.map(
        (choice) => _MapLaunchOption(
          number: choice.mapIndex,
          label: 'M${choice.mapIndex} - ${choice.title}',
          isNew: false,
          config: _PinballLaunchConfig.v1(choice.mapIndex),
        ),
      ),
      for (var i = 0; i < selectedV2Maps.length; i++)
        _MapLaunchOption(
          number: 5 + i,
          label: 'M${5 + i} - ${_displayV2MapTitle(selectedV2Maps[i])}',
          isNew: true,
          config: _PinballLaunchConfig.v2(selectedV2Maps[i].id),
        ),
    ];
    if (!mounted) {
      return null;
    }
    return showDialog<_PinballLaunchConfig>(
      context: context,
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 430, maxHeight: 620),
            decoration: BoxDecoration(
              color: const Color(0xFFF7FBFF),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE9D5E5), width: 1.2),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x331A0A14),
                  blurRadius: 28,
                  offset: Offset(0, 12),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '맵선택',
                          style: Theme.of(dialogContext).textTheme.titleLarge
                              ?.copyWith(
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFFE6006E),
                              ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(dialogContext).pop(),
                        icon: const Icon(
                          Icons.close_rounded,
                          color: Color(0xFF6E6271),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        children: [
                          for (final option in launchOptions)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(14),
                                onTap: () {
                                  Navigator.of(dialogContext).pop(option.config);
                                },
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 12,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFFFFF),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: option.number == suggestedMapIndex
                                          ? const Color(0xFFFF63A8)
                                          : const Color(0xFFE2E8EF),
                                      width: option.number == suggestedMapIndex
                                          ? 1.4
                                          : 1.0,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          option.label,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: Color(0xFF2D3340),
                                            fontWeight: FontWeight.w700,
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      if (option.isNew)
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 7,
                                            vertical: 3,
                                          ),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFFF2E84),
                                            borderRadius: BorderRadius.circular(
                                              999,
                                            ),
                                          ),
                                          child: const Text(
                                            'NEW',
                                            style: TextStyle(
                                              color: Colors.white,
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _displayV2MapTitle(_V2MapChoice map) {
    const idOverrides = <String, String>{
      'm5_Cosmic_Odyssey': 'Cosmic Odyssey',
      'm6_Spacetime_Labyrinth': 'Spacetime Labyrinth',
      'm7_PinBall': 'PinBall',
      'm8_Sticky_Hell': 'Sticky Hell',
    };
    final fromId = idOverrides[map.id];
    if (fromId != null && fromId.isNotEmpty) {
      return fromId;
    }
    final raw = map.title.trim().isNotEmpty ? map.title.trim() : map.id.trim();
    if (raw.isEmpty) {
      return map.id;
    }
    return raw.replaceAll('_', ' ');
  }

  bool get _isSpinGateMode =>
      _enableAdSpinGate &&
      (_mode == RouletteMode.food || _mode == RouletteMode.store);

  Duration get _spinCooldownRemaining {
    final until = _spinCooldownUntil;
    if (until == null) {
      return Duration.zero;
    }
    final remaining = until.difference(DateTime.now());
    if (remaining.isNegative) {
      return Duration.zero;
    }
    return remaining;
  }

  String _formatHms(Duration duration) {
    final totalSeconds = duration.inSeconds.clamp(0, 99 * 3600);
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    final seconds = totalSeconds % 60;
    return '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  String _spinButtonLabel() {
    if (_isSpinning) {
      return _mode == RouletteMode.custom ? '커스텀 항목 선택 중...' : '선택 후보 검색 중...';
    }
    if (_isRewardedAdLoading ||
        _isRewardedAdShowing ||
        _isAdBonusIntroShowing) {
      return '광고 준비 중...';
    }
    if (!_isSpinGateMode) {
      return '룰렛 돌리기';
    }
    final remaining = _spinCooldownRemaining;
    if (_spinGateState == _spinGateStateCooldown && remaining > Duration.zero) {
      return '다시 돌리기까지 ${_formatHms(remaining)}';
    }
    if (_spinGateState == _spinGateStateAdBonus) {
      return '광고 보고 딱 한번만 더 돌리기';
    }
    return '룰렛 돌리기';
  }

  bool get _isSpinButtonEnabled {
    if (_isSpinning ||
        _isRewardedAdLoading ||
        _isRewardedAdShowing ||
        _isAdBonusIntroShowing) {
      return false;
    }
    if (!_isSpinGateMode) {
      return true;
    }
    return !(_spinGateState == _spinGateStateCooldown &&
        _spinCooldownRemaining > Duration.zero);
  }

  Future<void> _persistSpinGateState() async {
    await _cacheStore.write(_spinGateStateCacheKey, _spinGateState.toString());
    final cooldownMs = _spinCooldownUntil?.millisecondsSinceEpoch ?? 0;
    await _cacheStore.write(
      _spinGateCooldownUntilCacheKey,
      cooldownMs.toString(),
    );
  }

  Future<void> _setSpinGateReady() async {
    _spinCooldownTicker?.cancel();
    _spinGateState = _spinGateStateReady;
    _spinCooldownUntil = null;
    await _persistSpinGateState();
    if (!mounted) {
      return;
    }
    setState(() {});
  }

  Future<void> _setSpinGateAdBonus() async {
    _spinGateState = _spinGateStateAdBonus;
    _spinCooldownUntil = null;
    await _persistSpinGateState();
    if (mounted) {
      setState(() {});
    }
    unawaited(_ensureRewardedAdLoaded());
  }

  Future<void> _setSpinGateCooldown() async {
    _disposeRewardedAd();
    _spinGateState = _spinGateStateCooldown;
    _spinCooldownUntil = DateTime.now().add(_spinCooldownDuration);
    await _persistSpinGateState();
    _startSpinCooldownTicker();
    if (!mounted) {
      return;
    }
    setState(() {});
  }

  void _startSpinCooldownTicker() {
    _spinCooldownTicker?.cancel();
    _spinCooldownTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      final remaining = _spinCooldownRemaining;
      if (remaining <= Duration.zero) {
        unawaited(_setSpinGateReady());
        return;
      }
      if (mounted) {
        setState(() {});
      }
    });
  }

  Future<void> _restoreSpinGateState() async {
    final savedStateRaw = await _cacheStore.read(_spinGateStateCacheKey);
    final savedCooldownUntilRaw = await _cacheStore.read(
      _spinGateCooldownUntilCacheKey,
    );
    var nextState = int.tryParse(savedStateRaw ?? '') ?? _spinGateStateReady;
    DateTime? nextCooldownUntil;
    final parsedCooldownMs = int.tryParse(savedCooldownUntilRaw ?? '');
    if (parsedCooldownMs != null && parsedCooldownMs > 0) {
      nextCooldownUntil = DateTime.fromMillisecondsSinceEpoch(parsedCooldownMs);
    }

    if (nextState == _spinGateStateCooldown &&
        (nextCooldownUntil == null ||
            !nextCooldownUntil.isAfter(DateTime.now()))) {
      nextState = _spinGateStateReady;
      nextCooldownUntil = null;
    }

    _spinGateState = nextState;
    _spinCooldownUntil = nextCooldownUntil;
    await _persistSpinGateState();

    if (!mounted) {
      return;
    }
    setState(() {});

    if (nextState == _spinGateStateCooldown && nextCooldownUntil != null) {
      _startSpinCooldownTicker();
    } else if (nextState == _spinGateStateAdBonus) {
      unawaited(_ensureRewardedAdLoaded());
    }
  }

  void _disposeRewardedAd() {
    _rewardedAd?.dispose();
    _rewardedAd = null;
  }

  Future<bool> _ensureRewardedAdLoaded() async {
    if (_rewardedAd != null) {
      return true;
    }
    if (_isRewardedAdLoading) {
      return false;
    }

    if (mounted) {
      setState(() {
        _isRewardedAdLoading = true;
      });
    } else {
      _isRewardedAdLoading = true;
    }

    final completer = Completer<bool>();
    RewardedAd.load(
      adUnitId: _rewardedAdUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          _rewardedAd = ad;
          if (!completer.isCompleted) {
            completer.complete(true);
          }
        },
        onAdFailedToLoad: (_) {
          if (!completer.isCompleted) {
            completer.complete(false);
          }
        },
      ),
    );

    final loaded = await completer.future;
    if (mounted) {
      setState(() {
        _isRewardedAdLoading = false;
      });
    } else {
      _isRewardedAdLoading = false;
    }
    if (!loaded) {
      _disposeRewardedAd();
    }
    return loaded;
  }

  Future<bool> _showRewardedAd() async {
    final loaded = await _ensureRewardedAdLoaded();
    final ad = _rewardedAd;
    if (!loaded || ad == null) {
      return false;
    }

    _rewardedAd = null;
    var rewarded = false;
    final completer = Completer<void>();

    if (mounted) {
      setState(() {
        _isRewardedAdShowing = true;
      });
    } else {
      _isRewardedAdShowing = true;
    }

    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        if (!completer.isCompleted) {
          completer.complete();
        }
      },
      onAdFailedToShowFullScreenContent: (ad, _) {
        ad.dispose();
        if (!completer.isCompleted) {
          completer.complete();
        }
      },
    );

    ad.show(
      onUserEarnedReward: (_, _) {
        rewarded = true;
      },
    );

    await completer.future;

    if (mounted) {
      setState(() {
        _isRewardedAdShowing = false;
      });
    } else {
      _isRewardedAdShowing = false;
    }

    return rewarded;
  }

  Future<bool> _performSpinRound() async {
    if (!mounted) {
      return false;
    }
    final hasCachedLocation = _lat.abs() > 0.000001 || _lng.abs() > 0.000001;
    bool hasLocation = hasCachedLocation;
    if (_mode == RouletteMode.store) {
      hasLocation = await _loadCurrentLocation();
      if (!hasLocation) {
        _showSnack('주변식당 기준은 현재 위치 확인 후 사용할 수 있어요.');
        return false;
      }
    } else {
      unawaited(_loadCurrentLocation(silentFail: true));
    }
    final previewCount = _pinballPreviewCandidateCount();
    final suggestedMapIndex = _pickAutoPinballMapIndex(
      disallowMap4: previewCount <= 5,
    );
    final launchConfig = await _showPinballLaunchPicker(
      suggestedMapIndex: suggestedMapIndex,
    );
    if (launchConfig == null) {
      return false;
    }
    return _spin(launchConfig: launchConfig, hasLocation: hasLocation);
  }

  Future<void> _showAdBonusIntro() async {
    if (!mounted) {
      return;
    }
    setState(() {
      _isAdBonusIntroShowing = true;
    });
    await Future.delayed(const Duration(milliseconds: 1500));
    if (!mounted) {
      return;
    }
    setState(() {
      _isAdBonusIntroShowing = false;
    });
  }

  Future<void> _handleAdBonusSpin() async {
    await _showAdBonusIntro();
    if (!mounted) {
      return;
    }
    final rewarded = await _showRewardedAd();
    if (!mounted) {
      return;
    }
    if (!rewarded) {
      _showSnack('광고 시청이 완료되지 않아 추가 기회가 지급되지 않았어요.');
      unawaited(_ensureRewardedAdLoaded());
      return;
    }
    await _performSpinRound();
    await _setSpinGateCooldown();
  }

  Future<void> _onSpinButtonPressed() async {
    if (!mounted) {
      return;
    }
    if (_isSpinGateMode &&
        _spinGateState == _spinGateStateCooldown &&
        _spinCooldownRemaining <= Duration.zero) {
      await _setSpinGateReady();
    }
    if (_isSpinGateMode &&
        _spinGateState == _spinGateStateCooldown &&
        _spinCooldownRemaining > Duration.zero) {
      return;
    }
    if (_isSpinGateMode && _spinGateState == _spinGateStateAdBonus) {
      await _handleAdBonusSpin();
      return;
    }

    final didSpin = await _performSpinRound();
    if (!mounted || !didSpin || !_isSpinGateMode) {
      return;
    }
    await _setSpinGateAdBonus();
  }

  Future<bool> _spin({
    required _PinballLaunchConfig launchConfig,
    required bool hasLocation,
  }) async {
    if (_mode == RouletteMode.custom) {
      return _spinCustom(launchConfig: launchConfig, hasLocation: hasLocation);
    }

    if (!_hasValidGroupSelection) {
      _showSnack('직접 선택에서 국가별 요리 또는 메뉴 타입을 1개 이상 선택해 주세요.');
      return false;
    }

    if (_mode == RouletteMode.store) {
      return _spinStore(launchConfig: launchConfig, hasLocation: hasLocation);
    }

    final filteredCandidates = _spinCandidates();
    if (filteredCandidates.isEmpty) {
      _showSnack('현재 설정에 맞는 후보가 없습니다. 필터를 조정해 주세요.');
      return false;
    }

    setState(() {
      _isSpinning = true;
      _spinProgressText = '선택 후보 검색 중...';
    });

    var didComplete = false;
    try {
      final fallback = RouletteResultArgs(
        resultName: filteredCandidates.first.keyword,
        query: filteredCandidates.first.keyword,
        mode: _mode,
        radiusMeters: _selectedRadiusM,
        selectedReasonLabel: _resolveFoodReasonLabel(filteredCandidates.first),
        preferPopularOnOpen: false,
        originLat: hasLocation ? _lat : null,
        originLng: hasLocation ? _lng : null,
        originLabel: hasLocation ? _locationLabel : null,
        showSearchButton: hasLocation,
        fromMood: widget.args.autoStart,
      );
      didComplete = await _handlePostSpinResult(
        args: fallback,
        launchConfig: launchConfig,
        candidateNames: filteredCandidates
            .map((candidate) => candidate.keyword)
            .toList(growable: false),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSpinning = false;
          _spinProgressText = null;
        });
      }
    }
    return didComplete;
  }

  Future<bool> _spinCustom({
    required _PinballLaunchConfig launchConfig,
    required bool hasLocation,
  }) async {
    if (!_hasValidCustomEntries) {
      _showSnack('커스텀룰렛 항목을 모두 입력해 주세요.');
      return false;
    }
    final entries = _customEntries;
    if (entries.length < _minCustomItemCount) {
      _showSnack('커스텀룰렛은 항목 2개 이상이 필요합니다.');
      return false;
    }

    var didComplete = false;
    setState(() {
      _isSpinning = true;
      _spinProgressText = '커스텀 항목 선택 중...';
    });

    try {
      final selected = entries[_random.nextInt(entries.length)];
      if (!mounted) {
        return false;
      }

      // Check if the selected custom item matches any of our known food candidates
      final hasMatch = _foodCandidates.any((c) {
        final k = c.keyword;
        return selected == k ||
            selected.contains(k) ||
            k.contains(selected) ||
            (k.endsWith('집') && selected == k.substring(0, k.length - 1));
      });
      didComplete = await _handlePostSpinResult(
        args: RouletteResultArgs(
          resultName: selected,
          query: selected,
          mode: RouletteMode.custom,
          radiusMeters: 1000, // 커스텀 모드는 1km 고정
          selectedReasonLabel: '커스텀룰렛',
          preferPopularOnOpen: false,
          originLat: hasLocation ? _lat : null,
          originLng: hasLocation ? _lng : null,
          originLabel: hasLocation ? _locationLabel : null,
          showSearchButton: hasMatch && hasLocation,
        ),
        launchConfig: launchConfig,
        candidateNames: entries,
        waitForFullRanking: _showAllCustomRankingInResult,
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSpinning = false;
          _spinProgressText = null;
        });
      }
    }
    return didComplete;
  }

  Future<bool> _spinStore({
    required _PinballLaunchConfig launchConfig,
    required bool hasLocation,
  }) async {
    if (!hasLocation) {
      _showSnack('주변식당 기준은 현재 위치 확인 후 사용할 수 있어요.');
      return false;
    }
    final filteredCandidates = _spinCandidates();
    if (filteredCandidates.isEmpty) {
      _showSnack('현재 설정에 맞는 후보가 없습니다. 필터를 조정해 주세요.');
      return false;
    }

    final selectedCandidate =
        filteredCandidates[_random.nextInt(filteredCandidates.length)];
    final storeContext = _StoreSelectionContext(
      queryKeyword: selectedCandidate.keyword,
      reasonLabel: _resolveStoreReasonLabel(selectedCandidate),
    );

    setState(() {
      _isSpinning = true;
      _spinProgressText = '식당을 찾는 중...';
    });

    List<RankedPlace> ranked = const <RankedPlace>[];
    try {
      ranked = await _hybridService.searchHybrid(
        query: storeContext.queryKeyword,
        lat: _lat,
        lng: _lng,
        radius: _effectiveSearchRadiusM,
        sort: PlaceSort.distance,
        enableNaverSignal: true,
      );
    } on MissingApiKeyException {
      _showSnack('검색 설정값이 누락되었습니다.');
    } on TimeoutException {
      _showSnack('요청 시간이 초과되었습니다.');
    } on ApiRequestException catch (e) {
      if (e.statusCode == 429 && e.message.isNotEmpty) {
        _showSnack(e.message);
      } else {
        _showSnack('식당 검색에 실패했습니다.');
      }
    } catch (_) {
      _showSnack('식당 검색 중 오류가 발생했습니다.');
    } finally {
      if (mounted) {
        setState(() {
          _isSpinning = false;
          _spinProgressText = null;
        });
      }
    }

    if (!mounted) {
      return false;
    }

    if (ranked.isEmpty) {
      _showSnack('선택한 거리 안에서 식당을 찾지 못했습니다.');
      return false;
    }

    if (_popularOnlySearch) {
      ranked = ranked.where((item) => item.hasNaverReviewSignal).toList()
        ..sort((a, b) => a.naverReviewRank!.compareTo(b.naverReviewRank!));
      if (ranked.isEmpty) {
        _showSnack('많이 찾는 음식점 조건으로는 식당을 찾지 못했습니다.');
        return false;
      }
    }

    final reviewTop = ranked.where((item) => item.hasNaverReviewSignal).toList()
      ..sort((a, b) => a.naverReviewRank!.compareTo(b.naverReviewRank!));
    final pool = _popularOnlySearch
        ? ranked
        : reviewTop.isNotEmpty
        ? reviewTop.take(5).toList()
        : ranked.take(min(5, ranked.length)).toList();
    final selected = pool[_random.nextInt(pool.length)];

    final gameCandidates = ranked
        .take(min(_storeBallCandidatesPerSingleFetch, ranked.length))
        .map((place) => place.kakao.name)
        .toList(growable: false);
    await _handlePostSpinResult(
      args: RouletteResultArgs(
        resultName: selected.kakao.name,
        query: storeContext.queryKeyword,
        mode: _mode,
        radiusMeters: _selectedRadiusM,
        selectedStore: selected,
        selectedReasonLabel: storeContext.reasonLabel,
        preferPopularOnOpen: _popularOnlySearch,
        originLat: _lat,
        originLng: _lng,
        originLabel: _locationLabel,
      ),
      launchConfig: launchConfig,
      candidateNames: gameCandidates,
      rankedCandidates: ranked,
    );
    return true;
  }

  Future<bool> _handlePostSpinResult({
    required RouletteResultArgs args,
    required _PinballLaunchConfig launchConfig,
    required List<String> candidateNames,
    bool waitForFullRanking = false,
    List<RankedPlace> rankedCandidates = const <RankedPlace>[],
  }) async {
    final normalizedCandidates = candidateNames
        .map((name) => name.trim())
        .where((name) => name.isNotEmpty)
        .toList(growable: false);
    if (normalizedCandidates.isEmpty) {
      _showSnack('핀볼 후보가 없습니다. 잠시 후 다시 시도해 주세요.');
      return false;
    }

    final navigator = Navigator.of(context);
    final Object? pinballResult;
    if (launchConfig.useV2) {
      pinballResult = await navigator.pushNamed(
        PinballV2Screen.routeName,
        arguments: PinballV2ScreenArgs(
          candidates: normalizedCandidates,
          mapId: launchConfig.v2MapId ?? 'v2_default',
          autoStart: true,
          waitForFullRanking: waitForFullRanking,
        ),
      );
    } else {
      final selectedMapIndex = launchConfig.v1MapIndex ?? 1;
      final effectiveMapIndex =
          normalizedCandidates.length <= 5 && selectedMapIndex == 4
          ? _pickAutoPinballMapIndex(disallowMap4: true)
          : selectedMapIndex;
      _recordAutoPinballMapSelection(effectiveMapIndex);
      pinballResult = await navigator.pushNamed(
        PinballScreen.routeName,
        arguments: PinballScreenArgs(
          candidates: normalizedCandidates,
          autoStart: true,
          selectedMapIndex: effectiveMapIndex,
          waitForFullRanking: waitForFullRanking,
        ),
      );
    }
    if (!mounted || pinballResult == null) {
      return false;
    }
    final outcome = _parsePinballOutcome(pinballResult);
    if (outcome == null) {
      return false;
    }
    final winnerName = outcome.winner;
    final rankingNames = args.mode == RouletteMode.custom &&
            waitForFullRanking
        ? outcome.ranking
        : const <String>[];
    final matchedStore =
        args.mode == RouletteMode.store && rankedCandidates.isNotEmpty
        ? _findStoreByName(
            rankedCandidates: rankedCandidates,
            winnerName: winnerName,
          )
        : null;
    final resolvedStore = args.mode == RouletteMode.store
        ? (matchedStore ??
              _fallbackStoreByIndex(rankedCandidates: rankedCandidates))
        : null;
    if (args.mode == RouletteMode.store && matchedStore == null) {
      _showSnack('핀볼 결과가 후보식당과 정확히 일치하지 않아 근접 후보로 대체합니다.');
    }

    await _goToRouletteResult(
      RouletteResultArgs(
        resultName: winnerName,
        query: winnerName,
        mode: args.mode,
        radiusMeters: args.radiusMeters,
        selectedStore: resolvedStore ?? args.selectedStore,
        selectedReasonLabel: args.selectedReasonLabel,
        preferPopularOnOpen: args.preferPopularOnOpen,
        originLat: args.originLat,
        originLng: args.originLng,
        originLabel: args.originLabel,
        showSearchButton: args.showSearchButton,
        fromMood: args.fromMood,
        rankingNames: rankingNames,
      ),
    );
    return true;
  }

  _PinballOutcome? _parsePinballOutcome(Object pinballResult) {
    String winner = '';
    List<String> ranking = const <String>[];

    if (pinballResult is String) {
      winner = pinballResult.trim();
    } else if (pinballResult is Map) {
      final dynamic rawWinner = pinballResult['winner'];
      if (rawWinner is String) {
        winner = rawWinner.trim();
      } else if (rawWinner != null) {
        winner = rawWinner.toString().trim();
      }
      ranking = _extractStringList(pinballResult['ranking']);
    }

    if (winner.isEmpty && ranking.isNotEmpty) {
      winner = ranking.first;
    }
    if (winner.isEmpty) {
      return null;
    }
    return _PinballOutcome(
      winner: winner,
      ranking: _normalizeRanking(winner, ranking),
    );
  }

  List<String> _extractStringList(dynamic raw) {
    if (raw is! List) {
      return const <String>[];
    }
    return raw
        .map((item) => item == null ? '' : item.toString().trim())
        .where((item) => item.isNotEmpty)
        .toList(growable: false);
  }

  List<String> _normalizeRanking(String winner, List<String> ranking) {
    final normalized = <String>[];
    final seen = <String>{};
    final first = winner.trim();
    if (first.isNotEmpty) {
      normalized.add(first);
      seen.add(first);
    }
    for (final item in ranking) {
      final value = item.trim();
      if (value.isEmpty || seen.contains(value)) {
        continue;
      }
      normalized.add(value);
      seen.add(value);
    }
    return normalized;
  }

  RankedPlace? _findStoreByName({
    required List<RankedPlace> rankedCandidates,
    required String winnerName,
  }) {
    final target = _normalizeCompareName(winnerName);
    RankedPlace? bestMatch;
    var bestScore = -1;

    for (final candidate in rankedCandidates) {
      final candidateName = _normalizeCompareName(candidate.kakao.name);
      if (candidateName == target) {
        return candidate;
      }
      final score = _compareNormalizedNameMatch(candidateName, target);
      if (score > bestScore) {
        bestMatch = candidate;
        bestScore = score;
      }
    }

    return bestScore >= 3 ? bestMatch : null;
  }

  int _compareNormalizedNameMatch(String left, String right) {
    if (left.isEmpty || right.isEmpty) {
      return 0;
    }

    if (left == right) {
      return 999;
    }

    if (left.contains(right) || right.contains(left)) {
      return 100;
    }

    final leftTokens = left
        .split(RegExp(r'[\u0020\-_(),./]+'))
        .where((token) => token.isNotEmpty)
        .toSet();
    final rightTokens = right
        .split(RegExp(r'[\u0020\-_(),./]+'))
        .where((token) => token.isNotEmpty)
        .toSet();

    if (leftTokens.isEmpty || rightTokens.isEmpty) {
      return 0;
    }

    var matchCount = 0;
    for (final leftToken in leftTokens) {
      for (final rightToken in rightTokens) {
        if (leftToken == rightToken) {
          matchCount++;
        }
      }
    }

    return matchCount * 2;
  }

  String _normalizeCompareName(String value) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[\s\-_(),.!?:/]'), '')
        .replaceAll(RegExp(r'\d+'), '')
        .trim();
  }

  RankedPlace? _fallbackStoreByIndex({
    required List<RankedPlace> rankedCandidates,
  }) {
    if (rankedCandidates.isEmpty) {
      return null;
    }
    return rankedCandidates.first;
  }

  Future<void> _goToRouletteResult(RouletteResultArgs args) async {
    if (widget.args.autoStart) {
      await Navigator.pushReplacementNamed(
        context,
        RouletteResultScreen.routeName,
        arguments: args,
      );
    } else {
      await Navigator.pushNamed(
        context,
        RouletteResultScreen.routeName,
        arguments: args,
      );
    }
  }

  String _resolveFoodReasonLabel(_RouletteCandidate selected) {
    return _resolveSelectionReason(selected);
  }

  String _resolveStoreReasonLabel(_RouletteCandidate selected) {
    if (!_isMenuManual) {
      return '$_cuisineTitle : ${selected.cuisine.label}';
    }
    return _resolveSelectionReason(selected);
  }

  String _resolveSelectionReason(_RouletteCandidate selected) {
    if (!_isMenuManual) {
      return '메뉴 랜덤';
    }
    if (_selectedCuisines.contains(selected.cuisine)) {
      return '$_cuisineTitle : ${selected.cuisine.label}';
    }
    final matched = selected.foodTypes
        .where(_selectedFoodTypes.contains)
        .toList();
    if (matched.isNotEmpty) {
      return '$_foodTypeTitle : ${matched.first.label}';
    }
    return '직접 선택';
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _setMenuRandom() {
    setState(() {
      _isMenuManual = false;
      _selectedCuisines = <_CuisineType>{};
      _selectedFoodTypes = <_FoodType>{};
    });
  }

  void _setMenuManual() {
    setState(() {
      _isMenuManual = true;
      _selectedCuisines = <_CuisineType>{};
      _selectedFoodTypes = <_FoodType>{};
    });
  }

  void _toggleCuisine(_CuisineType value) {
    setState(() {
      _isMenuManual = true;
      final next = Set<_CuisineType>.from(_selectedCuisines);
      if (next.contains(value)) {
        next.remove(value);
      } else {
        next.add(value);
      }
      _selectedCuisines = next;
    });
  }

  void _toggleFoodType(_FoodType value) {
    setState(() {
      _isMenuManual = true;
      final next = Set<_FoodType>.from(_selectedFoodTypes);
      if (next.contains(value)) {
        next.remove(value);
      } else {
        next.add(value);
      }
      _selectedFoodTypes = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    if (widget.args.autoStart) {
      return Scaffold(
        extendBody: true,
        extendBodyBehindAppBar: true,
        body: SafeArea(
          top: false,
          bottom: false,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  _spinProgressText ?? '추천 결과를 준비 중입니다...',
                  style: textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    final sourceTitle = widget.args.sourceTitle;
    final isCustomMode = _mode == RouletteMode.custom;
    final canSpin = _isSpinButtonEnabled;
    final topInset = MediaQuery.of(context).padding.top;
    final contentTopPadding = topInset;

    return Scaffold(
      extendBody: true,
      extendBodyBehindAppBar: true,
      body: SafeArea(
        top: false,
        bottom: false,
        child: Stack(
          children: [
            ListView(
              padding: EdgeInsets.fromLTRB(18, contentTopPadding, 18, 100),
              children: [
                if (sourceTitle != null && sourceTitle.isNotEmpty) ...[
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      color: const Color(0x141494A6),
                      border: Border.all(color: const Color(0x331494A6)),
                    ),
                    child: Text(
                      sourceTitle,
                      style: textTheme.titleSmall?.copyWith(
                        color: const Color(0xFF1D4E57),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
                _ModeWheelSelector(
                  mode: _mode,
                  onChanged: (mode) {
                    setState(() {
                      _mode = mode;
                      if (_mode != RouletteMode.store) {
                        _popularOnlySearch = false;
                      }
                    });
                  },
                ),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    0,
                    10,
                    0,
                    14,
                  ), // 네온 글로우를 위아래 여백만 확보 (양옆은 리스트뷰 여백 활용)
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Card(
                        color: const Color(0xFFE8ECEE),
                        elevation: 0,
                        margin: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: const BorderSide(
                            color: Color(0xFFD8E0E2),
                            width: 1,
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AnimatedSize(
                                duration: const Duration(milliseconds: 300),
                                curve: Curves.easeInOutCubic,
                                alignment: Alignment.topCenter,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const SizedBox(height: 12),
                                    if (isCustomMode) ...[
                                      Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          _buildCustomCountAdjustButton(
                                            delta: -1,
                                            icon: Icons
                                                .remove_circle_outline_rounded,
                                          ),
                                          const SizedBox(width: 16),
                                          Text(
                                            '$_customItemCount',
                                            style: textTheme.displaySmall
                                                ?.copyWith(
                                                  fontWeight: FontWeight.w900,
                                                  color: const Color(
                                                    0xFFE16A95,
                                                  ),
                                                ),
                                          ),
                                          const SizedBox(width: 16),
                                          _buildCustomCountAdjustButton(
                                            delta: 1,
                                            icon: Icons
                                                .add_circle_outline_rounded,
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
                                      ...List.generate(
                                        _customItemControllers.length,
                                        (index) {
                                          return Padding(
                                            padding: const EdgeInsets.only(
                                              bottom: 10,
                                            ),
                                            child: TextField(
                                              controller:
                                                  _customItemControllers[index],
                                              onChanged: (_) => setState(() {}),
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w600,
                                              ),
                                              decoration: InputDecoration(
                                                isDense: true,
                                                contentPadding:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 16,
                                                      vertical: 12,
                                                    ),
                                                hintText: '후보${index + 1}',
                                                hintStyle: TextStyle(
                                                  color: Colors.grey.withValues(
                                                    alpha: 0.5,
                                                  ),
                                                ),
                                                filled: true,
                                                fillColor: Colors.white,
                                                border: OutlineInputBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(25),
                                                  borderSide: const BorderSide(
                                                    color: Color(0xFFD8E0E2),
                                                  ),
                                                ),
                                                enabledBorder:
                                                    OutlineInputBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            25,
                                                          ),
                                                      borderSide:
                                                          const BorderSide(
                                                            color: Color(
                                                              0xFFD8E0E2,
                                                            ),
                                                          ),
                                                    ),
                                                focusedBorder:
                                                    OutlineInputBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            25,
                                                          ),
                                                      borderSide:
                                                          const BorderSide(
                                                            color: Color(
                                                              0xFFD81A60,
                                                            ),
                                                            width: 1.5,
                                                          ),
                                                    ),
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                                    ] else ...[
                                      Transform.translate(
                                        offset: const Offset(0, -12),
                                        child: _AnimatedSegmentedControl<bool>(
                                          items: const [false, true],
                                          selectedItem: _isMenuManual,
                                          itemLabelBuilder: (isManual) =>
                                              isManual
                                              ? '직접 선택'
                                              : (_mode == RouletteMode.store
                                                    ? '음식점 랜덤'
                                                    : '메뉴 랜덤'),
                                          onItemSelected: (isManual) {
                                            if (isManual) {
                                              _setMenuManual();
                                            } else {
                                              _setMenuRandom();
                                            }
                                          },
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      IgnorePointer(
                                        ignoring: !_isMenuManual,
                                        child: Container(
                                          padding: _isMenuManual
                                              ? const EdgeInsets.all(8)
                                              : const EdgeInsets.fromLTRB(
                                                  8,
                                                  8,
                                                  8,
                                                  0,
                                                ),
                                          decoration: BoxDecoration(
                                            borderRadius: BorderRadius.circular(
                                              12,
                                            ),
                                            color: const Color(0x08000000),
                                            border: Border.all(
                                              color: const Color(0x22000000),
                                            ),
                                          ),
                                          child: SizedBox(
                                            height: _isMenuManual ? 320 : 328,
                                            child: Stack(
                                              children: [
                                                Opacity(
                                                  opacity: _isMenuManual
                                                      ? 1.0
                                                      : 0.0,
                                                  child: Row(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Expanded(
                                                        child: _FilterColumnCard(
                                                          title: _cuisineTitle,
                                                          children: _CuisineType
                                                              .values
                                                              .where(
                                                                (v) =>
                                                                    v !=
                                                                    _CuisineType
                                                                        .random,
                                                              )
                                                              .map(
                                                                (
                                                                  v,
                                                                ) => _FilterToggleTile(
                                                                  label:
                                                                      v.label,
                                                                  selected:
                                                                      _selectedCuisines
                                                                          .contains(
                                                                            v,
                                                                          ),
                                                                  enabled:
                                                                      _isMenuManual,
                                                                  onTap: () =>
                                                                      _toggleCuisine(
                                                                        v,
                                                                      ),
                                                                ),
                                                              )
                                                              .toList(),
                                                        ),
                                                      ),
                                                      const SizedBox(width: 8),
                                                      Expanded(
                                                        child: _FilterColumnCard(
                                                          title: _foodTypeTitle,
                                                          children: _FoodType
                                                              .values
                                                              .where(
                                                                (v) =>
                                                                    v !=
                                                                    _FoodType
                                                                        .random,
                                                              )
                                                              .map(
                                                                (
                                                                  v,
                                                                ) => _FilterToggleTile(
                                                                  label:
                                                                      v.label,
                                                                  selected:
                                                                      _selectedFoodTypes
                                                                          .contains(
                                                                            v,
                                                                          ),
                                                                  enabled:
                                                                      _isMenuManual,
                                                                  onTap: () =>
                                                                      _toggleFoodType(
                                                                        v,
                                                                      ),
                                                                ),
                                                              )
                                                              .toList(),
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                                if (!_isMenuManual)
                                                  Positioned.fill(
                                                    child: ClipRRect(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            8,
                                                          ),
                                                      child: Image.asset(
                                                        'assets/background/random.png',
                                                        fit: BoxFit.contain,
                                                        alignment: Alignment
                                                            .bottomCenter,
                                                      ),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Positioned.fill(
                        child: IgnorePointer(
                          child: CustomPaint(painter: _NeonPainter()),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: isCustomMode ? 8 : 28),
                if (isCustomMode)
                  Align(
                    alignment: Alignment.centerRight,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () {
                        setState(() {
                          _showAllCustomRankingInResult =
                              !_showAllCustomRankingInResult;
                        });
                      },
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(4, 2, 0, 14),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF7F8FB),
                            borderRadius: BorderRadius.circular(13),
                            border: Border.all(
                              color: const Color(0xFFFF4D98),
                              width: 1.1,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 160),
                                curve: Curves.easeOutCubic,
                                width: 18,
                                height: 18,
                                decoration: BoxDecoration(
                                  color: _showAllCustomRankingInResult
                                      ? const Color(0xFFFF2E84)
                                      : Colors.white,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: const Color(0xFFFF2E84),
                                    width: 1.3,
                                  ),
                                ),
                                child: _showAllCustomRankingInResult
                                    ? const Icon(
                                        Icons.check_rounded,
                                        size: 13,
                                        color: Colors.white,
                                      )
                                    : null,
                              ),
                              const SizedBox(width: 7),
                              Text(
                                '모든등수보기',
                                style: textTheme.bodySmall?.copyWith(
                                  color: const Color(0xFFE6006E),
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                GlowingActionButton(
                  onTap: canSpin ? _onSpinButtonPressed : null,
                  isLoading:
                      _isSpinning ||
                      _isRewardedAdLoading ||
                      _isRewardedAdShowing ||
                      _isAdBonusIntroShowing,
                  icon: Icons.casino_rounded,
                  label: _spinButtonLabel(),
                ),
              ],
            ),
            if (_isAdBonusIntroShowing)
              Positioned.fill(
                child: IgnorePointer(
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.56),
                    alignment: Alignment.center,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween<double>(begin: 0.88, end: 1.0),
                      duration: const Duration(milliseconds: 900),
                      curve: Curves.easeOutBack,
                      builder: (context, scale, child) {
                        return Opacity(
                          opacity: 0.98,
                          child: Transform.scale(scale: scale, child: child),
                        );
                      },
                      child: Image.asset(
                        'assets/background/1try.png',
                        width: 240,
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// Removed _MenuModeButton since it's no longer used.

class _FilterColumnCard extends StatelessWidget {
  const _FilterColumnCard({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
          child: Text(
            title,
            style: textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: const Color(0xFF2F3237),
            ),
          ),
        ),
        const SizedBox(height: 6),
        ...children,
      ],
    );
  }
}

class _FilterToggleTile extends StatelessWidget {
  const _FilterToggleTile({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final activeColor = const Color(0xFF2A1B17);
    // 하얀색 반투명을 불투명으로 바꾸고 명도 다운 (선택 여부에 따라 컬러 구분)
    final bgColor = selected
        ? const Color(0xFFE8ECEE)
        : const Color(0xFFF1F4F5);
    final borderColor = selected
        ? const Color(0xFFB0C0C4)
        : const Color(0xFFD8E0E2);

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: enabled ? onTap : null,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: bgColor,
            border: Border.all(color: borderColor),
          ),
          child: Row(
            children: [
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                size: 16,
                color: selected ? activeColor : const Color(0xFF8EA1A6),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  style: textTheme.bodySmall?.copyWith(
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: selected
                        ? const Color(0xFF0F6B78)
                        : const Color(0xFF3E5A62),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StoreSelectionContext {
  const _StoreSelectionContext({
    required this.queryKeyword,
    required this.reasonLabel,
  });

  final String queryKeyword;
  final String reasonLabel;
}

class _PinballOutcome {
  const _PinballOutcome({required this.winner, required this.ranking});

  final String winner;
  final List<String> ranking;
}

class _PinballMapChoice {
  const _PinballMapChoice({required this.mapIndex, required this.title});

  final int mapIndex;
  final String title;
}

class _MapLaunchOption {
  const _MapLaunchOption({
    required this.number,
    required this.label,
    required this.isNew,
    required this.config,
  });

  final int number;
  final String label;
  final bool isNew;
  final _PinballLaunchConfig config;
}

class _PinballLaunchConfig {
  const _PinballLaunchConfig._({
    required this.useV2,
    this.v1MapIndex,
    this.v2MapId,
  });

  const _PinballLaunchConfig.v1(int mapIndex)
    : this._(useV2: false, v1MapIndex: mapIndex);

  const _PinballLaunchConfig.v2(String mapId)
    : this._(useV2: true, v2MapId: mapId);

  final bool useV2;
  final int? v1MapIndex;
  final String? v2MapId;
}

class _V2MapChoice {
  const _V2MapChoice({
    required this.id,
    required this.title,
    required this.sort,
  });

  final String id;
  final String title;
  final int sort;
}

class _RouletteCandidate {
  const _RouletteCandidate({
    required this.keyword,
    required this.cuisine,
    required this.foodTypes,
  });

  final String keyword;
  final _CuisineType cuisine;
  final Set<_FoodType> foodTypes;
}

class _ManualGroupPool {
  const _ManualGroupPool({required this.label, required this.candidates});

  final String label;
  final List<_RouletteCandidate> candidates;
}

class _ModeWheelSelector extends StatefulWidget {
  const _ModeWheelSelector({required this.mode, required this.onChanged});

  final RouletteMode mode;
  final ValueChanged<RouletteMode> onChanged;

  @override
  State<_ModeWheelSelector> createState() => _ModeWheelSelectorState();
}

class _ModeWheelSelectorState extends State<_ModeWheelSelector>
    with SingleTickerProviderStateMixin {
  late final TabController _controller;

  static const Color _selectedText = Color(0xFFD81A60);
  static const Color _unselectedText = Color(0xFF65535E);

  @override
  void initState() {
    super.initState();
    _controller = TabController(
      length: RouletteMode.values.length,
      vsync: this,
      initialIndex: widget.mode.index,
    );
  }

  @override
  void didUpdateWidget(covariant _ModeWheelSelector oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_controller.index != widget.mode.index) {
      _controller.index = widget.mode.index;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final modes = RouletteMode.values;

    return SizedBox(
      height: 56,
      child: TabBar(
        controller: _controller,
        isScrollable: false,
        labelPadding: EdgeInsets.zero,
        dividerColor: Colors.transparent,
        splashFactory: NoSplash.splashFactory,
        overlayColor: const WidgetStatePropertyAll<Color>(Colors.transparent),
        indicatorSize: TabBarIndicatorSize.label,
        indicatorPadding: const EdgeInsets.only(bottom: 10),
        indicator: const _NeonUnderlineTabIndicator(
          color: Color(0xFFFF2E84),
          thickness: 3.6,
        ),
        labelColor: _selectedText,
        unselectedLabelColor: _unselectedText,
        labelStyle: textTheme.titleSmall?.copyWith(
          fontSize: 16,
          fontWeight: FontWeight.w800,
        ),
        unselectedLabelStyle: textTheme.titleSmall?.copyWith(
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        onTap: (index) {
          final mode = modes[index];
          if (mode != widget.mode) {
            widget.onChanged(mode);
          }
        },
        tabs: modes
            .map(
              (mode) => Tab(
                height: 40,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    mode.label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _NeonUnderlineTabIndicator extends Decoration {
  const _NeonUnderlineTabIndicator({
    required this.color,
    required this.thickness,
  });

  final Color color;
  final double thickness;

  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) {
    return _NeonUnderlineTabIndicatorPainter(
      color: color,
      thickness: thickness,
    );
  }
}

class _NeonUnderlineTabIndicatorPainter extends BoxPainter {
  _NeonUnderlineTabIndicatorPainter({
    required this.color,
    required this.thickness,
  });

  final Color color;
  final double thickness;

  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    final size = configuration.size;
    if (size == null) {
      return;
    }
    final rect = offset & size;
    final width = (rect.width * 0.72).clamp(26.0, 54.0);
    final lineRect = Rect.fromCenter(
      center: Offset(rect.center.dx, rect.bottom - thickness * 0.1),
      width: width,
      height: thickness,
    );
    final rr = RRect.fromRectAndRadius(lineRect, const Radius.circular(999));

    final glowNear = Paint()
      ..color = color.withValues(alpha: 0.88)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
    final glowFar = Paint()
      ..color = color.withValues(alpha: 0.66)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 9);
    final core = Paint()..color = color;

    canvas.drawRRect(rr, glowFar);
    canvas.drawRRect(rr, glowNear);
    canvas.drawRRect(rr, core);
  }
}

class _AnimatedSegmentedControl<T> extends StatelessWidget {
  const _AnimatedSegmentedControl({
    required this.items,
    required this.selectedItem,
    required this.onItemSelected,
    required this.itemLabelBuilder,
  });

  final List<T> items;
  final T selectedItem;
  final void Function(T) onItemSelected;
  final String Function(T) itemLabelBuilder;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    final selectedIndex = items
        .indexOf(selectedItem)
        .clamp(0, items.length - 1);
    final count = items.length;

    // 약간 밝은 다크그레이 배경 (앱의 다른 어두운 톤들과 조화롭도록, 사용자 요청)
    final bgColor = const Color(0xFF2B2B2D);
    // 자주색 버튼 (사용자 요청 세 번째 이미지 스타일: 생동감 있는 마젠타 컬러)
    final activeBgColor = const Color(0xFFD81A60);
    final textTheme = Theme.of(context).textTheme;

    return Container(
      height: 38, // 높이를 줄여서 슬림하게
      padding: const EdgeInsets.all(3), // 여백 소폭 축소
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(19),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOutCubic,
            alignment: Alignment(
              -1.0 + (selectedIndex / (count - 1 > 0 ? count - 1 : 1)) * 2.0,
              0,
            ),
            child: FractionallySizedBox(
              widthFactor: 1.0 / count,
              heightFactor: 1.0,
              child: Container(
                decoration: BoxDecoration(
                  color: activeBgColor,
                  borderRadius: BorderRadius.circular(16), // 슬림해진 높이에 맞춰 R값 조정
                ),
              ),
            ),
          ),
          Row(
            children: items.map((item) {
              final isSelected = item == selectedItem;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onItemSelected(item),
                  child: Center(
                    child: AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 250),
                      style: textTheme.bodyMedium!.copyWith(
                        fontWeight: isSelected
                            ? FontWeight.w800
                            : FontWeight.w600,
                        color: isSelected
                            ? Colors.white
                            : const Color(0xFF8B9298),
                      ),
                      child: Text(itemLabelBuilder(item)),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _NeonPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final double h = size.height;
    final double w = size.width;
    const double r = 16.0;

    // 카드의 실제 경계선(0~w, 0~h)에 완벽히 맞닿는 기본 패스
    final Path path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, w, h),
          const Radius.circular(r),
        ),
      );

    final Rect bounds = Rect.fromLTWH(0, 0, w, h);
    final neonGradient = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0xFFE040FB), Color(0xFFFF4081), Color(0xFF18FFFF)],
      stops: [0.0, 0.5, 1.0],
    ).createShader(bounds);

    // 1. 바깥쪽 풍성한 광채
    // 아주 넓은 블러를 사용하되, 카드 안쪽으로는 들어오지 못하도록 카드의 내부를 잘라냅니다(Clip).
    // 투명도를 주어 바깥쪽 네온이 너무 강하지 않게 부드럽게 퍼지도록 조절합니다.
    canvas.save();
    final Path clipOuter = Path()
      ..addRect(Rect.fromLTWH(-200, -200, w + 400, h + 400)) // 바깥쪽 넉넉한 영역
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, w, h),
          const Radius.circular(r),
        ),
      ) // 안쪽 카드 영역
      ..fillType = PathFillType.evenOdd; // 도넛 형태로 안쪽을 뚫어줌
    canvas.clipPath(clipOuter);

    final neonGradientOuter = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFFE040FB).withValues(alpha: 0.55),
        const Color(0xFFFF4081).withValues(alpha: 0.55),
        const Color(0xFF18FFFF).withValues(alpha: 0.55),
      ],
      stops: const [0.0, 0.5, 1.0],
    ).createShader(bounds);

    final outerGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth =
          12 // 빛의 확산 두께를 약간 줄임
      ..shader = neonGradientOuter
      ..maskFilter = const MaskFilter.blur(
        BlurStyle.normal,
        8,
      ); // 확산(번짐) 정도 설정 축소
    canvas.drawPath(path, outerGlow);
    canvas.restore(); // 클리핑 해제

    // 2. 안쪽 짧은 광채 (이건 클리핑 없이 그려서 안쪽으로 살짝만 스며들게 합니다)
    // BlurStyle.normal 을 사용하여 안쪽/바깥쪽 모두 자연스럽게 번짐 (반경 2로 아주 짧게)
    final innerGlowShort = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..shader = neonGradient
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);

    final coreGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFFFCE4EC), // 아주 옅은 파스텔 핑크
        const Color(
          0xFFF8BBD0,
        ).withValues(alpha: 0.95), // 핑크/마젠타 느낌의 화사한 채도 약간 추가
        const Color(0xFFE0FFFF).withValues(alpha: 0.9), // 시안빛 하단 스며듦
      ],
      stops: const [0.0, 0.6, 1.0],
    ).createShader(bounds);

    final core = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth =
          2.8 // 경계선에 딱 맞물리도록 두께 조절 (1.4px씩 반반 걸침)
      ..shader = coreGradient;

    canvas.drawPath(path, innerGlowShort);
    canvas.drawPath(path, core);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
