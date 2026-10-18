'use strict';
// Zenframe Assistant 1.3.0: After Effects' playback level, for Zeni's dancing (see AudioMeter.cs).
// start(onLine) runs the small Windows helper and calls onLine({peak}) / onLine({sessions}) / onLine({ready}) /
// onLine({ended}). Returns a stop() function. Windows only; elsewhere it reports ended at once.
const path = require('path');
const { spawn } = require('child_process');

function start(onLine, opts = {}) {
  const spawnFn = opts.spawn || spawn;
  if ((opts.platform || process.platform) !== 'win32') { setTimeout(() => onLine({ ended: true, reason: 'not windows' }), 0); return () => {}; }
  const cs = path.join(__dirname, 'AudioMeter.cs');
  const script = '$ErrorActionPreference = "Stop"; Add-Type -Path $env:ZENFRAME_METER_CS; [Zenframe.AudioMeter]::Run()';
  let child, buf = '', done = false, err = '';
  try {
    child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: Object.assign({}, process.env, { ZENFRAME_METER_CS: cs }), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) { setTimeout(() => onLine({ ended: true, reason: e.message }), 0); return () => {}; }
  const end = reason => { if (done) return; done = true; onLine({ ended: true, reason }); };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line === 'ready') onLine({ ready: true });
      else if (line.startsWith('p ')) { const v = parseFloat(line.slice(2)); if (isFinite(v)) onLine({ peak: v }); }
      else if (line.startsWith('sessions ')) onLine({ sessions: parseInt(line.slice(9), 10) || 0 });
    }
  });
  child.stderr.on('data', d => { if (err.length < 2000) err += d; });
  child.on('error', e => end(e.message));
  child.on('exit', code => end(String(err || 'exit ' + code).trim().slice(0, 300)));
  return () => { if (done) return; done = true; try { child.stdin.end(); } catch (e) {} try { child.kill(); } catch (e) {} };
}

module.exports = { start };
