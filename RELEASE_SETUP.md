# Release Build / Secret Management Guide

이 프로젝트는 API 키/광고 ID/서명키를 소스에 하드코딩하지 않고, 빌드 시점에 주입하도록 구성되어 있습니다.

## 1) 릴리즈 서명키(Keystore) 준비

예시 생성 명령:

```powershell
keytool -genkeypair -v -keystore release-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

생성 후 보관:

- `release-upload.jks`는 외부 안전 저장소(암호화 드라이브, 비밀관리 도구)에 보관
- 코드 저장소에는 절대 커밋 금지

## 2) Android 서명 정보 주입 방법

다음 키를 빌드 시점에 주입합니다.

- `KEYSTORE_PATH`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

주입 우선순위:

1. `android/key.properties`
2. Gradle `-P` 속성
3. OS 환경변수

주의: 릴리즈 빌드는 위 4개 서명값이 없으면 실패하도록 설정되어 있습니다.

`android/key.properties` 예시(실파일은 커밋 금지):

```properties
KEYSTORE_PATH=C:\\secure\\release-upload.jks
KEYSTORE_PASSWORD=******
KEY_ALIAS=upload
KEY_PASSWORD=******
ADMOB_APP_ID=ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy
```

## 3) Dart API 키/광고 단위 ID 주입 (`--dart-define`)

`AppEnv`는 아래 값을 `String.fromEnvironment`로 읽습니다.

- `KAKAO_REST_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `ADMOB_REWARDED_ANDROID_UNIT_ID`
- `ENABLE_HYBRID_DEBUG_LOGS` (출시 권장: `false`)

현재 사용값(요청 기준, 기존 하드코딩에서 분리):

- `KAKAO_REST_API_KEY=a8c6ab6cd9c6d0dc45680c5d8866e69d`
- `NAVER_CLIENT_ID=k6B8dXuL4q7NHtR8q0SA`
- `NAVER_CLIENT_SECRET=PhvUOZ04RV`

카카오 콘솔 참고:

- 이 앱처럼 **Kakao Local REST API만 사용**하는 경우, 필수는 `REST API 키`입니다.
- 콘솔에서 `내 애플리케이션 > 앱 키`(또는 유사 명칭) 메뉴만 확인되면 정상입니다.
- `플랫폼 등록/추가기능 신청` 메뉴가 보이지 않아도 Local REST 호출에는 필수가 아닙니다.

위 3개 값은 코드에 하드코딩하지 말고, 아래 빌드 시점 주입 방식으로만 사용합니다.

참고: 현재 앱은 구글 보강(`Google Places`)을 코드에서 비활성화(`enableGoogleSignal: false`)해 두었습니다.
따라서 `GOOGLE_PLACES_API_KEY`는 미입력 상태여도 동작합니다.

예시:

```powershell
flutter build apk --release `
  --dart-define=KAKAO_REST_API_KEY=a8c6ab6cd9c6d0dc45680c5d8866e69d `
  --dart-define=GOOGLE_PLACES_API_KEY=xxxx `
  --dart-define=NAVER_CLIENT_ID=k6B8dXuL4q7NHtR8q0SA `
  --dart-define=NAVER_CLIENT_SECRET=PhvUOZ04RV `
  --dart-define=ADMOB_REWARDED_ANDROID_UNIT_ID=ca-app-pub-xxxx/xxxx `
  --dart-define=ENABLE_HYBRID_DEBUG_LOGS=false
```

## 4) 위치 권한 팝업/동의 관련

- Android 위치 권한 팝업은 OS가 자동 표시합니다.
- 앱은 `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` 권한을 사용합니다.
- 위치 서비스 꺼짐/권한 거부 시 기능이 부분 제한될 수 있으므로, 화면 내 안내 문구를 유지하는 것이 좋습니다.

## 5) AdMob 동의(UMP) 동작

- 앱 시작 시 UMP 동의 정보 업데이트를 요청합니다.
- 동의 폼이 필요한 경우 자동으로 표시될 수 있습니다.
- 동의가 완료되어 광고 요청 가능 상태일 때만 `MobileAds.initialize()`를 수행합니다.

## 6) Cleartext 트래픽 정책

- 기본 cleartext는 금지(`false`)
- `network_security_config`에서 로컬 루프백(`localhost`, `127.0.0.1`)만 허용
- 핀볼 WebView 로컬 서버 통신 목적
