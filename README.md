# FoodPicker

슬롯 기반 음식 의사결정 앱의 1차 구현본입니다.

## 구현된 핵심

- 카카오 후보 검색(최대 30개, 반경 2km)
- Google 평점/리뷰수 보강(상위 20개, 이름+좌표 근접 매칭)
- Naver 로컬 API `리뷰 많은 순(sort=comment)` 신호 반영
- 음식 키워드 검색 시 미매칭 상위 장소는 상호명 기준 추가 조회(기본 최대 5회)
- 품질 게이트(`rating >= 4.0 && reviews >= 30`) 우선 정렬
- 미통과/미매칭 후보는 카카오 거리순 보완
- Google 메타 24시간 TTL 캐시(SharedPreferences)
- 홈 단일 진입 구조(하단 메뉴 없음)

## 실행

```powershell
flutter run `
  --dart-define=KAKAO_REST_API_KEY=a8c6ab6cd9c6d0dc45680c5d8866e69d `
  --dart-define=GOOGLE_PLACES_API_KEY=YOUR_GOOGLE_PLACES_KEY `
  --dart-define=NAVER_CLIENT_ID=YOUR_NAVER_CLIENT_ID `
  --dart-define=NAVER_CLIENT_SECRET=YOUR_NAVER_CLIENT_SECRET
```

Google 키가 없어도 카카오 검색은 동작합니다.

```powershell
flutter run `
  --dart-define=KAKAO_REST_API_KEY=a8c6ab6cd9c6d0dc45680c5d8866e69d
```

## 무선 디버깅 스플래시 멈춤 대응

무선 디버깅에서 앱이 스플래시에서 멈추면 아래 순서로 복구합니다.

```powershell
adb kill-server
adb start-server
```

디바이스에서 무선 디버깅을 껐다가 다시 켜고 재페어링한 뒤, 디버그 대기 관련 전역값을 초기화합니다.

```powershell
adb shell settings put global debug_app ""
adb shell settings put global wait_for_debugger 0
```

그 다음 다시 실행합니다.

```powershell
flutter run -d <wireless-device-id>
```

참고: `adb`가 PATH에 없으면 Android SDK의 `platform-tools/adb` 절대경로로 같은 명령을 실행합니다.

## 카카오 API 설정

- Kakao Developers에서 앱 생성
- `내 애플리케이션 > 앱 키`에서 `REST API 키` 확인
- `제품 설정 > 카카오맵 > 로컬 API` 사용 설정
- 앱 실행 시 `--dart-define=KAKAO_REST_API_KEY=...`로 키 주입

현재 카카오 검색은 `음식점(FD6)` 카테고리 필터를 기본 적용합니다.

## 네이버 리뷰순 연동

- 네이버 개발자 센터에서 검색 API 앱 생성
- `X-Naver-Client-Id`, `X-Naver-Client-Secret` 발급
- 앱 실행 시 아래 키를 함께 주입
  - `--dart-define=NAVER_CLIENT_ID=...`
  - `--dart-define=NAVER_CLIENT_SECRET=...`

## 테스트

```powershell
flutter analyze
flutter test
```

## 백업/복구 (파일 복사 방식)

이 프로젝트에서는 작업 중간 백업을 파일 복사 방식으로 관리합니다.

```powershell
# 예: main.dart 백업
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item .\lib\main.dart ".\lib\main.dart.bak_$ts"
```

```powershell
# 예: 백업본으로 복구
Copy-Item .\lib\main.dart.bak_20260225_013342 .\lib\main.dart -Force
```

```powershell
# 예: 핀볼 데이터 폴더 통째로 백업
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item .\lib\ui\pinball\src\data ".\lib\ui\pinball\src\data.bak_$ts" -Recurse
```

## 주요 경로

- `lib/services/hybrid_ranking_service.dart`
- `lib/services/kakao_place_search_client.dart`
- `lib/services/google_places_client.dart`
- `lib/services/google_meta_cache.dart`
- `lib/ui/screens/nearby_search_screen.dart`
