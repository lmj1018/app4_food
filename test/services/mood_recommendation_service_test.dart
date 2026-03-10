import 'package:app4_food/data/models/mood_models.dart';
import 'package:app4_food/services/mood_recommendation_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final service = MoodRecommendationService();

  test('weather mode suggests warm soup menus on rainy days', () {
    final result = service.recommend(
      optionId: MoodOptionId.weatherFit,
      context: MoodContext(
        now: DateTime(2026, 2, 21, 12),
        peopleCount: 2,
        budgetWon: 14000,
        quickMealPreferred: false,
        weatherCode: 61,
        temperatureC: 12,
      ),
      limit: 4,
    );

    final names = result.map((item) => item.menu).toList();
    expect(names, contains('칼국수'));
  });

  test('budget mode suggests affordable menus in low budget', () {
    final result = service.recommend(
      optionId: MoodOptionId.budget,
      context: MoodContext(
        now: DateTime(2026, 2, 21, 13),
        peopleCount: 1,
        budgetWon: 9000,
        quickMealPreferred: false,
      ),
      limit: 3,
    );

    expect(result.first.menu, '김밥');
  });

  test('quick meal preference boosts quick menus', () {
    final result = service.recommend(
      optionId: MoodOptionId.officeLunch,
      context: MoodContext(
        now: DateTime(2026, 2, 21, 12),
        peopleCount: 2,
        budgetWon: 12000,
        quickMealPreferred: true,
      ),
      limit: 3,
    );

    expect(result.first.reason, contains('빠른 식사 조건 반영'));
  });
}
