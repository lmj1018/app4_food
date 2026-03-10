import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'exceptions.dart';

class CurrentWeatherSnapshot {
  const CurrentWeatherSnapshot({
    required this.weatherCode,
    required this.temperatureC,
  });

  final int weatherCode;
  final double temperatureC;

  bool get isRainy {
    return (weatherCode >= 51 && weatherCode <= 67) ||
        (weatherCode >= 80 && weatherCode <= 82) ||
        weatherCode == 95 ||
        weatherCode == 96 ||
        weatherCode == 99;
  }

  bool get isSnowy {
    return weatherCode == 71 ||
        weatherCode == 73 ||
        weatherCode == 75 ||
        weatherCode == 77 ||
        weatherCode == 85 ||
        weatherCode == 86;
  }

  bool get isHot => temperatureC >= 28;

  bool get isCold => temperatureC <= 8;

  String get summary {
    if (isRainy) {
      return '비 오는 날';
    }
    if (isSnowy) {
      return '눈 오는 날';
    }
    if (isHot) {
      return '더운 날';
    }
    if (isCold) {
      return '추운 날';
    }
    return '무난한 날씨';
  }
}

class OpenMeteoWeatherService {
  OpenMeteoWeatherService({http.Client? httpClient})
    : _httpClient = httpClient ?? http.Client();

  final http.Client _httpClient;

  Future<CurrentWeatherSnapshot?> fetchCurrent({
    required double lat,
    required double lng,
  }) async {
    final uri = Uri.https('api.open-meteo.com', '/v1/forecast', {
      'latitude': '$lat',
      'longitude': '$lng',
      'current': 'temperature_2m,weather_code',
      'timezone': 'auto',
    });

    final response = await _httpClient
        .get(uri, headers: const {'Content-Type': 'application/json'})
        .timeout(const Duration(seconds: 8));

    if (response.statusCode != 200) {
      throw ApiRequestException(
        'Open-Meteo request failed.',
        statusCode: response.statusCode,
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw ApiRequestException('Open-Meteo response format is invalid.');
    }

    final current = decoded['current'];
    if (current is! Map<String, dynamic>) {
      return null;
    }

    final weatherCode = _toInt(current['weather_code']);
    final temperature = _toDouble(current['temperature_2m']);
    if (weatherCode == null || temperature == null) {
      return null;
    }

    return CurrentWeatherSnapshot(
      weatherCode: weatherCode,
      temperatureC: temperature,
    );
  }
}

double? _toDouble(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse((value ?? '').toString());
}

int? _toInt(dynamic value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse((value ?? '').toString());
}
