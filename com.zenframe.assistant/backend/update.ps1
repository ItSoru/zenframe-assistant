# Zenframe Assistant updater, v1.5.2.
# Downloads the latest release from the official GitHub repository, checks it,
# and installs it with the release's own installer once After Effects is closed.
#   -Panel       started by the panel's Update button: no prompts, waits for After Effects
#                to close, then reopens it after installing.
#   -StatusFile  JSON file the panel reads to show progress.
param([switch]$Panel, [string]$StatusFile)
$ErrorActionPreference = 'Stop'
$Repo = 'ItSoru/zenframe-assistant'
$work = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZenframeAssistant\updates'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$log = Join-Path $work 'update-log.txt'

function Say([string]$text, [string]$color = 'Gray') {
    Write-Host $text -ForegroundColor $color
    Add-Content -LiteralPath $log -Value ((Get-Date -Format s) + '  ' + $text) -Encoding UTF8
}
function Status([string]$state, [string]$message, [string]$version = '') {
    if (-not $StatusFile) { return }
    [pscustomobject]@{ state = $state; message = $message; version = $version; at = (Get-Date -Format o) } |
        ConvertTo-Json | Set-Content -LiteralPath $StatusFile -Encoding UTF8
}
function VersionOf([string]$text) {
    $m = [regex]::Match([string]$text, '(\d+)\.(\d+)\.(\d+)')
    if (-not $m.Success) { return $null }
    return [version]('{0}.{1}.{2}' -f $m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value)
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Zenframe Assistant supports Windows only.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $aePath = $null
    if ($Panel) { $ae = Get-Process -Name AfterFX -ErrorAction SilentlyContinue | Select-Object -First 1; if ($ae) { $aePath = $ae.Path } }

    Status 'checking' 'Checking for a new version...'
    Say 'Checking for a new version...'
    $headers = @{ 'User-Agent' = 'Zenframe-Assistant-Updater'; 'Accept' = 'application/vnd.github+json' }
    $release = Invoke-RestMethod -Uri ('https://api.github.com/repos/' + $Repo + '/releases/latest') -Headers $headers -UseBasicParsing
    $latest = VersionOf $release.tag_name
    if (-not $latest) { throw 'Could not read the latest version number.' }

    $manifestPath = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.zenframe.assistant\CSXS\manifest.xml'
    $installed = $null
    if (Test-Path -LiteralPath $manifestPath) { [xml]$mf = Get-Content -LiteralPath $manifestPath -Raw; $installed = VersionOf $mf.ExtensionManifest.ExtensionBundleVersion }
    if ($installed -and $installed -ge $latest) {
        Status 'current' ('Zenframe Assistant ' + $installed + ' is the latest version.') ([string]$installed)
        Say ('You already have the latest version (' + $installed + ').') 'Green'
        exit 0
    }

    $asset = @($release.assets | Where-Object { $_.name -match '^Zenframe-Assistant-[\d.]+\.zip$' }) | Select-Object -First 1
    if (-not $asset) { throw 'The latest release has no install ZIP.' }
    $prefix = 'https://github.com/' + $Repo + '/releases/download/'
    if (-not ([string]$asset.browser_download_url).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'The download link is not from the official repository.' }
    if ($asset.size -gt 100MB) { throw 'The download is unexpectedly large.' }

    $folder = [IO.Path]::GetFullPath((Join-Path $work ([string]$latest)))
    if (Test-Path -LiteralPath $folder) { Remove-Item -LiteralPath $folder -Recurse -Force }
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $zip = Join-Path $folder $asset.name

    Status 'downloading' ('Downloading ' + $latest + '...') ([string]$latest)
    Say ('Downloading Zenframe Assistant ' + $latest + '...')
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers @{ 'User-Agent' = 'Zenframe-Assistant-Updater' } -UseBasicParsing
    if ($asset.digest -and ([string]$asset.digest).StartsWith('sha256:')) {
        $want = ([string]$asset.digest).Substring(7).ToUpperInvariant()
        if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $want) { throw 'The download did not match the published checksum.' }
    }

    Status 'checking-package' 'Checking the package...' ([string]$latest)
    Expand-Archive -LiteralPath $zip -DestinationPath $folder -Force
    $installer = Get-ChildItem -LiteralPath $folder -Recurse -Filter 'Install-Zenframe-Assistant.ps1' | Select-Object -First 1
    if (-not $installer) { throw 'The package has no installer.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer.FullName -CheckOnly | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The package failed its integrity check.' }
    Say 'Package verified.' 'Green'

    if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) {
        Status 'ready' ('Version ' + $latest + ' is ready. Close After Effects to install it.') ([string]$latest)
        Say 'Close After Effects to finish. The update installs as soon as it closes.' 'Yellow'
        while (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 2 }
        Start-Sleep -Seconds 2
    }

    Status 'installing' ('Installing ' + $latest + '...') ([string]$latest)
    Say ('Installing ' + $latest + '...')
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer.FullName | ForEach-Object { Say ([string]$_) }
    if ($LASTEXITCODE -ne 0) { throw 'The installer stopped. Your previous version was kept.' }

    Status 'done' ('Zenframe Assistant ' + $latest + ' is installed.') ([string]$latest)
    Say ('Zenframe Assistant ' + $latest + ' is installed.') 'Green'
    if ($aePath -and (Test-Path -LiteralPath $aePath)) { Say 'Reopening After Effects...'; Start-Process -FilePath $aePath }
    exit 0
} catch {
    $problem = $_.Exception.Message
    Status 'error' $problem
    Say $problem 'Red'
    exit 1
}
