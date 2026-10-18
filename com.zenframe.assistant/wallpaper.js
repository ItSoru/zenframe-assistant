/* Zenframe Assistant wallpaper and glass look, v1.2.0.
   - The image is resized and stored on this computer only.
   - Readability is guaranteed by measuring the image: a dark layer is laid over it that is exactly
     strong enough that its brightest area ends up no lighter than #616161, and every place with text
     is frosted glass that darkens it by about half again. So text never sits on anything lighter than
     about #454545: white text keeps at least 7:1 contrast, the accent and secondary text at least 4.5:1.
   - The accent color (and a few alternatives) are picked from the image.
   Without a wallpaper nothing here changes the panel. */
(function () {
  'use strict';

  var KEY = 'zenframeAssistant.wallpaper';
  var MAX_SIDE = 1600, TARGET_LUM = 0.12, SAMPLE = 48;
  var $ = function (id) { return document.getElementById(id); };
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;
  var state = null; // { image, scrim, blur, palette, matchAccent }

  /* ---------- Storage: a file in %LOCALAPPDATA%\ZenframeAssistant, or panel storage in a browser ---------- */
  function storeFile() {
    if (!nodeRequire || !window.__adobe_cep__) return null;
    try {
      var path = nodeRequire('path'), os = nodeRequire('os');
      return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'ZenframeAssistant', 'wallpaper.json');
    } catch (e) { return null; }
  }
  function load() {
    var file = storeFile();
    try {
      if (file) { var fs = nodeRequire('fs'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
      return JSON.parse(localStorage.getItem(KEY));
    } catch (e) { return null; }
  }
  function save(data) {
    var file = storeFile();
    try {
      if (file) {
        var fs = nodeRequire('fs'), path = nodeRequire('path');
        if (!data) { if (fs.existsSync(file)) fs.unlinkSync(file); return true; }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
        return true;
      }
      if (!data) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- Color math ---------- */
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
  function hex(r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s, l];
  }

  // How strong the dark layer must be: the brightest area of the image (in a 48x48 grid of area
  // averages) must end up at or below TARGET_LUM. Composite = L * (1 - a) + 0.002 * a.
  // Smaller bright specks are covered by the text shadow.
  function scrimFor(pixels) {
    var bright = 0;
    for (var i = 0; i < pixels.length; i += 4) bright = Math.max(bright, lum(pixels[i], pixels[i + 1], pixels[i + 2]));
    var a = bright <= TARGET_LUM ? 0 : (bright - TARGET_LUM) / (bright - 0.002);
    return Math.max(0.35, Math.min(0.97, Math.round(a * 1000) / 1000 + 0.02));
  }

  // Up to 5 distinct, lively colors from the image, most prominent first.
  function paletteFor(pixels) {
    var buckets = {};
    for (var i = 0; i < pixels.length; i += 4) {
      var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], c = hsl(r, g, b);
      if (c[1] < 0.28 || c[2] < 0.18 || c[2] > 0.88) continue;
      var k = Math.floor(c[0] / 20);
      var w = c[1] * (1 - Math.abs(c[2] - 0.55));
      var bk = buckets[k] || (buckets[k] = { w: 0, r: 0, g: 0, b: 0 });
      bk.w += w; bk.r += r * w; bk.g += g * w; bk.b += b * w;
    }
    var list = Object.keys(buckets).map(function (k) { var x = buckets[k]; return { w: x.w, hex: hex(x.r / x.w, x.g / x.w, x.b / x.w), hue: Number(k) }; });
    list.sort(function (a, b) { return b.w - a.w; });
    var out = [];
    list.forEach(function (c) { if (out.length < 5 && out.every(function (o) { return Math.min(Math.abs(o.hue - c.hue), 18 - Math.abs(o.hue - c.hue)) >= 2; })) out.push(c); });
    return out.map(function (c) { return lively(c.hex); });
  }
  // Make a picked color vivid enough to work as an accent.
  function lively(h) {
    var n = parseInt(h.slice(1), 16), c = hsl(n >> 16 & 255, n >> 8 & 255, n & 255);
    var s = Math.max(c[1], 0.55), l = Math.min(Math.max(c[2], 0.58), 0.72);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var f = function (t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    var hh = c[0] / 360;
    return hex(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255);
  }

  /* ---------- Reading an image ---------- */
  function analyze(img) {
    var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    var big = document.createElement('canvas');
    big.width = Math.max(1, Math.round(img.naturalWidth * scale)); big.height = Math.max(1, Math.round(img.naturalHeight * scale));
    big.getContext('2d').drawImage(img, 0, 0, big.width, big.height);
    var small = document.createElement('canvas');
    small.width = SAMPLE; small.height = SAMPLE;
    var sctx = small.getContext('2d');
    sctx.drawImage(img, 0, 0, SAMPLE, SAMPLE); // each sample is an average of an area, like a blur
    var px = sctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    return { image: big.toDataURL('image/jpeg', 0.86), scrim: scrimFor(px), palette: paletteFor(px) };
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(Error('Choose a JPG, PNG, WebP or GIF image.'));
      if (file.size > 40 * 1024 * 1024) return reject(Error('That image is over 40 MB. Choose a smaller one.'));
      var reader = new FileReader();
      reader.onerror = function () { reject(Error('Could not read that image.')); };
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { try { resolve(analyze(img)); } catch (e) { reject(Error('Could not read that image.')); } };
        img.onerror = function () { reject(Error('That file is not an image Zenframe can show.')); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Showing it ---------- */
  function show() {
    var root = document.documentElement, layer = $('wallpaper');
    var on = !!(state && state.image);
    root.classList.toggle('has-wallpaper', on);
    if (!on) root.classList.remove('wp-bright');
    window.ZenframeAccentBase = on ? '#616161' : null; // accent text must stay readable on the brightest wallpaper area
    if (window.ZenframeAccent) window.ZenframeAccent.refresh();
    if (!on) { layer.style.backgroundImage = ''; renderControls(); return; }
    layer.style.backgroundImage = 'url("' + state.image + '")';
    // Visibility 0 = the guaranteed-readable darkness; higher shows more of the image (less dark
    // layer, lighter glass) and gives text a stronger dark halo instead.
    var vis = visOf(state) / 100;
    root.classList.toggle('wp-bright', vis > 0);
    root.style.setProperty('--wp-scrim', String(Math.round(state.scrim * (1 - vis * 0.85) * 1000) / 1000));
    root.style.setProperty('--wp-glass-a', String(Math.round((0.52 - vis * 0.27) * 1000) / 1000));
    root.style.setProperty('--wp-glass-strong-a', String(Math.round((0.76 - vis * 0.16) * 1000) / 1000));
    root.style.setProperty('--wp-blur', blurOf(state) + 'px');
    renderControls();
  }
  function renderControls() {
    var on = !!(state && state.image);
    $('wallpaperRemove').hidden = !on;
    $('wallpaperOptions').hidden = !on;
    $('wallpaperPreview').style.backgroundImage = on ? 'url("' + state.image + '")' : '';
    $('wallpaperPreview').classList.toggle('empty', !on);
    if (!on) return;
    $('wallpaperVisibility').value = visOf(state);
    $('wallpaperVisibilityValue').textContent = visOf(state) ? visOf(state) + '%' : 'Most readable';
    $('wallpaperVisibilityHint').hidden = !visOf(state);
    $('wallpaperBlur').value = blurOf(state);
    $('wallpaperBlurValue').textContent = blurOf(state) + ' px';
    $('wallpaperMatch').checked = state.matchAccent !== false;
    var box = $('wallpaperPalette'); box.textContent = '';
    (state.palette || []).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.title = 'Use ' + c + ' as the accent'; b.setAttribute('aria-label', 'Use ' + c + ' as the accent');
      b.style.setProperty('--swatch', c);
      b.appendChild(document.createElement('span'));
      b.onclick = function () { if (window.ZenframeAccent) window.ZenframeAccent.set(c); };
      box.appendChild(b);
    });
    $('wallpaperPaletteRow').hidden = !(state.palette && state.palette.length);
  }
  function visOf(s) { return s && s.visibility ? s.visibility : 0; }
  function blurOf(s) { return s && s.blur != null ? s.blur : 16; }
  function status(text) { $('wallpaperStatus').textContent = text || ''; }

  /* ---------- Controls ---------- */
  $('wallpaperChoose').onclick = function () { $('wallpaperFile').value = ''; $('wallpaperFile').click(); };
  $('wallpaperFile').onchange = function () {
    var file = this.files && this.files[0];
    if (!file) return;
    status('Reading the image…');
    readFile(file).then(function (r) {
      var match = !state || state.matchAccent !== false;
      state = { image: r.image, scrim: r.scrim, blur: blurOf(state), visibility: visOf(state), palette: r.palette, matchAccent: match };
      if (match && r.palette.length && window.ZenframeAccent) window.ZenframeAccent.set(r.palette[0]);
      show();
      status((save(state) ? 'Wallpaper set.' : 'Wallpaper set for now, but it could not be saved.') + (r.palette.length ? '' : ' The image has no strong colors, so your accent stays the same.'));
    }).catch(function (e) { status(e.message); });
  };
  $('wallpaperRemove').onclick = function () { state = null; save(null); show(); status('Wallpaper removed.'); };
  $('wallpaperVisibility').oninput = function () { state.visibility = Number(this.value); show(); save(state); };
  $('wallpaperBlur').oninput = function () { state.blur = Number(this.value); show(); save(state); };
  $('wallpaperMatch').onchange = function () {
    state.matchAccent = this.checked; save(state);
    if (this.checked && state.palette && state.palette[0] && window.ZenframeAccent) window.ZenframeAccent.set(state.palette[0]);
  };

  state = load();
  if (state && !state.image) state = null;
  show();
  window.ZenframeWallpaper = { analyzeForTest: analyze, scrimFor: scrimFor, paletteFor: paletteFor, TARGET_LUM: TARGET_LUM };
})();
