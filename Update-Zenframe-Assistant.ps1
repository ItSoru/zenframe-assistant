# Zenframe Assistant updater, v1.5.2.
# Replaces the installed Zenframe Assistant with the version in this folder.
# Your settings, conversations and saved keys are kept. If After Effects is open,
# the update waits until you close it, installs, then reopens After Effects.
$ErrorActionPreference = 'Stop'
function VersionOf([string]$text) {
    $m = [regex]::Match([string]$text, '(\d+)\.(\d+)\.(\d+)')
    if (-not $m.Success) { return $null }
    return [version]('{0}.{1}.{2}' -f $m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value)
}
try {
    if ($env:OS -ne 'Windows_NT') { throw 'Zenframe Assistant supports Windows only.' }
    $packageRoot = [IO.Path]::GetFullPath($PSScriptRoot)
    $installer = Join-Path $packageRoot 'Install-Zenframe-Assistant.ps1'
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Extract the entire ZIP before running this updater.' }
    [xml]$newManifest = Get-Content -LiteralPath (Join-Path $packageRoot 'com.zenframe.assistant\CSXS\manifest.xml') -Raw
    $newVersion = VersionOf $newManifest.ExtensionManifest.ExtensionBundleVersion
    $installedManifest = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.zenframe.assistant\CSXS\manifest.xml'
    $oldVersion = $null
    if (Test-Path -LiteralPath $installedManifest) { [xml]$old = Get-Content -LiteralPath $installedManifest -Raw; $oldVersion = VersionOf $old.ExtensionManifest.ExtensionBundleVersion }

    if (-not $oldVersion) { Write-Host ('Zenframe Assistant is not installed yet. Installing ' + $newVersion + '.') }
    elseif ($oldVersion -lt $newVersion) { Write-Host ('Updating Zenframe Assistant ' + $oldVersion + ' to ' + $newVersion + '.') }
    elseif ($oldVersion -eq $newVersion) { Write-Host ('Version ' + $newVersion + ' is already installed. Reinstalling it.') }
    else {
        Write-Host ('The installed version (' + $oldVersion + ') is newer than this one (' + $newVersion + ').') -ForegroundColor Yellow
        $answer = Read-Host 'Replace it with the older version? Type Y to continue'
        if ($answer -notmatch '^[Yy]') { Write-Host 'Nothing was changed.'; exit 0 }
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -CheckOnly
    if ($LASTEXITCODE -ne 0) { throw 'This package failed its integrity check. Download it again.' }

    $aePath = $null
    $ae = Get-Process -Name AfterFX -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ae) {
        $aePath = $ae.Path
        Write-Host ''
        Write-Host 'After Effects is open. Save your project and close After Effects.' -ForegroundColor Yellow
        Write-Host 'The update installs as soon as it closes, then After Effects reopens.' -ForegroundColor Yellow
        while (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 2 }
        Start-Sleep -Seconds 2
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
    if ($LASTEXITCODE -ne 0) { throw 'The update stopped. Your previous version was kept.' }
    Write-Host ''
    Write-Host ('Zenframe Assistant ' + $newVersion + ' is ready.') -ForegroundColor Green
    if ($aePath -and (Test-Path -LiteralPath $aePath)) { Write-Host 'Reopening After Effects...'; Start-Process -FilePath $aePath }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
