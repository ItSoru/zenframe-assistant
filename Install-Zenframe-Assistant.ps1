param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$destination = $null
$backup = $null
$copyStarted = $false
try {
    if ($env:OS -ne 'Windows_NT') { throw 'Zenframe Assistant supports Windows only.' }
    $packageRoot = [IO.Path]::GetFullPath($PSScriptRoot)
    $source = Join-Path $packageRoot 'com.zenframe.assistant'
    $hashList = Join-Path $packageRoot 'checksums.json'
    if (-not (Test-Path -LiteralPath $hashList -PathType Leaf)) { throw 'Extract the entire ZIP before running this installer.' }
    $entries = Get-Content -LiteralPath $hashList -Raw | ConvertFrom-Json
    if (@($entries).Count -lt 10) { throw 'Package checksum list is incomplete.' }
    foreach ($entry in $entries) {
        $file = [IO.Path]::GetFullPath((Join-Path $packageRoot $entry.path))
        if (-not $file.StartsWith($packageRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid package file path.' }
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw ('Package file missing: ' + $entry.path) }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Package file changed or corrupted: ' + $entry.path) }
    }
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $source 'CSXS\manifest.xml') -Raw
    if ($manifest.ExtensionManifest.ExtensionBundleId -ne 'com.zenframe.assistant') { throw 'Unexpected extension ID.' }
    Write-Host 'Package integrity verified.' -ForegroundColor Green
    if ($CheckOnly) { exit 0 }
    if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { throw 'Close After Effects and run the installer again.' }
    $cepRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions'))
    $destination = [IO.Path]::GetFullPath((Join-Path $cepRoot 'com.zenframe.assistant'))
    $backupRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZenframeAssistant\install-backups'))
    if ((Split-Path -Parent $destination) -ne $cepRoot) { throw 'Invalid installation path.' }
    New-Item -ItemType Directory -Path $cepRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    if (Test-Path -LiteralPath $destination) {
        [xml]$existing = Get-Content -LiteralPath (Join-Path $destination 'CSXS\manifest.xml') -Raw
        if ($existing.ExtensionManifest.ExtensionBundleId -ne 'com.zenframe.assistant') { throw 'Destination contains an unrelated extension.' }
        $backup = [IO.Path]::GetFullPath((Join-Path $backupRoot ('previous-' + [guid]::NewGuid().ToString('N'))))
        if ((Split-Path -Parent $backup) -ne $backupRoot) { throw 'Invalid backup path.' }
        Move-Item -LiteralPath $destination -Destination $backup
    }
    $copyStarted = $true
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
    # Remember the original PlayerDebugMode values once, so the uninstaller can restore them.
    $debugBackup = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZenframeAssistant\debug-mode-backup.json'))
    if (-not (Test-Path -LiteralPath $debugBackup)) {
        $previous = foreach ($version in 9..13) {
            $key = 'HKCU:\Software\Adobe\CSXS.' + $version
            $value = $null
            if (Test-Path -LiteralPath $key) { $value = (Get-ItemProperty -LiteralPath $key -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode }
            [pscustomobject]@{ Version = $version; Existed = ($null -ne $value); Value = $value }
        }
        ConvertTo-Json -InputObject @($previous) | Set-Content -LiteralPath $debugBackup -Encoding UTF8
    }
    foreach ($version in 9..13) {
        $key = 'HKCU:\Software\Adobe\CSXS.' + $version
        New-Item -Path $key -Force | Out-Null
        New-ItemProperty -LiteralPath $key -Name PlayerDebugMode -PropertyType String -Value '1' -Force | Out-Null
    }
    [pscustomobject]@{ InstalledAt=(Get-Date -Format o); ExtensionId='com.zenframe.assistant'; Version='1.5.2'; PreviousInstallBackup=$backup } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'installation-record.json') -Encoding UTF8
    Write-Host 'Zenframe Assistant installed.' -ForegroundColor Green
    Write-Host 'Open After Effects > Window > Extensions > Zenframe Assistant.'
    Write-Host 'Next: open Settings in the panel and choose your AI provider. See START-HERE.txt.'
    Write-Host 'This unsigned CEP panel enables per-user Adobe debug mode (CSXS 9-13).'
} catch {
    $problem = $_.Exception.Message
    if ($copyStarted -and $destination -and (Test-Path -LiteralPath $destination)) {
        $failed = [IO.Path]::GetFullPath((Join-Path $backupRoot ('incomplete-' + [guid]::NewGuid().ToString('N'))))
        if ((Split-Path -Parent $failed) -eq $backupRoot -and (Split-Path -Parent $destination) -eq $cepRoot) {
            try { Move-Item -LiteralPath $destination -Destination $failed } catch { Write-Host 'Could not archive the incomplete installation.' }
        }
    }
    if ($backup -and (Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $destination)) {
        try { Move-Item -LiteralPath $backup -Destination $destination; Write-Host 'Previous installation restored.' } catch { Write-Host ('Previous installation is preserved at: ' + $backup) }
    }
    Write-Host $problem -ForegroundColor Red
    exit 1
}
