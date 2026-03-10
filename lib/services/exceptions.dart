class MissingApiKeyException implements Exception {
  MissingApiKeyException(this.keyName);

  final String keyName;

  @override
  String toString() {
    return 'MissingApiKeyException: $keyName is not configured.';
  }
}

class ApiRequestException implements Exception {
  ApiRequestException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() {
    if (statusCode == null) {
      return 'ApiRequestException: $message';
    }
    return 'ApiRequestException($statusCode): $message';
  }
}
