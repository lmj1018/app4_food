# Build Notes

- Android release builds must read secrets from `secrets/mobile_release.local.psd1`.
- Do not inline release secrets into manual `flutter build` commands if the local secrets file exists.
- For AAB builds, run `powershell -ExecutionPolicy Bypass -File .\scripts\build_aab.ps1` from the repo root.
- For APK builds, run `powershell -ExecutionPolicy Bypass -File .\scripts\build_apk_via_temp.ps1 -Mode release` from the repo root.
- `scripts/build_apk_via_temp.ps1` must build inside `.codex_tmp` and then place the final file at `build/app/outputs/flutter-apk/app-release.apk`.
- If a different secrets file is needed, pass `-ConfigPath <path>` to the build scripts.
