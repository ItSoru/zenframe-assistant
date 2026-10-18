'use strict';
// Zenframe Assistant 1.2.0+: finds what the user has installed for After Effects, so Zeni can list it,
// open panels, run scripts (always after approval) and apply presets. Only reads folders; never changes them.
//  - CEP panels: manifests in the per-user and all-users CEP extension folders (After Effects only).
//  - ScriptUI panels and scripts: After Effects' own Scripts folder and the per-user Scripts folder.
//  - Presets (.ffx): After Effects' Presets folder and Documents\Adobe\After Effects <year>\User Presets.
const fs = require('fs');
const path = require('path');

const MAX_FILES = 20000;
const SKIP_SCRIPT_DIRS = /^(startup|shutdown|scriptui panels|\(.*\))$/i;
const SELF = /^com\.zenframe\.assistant/i;

async function dirents(dir) {
  try { return await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return []; }
}
async function isDir(p) { try { return (await fs.promises.stat(p)).isDirectory(); } catch (e) { return false; } }

// Files with a matching extension under dir, down to `depth` folder levels.
async function walk(dir, re, depth, out, skipDir) {
  const list = await dirents(dir);
  for (const d of list) {
    if (out.length >= MAX_FILES) return out;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { if (depth > 0 && !(skipDir && skipDir.test(d.name))) await walk(full, re, depth - 1, out, skipDir); }
    else if (re.test(d.name)) out.push(full);
  }
  return out;
}

function unxml(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}
// Panels an extension manifest adds to After Effects' Window > Extensions menu.
function parseManifest(xml) {
  xml = String(xml).replace(/<!--[\s\S]*?-->/g, '');
  const bundle = unxml((/ExtensionBundleName="([^"]*)"/.exec(xml) || [])[1]);
  const top = (/<ExecutionEnvironment>[\s\S]*?<HostList>([\s\S]*?)<\/HostList>/.exec(xml) || [])[1] || '';
  const forAE = s => /Name="AEFT"/i.test(s);
  const panels = [];
  const dispatch = (/<DispatchInfoList>([\s\S]*?)<\/DispatchInfoList>/.exec(xml) || [])[1] || '';
  const re = /<Extension\s+Id="([^"]+)"[^>]*?>([\s\S]*?)<\/Extension>/g;
  let m;
  while ((m = re.exec(dispatch))) {
    const id = m[1], body = m[2];
    const own = (/<HostList>([\s\S]*?)<\/HostList>/.exec(body) || [])[1];
    if (!(own ? forAE(own) : forAE(top))) continue;
    const type = unxml((/<Type>([\s\S]*?)<\/Type>/.exec(body) || [])[1]);
    const menu = unxml((/<Menu[^>]*>([\s\S]*?)<\/Menu>/.exec(body) || [])[1]);
    if (!/^(Panel|Modeless|ModalDialog)$/i.test(type) || !menu) continue; // hidden helpers have no menu
    panels.push({ id, name: /^%/.test(menu) ? (bundle && !/^%/.test(bundle) ? bundle : id) : menu });
  }
  return panels;
}

function aeVersion(info) {
  const m = /^(\d+)\.(\d+)/.exec(String(info.version || ''));
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

function roots(info, env) {
  env = env || process.env;
  const v = aeVersion(info);
  const app = info.appFolder || '';
  const cep = [
    env.APPDATA && path.join(env.APPDATA, 'Adobe', 'CEP', 'extensions'),
    path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Common Files', 'Adobe', 'CEP', 'extensions'),
    path.join(env.ProgramFiles || 'C:\\Program Files', 'Common Files', 'Adobe', 'CEP', 'extensions')
  ].filter(Boolean);
  return {
    cep: [...new Set(cep)],
    scripts: [app && path.join(app, 'Scripts')].filter(Boolean),
    userScriptsBase: env.APPDATA ? path.join(env.APPDATA, 'Adobe', 'After Effects') : '',
    presets: [app && path.join(app, 'Presets')].filter(Boolean),
    documents: info.documents || (env.USERPROFILE ? path.join(env.USERPROFILE, 'Documents') : ''),
    version: v
  };
}

async function scan(info, env) {
  const r = roots(info, env);
  const panels = [], scripts = [], presets = [], seen = new Set();
  const add = (list, item) => { const k = (item.kind + '|' + (item.path || item.id)).toLowerCase(); if (!seen.has(k)) { seen.add(k); list.push(item); } };

  for (const base of r.cep) {
    for (const d of await dirents(base)) {
      if (!d.isDirectory() && !d.isSymbolicLink()) continue;
      let xml;
      try { xml = await fs.promises.readFile(path.join(base, d.name, 'CSXS', 'manifest.xml'), 'utf8'); } catch (e) { continue; }
      for (const p of parseManifest(xml)) if (!SELF.test(p.id)) add(panels, { kind: 'panel', type: 'extension', name: p.name, id: 'cep:' + p.id, folder: d.name });
    }
  }

  // The per-user Scripts folder lives under %APPDATA%\Adobe\After Effects\<major.minor>.
  const scriptRoots = r.scripts.slice();
  if (r.userScriptsBase && r.version) {
    for (const d of await dirents(r.userScriptsBase)) {
      if (d.isDirectory() && new RegExp('^' + r.version.major + '\\.\\d+$').test(d.name)) scriptRoots.push(path.join(r.userScriptsBase, d.name, 'Scripts'));
    }
  }
  const SCRIPT = /\.(jsx|jsxbin)$/i;
  for (const root of scriptRoots) {
    for (const f of await walk(path.join(root, 'ScriptUI Panels'), SCRIPT, 1, [])) {
      add(panels, { kind: 'panel', type: 'scriptui', name: path.basename(f).replace(SCRIPT, ''), id: 'scriptui:' + f, path: f });
    }
    for (const f of await walk(root, SCRIPT, 1, [], SKIP_SCRIPT_DIRS)) {
      add(scripts, { kind: 'script', name: path.basename(f).replace(SCRIPT, ''), path: f, folder: path.relative(root, path.dirname(f)) || 'Scripts' });
    }
  }

  const presetRoots = r.presets.slice();
  if (r.documents) {
    const adobe = path.join(r.documents, 'Adobe');
    const exact = r.version && path.join(adobe, 'After Effects ' + (2000 + r.version.major), 'User Presets');
    if (exact && await isDir(exact)) presetRoots.push(exact);
    else for (const d of await dirents(adobe)) if (d.isDirectory() && /^After Effects \d{4}$/.test(d.name)) presetRoots.push(path.join(adobe, d.name, 'User Presets'));
  }
  for (const root of presetRoots) {
    const label = /User Presets$/i.test(root) ? 'User Presets' : 'Presets';
    for (const f of await walk(root, /\.ffx$/i, 6, [])) {
      const rel = path.relative(root, path.dirname(f));
      add(presets, { kind: 'preset', name: path.basename(f).replace(/\.ffx$/i, ''), path: f, folder: rel ? label + '/' + rel.split(path.sep).join('/') : label });
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return { panels: panels.sort(byName), scripts: scripts.sort(byName), presets: presets.sort(byName) };
}

// Paged, searchable listing for the AI.
function list(all, args) {
  args = args || {};
  const PAGE = 100;
  const kinds = { panels: 'panels', scripts: 'scripts', presets: 'presets' };
  let items = args.kind && kinds[args.kind] ? all[kinds[args.kind]] : all.panels.concat(all.scripts, all.presets);
  const words = String(args.query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) items = items.filter(i => { const s = (i.name + ' ' + (i.folder || '') + ' ' + (i.type || '')).toLowerCase(); return words.every(w => s.includes(w)); });
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const out = {
    counts: { panels: all.panels.length, scripts: all.scripts.length, presets: all.presets.length },
    total: items.length, offset,
    items: items.slice(offset, offset + PAGE).map(i => {
      const o = { kind: i.kind, name: i.name };
      if (i.kind === 'panel') { o.id = i.id; o.type = i.type; } else { o.path = i.path; o.folder = i.folder; }
      return o;
    })
  };
  if (offset + PAGE < items.length) out.nextOffset = offset + PAGE;
  return out;
}

const key = p => path.resolve(String(p || '')).toLowerCase();
function findPath(all, kind, p) {
  const k = key(p);
  return (all[kind] || []).find(i => i.path && key(i.path) === k) || null;
}
function findPanel(all, id) {
  return all.panels.find(i => i.id === id) || (/^scriptui:/.test(String(id)) ? all.panels.find(i => i.path && key(i.path) === key(String(id).slice(9))) : null) || null;
}

module.exports = { scan, list, parseManifest, findPath, findPanel, roots };
