Set-StrictMode -Version Latest

function Get-RepoRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptRoot
    )

    return (Resolve-Path (Join-Path $ScriptRoot '..')).Path
}

function Get-DefaultReleaseConfigPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    return (Join-Path $RepoRoot 'secrets\mobile_release.local.psd1')
}

function Resolve-ReleaseConfigPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [string]$ConfigPath
    )

    $candidatePath = if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
        Get-DefaultReleaseConfigPath -RepoRoot $RepoRoot
    }
    else {
        $ConfigPath
    }

    if (-not [System.IO.Path]::IsPathRooted($candidatePath)) {
        $candidatePath = Join-Path $RepoRoot $candidatePath
    }

    $resolved = Resolve-Path $candidatePath -ErrorAction SilentlyContinue
    if ($null -eq $resolved) {
        throw "Release config not found: $candidatePath`nCopy secrets/mobile_release.example.psd1 to secrets/mobile_release.local.psd1 and fill in the values."
    }

    return $resolved.Path
}

function Get-ReleaseConfig {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [string]$ConfigPath
    )

    $resolvedConfigPath = Resolve-ReleaseConfigPath -RepoRoot $RepoRoot -ConfigPath $ConfigPath
    $rawConfig = Import-PowerShellDataFile -Path $resolvedConfigPath
    if (-not ($rawConfig -is [hashtable])) {
        throw "Release config must be a PowerShell hashtable: $resolvedConfigPath"
    }

    $config = @{}
    foreach ($entry in $rawConfig.GetEnumerator()) {
        $value = if ($null -eq $entry.Value) { '' } else { [string]$entry.Value }
        $config[$entry.Key] = $value.Trim()
    }
    $config['__ConfigPath'] = $resolvedConfigPath
    return $config
}

function Resolve-ConfigRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [Parameter(Mandatory = $true)]
        [string]$ConfigFilePath
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ''
    }

    if ([System.IO.Path]::IsPathRooted($Value)) {
        return $Value
    }

    $configDir = Split-Path -Parent $ConfigFilePath
    return [System.IO.Path]::GetFullPath((Join-Path $configDir $Value))
}

function Assert-RequiredConfigKeys {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config,
        [Parameter(Mandatory = $true)]
        [string[]]$RequiredKeys
    )

    $missingKeys = @(
        foreach ($key in $RequiredKeys) {
            if ([string]::IsNullOrWhiteSpace($Config[$key])) {
                $key
            }
        }
    )

    if ($missingKeys.Count -gt 0) {
        throw "Missing required values in $($Config['__ConfigPath']): $($missingKeys -join ', ')"
    }
}

function Get-DartDefineArguments {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $defineKeys = @(
        'KAKAO_REST_API_KEY',
        'GOOGLE_PLACES_API_KEY',
        'NAVER_CLIENT_ID',
        'NAVER_CLIENT_SECRET',
        'NAVER_DAILY_QUOTA',
        'ADMOB_REWARDED_ANDROID_UNIT_ID',
        'ENABLE_HYBRID_DEBUG_LOGS'
    )

    $arguments = New-Object System.Collections.Generic.List[string]
    foreach ($key in $defineKeys) {
        $value = $Config[$key]
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }
        $arguments.Add("--dart-define=$key=$value")
    }

    if (-not $Config.ContainsKey('ENABLE_HYBRID_DEBUG_LOGS')) {
        $arguments.Add('--dart-define=ENABLE_HYBRID_DEBUG_LOGS=false')
    }

    return $arguments.ToArray()
}

function Get-SafeFlutterCommandPreview {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $preview = foreach ($arg in $Arguments) {
        if ($arg -like '--dart-define=*') {
            $keyValue = $arg.Substring('--dart-define='.Length)
            $separatorIndex = $keyValue.IndexOf('=')
            if ($separatorIndex -ge 0) {
                $key = $keyValue.Substring(0, $separatorIndex)
                "--dart-define=$key=<redacted>"
            }
            else {
                '--dart-define=<redacted>'
            }
        }
        else {
            $arg
        }
    }

    return "flutter $($preview -join ' ')"
}

function Invoke-FlutterReleaseBuild {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectDir,
        [Parameter(Mandatory = $true)]
        [ValidateSet('apk', 'appbundle')]
        [string]$Target,
        [ValidateSet('release', 'profile', 'debug')]
        [string]$Mode = 'release',
        [string]$ConfigPath,
        [string[]]$ExtraFlutterArgs = @()
    )

    $resolvedProjectDir = (Resolve-Path $ProjectDir).Path
    $config = Get-ReleaseConfig -RepoRoot $resolvedProjectDir -ConfigPath $ConfigPath
    Assert-RequiredConfigKeys -Config $config -RequiredKeys @(
        'KEYSTORE_PATH',
        'KEYSTORE_PASSWORD',
        'KEY_ALIAS',
        'KEY_PASSWORD',
        'ADMOB_APP_ID'
    )

    if ([string]::IsNullOrWhiteSpace($config['KAKAO_REST_API_KEY'])) {
        Write-Warning 'KAKAO_REST_API_KEY is empty. Store search will not work correctly.'
    }
    if ([string]::IsNullOrWhiteSpace($config['ADMOB_REWARDED_ANDROID_UNIT_ID'])) {
        Write-Warning 'ADMOB_REWARDED_ANDROID_UNIT_ID is empty. Rewarded ads will use the in-app fallback if that path is ever enabled.'
    }

    $envKeys = @(
        'KEYSTORE_PATH',
        'KEYSTORE_PASSWORD',
        'KEY_ALIAS',
        'KEY_PASSWORD',
        'ADMOB_APP_ID'
    )
    $savedEnv = @{}
    foreach ($key in $envKeys) {
        $savedEnv[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
        $value = $config[$key]
        if ($key -eq 'KEYSTORE_PATH') {
            $value = Resolve-ConfigRelativePath -Value $value -ConfigFilePath $config['__ConfigPath']
        }
        [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }

    $flutterArgs = New-Object System.Collections.Generic.List[string]
    $flutterArgs.Add('build')
    $flutterArgs.Add($Target)
    $flutterArgs.Add("--$Mode")
    foreach ($arg in (Get-DartDefineArguments -Config $config)) {
        $flutterArgs.Add($arg)
    }
    foreach ($arg in $ExtraFlutterArgs) {
        if (-not [string]::IsNullOrWhiteSpace($arg)) {
            $flutterArgs.Add($arg)
        }
    }

    Push-Location $resolvedProjectDir
    try {
        Write-Host "Using release config: $($config['__ConfigPath'])"
        Write-Host "Running: $(Get-SafeFlutterCommandPreview -Arguments $flutterArgs.ToArray())"
        & flutter @flutterArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Flutter build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
        foreach ($key in $envKeys) {
            [System.Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process')
        }
    }

    return $config
}
