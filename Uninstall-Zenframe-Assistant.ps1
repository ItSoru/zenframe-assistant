$ErrorActionPreference = 'Stop'
try {
    if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { throw 'Close After Effects before uninstalling.' }
    $cepRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions'))
    $target = [IO.Path]::GetFullPath((Join-Path $cepRoot 'com.zenframe.assistant'))
    if ((Split-Path -Parent $target) -ne $cepRoot) { throw 'Invalid extension path.' }
    if (-not (Test-Path -LiteralPath $target)) { Write-Host 'Zenframe Assistant is not installed for this Windows user.'; exit 0 }
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $target 'CSXS\manifest.xml') -Raw
    if ($manifest.ExtensionManifest.ExtensionBundleId -ne 'com.zenframe.assistant') { throw 'Unexpected extension ID; nothing was removed.' }
    $archiveRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZenframeAssistant\install-backups'))
    $archive = [IO.Path]::GetFullPath((Join-Path $archiveRoot ('uninstalled-' + [guid]::NewGuid().ToString('N'))))
    if ((Split-Path -Parent $archive) -ne $archiveRoot) { throw 'Invalid archive path.' }
    New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
    Move-Item -LiteralPath $target -Destination $archive
    Write-Host 'Zenframe Assistant uninstalled. A recoverable copy was saved at:' -ForegroundColor Green
    Write-Host $archive
    $debugBackup = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZenframeAssistant\debug-mode-backup.json'))
    if (Test-Path -LiteralPath $debugBackup) {
        Write-Host ''
        Write-Host 'Zenframe turned on Adobe debug mode so unsigned panels can load.'
        Write-Host 'Restoring it can stop OTHER unsigned panels you use from loading.'
        $answer = Read-Host 'Restore Adobe debug mode to how it was before Zenframe? (y/N)'
        if ($answer -match '^(y|yes)$') {
            foreach ($entry in @(Get-Content -LiteralPath $debugBackup -Raw | ConvertFrom-Json)) {
                $key = 'HKCU:\Software\Adobe\CSXS.' + [int]$entry.Version
                if ($entry.Existed) {
                    New-Item -Path $key -Force | Out-Null
                    New-ItemProperty -LiteralPath $key -Name PlayerDebugMode -PropertyType String -Value ([string]$entry.Value) -Force | Out-Null
                } elseif (Test-Path -LiteralPath $key) {
                    Remove-ItemProperty -LiteralPath $key -Name PlayerDebugMode -ErrorAction SilentlyContinue
                }
            }
            Remove-Item -LiteralPath $debugBackup
            Write-Host 'Adobe debug mode settings restored.' -ForegroundColor Green
        } else {
            Write-Host 'Adobe debug mode left as is.'
        }
    }
    $keyDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZenframeAssistant\credentials'))
    $keyFiles = @(Get-ChildItem -LiteralPath $keyDir -Filter '*-key.dpapi' -File -ErrorAction SilentlyContinue)
    if ($keyFiles.Count -gt 0) {
        $answer = Read-Host ('Delete your ' + $keyFiles.Count + ' saved (encrypted) AI provider key(s) from this computer? (Y/n)')
        if ($answer -notmatch '^(n|no)$') { $keyFiles | Remove-Item; Write-Host 'Saved API keys deleted.' -ForegroundColor Green }
    }
    Write-Host 'Panel preferences and your Claude Code login (if any) were left unchanged.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
