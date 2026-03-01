param(
  [int]$Port = 8080,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

function Test-PortAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [int]$CandidatePort
  )
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CandidatePort)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Resolve-AvailablePort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$PreferredPort
  )
  for ($offset = 0; $offset -lt 30; $offset++) {
    $candidate = $PreferredPort + $offset
    if (Test-PortAvailable -CandidatePort $candidate) {
      return $candidate
    }
  }
  throw "사용 가능한 포트를 찾지 못했습니다. 시작 포트: $PreferredPort"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$selectedPort = Resolve-AvailablePort -PreferredPort $Port
$targetPage = "http://127.0.0.1:$selectedPort/tools/pinball_map_maker_v2.html"

Set-Location $repoRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host '[오류] python 명령을 찾을 수 없습니다. Python 설치 후 다시 실행하세요.' -ForegroundColor Red
  exit 1
}

if (-not $NoOpen) {
  Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Milliseconds 700
    Start-Process $url | Out-Null
  } -ArgumentList $targetPage | Out-Null
}

Write-Host "Pinball Map Maker V2 서버 시작: $targetPage" -ForegroundColor Cyan
Write-Host "중지하려면 이 창에서 Ctrl + C 를 누르세요." -ForegroundColor Yellow
if ($selectedPort -ne $Port) {
  Write-Host "요청 포트 $Port 사용 불가 -> 자동으로 $selectedPort 포트를 사용합니다." -ForegroundColor Yellow
}

& python -m http.server $selectedPort --bind 127.0.0.1
exit $LASTEXITCODE
