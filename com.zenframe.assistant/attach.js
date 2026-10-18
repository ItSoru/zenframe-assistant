/* Zenframe Assistant 1.2.0: attach images and text files to a message.
   Files wait in the message box until you press Send; nothing is sent when you add them.
   Images are resized here (longest side 1568 px, what vision models read best) and kept in memory only.
   Text files (scripts, expressions, JSON, CSV, subtitles, notes) are read as text. Nothing is saved to disk. */
(function () {
  'use strict';
  var MAX_FILES = 6, MAX_SIDE = 1568, MAX_IMAGE_IN = 30 * 1024 * 1024, MAX_IMAGE_OUT = 4.5 * 1024 * 1024, MAX_TEXT = 300 * 1024;
  var IMAGE = /^image\/(png|jpeg|webp|gif)$/i;
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
    var meta = document.createElement('span'); meta.className = 'attach-meta';
    var name = document.createElement('span'); name.className = 'attach-name'; name.textContent = f.name; name.title = f.name;
    var info = document.createElement('span'); info.className = 'attach-size';
    info.textContent = f.loading ? 'Reading…' : (f.kind === 'image' ? 'Image' : extOf(f.name) + ' file') + ' · ' + sizeText(f.size);
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

  function add(list) {
    var arr = Array.prototype.slice.call(list || []);
    arr.forEach(function (file) {
      if (files.length >= MAX_FILES) { note('You can attach up to ' + MAX_FILES + ' files to one message.'); return; }
      var isImage = IMAGE.test(file.type || ''), isText = !isImage && (TEXT_EXT.test(file.name || '') || /^text\//i.test(file.type || '') || /json|xml/i.test(file.type || ''));
      if (!isImage && !isText) { note('Zeni can read images (PNG, JPG, WebP, GIF) and text files like scripts, expressions, JSON, CSV and subtitles. "' + file.name + '" is neither.'); return; }
      if (files.some(function (x) { return x.name === file.name && x.size === file.size; })) return;
      var f = { id: nextId++, name: file.name || (isImage ? 'pasted-image.png' : 'file.txt'), kind: isImage ? 'image' : 'text', size: file.size, loading: true };
      files.push(f); reading++; render();
      (isImage ? readImage(f, file) : readText(f, file)).then(function () {
        f.loading = false;
      }, function (e) {
        files = files.filter(function (x) { return x.id !== f.id; });
        note(e.message);
      }).then(function () { reading--; render(); });
    });
  }

  /* ---------- Ways to attach ---------- */
  button.addEventListener('click', function () { input.value = ''; input.click(); });
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
      var taken = { files: files.map(function (f) { return f.kind === 'image' ? { name: f.name, kind: 'image', mime: f.mime, data: f.data } : { name: f.name, kind: 'text', text: f.text }; }),
        meta: files.map(function (f) { return { name: f.name, kind: f.kind, preview: f.preview || null }; }), raw: files.slice() };
      files = []; render();
      return taken;
    },
    restore: function (taken) { if (taken && taken.raw) { files = taken.raw.concat(files).slice(0, MAX_FILES); render(); } },
    add: add
  };
  render();
})();
