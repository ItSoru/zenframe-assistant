/* Zenframe Assistant 1.3.0: attach images, text files and video references to a message.
   Files wait in the message box until you press Send; nothing is sent when you add them.
   Images are resized here (longest side 1568 px, what vision models read best) and kept in memory only.
   Text files (scripts, expressions, JSON, CSV, subtitles, notes) are read as text. Nothing is saved to disk.
   Videos become one contact sheet of key frames (more where the picture changes) plus their timestamps,
   so every AI provider can follow the motion. */
(function () {
  'use strict';
  var MAX_FILES = 6, MAX_SIDE = 1568, MAX_IMAGE_IN = 30 * 1024 * 1024, MAX_IMAGE_OUT = 4.5 * 1024 * 1024, MAX_TEXT = 300 * 1024;
  var IMAGE = /^image\/(png|jpeg|webp|gif)$/i;
  var VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i, MAX_VIDEO = 1024 * 1024 * 1024, FRAMES = 12, CANDIDATES = 36;
  var TEXT_EXT = /\.(txt|md|markdown|jsx|jsxinc|js|mjs|ts|json|csv|tsv|xml|html?|css|srt|vtt|ass|ssa|lrc|log|ya?ml|ini|cfg|py|expr|glsl|txt2)$/i;
  var $ = function (id) { return document.getElementById(id); };
  var tray = $('attachTray'), input = $('attachInput'), button = $('attachButton'), prompt = $('prompt');
  var composer = document.querySelector('.composer');
  if (!tray || !input || !button || !composer) return;
  var files = [], reading = 0, noteTimer = 0, nextId = 1;

  function sizeText(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function extOf(name) { var m = /\.([a-z0-9]{1,5})$/i.exec(name); return m ? m[1].toUpperCase() : 'TXT'; }
  function note(text) {
    var el = tray.querySelector('.attach-note');
    if (!el) { el = document.createElement('div'); el.className = 'attach-note'; el.setAttribute('role', 'status'); }
    el.textContent = text;
    tray.appendChild(el); tray.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); tray.hidden = !files.length && !reading; }, 4500);
  }

  function chip(f) {
    var el = document.createElement('div');
    el.className = 'attach-chip attach-' + f.kind + (f.loading ? ' attach-loading' : '');
    var thumb = document.createElement('span'); thumb.className = 'attach-thumb'; thumb.setAttribute('aria-hidden', 'true');
    if (f.preview) { var img = document.createElement('img'); img.src = f.preview; img.alt = ''; thumb.appendChild(img); }
    else thumb.textContent = f.kind === 'image' ? '' : extOf(f.name);
    if (f.kind === 'video') { var play = document.createElement('i'); play.className = 'attach-play'; thumb.appendChild(play); }
    var meta = document.createElement('span'); meta.className = 'attach-meta';
    var name = document.createElement('span'); name.className = 'attach-name'; name.textContent = f.name; name.title = f.name;
    var info = document.createElement('span'); info.className = 'attach-size';
    info.textContent = f.loading ? (f.kind === 'video' ? 'Picking key frames…' : 'Reading…') : f.kind === 'video' ? 'Video · ' + f.frames + ' key frames · ' + clock(f.duration) : (f.kind === 'image' ? 'Image' : extOf(f.name) + ' file') + ' · ' + sizeText(f.size);
    meta.appendChild(name); meta.appendChild(info);
    var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'attach-remove';
    remove.setAttribute('aria-label', 'Remove ' + f.name); remove.title = 'Remove';
    remove.textContent = '×';
    remove.onclick = function () { files = files.filter(function (x) { return x.id !== f.id; }); render(); prompt.focus(); };
    el.appendChild(thumb); el.appendChild(meta); el.appendChild(remove);
    return el;
  }
  function render() {
    var keepNote = tray.querySelector('.attach-note');
    tray.textContent = '';
    if (files.length) {
      var row = document.createElement('div'); row.className = 'attach-row';
      files.forEach(function (f) { row.appendChild(chip(f)); });
      tray.appendChild(row);
    }
    if (keepNote) tray.appendChild(keepNote);
    tray.hidden = !files.length && !keepNote;
    composer.classList.toggle('has-files', files.length > 0);
    button.classList.toggle('has-files', files.length > 0);
    button.setAttribute('aria-label', files.length ? 'Attach files (' + files.length + ' attached)' : 'Attach files');
  }

  function readAs(file, how) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(Error('Could not read ' + file.name + '.')); };
      r.onload = function () { resolve(r.result); };
      if (how === 'text') r.readAsText(file); else r.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(Error('That file is not an image Zeni can read.')); };
      img.src = src;
    });
  }
  function canvasFor(img, max) {
    var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function split(dataUrl) { var i = dataUrl.indexOf(','); return { mime: dataUrl.slice(5, dataUrl.indexOf(';')), data: dataUrl.slice(i + 1) }; }
  function bytes(b64) { return Math.floor(b64.length * 3 / 4); }

  function readImage(f, file) {
    if (file.size > MAX_IMAGE_IN) return Promise.reject(Error(file.name + ' is over 30 MB.'));
    return readAs(file, 'url').then(loadImage).then(function (img) {
      var big = Math.max(img.naturalWidth, img.naturalHeight) > MAX_SIDE;
      var keep = !big && /^image\/(png|jpeg|webp)$/i.test(file.type) && file.size <= MAX_IMAGE_OUT;
      var out;
      if (keep) out = split(img.src);
      else {
        var c = canvasFor(img, MAX_SIDE);
        var png = /png|gif|webp/i.test(file.type);
        out = split(c.toDataURL(png ? 'image/png' : 'image/jpeg', .9));
        if (bytes(out.data) > MAX_IMAGE_OUT) out = split(c.toDataURL('image/jpeg', .86));
      }
      if (bytes(out.data) > MAX_IMAGE_OUT) throw Error(file.name + ' is still too large after resizing.');
      f.mime = out.mime; f.data = out.data;
      f.preview = canvasFor(img, 96).toDataURL('image/png');
    });
  }
  function readText(f, file) {
    if (file.size > MAX_TEXT) return Promise.reject(Error(file.name + ' is over 300 KB. Attach a smaller file or the part you need.'));
    return readAs(file, 'text').then(function (text) {
      if (text.indexOf('\u0000') >= 0) throw Error(file.name + ' looks like a binary file, not text.');
      f.text = text;
    });
  }


  /* ---------- Video references ---------- */
  function clock(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
  function seek(v, t) {
    return new Promise(function (resolve, reject) {
      var done = false, timer = setTimeout(function () { if (!done) { done = true; reject(Error('timeout')); } }, 4000);
      v.onseeked = function () { if (done) return; done = true; clearTimeout(timer); resolve(); };
      v.currentTime = t;
    });
  }
  function readVideo(f, file, range) {
    if (file.size > MAX_VIDEO) return Promise.reject(Error(f.name + ' is over 1 GB. Trim it or export a shorter reference clip.'));
    var url = URL.createObjectURL(file), v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(Error('timeout')); }, 15000);
      v.onloadedmetadata = function () { clearTimeout(t); resolve(); };
      v.onerror = function () { clearTimeout(t); reject(Error('decode')); };
      v.src = url;
    }).then(function () {
      var vw = v.videoWidth, vh = v.videoHeight, dur = v.duration;
      if (!vw || !vh || !isFinite(dur)) throw Error('decode');
      var t0 = Math.max(0, range && range.in || 0), t1 = Math.min(dur, range && range.out > t0 ? range.out : dur);
      var span = Math.max(0.04, t1 - t0), n = Math.min(CANDIDATES, Math.max(2, Math.round(span * 6)));
      var cw = 480, ch = Math.round(cw * vh / vw), small = document.createElement('canvas'); small.width = 32; small.height = 18;
      var sctx = small.getContext('2d'), shots = [], prev = null, i = 0;
      function next() {
        if (i >= n) return Promise.resolve();
        var time = t0 + span * (n === 1 ? 0.5 : (0.02 + 0.96 * i / (n - 1)));
        return seek(v, time).then(function () {
          var c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(v, 0, 0, cw, ch);
          sctx.drawImage(v, 0, 0, 32, 18);
          var px = sctx.getImageData(0, 0, 32, 18).data, diff = 0, g = new Float32Array(32 * 18);
          for (var k = 0; k < g.length; k++) { g[k] = px[k * 4] * .3 + px[k * 4 + 1] * .59 + px[k * 4 + 2] * .11; if (prev) diff += Math.abs(g[k] - prev[k]); }
          shots.push({ t: time, canvas: c, change: prev ? diff / g.length : 999 }); prev = g;
          i++; return next();
        });
      }
      return next().then(function () {
        // Keep the first and last frame, then the frames where the picture changes most.
        var keep = shots.length <= FRAMES ? shots.slice() : [shots[0], shots[shots.length - 1]].concat(shots.slice(1, -1).sort(function (a, b) { return b.change - a.change; }).slice(0, FRAMES - 2));
        keep.sort(function (a, b) { return a.t - b.t; });
        var cols = keep.length <= 4 ? keep.length : keep.length <= 9 ? 3 : 4, rows = Math.ceil(keep.length / cols), gap = 6;
        var sheet = document.createElement('canvas'); sheet.width = cols * cw + (cols + 1) * gap; sheet.height = rows * ch + (rows + 1) * gap;
        var x = sheet.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, sheet.width, sheet.height);
        keep.forEach(function (s, idx) {
          var cx = gap + (idx % cols) * (cw + gap), cy = gap + Math.floor(idx / cols) * (ch + gap);
          x.drawImage(s.canvas, cx, cy);
          var label = (idx + 1) + '  ' + clock(s.t - t0); x.font = 'bold 22px Segoe UI, sans-serif';
          var tw = x.measureText(label).width; x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(cx + 6, cy + 6, tw + 16, 32);
          x.fillStyle = '#fff'; x.fillText(label, cx + 14, cy + 30);
        });
        var scale = Math.min(1, MAX_SIDE / Math.max(sheet.width, sheet.height)), out = document.createElement('canvas');
        out.width = Math.round(sheet.width * scale); out.height = Math.round(sheet.height * scale);
        out.getContext('2d').drawImage(sheet, 0, 0, out.width, out.height);
        var img = split(out.toDataURL('image/jpeg', .86));
        if (bytes(img.data) > MAX_IMAGE_OUT) img = split(out.toDataURL('image/jpeg', .7));
        f.mime = img.mime; f.data = img.data; f.frames = keep.length; f.duration = span;
        var thumb = document.createElement('canvas'); thumb.width = 96; thumb.height = Math.round(96 * ch / cw); thumb.getContext('2d').drawImage(keep[0].canvas, 0, 0, thumb.width, thumb.height);
        f.preview = thumb.toDataURL('image/png');
        f.text = 'Video reference "' + f.name + '": ' + vw + 'x' + vh + ', ' + span.toFixed(2) + ' s' + (range ? ' (the part of the layer used in the comp)' : '') + '.\n' +
          'The attached image "' + f.name + ' (key frames)" is a contact sheet of ' + keep.length + ' frames, read left to right, top to bottom. Each frame is numbered with its time from the start of the clip:\n' +
          keep.map(function (s, idx) { return (idx + 1) + ') ' + clock(s.t - t0); }).join('\n') +
          '\nUse the frames and their timing to understand the motion, transitions and pacing. This is a reference only; it is not in the project.';
      });
    }).then(function () { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }, function (e) {
      URL.revokeObjectURL(url);
      throw Error(e && e.message === 'decode' || e && e.message === 'timeout' ? 'Zeni could not decode ' + f.name + '. H.264 MP4 works best; re-export or convert the clip and try again.' : e.message);
    });
  }

  function add(list, range) {
    var arr = Array.prototype.slice.call(list || []);
    arr.forEach(function (file) {
      if (files.length >= MAX_FILES) { note('You can attach up to ' + MAX_FILES + ' files to one message.'); return; }
      var isImage = IMAGE.test(file.type || ''), isVideo = !isImage && (/^video\//i.test(file.type || '') || VIDEO_EXT.test(file.name || ''));
      var isText = !isImage && !isVideo && (TEXT_EXT.test(file.name || '') || /^text\//i.test(file.type || '') || /json|xml/i.test(file.type || ''));
      if (!isImage && !isText && !isVideo) { note('Zeni can read images (PNG, JPG, WebP, GIF), videos (MP4, MOV, WebM) and text files like scripts, expressions, JSON, CSV and subtitles. "' + file.name + '" is none of those.'); return; }
      if (files.some(function (x) { return x.name === file.name && x.size === file.size; })) return;
      var f = { id: nextId++, name: file.name || (isImage ? 'pasted-image.png' : isVideo ? 'clip.mp4' : 'file.txt'), kind: isImage ? 'image' : isVideo ? 'video' : 'text', size: file.size, loading: true };
      files.push(f); reading++; render();
      (isImage ? readImage(f, file) : isVideo ? readVideo(f, file, range) : readText(f, file)).then(function () {
        f.loading = false;
      }, function (e) {
        files = files.filter(function (x) { return x.id !== f.id; });
        note(e.message);
      }).then(function () { reading--; render(); });
    });
  }

  /* ---------- Ways to attach ---------- */
  // The paperclip opens a small menu: files from this computer, or the selected video layer in After Effects.
  var menu = document.createElement('div'); menu.className = 'attach-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  function item(label, sub, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    var t = document.createElement('span'); t.textContent = label; var d = document.createElement('small'); d.textContent = sub;
    b.appendChild(t); b.appendChild(d); b.onclick = function () { closeMenu(); fn(); }; menu.appendChild(b);
  }
  item('Files from this computer', 'Images, videos, scripts, text', function () { input.value = ''; input.click(); });
  item('Selected video layer', 'Use a clip from your comp as a reference', function () {
    var cep = window.__adobe_cep__;
    if (!cep) { note('Open the panel inside After Effects to use project clips.'); return; }
    cep.evalScript('ZenframeSelectedFootage()', function (r) {
      var j = null; try { j = JSON.parse(r); } catch (e) {}
      if (!j || j.error) { note(j && j.error || 'Could not read the selected layer.'); return; }
      var k = 100 / (j.stretch || 100);
      window.ZenframeAttach.addPath(j.path, j.name, { in: Math.max(0, j.in * k), out: Math.max(0, j.out * k) });
    });
  });
  item('Study a project file (.aep)', 'Zeni reads how it was built, without opening it', function () {
    var use = function (picked) {
      if (!picked) return;
      var text = 'Study this project file and break down how it is built: ' + decodeURIComponent(String(picked).replace(/^file:\/\//, ''));
      prompt.value = prompt.value ? prompt.value.replace(/\s*$/, '\n') + text : text;
      prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.focus();
    };
    var oldDialog = function () {
      var picked = null;
      try { var r = window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx ? window.cep.fs.showOpenDialogEx(false, false, 'Choose an After Effects project', '', ['aep']) : null; picked = r && r.data && r.data[0]; } catch (e) {}
      if (!picked && !(window.cep && window.cep.fs)) note('Paste the full path of the .aep file into your message instead.');
      use(picked);
    };
    // The modern Windows picker first; the older built-in one if that is not available.
    if (window.ZenframePickFile) window.ZenframePickFile({ title: 'Choose an After Effects project', filter: 'After Effects projects (*.aep)|*.aep' }).then(use, oldDialog);
    else oldDialog();
  });
  document.body.appendChild(menu); // outside the message box, which clips anything that pokes out of it
  function placeMenu() {
    var c = composer.getBoundingClientRect(), b = button.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(b.left - 4, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.bottom = (innerHeight - c.top + 6) + 'px';
  }
  function closeMenu() { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) { placeMenu(); menu.querySelector('button').focus(); } });
  window.addEventListener('resize', function () { if (!menu.hidden) placeMenu(); });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); button.focus(); } });
  input.addEventListener('change', function () { add(input.files); input.value = ''; prompt.focus(); });
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  var depth = 0;
  composer.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; composer.classList.add('drop-over'); });
  composer.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  composer.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) composer.classList.remove('drop-over'); });
  composer.addEventListener('drop', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; composer.classList.remove('drop-over'); add(e.dataTransfer.files); prompt.focus(); });
  // Dropping a file anywhere else must never navigate the panel away.
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', function (e) { if (hasFiles(e)) e.preventDefault(); });
  prompt.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (!cd || !cd.files || !cd.files.length) return;
    e.preventDefault();
    add(cd.files);
  });

  // The workspace holds the sliding Scripts view just off to the side. Scrolling a chip into view must
  // never slide the whole chat sideways.
  var workspace = document.querySelector('.workspace');
  if (workspace) workspace.addEventListener('scroll', function () { if (workspace.scrollLeft) workspace.scrollLeft = 0; });

  window.ZenframeAttach = {
    count: function () { return files.length; },
    reading: function () { return reading > 0; },
    // Hands the files to a message and clears the box. meta is what the chat shows (and saves: names only).
    take: function () {
      var out = [];
      files.forEach(function (f) {
        if (f.kind === 'image') out.push({ name: f.name, kind: 'image', mime: f.mime, data: f.data });
        else if (f.kind === 'video') { out.push({ name: f.name + ' (key frames)', kind: 'image', mime: f.mime, data: f.data }); out.push({ name: f.name + ' (frame times)', kind: 'text', text: f.text }); }
        else out.push({ name: f.name, kind: 'text', text: f.text });
      });
      var taken = { files: out,
        meta: files.map(function (f) { return { name: f.name, kind: f.kind, preview: f.preview || null }; }), raw: files.slice() };
      files = []; render();
      return taken;
    },
    restore: function (taken) { if (taken && taken.raw) { files = taken.raw.concat(files).slice(0, MAX_FILES); render(); } },
    add: add,
    note: note,
    // A video layer's file from After Effects, limited to the part used in the comp.
    addPath: function (path, name, range) {
      var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;
      if (!nodeRequire) { note('Open the panel inside After Effects to use project clips.'); return; }
      try {
        var fs = nodeRequire('fs'), st = fs.statSync(path);
        if (st.size > MAX_VIDEO) { note(name + ' is over 1 GB. Export a shorter reference clip and attach that instead.'); return; }
        var buf = fs.readFileSync(path), blob = new Blob([buf]), base = String(path).replace(/^.*[\\\/]/, '');
        blob.name = base; add([{ name: base, type: '', size: st.size, __blob: blob }].map(function (x) { var b = x.__blob; b.name = x.name; return b; }), range);
      } catch (e) { note('Could not read that clip: ' + e.message); }
    }
  };
  render();
})();
