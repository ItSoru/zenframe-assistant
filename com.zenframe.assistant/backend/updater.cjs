'use strict';
// 1.5.2: one-click updates from the official GitHub releases.
// check() asks GitHub for the latest release. start() copies update.ps1 out of the
// extension folder (the install replaces that folder) and runs it in the background:
// it downloads and verifies the new version, waits for After Effects to close,
// installs it, then reopens After Effects. Progress is written to a status file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const cp = require('child_process');

const REPO = 'ItSoru/zenframe-assistant';

function workDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'ZenframeAssistant', 'updates');
}
function statusPath() { return path.join(workDir(), 'status.json'); }

function parse(v) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function newer(a, b) {
  const x = parse(a), y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
  return false;
}

function latestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get({
      host: 'api.github.com',
      path: '/repos/' + REPO + '/releases/latest',
      headers: { 'User-Agent': 'Zenframe-Assistant', Accept: 'application/vnd.github+json' },
      timeout: 15000
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; if (body.length > 2e6) req.destroy(); });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('GitHub answered ' + res.statusCode + '. Try again later.'));
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Could not read the release information.')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('GitHub did not answer in time.')));
    req.on('error', e => reject(new Error('Could not reach GitHub: ' + e.message)));
  });
}

// Returns { available, current, latest, notes, url }.
async function check(current) {
  const rel = await latestRelease();
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  const hasZip = (rel.assets || []).some(a => /^Zenframe-Assistant-[\d.]+\.zip$/.test(a.name));
  return { available: hasZip && newer(latest, current), current, latest, notes: String(rel.body || '').slice(0, 4000), url: rel.html_url || '' };
}

function readStatus() {
  try { return JSON.parse(fs.readFileSync(statusPath(), 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return null; }
}

// Starts the background updater. extensionRoot is the panel's own folder.
function start(extensionRoot) {
  if (process.platform !== 'win32') throw new Error('Updates are Windows only.');
  const dir = workDir();
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'update.ps1');
  fs.copyFileSync(path.join(extensionRoot, 'backend', 'update.ps1'), script);
  try { fs.unlinkSync(statusPath()); } catch (e) { /* none yet */ }
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Launched through Windows (WMI) so it keeps running after After Effects, and this
  // panel with it, closes. Paths travel in environment variables, never inside the command text.
  const launcher =
    "$cl = '\"' + $env:ZF_PS + '\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $env:ZF_SCRIPT + '\" -Panel -StatusFile \"' + $env:ZF_STATUS + '\"';" +
    "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 };" +
    "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cl; ProcessStartupInformation = $si };" +
    "if ($r.ReturnValue -ne 0) { exit 1 }";
  const env = Object.assign({}, process.env, { ZF_PS: ps, ZF_SCRIPT: script, ZF_STATUS: statusPath() });
  const r = cp.spawnSync(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', launcher],
    { env, windowsHide: true, timeout: 30000 });
  if (r.status !== 0) throw new Error('Windows did not start the updater.');
  return statusPath();
}

module.exports = { check, start, readStatus, newer };
