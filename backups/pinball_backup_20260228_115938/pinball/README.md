# Marble roulette

This is a lucky draw by dropping marbles.

[Demo]( https://lazygyu.github.io/roulette )

# Requirements

- Typescript
- Parcel
- box2d-wasm

# Development

```shell
> yarn
> yarn dev
```

# Build

```shell
> yarn build
```

# Backup & Restore (Copy-Based)

Use file-copy backups during edits.

```powershell
# backup a single file
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item .\src\data\newMaps.ts ".\src\data\newMaps.ts.bak_$ts"
```

```powershell
# restore from backup
Copy-Item .\src\data\newMaps.ts.bak_20260225_013342 .\src\data\newMaps.ts -Force
```
