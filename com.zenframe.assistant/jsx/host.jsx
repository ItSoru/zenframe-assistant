/* Zenframe Assistant host bridge, v1.0.9. ES3 for After Effects ExtendScript. */
var ZenframeAssistant = (function () {

  var effectCache = null;
  function installedEffects() {
    if (effectCache) return effectCache;
    var all = app.effects, n = all.length, out = [], k, e, mn, nm, cat;
    for (k = 0; k < n; k++) {
      e = all[k]; mn = String(e.matchName); nm = String(e.displayName); cat = String(e.category);
      out.push({ name: nm, matchName: mn, category: cat, search: (nm + ' ' + mn + ' ' + cat).toLowerCase(),
        thirdParty: !/^(ADBE|ADOBE|AE\.ADBE|CC |APC |CS |ISL |VISINF|Mettle |CINEMA 4D|Cryptomatte)/i.test(mn) });
    }
    effectCache = out;
    return out;
  }

  /* ---------- JSON (ExtendScript has no reliable JSON global) ---------- */
  function quote(s) {
    return '"' + String(s)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\x00-\x1f\u2028\u2029]/g, function (c) {
        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
      }) + '"';
  }
  function json(v) {
    var a = [], k, i;
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return quote(v);
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
    if (typeof v === 'boolean') return String(v);
    if (v instanceof Array) {
      for (i = 0; i < v.length; i++) a.push(json(v[i]));
      return '[' + a.join(',') + ']';
    }
    for (k in v) if (v.hasOwnProperty(k)) a.push(quote(k) + ':' + json(v[k]));
    return '{' + a.join(',') + '}';
  }
  // Strict JSON parser: never evaluates code, so tool arguments cannot run script.
  function parseJSON(text) {
    var at = 0, ch = ' ';
    function err(m) { throw new Error('Invalid request data: ' + m); }
    function next() { ch = text.charAt(at); at += 1; return ch; }
    function white() { while (ch && ch <= ' ') next(); }
    function word(w, value) {
      for (var i = 0; i < w.length; i++) { if (ch !== w.charAt(i)) err('unexpected ' + ch); next(); }
      return value;
    }
    function number() {
      var s = '';
      if (ch === '-') { s = '-'; next(); }
      while (ch >= '0' && ch <= '9') { s += ch; next(); }
      if (ch === '.') { s += '.'; while (next() && ch >= '0' && ch <= '9') s += ch; }
      if (ch === 'e' || ch === 'E') {
        s += ch; next();
        if (ch === '-' || ch === '+') { s += ch; next(); }
        while (ch >= '0' && ch <= '9') { s += ch; next(); }
      }
      var n = Number(s);
      if (!isFinite(n)) err('bad number');
      return n;
    }
    function string() {
      var s = '', hex, i, u;
      if (ch !== '"') err('expected string');
      while (next()) {
        if (ch === '"') { next(); return s; }
        if (ch === '\\') {
          next();
          if (ch === 'u') {
            u = 0;
            for (i = 0; i < 4; i++) {
              hex = parseInt(next(), 16);
              if (!isFinite(hex)) err('bad escape');
              u = u * 16 + hex;
            }
            s += String.fromCharCode(u);
          } else {
            var map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
            if (!map.hasOwnProperty(ch)) err('bad escape');
            s += map[ch];
          }
        } else s += ch;
      }
      err('unterminated string');
    }
    function array() {
      var a = [];
      next(); white();
      if (ch === ']') { next(); return a; }
      while (ch) {
        a.push(value()); white();
        if (ch === ']') { next(); return a; }
        if (ch !== ',') err('expected ,');
        next(); white();
      }
      err('unterminated array');
    }
    function object() {
      var o = {}, key;
      next(); white();
      if (ch === '}') { next(); return o; }
      while (ch) {
        key = string(); white();
        if (ch !== ':') err('expected :');
        next(); o[key] = value(); white();
        if (ch === '}') { next(); return o; }
        if (ch !== ',') err('expected ,');
        next(); white();
      }
      err('unterminated object');
    }
    function value() {
      white();
      if (ch === '{') return object();
      if (ch === '[') return array();
      if (ch === '"') return string();
      if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
      if (ch === 't') return word('true', true);
      if (ch === 'f') return word('false', false);
      if (ch === 'n') return word('null', null);
      err('unexpected ' + ch);
    }
    var result = value(); white();
    if (ch) err('trailing data');
    return result;
  }

  /* ---------- Lookups ---------- */
  function fail(s) { throw new Error(s); }
  function comp(id) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var c = app.project.item(i);
      if (c.id === id && c instanceof CompItem) return c;
    }
    return fail('Composition no longer exists. Read context again.');
  }
  function layer(ref) {
    if (!ref || typeof ref.expectedName !== 'string') fail('A fresh layer reference is required.');
    var c = comp(ref.compId);
    if (typeof ref.layerIndex !== 'number' || ref.layerIndex < 1 || ref.layerIndex > c.numLayers) fail('Layer index changed. Read context again.');
    var l = c.layer(ref.layerIndex);
    if (l.name !== ref.expectedName) fail('Layer name changed. Read context again.');
    return l;
  }
  function prop(l, path) {
    if (!(path instanceof Array) || !path.length) fail('Property path is required.');
    var p = l;
    for (var i = 0; i < path.length; i++) {
      var key = String(path[i]);
      p = p.property(/^\d+$/.test(key) ? Number(key) : key);
      if (!p) fail('Property not found: ' + key);
    }
    return p;
  }
  function finite(v, name, min, max) {
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) fail('Invalid ' + name);
    return v;
  }
  function str(v, name, allowEmpty) {
    if (typeof v !== 'string' || (!allowEmpty && !v.length)) fail('Missing ' + name);
    if (v.length > 5000) fail(name + ' is too long');
    return v;
  }
  function layerInfo(l, c) {
    var o = { compId: c.id, layerIndex: l.index, expectedName: l.name, selected: l.selected, inPoint: l.inPoint, outPoint: l.outPoint, locked: l.locked };
    try { o.source = l.source ? l.source.name : null; } catch (e) {}
    return o;
  }
  function numbers(v, lengths) {
    if (!(v instanceof Array)) return false;
    var okLength = false;
    for (var i = 0; i < lengths.length; i++) if (v.length === lengths[i]) okLength = true;
    if (!okLength) return false;
    for (i = 0; i < v.length; i++) if (typeof v[i] !== 'number' || !isFinite(v[i])) return false;
    return true;
  }
  function checkValue(p, v) {
    if (v === undefined) fail('A value is required.');
    var t = p.propertyValueType;
    if (t === PropertyValueType.OneD && (typeof v !== 'number' || !isFinite(v))) fail('"' + p.name + '" needs a single number.');
    if ((t === PropertyValueType.TwoD || t === PropertyValueType.TwoD_SPATIAL) && !numbers(v, [2])) fail('"' + p.name + '" needs [x, y].');
    if ((t === PropertyValueType.ThreeD || t === PropertyValueType.ThreeD_SPATIAL) && !numbers(v, [2, 3])) fail('"' + p.name + '" needs [x, y] or [x, y, z].');
    if (t === PropertyValueType.COLOR && !numbers(v, [3, 4])) fail('"' + p.name + '" needs an RGB or RGBA color from 0 to 1.');
  }
  function installedFile(p, re, what) {
    str(p, what + ' path');
    var f = new File(p);
    if (!re.test(f.fsName) || !f.exists) fail(what + ' not found: ' + p);
    return f;
  }
  function fileTitle(f) { return decodeURI(f.name).replace(/\.(jsx|jsxbin|ffx)$/i, ''); }
  function show(v) {
    var s = v instanceof Array ? '[' + v.join(', ') + ']' : String(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  }

  /* ---------- Context and inspection ---------- */
  function context() {
    var result = { projectName: app.project.file ? app.project.file.name : 'Untitled project', items: [], activeComp: null }, i, c = app.project.activeItem;
    for (i = 1; i <= Math.min(app.project.numItems, 100); i++) {
      var it = app.project.item(i);
      result.items.push({ id: it.id, name: it.name, type: it instanceof CompItem ? 'composition' : it instanceof FolderItem ? 'folder' : 'footage' });
    }
    result.itemsTruncated = app.project.numItems > 100;
    if (c instanceof CompItem) {
      var co = { id: c.id, name: c.name, width: c.width, height: c.height, duration: c.duration, frameRate: c.frameRate, time: c.time, layers: [], layerCount: c.numLayers };
      for (i = 1; i <= Math.min(c.numLayers, 100); i++) co.layers.push(layerInfo(c.layer(i), c));
      co.layersTruncated = c.numLayers > 100;
      result.activeComp = co;
    }
    return result;
  }
  function inspect(p, depth, budget) {
    var o = { name: p.name, matchName: p.matchName, index: p.propertyIndex };
    if (budget.n++ > 150) return { truncated: true };
    if (p.propertyType === PropertyType.PROPERTY) {
      try {
        var v = p.value;
        if (typeof v === 'number' || typeof v === 'string' || v instanceof Array) o.value = v;
        else if (v && v.text !== undefined) o.value = { text: v.text, font: v.font, fontSize: v.fontSize };
      } catch (e) {}
      o.numKeys = p.numKeys;
      o.canSetExpression = p.canSetExpression;
      if (p.canSetExpression) o.expression = p.expression;
    } else if (depth > 0) {
      o.children = [];
      for (var i = 1; i <= p.numProperties && budget.n <= 150; i++) o.children.push(inspect(p.property(i), depth - 1, budget));
    }
    return o;
  }

  /* ---------- Edits: check everything first, then apply ---------- */
  // prepare() validates one action WITHOUT changing the project and resolves
  // the exact layer/property objects, so later index shifts cannot retarget it.
  function prepare(a) {
    if (!a || typeof a.type !== 'string') fail('Each action needs a type.');
    var job = { a: a }, v, i;
    if (a.type === 'create_comp') {
      job.name = String(a.name || 'Zenframe composition');
      finite(a.width, 'width', 4, 30000); finite(a.height, 'height', 4, 30000);
      finite(a.duration, 'duration', 0.001, 10800); finite(a.frameRate, 'frame rate', 1, 120);
      job.summary = 'Create composition "' + job.name + '" (' + a.width + 'x' + a.height + ', ' + a.duration + 's, ' + a.frameRate + ' fps)';
      return job;
    }
    if (a.type === 'create_text' || a.type === 'create_null' || a.type === 'create_solid') {
      job.comp = comp(a.compId);
      if (a.type === 'create_solid') {
        v = a.color === undefined ? [0, 0, 0] : a.color;
        if (!(v instanceof Array) || v.length !== 3) fail('Color must be an RGB array.');
        for (i = 0; i < 3; i++) finite(v[i], 'color', 0, 1);
        job.color = v;
      }
      if (a.type === 'create_text') str(a.text === undefined ? '' : a.text, 'text', true);
      var kind = a.type === 'create_text' ? 'text layer' : a.type === 'create_null' ? 'null' : 'solid';
      job.summary = 'Add ' + kind + (a.name ? ' "' + a.name + '"' : '') + (a.type === 'create_text' ? ' saying "' + show(a.text || '') + '"' : '') + ' to "' + job.comp.name + '"';
      return job;
    }
    job.layer = layer(a.ref);
    if (job.layer.locked) fail('Layer is locked: ' + job.layer.name);
    var target = '"' + job.layer.name + '"';
    if (a.type === 'rename_layer') { str(a.name, 'name'); job.summary = 'Rename ' + target + ' to "' + a.name + '"'; }
    else if (a.type === 'duplicate_layer') { job.summary = 'Duplicate ' + target + (a.name ? ' as "' + a.name + '"' : ''); }
    else if (a.type === 'update_text') {
      str(a.text, 'text', true);
      var tp = job.layer.property('ADBE Text Properties');
      if (!tp) fail('Layer is not text: ' + job.layer.name);
      job.prop = tp.property('ADBE Text Document');
      job.summary = 'Change text of ' + target + ' to "' + show(a.text) + '"';
    } else if (a.type === 'add_effect') {
      str(a.matchName, 'effect matchName');
      job.prop = job.layer.property('ADBE Effect Parade');
      if (!job.prop || !job.prop.canAddProperty(a.matchName)) fail('Effect not available: ' + a.matchName);
      job.summary = 'Add effect ' + a.matchName + ' to ' + target;
    } else if (a.type === 'set_property') {
      job.prop = prop(job.layer, a.path);
      if (job.prop.propertyType !== PropertyType.PROPERTY) fail('Path is a group, not a value.');
      checkValue(job.prop, a.value);
      if (a.time !== undefined) {
        finite(a.time, 'key time', -10800, 10800);
        if (!job.prop.canVaryOverTime) fail('"' + job.prop.name + '" cannot be keyframed.');
      }
      job.summary = (a.time !== undefined ? 'Keyframe ' : 'Set ') + '"' + job.prop.name + '" on ' + target + ' to ' + show(a.value) + (a.time !== undefined ? ' at ' + a.time + 's' : '');
    } else if (a.type === 'set_expression') {
      job.prop = prop(job.layer, a.path);
      if (!job.prop.canSetExpression) fail('Property does not support expressions.');
      str(a.expression === undefined ? '' : a.expression, 'expression', true);
      job.summary = (a.expression ? 'Set expression on ' : 'Remove expression from ') + '"' + job.prop.name + '" of ' + target;
    } else if (a.type === 'set_timing') {
      job.ip = finite(a.inPoint, 'in point', -10800, 10800);
      job.op = finite(a.outPoint, 'out point', -10800, 10800);
      if (job.op <= job.ip) fail('Out point must follow in point.');
      job.summary = 'Set timing of ' + target + ' to ' + job.ip + 's - ' + job.op + 's';
    } else if (a.type === 'apply_preset') {
      // The panel only passes presets found in the Presets / User Presets folders.
      job.file = installedFile(a.presetPath, /\.ffx$/i, 'Preset');
      if (typeof job.layer.applyPreset !== 'function') fail('Presets cannot be applied to ' + target + '.');
      job.summary = 'Apply preset "' + fileTitle(job.file) + '" to ' + target;
    } else fail('Unsupported action: ' + a.type);
    return job;
  }

  function apply(job) {
    var a = job.a, c, l, p, v;
    if (a.type === 'create_comp') {
      c = app.project.items.addComp(job.name, a.width, a.height, 1, a.duration, a.frameRate);
      c.openInViewer();
      return { compId: c.id, name: c.name };
    }
    if (a.type === 'create_text' || a.type === 'create_null' || a.type === 'create_solid') {
      c = job.comp;
      if (a.type === 'create_text') l = c.layers.addText(String(a.text || ''));
      else if (a.type === 'create_null') l = c.layers.addNull();
      else l = c.layers.addSolid(job.color, String(a.name || 'Solid'), c.width, c.height, c.pixelAspect, c.duration);
      if (a.name) l.name = String(a.name);
      return layerInfo(l, c);
    }
    l = job.layer;
    if (a.type === 'rename_layer') l.name = String(a.name);
    else if (a.type === 'duplicate_layer') { l = l.duplicate(); if (a.name) l.name = String(a.name); }
    else if (a.type === 'update_text') { v = job.prop.value; v.text = String(a.text); job.prop.setValue(v); }
    else if (a.type === 'add_effect') { p = job.prop.addProperty(a.matchName); return { effectName: p.name, matchName: p.matchName, index: p.propertyIndex }; }
    else if (a.type === 'set_property') { if (a.time !== undefined) job.prop.setValueAtTime(a.time, a.value); else job.prop.setValue(a.value); }
    else if (a.type === 'set_expression') { job.prop.expression = String(a.expression || ''); if (job.prop.expressionError) fail(job.prop.expressionError); }
    else if (a.type === 'apply_preset') { l.applyPreset(job.file); }
    else if (a.type === 'set_timing') { l.outPoint = Math.max(l.outPoint, job.op, job.ip + 0.01); l.inPoint = job.ip; l.outPoint = job.op; }
    return layerInfo(l, l.containingComp);
  }

  function prepareAll(a) {
    if (!(a.actions instanceof Array) || !a.actions.length || a.actions.length > 30) fail('Use 1-30 actions.');
    var jobs = [];
    for (var i = 0; i < a.actions.length; i++) {
      try { jobs.push(prepare(a.actions[i])); }
      catch (e) { throw new Error('Action ' + (i + 1) + ' (' + (a.actions[i] && a.actions[i].type) + '): ' + e.message); }
    }
    return jobs;
  }

  /* ---------- Dispatch ---------- */
  function dispatch(name, a) {
    var i;
    if (name === 'ae_get_context') return context();
    if (name === 'ae_inspect_layer') {
      var l = layer(a.ref);
      return inspect(a.path && a.path.length ? prop(l, a.path) : l, Math.min(3, Math.max(1, a.depth || 2)), { n: 0 });
    }
    // After Effects rebuilds the whole effects list every time app.effects is read, so it is read
    // exactly once per session and kept. (Reading it inside a loop froze After Effects with many plugins.)
    // Installed effects, each listed once, in pages. After Effects reports some effects more than once.
    if (name === 'ae_search_effects') {
      var all = [], seen = {}, q = String(a.query || '').toLowerCase().replace(/^\s+|\s+$/g, '');
      var thirdOnly = a.thirdPartyOnly === true, offset = Math.max(0, Math.floor(Number(a.offset) || 0)), PAGE = 100;
      var list = installedEffects();
      for (i = 0; i < list.length; i++) {
        var e = list[i];
        if (seen.hasOwnProperty(e.matchName)) continue;
        seen[e.matchName] = true;
        if (q && e.search.indexOf(q) < 0) continue;
        if (thirdOnly && !e.thirdParty) continue;
        all.push({ name: e.name, matchName: e.matchName, category: e.category, thirdParty: e.thirdParty });
      }
      var page = all.slice(offset, offset + PAGE), out = { total: all.length, offset: offset, effects: page };
      if (offset + PAGE < all.length) out.nextOffset = offset + PAGE;
      return out;
    }
    // Panel-only: check a batch and describe it for the approval card. Changes nothing.
    if (name === 'ae_validate_actions') {
      var checked = prepareAll(a), lines = [];
      for (i = 0; i < checked.length; i++) lines.push(checked[i].summary);
      return { ok: true, summary: lines };
    }
    if (name === 'ae_apply_actions') {
      var jobs;
      try { jobs = prepareAll(a); }
      catch (pe) { return { error: String(pe.message || pe), applied: [], message: 'Nothing was changed. Read context again and fix this action.' }; }
      var done = [];
      app.beginUndoGroup('Zenframe: ' + String(a.label || 'Edit project').slice(0, 80));
      try {
        for (i = 0; i < jobs.length; i++) done.push(apply(jobs[i]));
        return { applied: done };
      } catch (ex) {
        return { error: String(ex), completed: done, failedIndex: done.length, message: 'Earlier actions in this batch were applied. Use After Effects Undo to revert the whole batch.' };
      } finally {
        app.endUndoGroup();
      }
    }
    // Panel-only: where After Effects keeps its scripts and presets (the panel lists them).
    if (name === 'ae_tool_paths') {
      var appFolder = null;
      try { appFolder = Folder.appPackage.fsName; } catch (e1) {}
      if (!appFolder) try { appFolder = Folder.startup.fsName; } catch (e2) {}
      return { version: String(app.version), appFolder: appFolder, userData: Folder.userData.fsName, documents: Folder.myDocuments.fsName };
    }
    // Panel-only: open a ScriptUI panel the way the Window menu does.
    if (name === 'open_script_panel') {
      var pf = installedFile(a.path, /\.(jsx|jsxbin)$/i, 'Panel'), label = decodeURI(pf.name);
      var cmd = app.findMenuCommandId(label) || app.findMenuCommandId(fileTitle(pf));
      if (!cmd) fail('After Effects has not loaded "' + label + '" yet. Restart After Effects, then open it from the Window menu.');
      app.executeCommand(cmd);
      return { ok: true };
    }
    // Panel-only: runs an installed script after the user approved it on the card.
    if (name === 'run_installed_script') {
      var sf = installedFile(a.path, /\.(jsx|jsxbin)$/i, 'Script');
      app.beginUndoGroup('Zenframe: ' + fileTitle(sf).slice(0, 60));
      try {
        $.evalFile(sf);
        return { ok: true, result: 'Script "' + fileTitle(sf) + '" ran. If it opened its own window, the user continues there.' };
      } catch (se) {
        return { error: 'The script stopped with an error: ' + String(se.message || se), line: se.line || null, message: 'Some of its changes may already be applied. Edit > Undo reverts them.' };
      } finally {
        app.endUndoGroup();
      }
    }
    // Panel-only: runs a script the user reviewed and clicked Run on. Not exposed to the model.
    if (name === 'run_reviewed_script') {
      if (typeof a.code !== 'string' || a.code.length > 200000) fail('Invalid script.');
      app.beginUndoGroup('Zenframe: reviewed script');
      try {
        var answer = eval(a.code);
        return { ok: true, result: answer === undefined ? 'Script completed.' : String(answer).slice(0, 4000) };
      } finally {
        app.endUndoGroup();
      }
    }
    fail('Unknown host method');
  }

  return {
    invoke: function (name, encoded) {
      try { return json(dispatch(name, parseJSON(decodeURIComponent(encoded)))); }
      catch (e) { return json({ error: String(e.message || e), line: e.line || null }); }
    }
  };
}());
