class AppEnv {
  const AppEnv._();

  static const String kakaoRestApiKey = String.fromEnvironment(
    'KAKAO_REST_API_KEY',
  );
  static const String googlePlacesApiKey = String.fromEnvironment(
    'GOOGLE_PLACES_API_KEY',
  );
  static const String naverClientId = String.fromEnvironment(
    'NAVER_CLIENT_ID',
  );
  static const String naverClientSecret = String.fromEnvironment(
    'NAVER_CLIENT_SECRET',
  );
  static const int naverDailyQuota = int.fromEnvironment(
    'NAVER_DAILY_QUOTA',
    defaultValue: 25000,
  );
  static const bool enableHybridDebugLogs = bool.fromEnvironment(
    'ENABLE_HYBRID_DEBUG_LOGS',
    defaultValue: false,
  );
  static const String adMobAndroidAppId = String.fromEnvironment(
    'ADMOB_ANDROID_APP_ID',
  );
  static const String adMobIosAppId = String.fromEnvironment(
    'ADMOB_IOS_APP_ID',
  );
  static const String adMobRewardedAndroidUnitId = String.fromEnvironment(
    'ADMOB_REWARDED_ANDROID_UNIT_ID',
  );
  static const String adMobRewardedIosUnitId = String.fromEnvironment(
    'ADMOB_REWARDED_IOS_UNIT_ID',
  );
}
