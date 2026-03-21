# Build Notes

- Release secrets must live only in the gitignored local file `secrets/mobile_release.local.psd1`.
- Create the local file by copying `secrets/mobile_release.example.psd1` and filling in the real values.
- Do not commit real API keys, ad IDs, keystore passwords, or keystore paths to tracked files.
- Do not inline release secrets into manual `flutter build` commands if the local secrets file exists.
- For AAB builds, always run `powershell -ExecutionPolicy Bypass -File .\scripts\build_aab.ps1` from the repo root.
- For APK builds, always run `powershell -ExecutionPolicy Bypass -File .\scripts\build_apk_via_temp.ps1 -Mode release` from the repo root.
- `scripts/build_apk_via_temp.ps1` must build inside `.codex_tmp` and then place the final file at `build/app/outputs/flutter-apk/app-release.apk`.
- If a different secrets file is needed, pass `-ConfigPath <path>` to the build scripts.
- Future build requests should default to these scripts instead of raw `flutter build` commands.
