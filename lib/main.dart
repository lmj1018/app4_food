import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _setPreferredOrientationsSafely();
  runApp(const FoodDecisionApp());
  unawaited(_initMobileAdsSafely());
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
    await completer.future;

    if (await consentInfo.isConsentFormAvailable()) {
      final formCompleter = Completer<void>();
      await ConsentForm.loadAndShowConsentFormIfRequired((_) {
        if (!formCompleter.isCompleted) {
          formCompleter.complete();
        }
      });
      await formCompleter.future;
    }

    final canRequestAds = await consentInfo.canRequestAds();
    if (canRequestAds) {
      await MobileAds.instance.initialize();
    }
  } catch (_) {}
}
