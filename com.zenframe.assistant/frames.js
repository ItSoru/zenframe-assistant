/* Zenframe Assistant 1.4.0: how Zeni "sees" an edit.
   After Effects renders the frames Zeni asks for (with every effect, shake and grade) to PNGs in the temp folder;
   they are packed here into one numbered sheet with timestamps, sent to the AI with that request, and deleted.
   Nothing about the project changes. */
(function () {
  'use strict';
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;
  var MAX_SIDE = 1568, WAIT_MS = 180000;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // After Effects may finish writing a frame after the call returns: wait until the file exists and stops growing.
  function waitFor(fs, path, deadline) {
    var last = -1;
    function check() {
      var size = -1;
      try { size = fs.statSync(path).size; } catch (e) {}
      if (size > 0 && size === last) return Promise.resolve(true);
      last = size;
      if (Date.now() > deadline) return Promise.resolve(false);
      return sleep(120).then(check);
    }
    return check();
  }
  function loadImage(bytes) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(Error('A rendered frame could not be read.')); };
      img.src = url;
    });
  }
  function clock(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
  // Pure layout (tested): columns and cell size for n frames of a w x h comp.
  function layout(n, w, h) {
    var cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols);
    var cw = Math.min(w, Math.floor(MAX_SIDE / cols)), ch = Math.round(cw * h / w);
    if (ch * rows > MAX_SIDE) { ch = Math.floor(MAX_SIDE / rows); cw = Math.round(ch * w / h); }
    return { cols: cols, rows: rows, cw: cw, ch: ch, width: cw * cols, height: ch * rows };
  }
  function sheet(images, frames, w, h) {
    var L = layout(images.length, w, h), c = document.createElement('canvas');
    c.width = L.width; c.height = L.height;
    var g = c.getContext('2d'), fs = Math.max(12, Math.round(L.cw / 22));
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    images.forEach(function (img, i) {
      var x = (i % L.cols) * L.cw, y = Math.floor(i / L.cols) * L.ch;
      if (img) g.drawImage(img, x, y, L.cw, L.ch);
      var label = (i + 1) + '  ' + clock(frames[i].t) + '  f' + frames[i].frame;
      g.font = '600 ' + fs + 'px Segoe UI, Arial, sans-serif';
      var tw = g.measureText(label).width;
      g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(x, y, tw + fs, fs * 1.6);
      g.fillStyle = '#fff'; g.fillText(label, x + fs / 2, y + fs * 1.18);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, L.cw - 1, L.ch - 1);
    });
    return { data: c.toDataURL('image/jpeg', 0.86).split(',')[1], width: c.width, height: c.height };
  }

  function render(args, host) {
    args = args || {};
    if (!nodeRequire) return Promise.resolve({ error: 'Rendering frames needs the panel inside After Effects.' });
    var times = Array.isArray(args.times) ? args.times.slice(0, 16) : [];
    if (!times.length) return Promise.resolve({ error: 'Give one or more times in seconds (up to 16).' });
    var fs = nodeRequire('fs'), started = Date.now();
    return host('render_frames', { compId: Number(args.compId) || 0, times: times }).then(function (r) {
      if (!r || r.error) return r || { error: 'After Effects did not render the frames.' };
      var deadline = Date.now() + WAIT_MS, images = [], missing = [];
      return r.frames.reduce(function (p, f, i) {
        return p.then(function () {
          return waitFor(fs, f.path, deadline).then(function (ok) {
            if (!ok) { missing.push(i + 1); images.push(null); return; }
            return loadImage(fs.readFileSync(f.path)).then(function (img) { images.push(img); }, function () { missing.push(i + 1); images.push(null); });
          });
        });
      }, Promise.resolve()).then(function () {
        r.frames.forEach(function (f) { try { fs.unlinkSync(f.path); } catch (e) {} });
        if (missing.length === r.frames.length) return { error: 'After Effects did not finish rendering these frames. A heavy comp may need fewer frames at a time.' };
        var s = sheet(images, r.frames, r.width, r.height);
        return {
          comp: r.name, compId: r.compId, size: r.width + 'x' + r.height, frameRate: r.frameRate,
          frames: r.frames.map(function (f, i) { return { n: i + 1, time: Math.round(f.t * 1000) / 1000, frame: f.frame }; }),
          missing: missing.length ? missing : undefined,
          renderSeconds: Math.round((Date.now() - started) / 100) / 10,
          note: 'The image shows these frames as rendered by After Effects (effects, shakes and grade included), numbered in order, scaled down to fit one sheet.',
          __images: [{ mime: 'image/jpeg', data: s.data, name: 'frames ' + r.frames.map(function (f) { return clock(f.t); }).join(', ') }]
        };
      });
    });
  }

  window.ZenframeFrames = { render: render, _layout: layout };
}());
