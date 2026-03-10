param(
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptRoot 'ReleaseBuildCommon.ps1')

$repoRoot = Get-RepoRoot -ScriptRoot $scriptRoot
$null = Invoke-FlutterReleaseBuild -ProjectDir $repoRoot -Target appbundle -Mode release -ConfigPath $ConfigPath

$bundlePath = Join-Path $repoRoot 'build\app\outputs\bundle\release\app-release.aab'
if (-not (Test-Path $bundlePath)) {
    throw "AAB output not found: $bundlePath"
}

Write-Host "AAB ready: $bundlePath"
