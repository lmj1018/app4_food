$ErrorActionPreference = 'Stop'

param(
  [int]$Port = 8080,
  [switch]$NoOpen
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$targetPage = "http://localhost:$Port/tools/pinball_map_maker_v2.html"

Set-Location $repoRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host '[오류] python 명령을 찾을 수 없습니다. Python 설치 후 다시 실행하세요.' -ForegroundColor Red
  exit 1
}

if (-not $NoOpen) {
  Start-Process $targetPage | Out-Null
}

Write-Host "Pinball Map Maker V2 서버 시작: $targetPage" -ForegroundColor Cyan
Write-Host "중지하려면 이 창에서 Ctrl + C 를 누르세요." -ForegroundColor Yellow

python -m http.server $Port
