import 'package:app4_food/app.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('home shows three main features', (tester) async {
    await tester.pumpWidget(const FoodDecisionApp());

    expect(find.text('룰렛'), findsOneWidget);
    expect(find.text('주변 검색'), findsOneWidget);
    expect(find.text('무드 추천'), findsOneWidget);
  });
}
