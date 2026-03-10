param(
    [ValidateSet('release', 'profile', 'debug')]
    [string]$Mode = 'release',
    [string]$ConfigPath,
    [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptRoot 'ReleaseBuildCommon.ps1')

$repoRoot = Get-RepoRoot -ScriptRoot $scriptRoot
$resolvedConfigPath = Resolve-ReleaseConfigPath -RepoRoot $repoRoot -ConfigPath $ConfigPath

$tempRoot = Join-Path $repoRoot '.codex_tmp'
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$tempRepo = Join-Path $tempRoot "apk_${Mode}_$timestamp"

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Force -Path $tempRepo | Out-Null

$excludeDirs = @(
    (Join-Path $repoRoot '.git'),
    (Join-Path $repoRoot '.dart_tool'),
    (Join-Path $repoRoot '.idea'),
    (Join-Path $repoRoot '.vscode'),
    (Join-Path $repoRoot '.codex_tmp'),
    (Join-Path $repoRoot 'build'),
    (Join-Path $repoRoot 'backups'),
    (Join-Path $repoRoot 'android\.gradle'),
    (Join-Path $repoRoot 'android\.kotlin')
)

$robocopyArgs = @(
    $repoRoot,
    $tempRepo,
    '/E',
    '/R:2',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD'
) + $excludeDirs

Write-Host "Copying project to temp workspace: $tempRepo"
& robocopy @robocopyArgs | Out-Null
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -gt 7) {
    throw "robocopy failed with exit code $robocopyExitCode."
}

try {
    $null = Invoke-FlutterReleaseBuild `
        -ProjectDir $tempRepo `
        -Target apk `
        -Mode $Mode `
        -ConfigPath $resolvedConfigPath

    $sourceApk = Join-Path $tempRepo "build\app\outputs\flutter-apk\app-$Mode.apk"
    if (-not (Test-Path $sourceApk)) {
        throw "APK output not found in temp workspace: $sourceApk"
    }

    $destinationDir = Join-Path $repoRoot 'build\app\outputs\flutter-apk'
    $destinationApk = Join-Path $destinationDir "app-$Mode.apk"
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    Move-Item -Path $sourceApk -Destination $destinationApk -Force

    Write-Host "APK ready: $destinationApk"
}
finally {
    if (-not $KeepTemp -and (Test-Path $tempRepo)) {
        Remove-Item -Path $tempRepo -Recurse -Force
    }
}
