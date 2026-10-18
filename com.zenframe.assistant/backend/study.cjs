'use strict';
// Zenframe Assistant 1.4.0: study an .aep project file without opening it in After Effects.
// Runs backend/aep_study.py with the user's Python and the open-source py-aep library (read-only parsing),
// then lines the clip changes up with the music when the song files are found next to the project.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const SCRIPT = path.join(__dirname, 'aep_study.py');
const TIMEOUT_MS = 6 * 60 * 1000;

function run(cmd, args, opts) {
  return new Promise(resolve => {
    cp.execFile(cmd, args, Object.assign({ windowsHide: true, maxBuffer: 30 * 1024 * 1024, timeout: TIMEOUT_MS }, opts || {}), (err, stdout, stderr) =>
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

// Python candidates: the one picked in Settings, the Windows launcher, then python / python3 on PATH.
function candidates(settings) {
  const list = [];
  if (settings && settings.pythonPath) list.push([settings.pythonPath, []]);
  if (process.platform === 'win32') list.push(['py', ['-3']]);
  list.push(['python', []], ['python3', []]);
  return list;
}
async function findPython(settings) {
  for (const [cmd, pre] of candidates(settings)) {
    const r = await run(cmd, pre.concat(['-c', 'import sys; print(sys.version_info[0], sys.version_info[1])']), { timeout: 15000 });
    const m = !r.err && /^(\d+) (\d+)/.exec(r.stdout.trim());
    if (m && Number(m[1]) === 3 && Number(m[2]) >= 8) return { cmd, pre, version: m[1] + '.' + m[2] };
  }
  return null;
}
async function status(settings) {
  const py = await findPython(settings);
  if (!py) return { python: false, library: false, message: 'Python 3 is not installed. Get it from python.org (tick "Add python.exe to PATH"), then click Install here.' };
  const r = await run(py.cmd, py.pre.concat(['-c', 'import py_aep; print("ok")']), { timeout: 30000 });
  const ok = !r.err && /ok/.test(r.stdout);
  return { python: py.version, library: ok, message: ok ? 'Ready: Zeni can study .aep project files (Python ' + py.version + ').' : 'Python ' + py.version + ' found. Click Install to add the project reader (py-aep).' };
}
async function install(settings) {
  const py = await findPython(settings);
  if (!py) throw new Error('Python 3 is not installed. Get it from python.org (tick "Add python.exe to PATH"), then try again.');
  const r = await run(py.cmd, py.pre.concat(['-m', 'pip', 'install', '--user', '--upgrade', 'py-aep']), { timeout: 10 * 60 * 1000 });
  if (r.err) throw new Error('Installing py-aep failed: ' + (r.stderr || r.err.message).trim().split('\n').slice(-3).join(' ').slice(0, 300));
  return status(settings);
}

// Song files in projects point at the editor's own drives; find them by name inside the project's folder.
function indexFolder(root, limit) {
  const map = new Map(); let seen = 0;
  (function walk(dir, depth) {
    if (depth > 5 || seen > limit) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (++seen > limit) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/\.(mp3|wav|m4a|aac|flac|ogg|aif|aiff|mp4|mov)$/i.test(e.name) && !map.has(e.name.toLowerCase())) map.set(e.name.toLowerCase(), full);
    }
  })(root, 0);
  return map;
}
function locate(file, root, index) {
  if (file && fs.existsSync(file)) return file;
  const base = String(file || '').split(/[\\/]/).pop().toLowerCase();
  return index.get(base) || null;
}

// Pure (tested): how the clip changes sit against each music layer's beat grid.
function syncReport(cuts, music, fps) {
  const fr = 1 / fps, rows = [];
  for (const t of cuts) {
    const m = music.find(x => t >= x.in - 1e-6 && t <= x.out + 1e-6);
    if (!m) continue;
    const k = m.stretch / 100, per = m.grid.period * k, first = m.start + m.grid.offset * k;
    const off = div => { const x = (t - first) / (per / div); return (x - Math.round(x)) * (per / div) / fr; };
    rows.push({ t, beat: off(1), half: off(2) });
  }
  if (!rows.length) return null;
  const within = (key, f) => rows.filter(r => Math.abs(r[key]) <= f).length;
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const halfOffsets = rows.map(r => r.half);
  return {
    cutsChecked: rows.length,
    onBeatWithin1Frame: within('beat', 1),
    onHalfBeatWithin1Frame: within('half', 1),
    medianFramesFromHalfBeat: Math.round(median(halfOffsets) * 10) / 10,
    spreadFrames: Math.round((median(halfOffsets.map(x => Math.abs(x - median(halfOffsets)))) || 0) * 10) / 10,
    note: 'A steady offset with a small spread means the cuts follow the grid (the detected beat phase can be a frame or two off, or the editor cuts slightly early on purpose).'
  };
}

async function studyProject(args, settings, analyzeAudioFile) {
  const file = String(args.path || '').trim().replace(/^"|"$/g, '');
  if (!/\.aep$/i.test(file)) return { error: 'Give the full path of an .aep project file.' };
  if (!fs.existsSync(file)) return { error: 'That project file was not found: ' + file };
  const py = await findPython(settings);
  if (!py) return { error: 'Studying project files needs Python 3. The user can install it from python.org, then click Install in Settings > Project files.' };
  const mode = ['overview', 'comp', 'keys'].includes(args.mode) ? args.mode : 'overview';
  const a = py.pre.concat([SCRIPT, file, mode]);
  if (args.comp) a.push(String(args.comp).slice(0, 200));
  const r = await run(py.cmd, a, { env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
  if (r.err && r.err.killed) return { error: 'Reading this project took too long.' };
  let out;
  try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { error: 'The project reader failed: ' + (r.stderr || r.stdout || (r.err && r.err.message) || '').trim().split('\n').slice(-2).join(' ').slice(0, 300) }; }
  if (out.error === 'missing-library') return { error: 'The project reader is not installed yet. Ask the user to open Settings > Project files and click Install (it adds the py-aep Python library).' };
  if (out.error || mode !== 'overview') return out;
  // Line the clip changes up with the music, when the song files can be found.
  if (typeof analyzeAudioFile === 'function' && out.audio && out.audio.longest && out.clipChanges) {
    const index = indexFolder(path.dirname(file), 20000), music = [], missing = [];
    for (const l of out.audio.longest.filter(x => x.out - x.in >= 6).slice(0, 4)) {
      const found = locate(l.file, path.dirname(file), index);
      if (!found) { missing.push(l.name); continue; }
      try {
        const g = await analyzeAudioFile(found);
        if (g && g.period) music.push({ name: l.name, start: l.start, in: l.in, out: l.out, stretch: l.stretch, grid: g });
      } catch (e) { missing.push(l.name); }
    }
    if (music.length) {
      out.music = music.map(m => ({ layer: m.name, bpmInComp: Math.round(m.grid.bpm / (m.stretch / 100) * 100) / 100, from: m.in, to: m.out }));
      out.sync = syncReport(out.clipChanges.times || [], music, out.mainComp.fps);
    }
    if (missing.length) out.musicNotFound = missing;
  }
  return out;
}

module.exports = { studyProject, status, install, syncReport, findPython };
