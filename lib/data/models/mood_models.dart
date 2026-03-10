enum MoodGroup { situation, emotion }

enum MoodOptionId {
  timeSlot,
  weatherFit,
  peopleCount,
  budget,
  quickMeal,
  alcoholSnack,
  lateNight,
  coupleDate,
  officeLunch,
  stressRelief,
  comfortFood,
  spicyCraving,
  coolCraving,
  greasyCraving,
  healthyToday,
  dietMode,
}

class MoodOption {
  const MoodOption({
    required this.id,
    required this.group,
    required this.label,
  });

  final MoodOptionId id;
  final MoodGroup group;
  final String label;
}

class MoodContext {
  const MoodContext({
    required this.now,
    required this.peopleCount,
    required this.budgetWon,
    required this.quickMealPreferred,
    this.weatherCode,
    this.temperatureC,
  });

  final DateTime now;
  final int peopleCount;
  final int budgetWon;
  final bool quickMealPreferred;
  final int? weatherCode;
  final double? temperatureC;
}

class MoodRecommendation {
  const MoodRecommendation({required this.menu, required this.reason});

  final String menu;
  final String reason;
}
