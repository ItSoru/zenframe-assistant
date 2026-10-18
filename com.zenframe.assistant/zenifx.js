/* Zenframe Assistant 1.5.0: headphone effects. While Zeni dances, every hit in the music (a kick, a snare,
   a strong accent; not every beat of the grid) makes his headphones glow and send out light: sound waves,
   rings, a sparkle burst or equalizer bars, always with twinkling stars. Stronger hits send more.
   Drawn on one small canvas inside his dance layer, so it follows his head. Off with reduced motion. */
(function () {
  'use strict';
  // Headphone cup centres in each 600 x 587 dance frame: [left, right].
  var CUPS = { vibeUp: [[206, 182], [382, 176]], vibeDown: [[200, 224], [366, 214]], chill1: [[206, 210], [390, 208]], chill2: [[202, 232], [386, 190]], chill3: [[206, 210], [390, 214]] };
  var MARGIN = 0.55; // canvas reaches this far past the sprite on every side (fraction of its width)
  var canvas = null, g = null, fx = [], box = { w: 0, h: 0, m: 0 }, rgb = '180,160,247', rgbAt = 0;

  function eio(v) { v = Math.max(0, Math.min(1, v)); return 0.5 - 0.5 * Math.cos(Math.PI * v); }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function col(a, white) { return 'rgba(' + (white ? '255,255,255' : white === 0 ? '255,224,251' : rgb) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function accent() {
    var now = Date.now();
    if (now - rgbAt < 1000) return;
    rgbAt = now;
    var v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v)) rgb = v.replace(/\s+/g, '');
  }
  function star(x, y, r, a, white) {
    if (r <= 0 || a <= 0) return;
    g.fillStyle = col(a, white); g.beginPath();
    for (var i = 0; i < 8; i++) { var rr = i % 2 ? r * 0.28 : r, an = i * Math.PI / 4 - Math.PI / 2; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    g.closePath(); g.fill();
    g.fillStyle = col(a * 0.9, true); g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill();
  }

  // Where the cups are right now, from what the dance is showing: [frame A, frame B, how much B].
  function cupsFor(a, b, t) {
    var A = CUPS[a], B = CUPS[b] || A;
    if (!A) return null;
    return [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
  }

  function attach(parent) {
    if (canvas) return canvas;
    canvas = document.createElement('canvas'); canvas.className = 'zeni-fx'; canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(canvas); g = canvas.getContext('2d');
    return canvas;
  }
  function size(w, h) {
    if (!canvas) return;
    var m = Math.round(w * MARGIN), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (box.w === w && box.h === h) return;
    box = { w: w, h: h, m: m, dpr: dpr };
    canvas.style.left = canvas.style.top = -m + 'px';
    canvas.style.width = (w + 2 * m) + 'px'; canvas.style.height = (h + 2 * m) + 'px';
    canvas.width = Math.round((w + 2 * m) * dpr); canvas.height = Math.round((h + 2 * m) * dpr);
  }

  function emit(style, side, power, cup) {
    var P = function (o) { o.side = side; o.t = 0; o.p = o.p || power; o.d = o.d || 0; o.dur = o.dur || 0.5; o.cup = cup; fx.push(o); };
    P({ k: 'bloom', dur: 0.45 });
    var stars = style === 'burst' ? Math.round(7 + power * 7) : Math.round(2 + power * 3);
    for (var i = 0; i < stars; i++) P({ k: 'star', d: Math.random() * 0.06, dur: 0.8 + Math.random() * 0.5, a: (side < 0 ? Math.PI : 0) + (Math.random() - 0.5) * (style === 'burst' ? 2.6 : 1.5),
      v: (style === 'burst' ? 70 : 50) + Math.random() * 80, spin: (Math.random() - 0.5) * 6, r: 3 + Math.random() * (style === 'burst' ? 5 : 3.5), pink: Math.random() < 0.35 });
    if (style === 'waves') { P({ k: 'arc' }); P({ k: 'arc', p: power * 0.8, d: 0.12 }); if (power >= 0.75 && Math.random() < 0.7) P({ k: 'note', d: 0.05, dur: 1.2, ch: Math.random() < 0.5 ? '♪' : '♫', wob: Math.random() * 6 }); }
    if (style === 'rings') { P({ k: 'ring', dur: 0.6 }); P({ k: 'ring', dur: 0.6, d: 0.1, p: power * 0.7 }); }
    if (style === 'burst') P({ k: 'flare', dur: 0.35 });
    if (style === 'eq') P({ k: 'eq', dur: 0.45, seed: Math.random() * 9 });
    if (fx.length > 160) fx.splice(0, fx.length - 160);
  }

  // dt in seconds; cups in sprite pixels (or null when no dance frame is showing); hits = strengths (0-1)
  // of the music hits that just passed; opts = { style, strength (0-1) }.
  function update(dt, cups, hits, opts) {
    if (!canvas) return;
    accent();
    if (cups && hits && hits.length && opts.style !== 'off') {
      var power = Math.max.apply(null, hits);
      power = Math.max(0.45, Math.min(1, power));
      emit(opts.style, -1, power, 0); emit(opts.style, 1, power, 1);
    }
    var dpr = box.dpr || 1, k = box.w / 600, amt = opts.strength, grow = (0.7 + amt * 0.6) * (box.w / 130);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    if (!fx.length) return;
    if (!cups) { fx = []; return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'lighter';
    fx = fx.filter(function (e) { return e.t - e.d < 1; });
    for (var n = 0; n < fx.length; n++) {
      var e = fx[n]; e.t += dt / e.dur;
      var life = e.t - e.d; if (life <= 0 || life >= 1) continue;
      var c = cups[e.cup], x = box.m + c[0] * k, y = box.m + c[1] * k, a = (1 - life) * amt * e.p, base = e.side < 0 ? Math.PI : 0, j, r, rr, gr;
      g.save(); g.shadowColor = col(1); g.shadowBlur = 14 * amt * k * 2;
      if (e.k === 'bloom') {
        rr = (14 + life * 30) * grow * 0.5; gr = g.createRadialGradient(x, y, 0, x, y, rr); g.shadowBlur = 0;
        gr.addColorStop(0, col(a * 0.6, true)); gr.addColorStop(0.35, col(a * 0.55)); gr.addColorStop(1, col(0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      } else if (e.k === 'arc') {
        g.lineCap = 'round'; r = (12 + life * 50 * e.p) * grow * 0.5;
        for (j = 0; j < 2; j++) {
          rr = r + j * 8 * grow * 0.5; gr = g.createLinearGradient(x, y - rr, x, y + rr);
          g.lineWidth = (4 - j * 1.5) * (1 - life * 0.5) * grow * 0.5;
          gr.addColorStop(0, col(0)); gr.addColorStop(0.5, j ? col(a * 0.9) : col(a * 0.75, true)); gr.addColorStop(1, col(0));
          g.strokeStyle = gr; g.beginPath(); g.arc(x, y, rr, base - 0.7, base + 0.7); g.stroke();
        }
      } else if (e.k === 'ring') {
        r = (8 + life * 46 * e.p) * grow * 0.5;
        g.lineWidth = 3 * (1 - life * 0.6) * grow * 0.5; g.strokeStyle = col(a * 0.9); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 1.2 * grow * 0.5; g.strokeStyle = col(a * 0.6, true); g.beginPath(); g.arc(x, y, r * 0.72, 0, Math.PI * 2); g.stroke();
        for (j = 0; j < 6; j++) { var an = j * Math.PI / 3 + life * 2; star(x + Math.cos(an) * r, y + Math.sin(an) * r, 2.5 * (1 - life) * grow * 0.5, a, true); }
      } else if (e.k === 'flare') {
        r = (10 + life * 40) * grow * 0.5; g.lineWidth = 2 * grow * 0.5;
        for (j = 0; j < 4; j++) { var fa = j * Math.PI / 4 + Math.PI / 8; g.strokeStyle = col(a * 0.8, true); g.beginPath(); g.moveTo(x - Math.cos(fa) * r, y - Math.sin(fa) * r); g.lineTo(x + Math.cos(fa) * r, y + Math.sin(fa) * r); g.stroke(); }
      } else if (e.k === 'star') {
        var dist = Math.sqrt(life) * e.v * grow * 0.5, sx = x + Math.cos(e.a) * dist + Math.sin(life * 6 + e.spin) * 4 * grow * 0.5, sy = y + Math.sin(e.a) * dist * 0.6 - life * 42 * grow * 0.5;
        var tw = 0.55 + 0.45 * Math.sin(life * 22 + e.spin * 3);
        g.translate(sx, sy); g.rotate(life * e.spin); star(0, 0, e.r * (1 - life * 0.5) * (0.8 + amt * 0.4) * grow * 0.5, (1 - life) * amt * tw, e.pink ? 0 : undefined);
      } else if (e.k === 'note') {
        g.fillStyle = col((1 - life) * amt); g.font = '600 ' + Math.round((15 + amt * 6) * grow * 0.5) + 'px "Segoe UI Symbol", sans-serif'; g.textAlign = 'center';
        g.fillText(e.ch, x + e.side * (14 + life * 30) * grow * 0.5 + Math.sin(life * 5 + e.wob) * 6, y - (8 + life * 60) * grow * 0.5);
      } else if (e.k === 'eq') {
        for (j = 0; j < 4; j++) {
          var hh = (8 + Math.abs(Math.sin((j + 1) * 1.7 + e.seed)) * 26) * (1 - life * 0.6) * grow * 0.5, bx = x + e.side * (14 + j * 7 + life * 10) * grow * 0.5;
          gr = g.createLinearGradient(bx, y - hh / 2, bx, y + hh / 2); gr.addColorStop(0, col(a, true)); gr.addColorStop(1, col(a * 0.6));
          g.fillStyle = gr; g.fillRect(bx - 2 * grow * 0.5, y - hh / 2, 4 * grow * 0.5, hh);
          star(bx, y - hh / 2 - (4 + life * 10) * grow * 0.5, 2.5 * (1 - life) * grow * 0.5, a, true);
        }
      }
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }
  function clear() { fx = []; if (g) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); } }

  window.ZenframeZeniFx = { attach: attach, size: size, update: update, clear: clear, cupsFor: cupsFor, _count: function () { return fx.length; } };
}());
