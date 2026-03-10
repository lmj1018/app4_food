import 'dart:math';
import '../data/models/mood_models.dart';
import 'open_meteo_weather_service.dart';

class MoodRecommendationService {
  final _rng = Random();

  static const Set<String> _quickFriendlyMenus = <String>{
    '김밥',
    '샌드위치',
    '햄버거',
    '덮밥',
    '라면',
    '떡볶이',
    '국밥',
    '우동',
  };

  static const Set<String> _highPriceMenus = <String>{
    '스테이크',
    '한우구이',
    '오마카세',
    '랍스터 파스타',
    '양갈비',
    '장어구이',
    '활어회',
    '코스 요리',
  };

  List<MoodRecommendation> recommend({
    required MoodOptionId optionId,
    required MoodContext context,
    int limit = 10,
  }) {
    final base = switch (optionId) {
      MoodOptionId.timeSlot => _timeSlot(context),
      MoodOptionId.weatherFit => _weatherFit(context),
      MoodOptionId.peopleCount => _peopleCount(context),
      MoodOptionId.budget => _budget(context),
      MoodOptionId.quickMeal => _quickMeal(context),
      MoodOptionId.alcoholSnack => _alcoholSnack(context),
      MoodOptionId.lateNight => _lateNight(context),
      MoodOptionId.coupleDate => _coupleDate(context),
      MoodOptionId.officeLunch => _officeLunch(context),
      MoodOptionId.stressRelief => _stressRelief(context),
      MoodOptionId.comfortFood => _comfortFood(context),
      MoodOptionId.spicyCraving => _spicyCraving(context),
      MoodOptionId.coolCraving => _coolCraving(context),
      MoodOptionId.greasyCraving => _greasyCraving(context),
      MoodOptionId.healthyToday => _healthyToday(context),
      MoodOptionId.dietMode => _dietMode(context),
    };
    final scored = _applyCommonAdjustments(base, context);

    // Shuffle then pick top N for variety
    scored.shuffle(_rng);
    final picked = scored.take(limit).toList();
    picked.sort((a, b) => b.score.compareTo(a.score));
    return picked
        .map((item) => MoodRecommendation(menu: item.menu, reason: item.reason))
        .toList();
  }

  List<_ScoredMenu> _applyCommonAdjustments(
    List<_ScoredMenu> source,
    MoodContext context,
  ) {
    return source.map((item) {
      var nextScore = item.score;
      var nextReason = item.reason;
      if (context.quickMealPreferred &&
          _quickFriendlyMenus.contains(item.menu)) {
        nextScore += 0.45;
        nextReason = '빠른 식사 조건 반영 · ${item.reason}';
      }
      if (context.budgetWon <= 12000 && _highPriceMenus.contains(item.menu)) {
        nextScore -= 0.6;
      }
      return _ScoredMenu(item.menu, nextScore, nextReason);
    }).toList();
  }

  // ─── 시간대 ───
  List<_ScoredMenu> _timeSlot(MoodContext context) {
    final hour = context.now.hour;
    if (hour < 10) {
      return [
        _ScoredMenu('토스트', 3.2, '아침에는 가볍고 빠르게 먹기 좋습니다.'),
        _ScoredMenu('샌드위치', 3.1, '출근/이동 중 먹기 편합니다.'),
        _ScoredMenu('죽', 3.0, '속이 편한 아침 메뉴입니다.'),
        _ScoredMenu('김밥', 2.9, '간단하게 한 끼 해결 가능합니다.'),
        _ScoredMenu('베이글', 3.0, '커피와 함께 든든한 아침식사.'),
        _ScoredMenu('에그 머핀', 2.8, '간편하게 단백질 챙기기 좋습니다.'),
        _ScoredMenu('오트밀', 2.7, '부드럽고 건강한 아침 선택.'),
        _ScoredMenu('팬케이크', 2.8, '달콤한 아침으로 기분 UP.'),
        _ScoredMenu('우유 시리얼', 2.5, '가장 빠르게 해결하는 아침.'),
        _ScoredMenu('브런치 세트', 3.1, '여유로운 아침에 완벽합니다.'),
        _ScoredMenu('그래놀라 요거트', 2.9, '헬시하고 포만감 좋은 아침.'),
        _ScoredMenu('크루아상', 2.7, '바삭한 빵으로 프렌치 아침.'),
        _ScoredMenu('떡국', 2.6, '한식 아침으로 든든합니다.'),
        _ScoredMenu('미역국', 2.8, '속 편하고 영양 만점 아침.'),
        _ScoredMenu('누룽지', 2.5, '구수하고 소화 잘 되는 아침.'),
      ];
    }
    if (hour < 15) {
      return [
        _ScoredMenu('제육볶음', 3.3, '점심 시간대 만족도가 높은 메뉴.'),
        _ScoredMenu('비빔밥', 3.2, '점심에 균형 있게 먹기 좋습니다.'),
        _ScoredMenu('국밥', 3.1, '든든하게 에너지를 채울 수 있습니다.'),
        _ScoredMenu('돈까스', 2.9, '점심 인기 메뉴입니다.'),
        _ScoredMenu('김치찌개', 3.0, '한국인 점심 1순위.'),
        _ScoredMenu('파스타', 2.9, '분위기 있는 점심 한 끼.'),
        _ScoredMenu('쌀국수', 2.8, '가볍고 이국적인 점심.'),
        _ScoredMenu('칼국수', 3.0, '따끈한 국물로 힘내는 점심.'),
        _ScoredMenu('덮밥', 2.9, '빠르고 든든한 한 끼.'),
        _ScoredMenu('부대찌개', 2.8, '얼큰하게 속 채우기 좋습니다.'),
        _ScoredMenu('된장찌개', 2.9, '집밥 느낌의 푸근한 점심.'),
        _ScoredMenu('순두부찌개', 2.8, '부드럽고 속 편한 점심.'),
        _ScoredMenu('냉면', 2.7, '더운 날 시원한 점심.'),
        _ScoredMenu('짜장면', 2.9, '실패 없는 점심 메뉴.'),
        _ScoredMenu('초밥', 2.7, '깔끔한 점심 식사.'),
        _ScoredMenu('볶음밥', 2.6, '간편하면서 풍성한 점심.'),
        _ScoredMenu('우동', 2.7, '따뜻한 국물면의 정석.'),
        _ScoredMenu('라멘', 2.8, '진한 국물의 일본식 점심.'),
      ];
    }
    if (hour < 22) {
      return [
        _ScoredMenu('삼겹살', 3.3, '저녁에 만족감 높은 메뉴.'),
        _ScoredMenu('파스타', 3.1, '저녁 약속 메뉴로 무난합니다.'),
        _ScoredMenu('초밥', 3.0, '깔끔하게 먹기 좋습니다.'),
        _ScoredMenu('닭갈비', 2.9, '함께 먹기 좋은 저녁 메뉴.'),
        _ScoredMenu('스테이크', 3.0, '특별한 저녁에 어울립니다.'),
        _ScoredMenu('보쌈', 2.9, '고기와 야채 조합이 훌륭합니다.'),
        _ScoredMenu('곱창', 2.8, '저녁 회식 메뉴 추천.'),
        _ScoredMenu('샤브샤브', 2.9, '건강하고 만족스러운 저녁.'),
        _ScoredMenu('피자', 2.7, '모임에서 부담 없는 메뉴.'),
        _ScoredMenu('훠궈', 2.8, '함께 즐기기 좋은 공유식.'),
        _ScoredMenu('쭈꾸미', 2.7, '매콤 달콤한 저녁 한 끼.'),
        _ScoredMenu('갈비찜', 3.0, '특별한 날 푸짐하게.'),
        _ScoredMenu('해물탕', 2.8, '해산물 가득한 저녁.'),
        _ScoredMenu('족발', 2.9, '맥주와 환상의 조합.'),
        _ScoredMenu('양갈비', 2.8, '이국적인 저녁 식사.'),
        _ScoredMenu('장어구이', 2.7, '보양식으로 좋은 저녁.'),
      ];
    }
    return [
      _ScoredMenu('라면', 3.3, '늦은 시간 빠르게 먹기 좋습니다.'),
      _ScoredMenu('떡볶이', 3.2, '야식으로 선호도가 높습니다.'),
      _ScoredMenu('치킨', 3.1, '늦은 시간 공유하기 좋은 메뉴.'),
      _ScoredMenu('족발', 2.9, '야식 만족도가 높은 메뉴.'),
      _ScoredMenu('피자', 2.8, '야식 배달의 클래식.'),
      _ScoredMenu('햄버거', 2.7, '24시간 패스트푸드 선택.'),
      _ScoredMenu('볶음밥', 2.6, '간단하고 든든한 야식.'),
      _ScoredMenu('교촌치킨', 2.8, '야식에 빠질 수 없는 치킨.'),
      _ScoredMenu('순대국', 2.7, '새벽 해장에 제격.'),
      _ScoredMenu('주먹밥', 2.5, '간편한 심야 간식.'),
      _ScoredMenu('마라탕', 2.9, '얼얼한 야식의 매력.'),
      _ScoredMenu('김밥', 2.6, '편의점에서 바로 해결.'),
      _ScoredMenu('토스트', 2.5, '포장마차 감성 야식.'),
      _ScoredMenu('컵라면', 2.4, '최소 비용 최대 만족 야식.'),
    ];
  }

  // ─── 날씨 ───
  List<_ScoredMenu> _weatherFit(MoodContext context) {
    final weather = _resolveWeather(context);
    if (weather == null) {
      return [
        _ScoredMenu('칼국수', 3.0, '날씨 정보 없이도 무난한 국물 메뉴.'),
        _ScoredMenu('파스타', 2.9, '실내 식사로 무난한 선택.'),
        _ScoredMenu('비빔밥', 2.8, '계절을 타지 않는 메뉴.'),
        _ScoredMenu('돈까스', 2.7, '날씨 무관 인기 메뉴.'),
        _ScoredMenu('덮밥', 2.6, '어떤 상황에도 무난합니다.'),
        _ScoredMenu('김치찌개', 2.9, '언제나 좋은 한식 정석.'),
        _ScoredMenu('짜장면', 2.7, '실패 없는 중식.'),
        _ScoredMenu('라멘', 2.8, '이국 풍미의 진한 국물.'),
        _ScoredMenu('떡볶이', 2.6, '매콤 달콤 간식 겸 식사.'),
        _ScoredMenu('쌀국수', 2.5, '가벼운 한 끼.'),
        _ScoredMenu('초밥', 2.7, '깔끔하게 먹기 좋습니다.'),
        _ScoredMenu('샌드위치', 2.5, '간편한 한 끼.'),
      ];
    }
    if (weather.isRainy) {
      return [
        _ScoredMenu('칼국수', 3.4, '비 오는 날 따뜻한 국물이 잘 어울립니다.'),
        _ScoredMenu('해물파전', 3.3, '비 오는 날 선호도가 높은 조합.'),
        _ScoredMenu('수제비', 3.2, '날씨와 잘 맞는 따뜻한 메뉴.'),
        _ScoredMenu('국밥', 3.0, '체온 유지에 좋은 한 끼.'),
        _ScoredMenu('감자전', 3.1, '비 오면 전이 땡기는 법.'),
        _ScoredMenu('우동', 2.9, '따뜻한 국물로 위로가 됩니다.'),
        _ScoredMenu('순두부찌개', 3.0, '부드럽고 뜨끈한 보양식.'),
        _ScoredMenu('된장찌개', 2.9, '비 오는 날 집밥 감성.'),
        _ScoredMenu('부추전', 2.8, '막걸리와 환상의 궁합.'),
        _ScoredMenu('김치전', 3.0, '비 오는 날의 국민 메뉴.'),
        _ScoredMenu('짬뽕', 2.9, '얼큰한 국물로 몸을 녹이세요.'),
        _ScoredMenu('라면', 2.8, '비 오는 날의 클래식.'),
        _ScoredMenu('떡국', 2.7, '따뜻한 국물이 그리울 때.'),
        _ScoredMenu('어묵탕', 2.8, '간편하게 몸을 녹이는 국물.'),
        _ScoredMenu('닭볶음탕', 2.9, '비 오면 더 맛있는 매콤 요리.'),
      ];
    }
    if (weather.isSnowy || weather.isCold) {
      return [
        _ScoredMenu('곰탕', 3.4, '추운 날에는 뜨끈한 국물.'),
        _ScoredMenu('샤브샤브', 3.2, '따뜻하게 오래 먹기 좋습니다.'),
        _ScoredMenu('순두부찌개', 3.1, '추운 날 만족도가 높습니다.'),
        _ScoredMenu('우동', 2.9, '부담 없이 따뜻하게.'),
        _ScoredMenu('김치찌개', 3.0, '추운 날 집밥의 정석.'),
        _ScoredMenu('된장찌개', 2.9, '구수한 국물의 온기.'),
        _ScoredMenu('설렁탕', 3.3, '뽀얗고 진한 사골국물.'),
        _ScoredMenu('부대찌개', 3.0, '얼큰하고 푸짐하게.'),
        _ScoredMenu('갈비탕', 3.1, '고급 보양 국물.'),
        _ScoredMenu('감자탕', 3.0, '뼈 해장국물의 깊은 맛.'),
        _ScoredMenu('뼈해장국', 2.9, '속까지 따뜻해지는 국물.'),
        _ScoredMenu('닭곰탕', 2.8, '담백하고 따뜻한 보양식.'),
        _ScoredMenu('떡만두국', 2.9, '추운 겨울의 국민 메뉴.'),
        _ScoredMenu('훠궈', 3.0, '함께 즐기는 따뜻한 한 끼.'),
        _ScoredMenu('어묵탕', 2.7, '간편한 따뜻함.'),
      ];
    }
    if (weather.isHot) {
      return [
        _ScoredMenu('냉면', 3.4, '더운 날에는 시원한 면 메뉴.'),
        _ScoredMenu('모밀', 3.2, '가볍고 시원하게 먹기 좋습니다.'),
        _ScoredMenu('초밥', 3.0, '깔끔한 온도감의 메뉴.'),
        _ScoredMenu('콩국수', 2.9, '여름철 선호도가 높은 선택.'),
        _ScoredMenu('물회', 3.1, '시원하고 새콤한 여름 별미.'),
        _ScoredMenu('밀면', 2.9, '부산식 시원한 면요리.'),
        _ScoredMenu('샐러드', 2.8, '가볍고 시원한 한 끼.'),
        _ScoredMenu('냉파스타', 2.7, '이탈리안 스타일 시원함.'),
        _ScoredMenu('비빔냉면', 3.0, '매콤 새콤한 여름 면.'),
        _ScoredMenu('팥빙수', 2.5, '식사 후 달콤한 디저트.'),
        _ScoredMenu('포케', 2.8, '하와이안 시원함.'),
        _ScoredMenu('냉우동', 2.7, '시원한 일본식 면.'),
        _ScoredMenu('수박 화채', 2.4, '간식으로 시원하게.'),
        _ScoredMenu('쌀국수', 2.8, '더운 날에도 잘 넘어가는 면.'),
        _ScoredMenu('회덮밥', 2.9, '시원한 해산물 덮밥.'),
      ];
    }
    return [
      _ScoredMenu('돈까스', 3.0, '무난한 날씨에 실패 확률이 낮습니다.'),
      _ScoredMenu('쌀국수', 2.9, '가볍게 먹기 좋습니다.'),
      _ScoredMenu('덮밥', 2.8, '간편하면서 든든한 메뉴.'),
      _ScoredMenu('비빔밥', 2.7, '언제나 좋은 한식 정석.'),
      _ScoredMenu('파스타', 2.8, '분위기와 맛 모두 좋습니다.'),
      _ScoredMenu('라멘', 2.7, '깊은 국물의 일본 면.'),
      _ScoredMenu('김치볶음밥', 2.6, '쉽고 맛있는 한 끼.'),
      _ScoredMenu('닭가슴살 샐러드', 2.5, '가볍고 건강하게.'),
      _ScoredMenu('짜장면', 2.7, '무난한 중식 한 끼.'),
      _ScoredMenu('떡볶이', 2.6, '간식 겸 든든한 식사.'),
      _ScoredMenu('카레', 2.6, '향신료 풍미의 한 끼.'),
      _ScoredMenu('오므라이스', 2.5, '부드럽고 달콤한 메뉴.'),
    ];
  }

  List<_ScoredMenu> _peopleCount(MoodContext context) {
    if (context.peopleCount <= 2) {
      return [
        _ScoredMenu('라멘', 3.3, '소규모 인원에서 빠르게 먹기 좋습니다.'),
        _ScoredMenu('덮밥', 3.1, '1~2인 식사에 효율적.'),
        _ScoredMenu('파스타', 3.0, '적은 인원 약속 메뉴로 안정적.'),
        _ScoredMenu('초밥', 2.8, '적은 인원에서 주문이 편합니다.'),
        _ScoredMenu('스테이크', 2.9, '둘이서 즐기기 좋은 고급 메뉴.'),
        _ScoredMenu('돈까스', 2.7, '빠르고 만족스러운 식사.'),
        _ScoredMenu('쌀국수', 2.6, '가볍게 한 끼.'),
        _ScoredMenu('카레', 2.5, '심플하게 한 끼.'),
        _ScoredMenu('리조또', 2.7, '소규모 분위기 메뉴.'),
        _ScoredMenu('샌드위치', 2.4, '간편한 만남에 적합.'),
        _ScoredMenu('비빔밥', 2.6, '한 명이도 먹기 좋은 메뉴.'),
        _ScoredMenu('우동', 2.5, '가볍고 따뜻한 선택.'),
      ];
    }
    if (context.peopleCount <= 4) {
      return [
        _ScoredMenu('닭갈비', 3.3, '3~4인이 함께 먹기 좋은 구성.'),
        _ScoredMenu('부대찌개', 3.2, '여럿이 나눠 먹기 좋습니다.'),
        _ScoredMenu('삼겹살', 3.1, '적당한 인원 모임 메뉴.'),
        _ScoredMenu('훠궈', 2.9, '공유형 식사에 적합.'),
        _ScoredMenu('곱창', 2.8, '소규모 회식 맛집.'),
        _ScoredMenu('피자', 2.9, '함께 나눠먹기 좋습니다.'),
        _ScoredMenu('쭈꾸미', 2.7, '매콤하게 함께 즐기기.'),
        _ScoredMenu('갈비', 3.0, '고기를 함께 구워먹는 즐거움.'),
        _ScoredMenu('감자탕', 2.8, '푸짐하게 나눠먹기.'),
        _ScoredMenu('해물찜', 2.7, '해산물 파티.'),
        _ScoredMenu('치킨', 2.8, '편하게 모여서.'),
        _ScoredMenu('샤브샤브', 2.9, '건강하게 함께.'),
      ];
    }
    return [
      _ScoredMenu('보쌈', 3.4, '다인원에서 분배가 쉬운 메뉴.'),
      _ScoredMenu('회식세트', 3.2, '단체 식사에서 효율적.'),
      _ScoredMenu('족발', 3.1, '인원수가 많을수록 만족도 높음.'),
      _ScoredMenu('전골', 2.9, '다인원 공유식에 잘 맞습니다.'),
      _ScoredMenu('삼겹살', 3.0, '대인원 고기 파티.'),
      _ScoredMenu('닭갈비', 2.8, '넓은 불판에 함께.'),
      _ScoredMenu('피자', 2.9, '대량 주문에 용이.'),
      _ScoredMenu('뷔페', 3.0, '대인원이면 뷔페가 답.'),
      _ScoredMenu('갈비', 2.9, '회식의 정석.'),
      _ScoredMenu('해물탕', 2.7, '푸짐한 단체 메뉴.'),
      _ScoredMenu('찜닭', 2.8, '넉넉한 양으로 함께.'),
      _ScoredMenu('치킨', 2.7, '편하게 여러 마리.'),
    ];
  }

  // ─── 예산 (세분화) ───
  List<_ScoredMenu> _budget(MoodContext context) {
    final won = context.budgetWon;
    if (won <= 7000) {
      return [
        _ScoredMenu('김밥', 3.4, '~3,500원 · 가성비 최고.'),
        _ScoredMenu('라면', 3.2, '~4,000원 · 빠르고 저렴.'),
        _ScoredMenu('떡볶이', 3.1, '~4,500원 · 매콤 간식.'),
        _ScoredMenu('컵밥', 2.9, '~3,000원 · 편의점 한 끼.'),
        _ScoredMenu('주먹밥', 2.7, '~2,500원 · 간편한 선택.'),
        _ScoredMenu('토스트', 2.8, '~3,500원 · 길거리 간식.'),
        _ScoredMenu('순대', 3.0, '~4,000원 · 분식 대표.'),
        _ScoredMenu('어묵', 2.6, '~2,000원 · 간단 간식.'),
        _ScoredMenu('핫도그', 2.5, '~3,000원 · 빠른 한입.'),
        _ScoredMenu('만두', 2.8, '~4,000원 · 든든한 간식.'),
        _ScoredMenu('붕어빵', 2.3, '~1,500원 · 달콤한 간식.'),
        _ScoredMenu('컵라면', 2.4, '~1,500원 · 최저가 한 끼.'),
      ];
    }
    if (won <= 10000) {
      return [
        _ScoredMenu('국밥', 3.3, '~8,000원 · 든든한 한 끼.'),
        _ScoredMenu('김치찌개', 3.2, '~8,000원 · 백반의 정석.'),
        _ScoredMenu('비빔밥', 3.1, '~9,000원 · 균형 잡힌 한식.'),
        _ScoredMenu('우동', 2.9, '~7,000원 · 부담 없는 면.'),
        _ScoredMenu('칼국수', 3.0, '~8,000원 · 따뜻한 국물면.'),
        _ScoredMenu('짜장면', 2.9, '~7,000원 · 실패 없는 중식.'),
        _ScoredMenu('덮밥', 2.8, '~8,000원 · 빠르고 든든.'),
        _ScoredMenu('된장찌개', 2.9, '~8,000원 · 구수한 집밥.'),
        _ScoredMenu('제육볶음', 3.0, '~9,000원 · 점심 인기 메뉴.'),
        _ScoredMenu('순대국', 2.8, '~8,000원 · 든든 국밥.'),
        _ScoredMenu('냉면', 2.7, '~9,000원 · 시원한 면.'),
        _ScoredMenu('수제비', 2.7, '~7,000원 · 따끈한 국물.'),
        _ScoredMenu('콩나물국밥', 2.8, '~7,500원 · 해장에도 좋아요.'),
        _ScoredMenu('라멘', 2.8, '~9,000원 · 진한 일본 국물.'),
      ];
    }
    if (won <= 15000) {
      return [
        _ScoredMenu('돈까스', 3.3, '~12,000원 · 점심 인기 메뉴.'),
        _ScoredMenu('쌀국수', 3.1, '~11,000원 · 이국적 한 끼.'),
        _ScoredMenu('파스타', 3.0, '~14,000원 · 분위기와 맛.'),
        _ScoredMenu('햄버거 세트', 2.9, '~12,000원 · 든든한 패스트푸드.'),
        _ScoredMenu('규동', 2.8, '~10,000원 · 일본식 덮밥.'),
        _ScoredMenu('카레', 2.7, '~11,000원 · 향신료 풍미.'),
        _ScoredMenu('떡갈비 정식', 2.9, '~13,000원 · 한식 정식.'),
        _ScoredMenu('부대찌개', 2.8, '~11,000원 · 얼큰하게.'),
        _ScoredMenu('닭갈비', 3.0, '~13,000원 · 매콤한 닭고기.'),
        _ScoredMenu('순두부찌개', 2.7, '~10,000원 · 부드럽게.'),
        _ScoredMenu('오므라이스', 2.6, '~11,000원 · 달콤 부드러운.'),
        _ScoredMenu('타코', 2.5, '~12,000원 · 멕시칸 스타일.'),
        _ScoredMenu('치킨 샐러드', 2.6, '~12,000원 · 건강한 선택.'),
        _ScoredMenu('초밥 세트', 2.8, '~14,000원 · 점심 특선 기준.'),
      ];
    }
    if (won <= 25000) {
      return [
        _ScoredMenu('삼겹살', 3.3, '~18,000원 · 고기 한 상.'),
        _ScoredMenu('초밥', 3.1, '~20,000원 · 프리미엄 회전초밥.'),
        _ScoredMenu('양갈비', 2.9, '~22,000원 · 이국적 고기.'),
        _ScoredMenu('장어덮밥', 2.8, '~20,000원 · 보양 든든.'),
        _ScoredMenu('곱창', 3.0, '~18,000원 · 풍미 가득.'),
        _ScoredMenu('갈비', 3.1, '~22,000원 · 한식 고기의 정석.'),
        _ScoredMenu('스테이크 런치', 2.9, '~24,000원 · 점심 특가.'),
        _ScoredMenu('해물찜', 2.8, '~22,000원 · 해산물 모음.'),
        _ScoredMenu('샤브샤브', 2.9, '~20,000원 · 건강한 고기.'),
        _ScoredMenu('닭한마리', 2.8, '~18,000원 · 푸짐한 닭요리.'),
        _ScoredMenu('보쌈', 2.9, '~20,000원 · 돼지고기 보양.'),
        _ScoredMenu('활어회', 2.7, '~24,000원 · 신선한 횟감.'),
        _ScoredMenu('우삼겹 세트', 2.8, '~19,000원 · 소고기 맛보기.'),
        _ScoredMenu('족발', 2.9, '~22,000원 · 쫀득한 보양.'),
      ];
    }
    if (won <= 35000) {
      return [
        _ScoredMenu('한우구이', 3.2, '~32,000원 · 국산 소고기.'),
        _ScoredMenu('스테이크', 3.1, '~30,000원 · 고급 양식.'),
        _ScoredMenu('활어회', 3.0, '~28,000원 · 산지 직송 회.'),
        _ScoredMenu('코스 일식', 2.9, '~30,000원 · 일식 코스 입문.'),
        _ScoredMenu('랍스터 파스타', 2.8, '~28,000원 · 특별한 파스타.'),
        _ScoredMenu('양갈비 세트', 2.9, '~30,000원 · 푸짐한 양고기.'),
        _ScoredMenu('장어구이', 2.8, '~32,000원 · 기력 보충.'),
        _ScoredMenu('킹크랩', 2.7, '~35,000원 · 해산물의 왕.'),
        _ScoredMenu('오리훈제', 2.7, '~26,000원 · 훈제 풍미.'),
        _ScoredMenu('갈비찜', 3.0, '~28,000원 · 푸짐한 한식.'),
        _ScoredMenu('철판 스테이크', 2.9, '~32,000원 · 라이브 조리.'),
        _ScoredMenu('해물 모둠', 2.8, '~30,000원 · 다양한 해산물.'),
      ];
    }
    return [
      _ScoredMenu('오마카세', 3.2, '40,000원~ · 셰프의 추천.'),
      _ScoredMenu('한우 코스', 3.1, '45,000원~ · 최상급 한우.'),
      _ScoredMenu('코스 요리', 3.0, '40,000원~ · 풀코스 양식.'),
      _ScoredMenu('참치 오마카세', 2.9, '50,000원~ · 참치의 정수.'),
      _ScoredMenu('프렌치 레스토랑', 2.8, '50,000원~ · 프렌치 파인다이닝.'),
      _ScoredMenu('와규 스테이크', 3.0, '45,000원~ · 마블링의 극치.'),
      _ScoredMenu('랍스터 코스', 2.8, '50,000원~ · 해산물 풀코스.'),
      _ScoredMenu('활킹크랩', 2.7, '60,000원~ · 호화 해산물.'),
      _ScoredMenu('장어 코스', 2.7, '40,000원~ · 보양 코스.'),
      _ScoredMenu('스시 오마카세', 2.9, '45,000원~ · 장인의 스시.'),
      _ScoredMenu('트러플 파스타', 2.6, '40,000원~ · 고급 풍미.'),
      _ScoredMenu('캐비어 세트', 2.5, '60,000원~ · 최고급 별미.'),
    ];
  }

  List<_ScoredMenu> _quickMeal(MoodContext context) {
    return [
      _ScoredMenu('김밥', 3.4, '짧은 시간에 빠르게 식사 가능.'),
      _ScoredMenu('샌드위치', 3.3, '대기 시간이 짧은 편.'),
      _ScoredMenu('햄버거', 3.2, '포장/매장 모두 빠른 식사.'),
      _ScoredMenu('덮밥', 3.0, '빠르게 한 끼 해결.'),
      _ScoredMenu('토스트', 2.9, '빠르고 간편한 한 끼.'),
      _ScoredMenu('주먹밥', 2.7, '편의점에서 바로.'),
      _ScoredMenu('우동', 2.8, '빠르게 나오는 면.'),
      _ScoredMenu('라면', 2.9, '5분 완성.'),
      _ScoredMenu('볶음밥', 2.7, '빠르게 볶아서.'),
      _ScoredMenu('국밥', 2.8, '금방 나오는 든든함.'),
      _ScoredMenu('짜장면', 2.7, '빠른 배달/포장.'),
      _ScoredMenu('핫도그', 2.5, '한입에 간편하게.'),
    ];
  }

  List<_ScoredMenu> _alcoholSnack(MoodContext context) {
    return [
      _ScoredMenu('치킨', 3.4, '술안주 대표 메뉴.'),
      _ScoredMenu('닭발', 3.2, '강한 맛 안주.'),
      _ScoredMenu('곱창', 3.1, '풍미가 진한 안주.'),
      _ScoredMenu('해물파전', 3.0, '무난한 주류 페어링.'),
      _ScoredMenu('족발', 2.9, '쫀득한 안주.'),
      _ScoredMenu('보쌈', 3.0, '소주와 환상 조합.'),
      _ScoredMenu('골뱅이무침', 2.8, '소주 안주의 클래식.'),
      _ScoredMenu('두부김치', 2.7, '가볍고 깔끔한 안주.'),
      _ScoredMenu('마른안주 모음', 2.5, '오징어, 땅콩 등.'),
      _ScoredMenu('감자튀김', 2.6, '맥주 안주 필수.'),
      _ScoredMenu('나초', 2.5, '맥주와 함께.'),
      _ScoredMenu('건어물', 2.4, '담백한 안주.'),
      _ScoredMenu('연어회', 2.8, '와인/사케 안주.'),
      _ScoredMenu('육회', 2.9, '소주와 찰떡궁합.'),
      _ScoredMenu('오돌뼈', 2.7, '매콤한 뼈 안주.'),
    ];
  }

  List<_ScoredMenu> _lateNight(MoodContext context) {
    return [
      _ScoredMenu('치킨', 3.4, '야식 시간대 만족도 높음.'),
      _ScoredMenu('족발', 3.2, '늦은 시간 배달 친화적.'),
      _ScoredMenu('떡볶이', 3.1, '야식 인기 메뉴.'),
      _ScoredMenu('라면', 2.8, '가장 빠른 야식.'),
      _ScoredMenu('피자', 3.0, '야식 배달 클래식.'),
      _ScoredMenu('햄버거', 2.7, '24시간 패스트푸드.'),
      _ScoredMenu('마라탕', 2.9, '얼얼한 야식 매력.'),
      _ScoredMenu('순대국', 2.8, '새벽 해장에 제격.'),
      _ScoredMenu('볶음밥', 2.6, '간단하고 든든한 야식.'),
      _ScoredMenu('라볶이', 2.7, '라면 + 떡볶이 야식.'),
      _ScoredMenu('토스트', 2.5, '포장마차 감성.'),
      _ScoredMenu('김밥', 2.6, '편의점에서 바로 해결.'),
      _ScoredMenu('닭강정', 2.8, '달콤 매콤 야식.'),
      _ScoredMenu('오뎅탕', 2.5, '따뜻한 야식 국물.'),
    ];
  }

  List<_ScoredMenu> _coupleDate(MoodContext context) {
    return [
      _ScoredMenu('파스타', 3.4, '데이트 분위기에 최고.'),
      _ScoredMenu('스테이크', 3.2, '특별한 식사 느낌.'),
      _ScoredMenu('초밥', 3.0, '깔끔한 데이트 식사.'),
      _ScoredMenu('브런치', 2.9, '대화 중심 식사.'),
      _ScoredMenu('와인바', 2.8, '분위기 있는 저녁.'),
      _ScoredMenu('리조또', 2.9, '고급 이탈리안.'),
      _ScoredMenu('오마카세', 2.7, '특별한 날 추천.'),
      _ScoredMenu('프렌치 비스트로', 2.8, '이국적 분위기.'),
      _ScoredMenu('디저트 카페', 2.6, '달콤한 마무리.'),
      _ScoredMenu('양갈비', 2.7, '이국적 고기 데이트.'),
      _ScoredMenu('활어회', 2.8, '신선한 해산물 데이트.'),
      _ScoredMenu('타파스', 2.6, '스페인식 소포션.'),
      _ScoredMenu('샤브샤브', 2.7, '함께 즐기는 식사.'),
      _ScoredMenu('퐁듀', 2.5, '로맨틱한 치즈 퐁듀.'),
    ];
  }

  List<_ScoredMenu> _officeLunch(MoodContext context) {
    return [
      _ScoredMenu('제육볶음', 3.3, '직장인 점심 선호도 높음.'),
      _ScoredMenu('김치찌개', 3.2, '점심 회전이 빠른 메뉴.'),
      _ScoredMenu('국밥', 3.1, '든든한 점심 메뉴.'),
      _ScoredMenu('비빔밥', 2.9, '무난한 점심 선택지.'),
      _ScoredMenu('돈까스', 3.0, '점심 인기 메뉴.'),
      _ScoredMenu('덮밥', 2.8, '빠르고 간편한 점심.'),
      _ScoredMenu('칼국수', 2.8, '따뜻한 국물이 필요할 때.'),
      _ScoredMenu('짜장면', 2.7, '중식 한 끼.'),
      _ScoredMenu('부대찌개', 2.7, '얼큰하게.'),
      _ScoredMenu('백반', 3.0, '집밥 스타일.'),
      _ScoredMenu('쌀국수', 2.6, '가볍게 먹고 싶을 때.'),
      _ScoredMenu('샐러드', 2.5, '다이어트 중이라면.'),
      _ScoredMenu('순두부찌개', 2.7, '부드럽고 속편한.'),
      _ScoredMenu('된장찌개', 2.8, '구수한 집밥 감성.'),
    ];
  }

  List<_ScoredMenu> _stressRelief(MoodContext context) {
    return [
      _ScoredMenu('마라탕', 3.4, '강한 자극으로 스트레스 해소.'),
      _ScoredMenu('불닭', 3.2, '매운맛으로 기분 전환.'),
      _ScoredMenu('떡볶이', 3.1, '자극적인 소스로 만족도 높음.'),
      _ScoredMenu('닭발', 2.9, '매운 안주형 메뉴.'),
      _ScoredMenu('곱창', 2.8, '기름진 풍미로 카타르시스.'),
      _ScoredMenu('치킨', 3.0, '치킨은 만능 스트레스 해소제.'),
      _ScoredMenu('삼겹살', 2.9, '고기를 구우면 스트레스 해소.'),
      _ScoredMenu('마라샹궈', 3.1, '얼얼한 맛의 쾌감.'),
      _ScoredMenu('불족발', 2.7, '매운 족발로 화끈하게.'),
      _ScoredMenu('짬뽕', 2.8, '매운 국물의 위로.'),
      _ScoredMenu('엽떡', 2.9, '중독성 있는 매운맛.'),
      _ScoredMenu('낙곱새', 3.0, '매콤한 전골의 정석.'),
      _ScoredMenu('불닭볶음면', 2.6, '집에서 즉석 스트레스 해소.'),
      _ScoredMenu('쭈꾸미', 2.8, '매콤 달콤 스트레스 해소.'),
    ];
  }

  List<_ScoredMenu> _comfortFood(MoodContext context) {
    return [
      _ScoredMenu('죽', 3.4, '부담이 적고 편안한 위로 메뉴.'),
      _ScoredMenu('곰탕', 3.2, '따뜻하고 안정적인 한 끼.'),
      _ScoredMenu('미역국', 3.0, '속이 편한 국물 메뉴.'),
      _ScoredMenu('우동', 2.9, '가볍게 위로받기 좋습니다.'),
      _ScoredMenu('칼국수', 3.0, '엄마 손맛 느낌.'),
      _ScoredMenu('된장찌개', 2.9, '집밥 향수를 달래주는 메뉴.'),
      _ScoredMenu('수제비', 2.8, '쫄깃한 반죽의 따뜻한 국물.'),
      _ScoredMenu('떡국', 2.7, '따뜻한 국물의 위로.'),
      _ScoredMenu('닭곰탕', 2.8, '담백한 보양식.'),
      _ScoredMenu('감자수프', 2.6, '부드럽고 따뜻한 수프.'),
      _ScoredMenu('누룽지탕', 2.7, '구수하고 편안한 맛.'),
      _ScoredMenu('잔치국수', 2.8, '소박하지만 위로되는.'),
      _ScoredMenu('삼계탕', 2.9, '몸과 마음의 보양.'),
      _ScoredMenu('설렁탕', 3.0, '뽀얀 국물의 포근함.'),
    ];
  }

  List<_ScoredMenu> _spicyCraving(MoodContext context) {
    return [
      _ScoredMenu('마라탕', 3.4, '강한 매운맛 대표.'),
      _ScoredMenu('짬뽕', 3.2, '국물 있는 매운맛.'),
      _ScoredMenu('매운 닭갈비', 3.1, '매콤한 메인 식사.'),
      _ScoredMenu('불족발', 2.9, '매운 안주형 메뉴.'),
      _ScoredMenu('엽떡', 3.0, '중독성 강한 매운 떡볶이.'),
      _ScoredMenu('마라샹궈', 3.1, '기름진 매운맛.'),
      _ScoredMenu('닭발', 2.8, '뼈 있는 매운 안주.'),
      _ScoredMenu('낙곱새', 3.0, '매운 전골의 정석.'),
      _ScoredMenu('불닭', 2.9, '화끈한 닭요리.'),
      _ScoredMenu('쭈꾸미', 2.8, '매콤 달콤한 해산물.'),
      _ScoredMenu('매운 갈비찜', 2.7, '얼큰한 갈비.'),
      _ScoredMenu('청양고추 김치찌개', 2.8, '다단계 매운맛.'),
      _ScoredMenu('고추장 불고기', 2.7, '단맛과 매운맛 조화.'),
      _ScoredMenu('매운 해물찜', 2.9, '해산물 + 매운 양념.'),
    ];
  }

  List<_ScoredMenu> _coolCraving(MoodContext context) {
    return [
      _ScoredMenu('냉면', 3.4, '시원한 음식 대표 메뉴.'),
      _ScoredMenu('모밀', 3.2, '깔끔하고 차가운 식사.'),
      _ScoredMenu('콩국수', 3.0, '여름철 시원한 선택.'),
      _ScoredMenu('물회', 2.9, '강한 시원함.'),
      _ScoredMenu('밀면', 2.8, '부산식 시원한 면.'),
      _ScoredMenu('냉파스타', 2.7, '이탈리안 스타일 시원함.'),
      _ScoredMenu('비빔냉면', 3.1, '매콤 새콤 시원.'),
      _ScoredMenu('회덮밥', 2.8, '시원한 해산물 덮밥.'),
      _ScoredMenu('샐러드', 2.6, '시원하고 가벼운.'),
      _ScoredMenu('포케', 2.7, '하와이안 시원함.'),
      _ScoredMenu('냉우동', 2.6, '일본식 차가운 면.'),
      _ScoredMenu('초밥', 2.7, '차가운 밥의 깔끔함.'),
      _ScoredMenu('쌈밥', 2.5, '시원한 채소 쌈.'),
      _ScoredMenu('메밀전병', 2.6, '담백한 차가운 전.'),
    ];
  }

  List<_ScoredMenu> _greasyCraving(MoodContext context) {
    return [
      _ScoredMenu('치즈돈까스', 3.4, '진한 맛에 만족도 높음.'),
      _ScoredMenu('치킨', 3.2, '기름진 메뉴 대표.'),
      _ScoredMenu('햄버거', 3.0, '기름진 풍미를 빠르게.'),
      _ScoredMenu('곱창', 2.9, '진한 풍미.'),
      _ScoredMenu('삼겹살', 3.0, '기름진 고기의 정석.'),
      _ScoredMenu('피자', 2.8, '치즈 듬뿍.'),
      _ScoredMenu('감자튀김', 2.7, '바삭한 기름진 간식.'),
      _ScoredMenu('탕수육', 2.9, '기름진 중식 정석.'),
      _ScoredMenu('뼈다귀 해장국', 2.7, '기름진 국물.'),
      _ScoredMenu('크림 파스타', 2.8, '진한 크림 소스.'),
      _ScoredMenu('카르보나라', 2.9, '베이컨과 크림의 조화.'),
      _ScoredMenu('모짜렐라 스틱', 2.6, '쫄깃 치즈 튀김.'),
      _ScoredMenu('양념치킨', 3.0, '달콤 기름진 치킨.'),
      _ScoredMenu('떡갈비', 2.7, '기름진 한식 고기.'),
    ];
  }

  List<_ScoredMenu> _healthyToday(MoodContext context) {
    return [
      _ScoredMenu('샐러드', 3.4, '가볍고 건강한 한 끼.'),
      _ScoredMenu('포케', 3.2, '단백질/채소 균형.'),
      _ScoredMenu('월남쌈', 3.0, '채소 비중이 높은 메뉴.'),
      _ScoredMenu('두부샐러드', 2.9, '포만감과 건강을 함께.'),
      _ScoredMenu('닭가슴살', 2.8, '고단백 저칼로리.'),
      _ScoredMenu('그릴드 치킨', 2.9, '구운 닭으로 건강하게.'),
      _ScoredMenu('오트밀', 2.6, '가벼운 건강 식사.'),
      _ScoredMenu('연어 볼', 2.8, '오메가3 풍부.'),
      _ScoredMenu('곤약면', 2.5, '초저칼로리 면.'),
      _ScoredMenu('현미밥 정식', 2.7, '건강한 탄수화물.'),
      _ScoredMenu('야채 비빔밥', 2.8, '채소 듬뿍.'),
      _ScoredMenu('스무디 볼', 2.5, '과일 가득 건강식.'),
      _ScoredMenu('견과류 샐러드', 2.6, '좋은 지방.'),
      _ScoredMenu('두부 스테이크', 2.7, '식물성 단백질.'),
    ];
  }

  List<_ScoredMenu> _dietMode(MoodContext context) {
    return [
      _ScoredMenu('샐러드', 3.4, '저칼로리 채소 중심의 가벼운 식사.'),
      _ScoredMenu('포케', 3.3, '단백질과 채소를 함께 챙기는 균형 잡힌 다이어트.'),
      _ScoredMenu('월남쌈', 3.2, '채소를 풍성하게 즐기는 건강한 식사.'),
      _ScoredMenu('키토김밥', 3.1, '밥 대신 달걀 지단으로 탄수화물을 줄인 식사.'),
      _ScoredMenu('곤약면', 3.0, '칼로리가 매우 낮은 면 요리.'),
      _ScoredMenu('곤약볶음밥', 2.9, '포만감은 높이고 칼로리는 낮춘 볶음밥.'),
      _ScoredMenu('닭가슴살 샐러드', 3.2, '고단백 저지방의 정석적인 식사.'),
      _ScoredMenu('두부면 파스타', 3.0, '밀가루 대신 두부로 만든 면 요리.'),
      _ScoredMenu('묵밥', 2.9, '칼로리가 낮고 시원하게 즐기는 한 끼.'),
      _ScoredMenu('서브웨이 샌드위치', 3.1, '소스와 빵을 조절한 맞춤형 다이어트 식사.'),
      _ScoredMenu('단호박 찜', 2.8, '식이섬유가 풍부하고 달콤한 다이어트 식품.'),
      _ScoredMenu('연어 샐러드', 3.2, '건강한 지방과 단백질을 동시에 섭취.'),
      _ScoredMenu('낫또', 2.7, '장 건강과 영양을 챙기는 발효 식품.'),
      _ScoredMenu('그릭 요거트', 2.8, '포만감이 오래가는 고단백 간식 겸 식사.'),
      _ScoredMenu('샤브샤브', 3.0, '고기와 야채를 데쳐 먹는 담백한 식사.'),
    ];
  }

  CurrentWeatherSnapshot? _resolveWeather(MoodContext context) {
    final code = context.weatherCode;
    final temp = context.temperatureC;
    if (code == null || temp == null) return null;
    return CurrentWeatherSnapshot(weatherCode: code, temperatureC: temp);
  }
}

class _ScoredMenu {
  _ScoredMenu(this.menu, this.score, this.reason);
  final String menu;
  final double score;
  final String reason;
}
