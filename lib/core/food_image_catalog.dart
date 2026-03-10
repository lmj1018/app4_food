import 'dart:math';

class FoodImageCatalog {
  static const List<String> keywords = <String>[
    '김치찌개',
    '제육볶음',
    '비빔밥',
    '냉면',
    '국밥',
    '삼겹살',
    '떡볶이',
    '순두부찌개',
    '갈비탕',
    '닭갈비',
    '감자탕',
    '칼국수',
    '보쌈',
    '불고기',
    '파스타',
    '피자',
    '햄버거',
    '샌드위치',
    '스테이크',
    '리조또',
    '토마토파스타',
    '크림파스타',
    '오므라이스',
    '브런치',
    '핫도그',
    '미트볼스파게티',
    '짜장면',
    '짬뽕',
    '탕수육',
    '마라탕',
    '마파두부',
    '깐풍기',
    '훠궈',
    '양장피',
    '초밥',
    '라멘',
    '우동',
    '돈까스',
    '규동',
    '가츠동',
    '텐동',
    '카레우동',
    '치킨',
    '쌀국수',
    '샤브샤브',
    '카레',
    '족발',
    '샐러드',
    '된장찌개',
    '부대찌개',
    '육회비빔밥',
    '닭볶음탕',
    '쭈꾸미볶음',
    '낙지볶음',
    '오징어볶음',
    '설렁탕',
    '뼈해장국',
    '닭한마리',
    '막국수',
    '만둣국',
    '알리오올리오',
    '까르보나라',
    '라자냐',
    '리가토니파스타',
    '치즈버거',
    '클럽샌드위치',
    '바비큐폭립',
    '그릴치킨샐러드',
    '토스트',
    '치킨랩',
    '볶음밥',
    '마라샹궈',
    '고추잡채',
    '깐쇼새우',
    '유린기',
    '계란볶음밥',
    '우육면',
    '딤섬',
    '메밀소바',
    '카츠카레',
    '연어덮밥',
    '사케동',
    '오코노미야키',
    '야키토리',
    '나가사키짬뽕',
    '규카츠',
    '타코',
    '부리또',
    '포케',
    '인도커리',
    '탄두리치킨',
    '케밥',
    '월남쌈',
    '양꼬치',
    '팟타이',
    '분짜',
  ];

  static const Map<String, String> _alias = <String, String>{
    '자장면': '짜장면',
    '자장': '짜장면',
    '짜장': '짜장면',
    '자장면집': '짜장면',
    '짜장면집': '짜장면',
    'jajangmyeon': '짜장면',
  };

  static const Map<String, String> _categoryAssetByToken = <String, String>{
    '한식': 'assets/foodimages/korean.jpg',
    'korean': 'assets/foodimages/korean.jpg',
    '양식': 'assets/foodimages/western.jpg',
    'western': 'assets/foodimages/western.jpg',
    '중식': 'assets/foodimages/chinese.jpg',
    'chinese': 'assets/foodimages/chinese.jpg',
    '일식': 'assets/foodimages/japanese.jpg',
    'japanese': 'assets/foodimages/japanese.jpg',
    '기타': 'assets/foodimages/other.jpg',
    'other': 'assets/foodimages/other.jpg',
    '밥': 'assets/foodimages/rice.jpg',
    'rice': 'assets/foodimages/rice.jpg',
    '빵': 'assets/foodimages/bread.jpg',
    'bread': 'assets/foodimages/bread.jpg',
    '면': 'assets/foodimages/noodle.jpg',
    'noodle': 'assets/foodimages/noodle.jpg',
    '국물': 'assets/foodimages/soup.jpg',
    'soup': 'assets/foodimages/soup.jpg',
    '고기': 'assets/foodimages/meat.jpg',
    'meat': 'assets/foodimages/meat.jpg',
    '분식': 'assets/foodimages/snack.jpg',
    'snack': 'assets/foodimages/snack.jpg',
    '패스트푸드': 'assets/foodimages/fast_food.jpg',
    'fastfood': 'assets/foodimages/fast_food.jpg',
    'fast_food': 'assets/foodimages/fast_food.jpg',
    'fast-food': 'assets/foodimages/fast_food.jpg',
  };

  static final List<String> _normalizedKeywords = keywords
      .map(_normalize)
      .toList(growable: false);

  static final Map<String, int> _indexByNormalizedKeyword = <String, int>{
    for (int i = 0; i < _normalizedKeywords.length; i++)
      _normalizedKeywords[i]: i + 1,
  };

  static final Map<String, String> _normalizedAlias = <String, String>{
    for (final entry in _alias.entries)
      _normalize(entry.key): _normalize(entry.value),
  };

  static final List<MapEntry<String, String>> _normalizedCategoryAssets =
      _categoryAssetByToken.entries
          .map(
            (entry) =>
                MapEntry<String, String>(_normalize(entry.key), entry.value),
          )
          .toList(growable: false)
        ..sort((a, b) => b.key.length.compareTo(a.key.length));

  static String? assetForKeyword(String? rawKeyword) {
    if (rawKeyword == null || rawKeyword.trim().isEmpty) {
      return null;
    }
    final normalized = _normalize(rawKeyword);
    if (normalized.isEmpty) {
      return null;
    }
    final direct = _indexByNormalizedKeyword[normalized];
    if (direct != null) {
      return _assetPathByIndex(direct);
    }

    final aliasKeyword = _normalizedAlias[normalized];
    if (aliasKeyword != null) {
      final aliasIndex = _indexByNormalizedKeyword[aliasKeyword];
      if (aliasIndex != null) {
        return _assetPathByIndex(aliasIndex);
      }
    }

    final matched = _matchIndicesFromText(rawKeyword);
    if (matched.isNotEmpty) {
      return _assetPathByIndex(matched.first);
    }
    return null;
  }

  static String? categoryAssetForText(String? rawText) {
    if (rawText == null || rawText.trim().isEmpty) {
      return null;
    }
    final normalized = _normalize(rawText);
    if (normalized.isEmpty) {
      return null;
    }
    for (final entry in _normalizedCategoryAssets) {
      if (normalized.contains(entry.key)) {
        return entry.value;
      }
    }
    return null;
  }

  static String? categoryAssetFromTexts(Iterable<String?> texts) {
    for (final text in texts) {
      final matched = categoryAssetForText(text);
      if (matched != null) {
        return matched;
      }
    }
    return null;
  }

  static List<String> assetsFromTexts(
    Iterable<String?> texts, {
    int limit = 4,
  }) {
    if (limit <= 0) {
      return const <String>[];
    }
    final categoryAssets = <String>[];
    final seenAssets = <String>{};
    for (final text in texts) {
      final categoryAsset = categoryAssetForText(text);
      if (categoryAsset != null && seenAssets.add(categoryAsset)) {
        categoryAssets.add(categoryAsset);
        if (categoryAssets.length >= limit) {
          return categoryAssets.take(limit).toList(growable: false);
        }
      }
    }

    final indices = <int>{};
    for (final text in texts) {
      if (text == null || text.trim().isEmpty) {
        continue;
      }
      final matches = _matchIndicesFromText(text);
      for (final index in matches) {
        indices.add(index);
        if (indices.length >= limit) {
          break;
        }
      }
      if (indices.length >= limit) {
        break;
      }
    }
    final result = <String>[...categoryAssets];
    for (final index in indices) {
      final asset = _assetPathByIndex(index);
      if (seenAssets.add(asset)) {
        result.add(asset);
      }
      if (result.length >= limit) {
        break;
      }
    }
    return result.take(limit).toList(growable: false);
  }

  static List<String> fallbackAssetsForSeed(String seed, {int count = 4}) {
    if (count <= 0 || keywords.isEmpty) {
      return const <String>[];
    }
    final random = Random(seed.hashCode);
    final order = List<int>.generate(keywords.length, (index) => index + 1)
      ..shuffle(random);
    return order.take(count).map(_assetPathByIndex).toList(growable: false);
  }

  static List<int> _matchIndicesFromText(String text) {
    final normalized = _normalize(text);
    if (normalized.isEmpty) {
      return const <int>[];
    }

    final result = <int>[];
    final seen = <int>{};

    for (int i = 0; i < _normalizedKeywords.length; i++) {
      final keyword = _normalizedKeywords[i];
      if (normalized.contains(keyword)) {
        final index = i + 1;
        if (seen.add(index)) {
          result.add(index);
        }
      }
    }

    for (final entry in _normalizedAlias.entries) {
      if (normalized.contains(entry.key)) {
        final index = _indexByNormalizedKeyword[entry.value];
        if (index != null && seen.add(index)) {
          result.add(index);
        }
      }
    }

    return result;
  }

  static String _assetPathByIndex(int index) {
    final id = index.toString().padLeft(3, '0');
    return 'assets/foodimages/food_$id.jpg';
  }

  static String _normalize(String value) {
    return value.toLowerCase().replaceAll(
      RegExp(r'[\s\-\_\(\)\[\]\{\}\.,/:>·ㆍ|]'),
      '',
    );
  }
}
