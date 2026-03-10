import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'app.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  await _setPreferredOrientationsSafely();
  runApp(const FoodDecisionApp());
  _scheduleMobileAdsInitialization(binding);
}

Future<void> _setPreferredOrientationsSafely() async {
  try {
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]).timeout(const Duration(seconds: 2));
  } catch (_) {
    // Keep app boot resilient even if orientation channel response is delayed.
  }
}

void _scheduleMobileAdsInitialization(WidgetsBinding binding) {
  if (kDebugMode) {
    return;
  }
  binding.addPostFrameCallback((_) {
    unawaited(_initMobileAdsSafelyWithDelay());
  });
}

Future<void> _initMobileAdsSafelyWithDelay() async {
  await Future<void>.delayed(const Duration(milliseconds: 1200));
  await _initMobileAdsSafely();
}

Future<void> _initMobileAdsSafely() async {
  try {
    final consentInfo = ConsentInformation.instance;
    final completer = Completer<void>();
    consentInfo.requestConsentInfoUpdate(
      ConsentRequestParameters(),
      () {
        if (!completer.isCompleted) {
          completer.complete();
        }
      },
      (_) {
        if (!completer.isCompleted) {
          completer.complete();
        }
      },
    );
    await completer.future.timeout(
      const Duration(seconds: 6),
      onTimeout: () {},
    );

    final isConsentFormAvailable = await consentInfo
        .isConsentFormAvailable()
        .timeout(const Duration(seconds: 4), onTimeout: () => false);
    if (isConsentFormAvailable) {
      final formCompleter = Completer<void>();
      await ConsentForm.loadAndShowConsentFormIfRequired((_) {
        if (!formCompleter.isCompleted) {
          formCompleter.complete();
        }
      }).timeout(const Duration(seconds: 8), onTimeout: () {});
      await formCompleter.future.timeout(
        const Duration(seconds: 8),
        onTimeout: () {},
      );
    }

    final canRequestAds = await consentInfo.canRequestAds().timeout(
      const Duration(seconds: 4),
      onTimeout: () => false,
    );
    if (canRequestAds) {
      await MobileAds.instance.initialize().timeout(const Duration(seconds: 5));
    }
  } catch (_) {}
}
