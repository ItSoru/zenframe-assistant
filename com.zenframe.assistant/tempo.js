/* Zenframe Assistant 1.3.0: song tempo and beat grid, computed locally from the audio file. */
/* Zenframe tempo analysis: spectral-flux onsets, comb-filtered autocorrelation tempogram,
   log-normal tempo prior, beat-phase fit. Works on a mono Float32Array. */
(function (root) {
  'use strict';
  function fft(re, im) {
    var n = re.length, i, j, k, len, half, wr, wi, tr, ti, ur, ui, ang, cr, ci, t;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (len = 2; len <= n; len <<= 1) {
      half = len >> 1; ang = -2 * Math.PI / len; cr = Math.cos(ang); ci = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        wr = 1; wi = 0;
        for (k = 0; k < half; k++) {
          ur = re[i + k]; ui = im[i + k];
          tr = re[i + k + half] * wr - im[i + k + half] * wi; ti = re[i + k + half] * wi + im[i + k + half] * wr;
          re[i + k] = ur + tr; im[i + k] = ui + ti; re[i + k + half] = ur - tr; im[i + k + half] = ui - ti;
          t = wr * cr - wi * ci; wi = wr * ci + wi * cr; wr = t;
        }
      }
    }
  }
  // Downmix/resample to ~11 kHz: plenty for rhythm, 4x less work.
  function prepare(channels, sr) {
    var step = Math.max(1, Math.round(sr / 11025)), len = Math.floor(channels[0].length / step), out = new Float32Array(len), c, i, k, s;
    for (i = 0; i < len; i++) { s = 0; for (c = 0; c < channels.length; c++) for (k = 0; k < step; k++) s += channels[c][i * step + k]; out[i] = s / (step * channels.length); }
    return { data: out, sr: sr / step };
  }
  function onsetEnvelope(x, sr) {
    var N = 1024, hop = 128, frames = Math.floor((x.length - N) / hop), win = new Float32Array(N), i, f, k;
    for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var bins = 220 /* up to ~2.4 kHz */, prev = new Float32Array(bins), env = new Float32Array(Math.max(0, frames)), rms = new Float32Array(Math.max(0, frames));
    var low = new Float32Array(Math.max(0, frames)), high = new Float32Array(Math.max(0, frames)); // 1.4.0: kick/bass vs snare/clap/hat
    // 1.5.1: flux in the snare/tom body band (~150-480 Hz) and above it, for telling drums from melody and hi-hats.
    var body = new Float32Array(Math.max(0, frames)), top = new Float32Array(Math.max(0, frames)), lowLin = new Float32Array(Math.max(0, frames)), bodyLin = new Float32Array(Math.max(0, frames)), prevLin = new Float32Array(bins);
    var re = new Float64Array(N), im = new Float64Array(N);
    for (f = 0; f < frames; f++) {
      var off = f * hop, e = 0;
      for (i = 0; i < N; i++) { var v = x[off + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      rms[f] = Math.sqrt(e / N);
      fft(re, im);
      var flux = 0;
      for (k = 1; k < bins; k++) {
        var mag = Math.log(1 + 100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        var d = mag - prev[k]; if (d > 0) { flux += d * (k < 30 ? 1.5 : 1); if (k < 14) low[f] += d; else if (k > 40) high[f] += d; }
        if (d > 0) { if (k >= 14 && k < 45) body[f] += d; else if (k >= 45) top[f] += d; }
        if (k < 45) { var lin = Math.sqrt(re[k] * re[k] + im[k] * im[k]), dl = lin - prevLin[k]; if (dl > 0) { if (k >= 2 && k < 14) lowLin[f] += dl; else if (k >= 14) bodyLin[f] += dl; } prevLin[k] = lin; }
        prev[k] = mag;
      }
      env[f] = flux;
    }
    // Remove slow trend so loud sections don't dominate.
    var w = 32, out = new Float32Array(env.length), acc = 0, q = [];
    for (f = 0; f < env.length; f++) { acc += env[f]; q.push(env[f]); if (q.length > 2 * w + 1) acc -= q.shift(); out[f] = Math.max(0, env[f] - acc / q.length); }
    return { env: out, fps: sr / hop, rms: rms, low: low, high: high, raw: env, body: body, top: top, lowLin: lowLin, bodyLin: bodyLin };
  }
  // 1.5.1: the analysis finds a hit to within one analysis window (about 90 ms). This looks at the real samples around
  // each one and finds the moment the sound actually starts (the steepest rise of its level in the band of that hit),
  // so a marker placed there lines up with what you hear. Adds `at` (seconds in the file) to every hit.
  function refine(hits, channels, sr) {
    var len = channels[0].length, nch = channels.length, hop = Math.max(1, Math.round(sr / 1000)), i, j, h;
    for (var hi = 0; hi < hits.length; hi++) {
      h = hits[hi];
      var low = h.kind === 'low', pre = 0.03, post = 0.17, warm = Math.round(0.06 * sr);
      var a = Math.max(0, Math.round((h.t - pre) * sr)), b = Math.min(len, Math.round((h.t + post) * sr));
      if (b - a < hop * 20) { h.at = h.t; continue; }
      var a0 = Math.max(0, a - warm), y = new Float32Array(b - a0), l1 = 0, l2 = 0, al = 1 - Math.exp(-2 * Math.PI * (low ? 220 : 160) / sr);
      for (i = a0; i < b; i++) {
        var m = 0; for (j = 0; j < nch; j++) m += channels[j][i]; m /= nch;
        l1 += al * (m - l1); l2 += al * (l1 - l2);
        y[i - a0] = low ? l2 : m - l2;   // the bass of the sound, or everything above the bass
      }
      // level every millisecond: a short average of |y| (longer for bass, whose waves are long)
      var w = Math.round((low ? 0.010 : 0.003) * sr), steps = Math.floor((b - a) / hop), env = new Float32Array(steps), peak = 0;
      for (i = 0; i < steps; i++) {
        var c = (a - a0) + i * hop, s0 = Math.max(0, c - w), s1 = Math.min(y.length, c + w), acc = 0;
        for (j = s0; j < s1; j++) acc += Math.abs(y[j]);
        env[i] = acc / Math.max(1, s1 - s0); if (env[i] > peak) peak = env[i];
      }
      if (!(peak > 0)) { h.at = h.t; continue; }
      var gap = low ? 6 : 3, d = new Float32Array(steps), dmax = 0, at = 0, floor = peak * 0.03;
      for (i = gap; i < steps - gap; i++) { d[i] = Math.log(env[i + gap] + floor) - Math.log(env[i - gap] + floor); if (d[i] > dmax) { dmax = d[i]; at = i; } }
      if (dmax <= 0) { h.at = h.t; continue; }
      while (at > gap && d[at - 1] > 0.3 * dmax) at--;                   // back to where the rise starts
      h.at = Math.round((a + (at + gap * 0.5 + w / hop) * hop) / sr * 1000) / 1000;   // the averaging window makes the rise look earlier by about its half-width
    }
  }
  // 1.5.1: the beat grid is fitted on the analysis windows, which sit about 80 ms ahead of what you hear. With the exact
  // hit times we can line the grid up with the real beats: slide it a little and keep the spot where the strong hits fall closest.
  // Gives the exact grid start (offsetExact) and the shift (lead = offset - offsetExact, in the same time base as the grid) for the
  // headphone effects, which keep sharing the dance's timing.
  function alignGrid(result) {
    var hits = result.hits, per = result.period, best = -1, bestX = 0.075, sum = 0, count = 0, x, i;
    result.offsetExact = result.offset + bestX; result.lead = -bestX;   // a window starts, on average, about 75 ms before the sound it finds
    if (hits.length < 8) return;
    var found = null;
    for (x = 0.03; x <= 0.093; x += 0.001) {                  // the lead cannot be longer than one window (93 ms)
      var sc = 0;
      for (i = 0; i < hits.length; i++) {
        var d = ((hits[i].at - (result.offset + x)) % per + per * 1.5) % per - per / 2;
        sc += Math.min(1.2, hits[i].g || 0.5) * Math.exp(-d * d / (2 * 0.02 * 0.02));
      }
      sum += sc; count++;
      if (sc > best) { best = sc; found = x; }
    }
    // Only trust the fit when the hits really sit on the grid; otherwise keep the typical lead.
    if (found !== null && best > 1.3 * (sum / count)) bestX = found;
    result.offsetExact = result.offset + bestX; result.lead = -bestX;
  }
  function analyze(channels, sampleRate, opts) {
    opts = opts || {};
    var p = prepare(channels, sampleRate), o = onsetEnvelope(p.data, p.sr), env = o.env, fps = o.fps, n = env.length;
    var minBpm = 60, maxBpm = 200, maxLag = Math.ceil(fps * 60 / minBpm) * 4 + 2, ac = new Float64Array(maxLag + 1), lag, i;
    for (lag = 1; lag <= maxLag; lag++) { var s = 0; for (i = 0; i + lag < n; i++) s += env[i] * env[i + lag]; ac[lag] = s / (n - lag); }
    var acAt = function (l) { var a = Math.floor(l), b = a + 1, t = l - a; return b > maxLag ? 0 : ac[a] * (1 - t) + ac[b] * t; };
    var best = null, prior = opts.prior || 120, cands = [];
    for (var bpm = minBpm; bpm <= maxBpm; bpm += 0.1) {
      var L = fps * 60 / bpm;
      // Comb: the true period repeats at 2x and 4x, and is subdivided at 0.5x.
      var main = acAt(L), base = main + 0.5 * acAt(2 * L) + 0.25 * acAt(4 * L);
      // Real beats are usually split into eighth notes; triplet or dotted patterns are not.
      var duple = main > 0 ? Math.min(1, acAt(L / 2) / main) : 0;
      var score = base * (0.6 + 0.4 * duple);
      var oct = Math.log(bpm / prior) / Math.LN2;
      score *= Math.exp(-0.5 * oct * oct / (0.9 * 0.9));
      cands.push([bpm, score]);
      if (!best || score > best[1]) best = [bpm, score];
    }
    // 1.5.1: a slow tempo is often half of the real one (a song at 145 BPM found as 72.5). When the pulse at twice the speed is
    // about as strong as the slow one, the faster tempo is the one people count.
    if (best[0] < 85 && best[0] * 2 <= maxBpm) {
      var slowL = fps * 60 / best[0], slowStrength = acAt(slowL);
      if (slowStrength > 0 && acAt(slowL / 2) / slowStrength >= 0.75) {   // songs that really are slow score 0.6 or less here, halved ones 0.8 or more
        var dbl = best[0] * 2, faster = null;
        cands.forEach(function (c) { if (Math.abs(c[0] - dbl) <= dbl * 0.03 && (!faster || c[1] > faster[1])) faster = c; });
        if (faster) best = faster;
      }
    }
    // Fine-tune: slide a beat grid over the whole song and keep the tempo/phase that lands on the most onsets.
    function gridFit(bpmTry, offStep) {
      var pf = fps * 60 / bpmTry, top = { sum: -1, off: 0 };
      for (var off = 0; off < pf; off += offStep) {
        var sum = 0;
        for (var pos = off; pos < n - 1; pos += pf) { var ix = Math.floor(pos), t = pos - ix; sum += env[ix] * (1 - t) + env[ix + 1] * t; }
        if (sum > top.sum) { top.sum = sum; top.off = off; }
      }
      return top;
    }
    var fine = { bpm: best[0], fit: gridFit(best[0], 0.5) };
    for (var bt = best[0] * 0.97; bt <= best[0] * 1.03; bt += 0.02) { var g = gridFit(bt, 1); if (g.sum > fine.fit.sum) fine = { bpm: bt, fit: g }; }
    fine.fit = gridFit(fine.bpm, 0.25);
    var bpmOut = Math.round(fine.bpm * 100) / 100, period = 60 / bpmOut, perF = period * fps, bestOff = fine.fit.off;
    // Loudness per beat (0..1) for "how hard Zeni vibes".
    var beats = [], maxR = 0, b;
    for (b = bestOff; b < n; b += perF) { var a0 = Math.round(b), a1 = Math.min(n, Math.round(b + perF)), r = 0; for (i = a0; i < a1; i++) r += o.rms[i]; r /= Math.max(1, a1 - a0); beats.push(r); if (r > maxR) maxR = r; }
    for (b = 0; b < beats.length; b++) beats[b] = maxR ? +(beats[b] / maxR).toFixed(3) : 0;
    // Alternatives (half / double) so the UI can offer a quick fix.
    var result = { bpm: bpmOut, period: period, offset: bestOff / fps, energy: beats, alt: [Math.round(bpmOut * 5) / 10, Math.round(bpmOut * 20) / 10] };
    if (opts.detail) {
      detail(result, o, fps, n); refine(result.hits, channels, sampleRate);
      // The same hit is often found twice, a window apart; after refining both land on the same moment. Keep the stronger.
      var uniq = [];
      result.hits.sort(function (a, b) { return a.at - b.at; }).forEach(function (h) { var l = uniq[uniq.length - 1]; if (l && h.at - l.at < 0.07) { if (h.g > l.g) uniq[uniq.length - 1] = h; } else uniq.push(h); });
      result.hits = uniq;
      alignGrid(result);
      // For the effects: each hit in the time base of the beat grid, so it lands on the beat exactly where the music puts it.
      result.hits.forEach(function (h) { h.te = Math.round((h.at + result.lead) * 1000) / 1000; });
      result.hits.sort(function (a, b) { return a.te - b.te; });
    }
    return result;
  }
  // 1.5.1: the hits that deserve an effect: kicks, snares, claps and other drum-like attacks. Melodic onsets (synth
  // stabs, vocals) and hi-hats are left out. Every hit is judged against the hits around it (about 4 s either side),
  // not against the loudest moment of the song, so quiet kicks still count and one big crash does not hide the rest.
  // ref = the percentile of the nearby hits a hit is compared with; the pairs are [on the beat grid, between the
  // eighth notes of the grid]: the share of that level a hit must reach.
  var HITCFG = { ref: 0.9, kick: [0.4, 0.4], body: [0.4, 0.8], bodyTop: 1.5, crash: 4, grid: 0.055 };
  function percussiveHits(result, o, fps, n) {
    var C = HITCFG, win = Math.max(1, Math.round(0.05 * fps)), mergeGap = 0.06, half = result.period / 2, i;
    function peaks(x) {
      var sorted = Array.prototype.slice.call(x).sort(function (a, b) { return a - b; }), floor = sorted[Math.floor(sorted.length * 0.97)] * 0.1, out = [];
      for (var f = 1; f < n - 1; f++) {
        var v = x[f]; if (v <= floor) continue;
        var isPeak = true;
        for (var q = Math.max(0, f - win); q <= Math.min(n - 1, f + win); q++) if (x[q] > v || (x[q] === v && q < f)) { isPeak = false; break; }
        if (isPeak) out.push({ t: f / fps, v: v });
      }
      return out;
    }
    // The level of the peaks of one band within 4 s of time t (a percentile of them).
    function localRef(list, t, pct, whole) {
      var lo = 0, hi = list.length, mid;
      while (lo < hi) { mid = (lo + hi) >> 1; if (list[mid].t < t - 4) lo = mid + 1; else hi = mid; }
      var vs = []; for (var k = lo; k < list.length && list[k].t <= t + 4; k++) vs.push(list[k].v);
      if (vs.length < 6) return whole;
      vs.sort(function (a, b) { return a - b; });
      return vs[Math.floor(vs.length * pct)];
    }
    function wholeRef(list, pct) { var vs = list.map(function (h) { return h.v; }).sort(function (a, b) { return a - b; }); return vs.length ? vs[Math.floor(vs.length * pct)] : 1; }
    function offGrid(t) { var ph = ((t - result.offset) % half + half) % half; return Math.min(ph, half - ph) > C.grid; }
    var kp = peaks(o.lowLin), bp = peaks(o.bodyLin), tp = peaks(o.top), kg = wholeRef(kp, 0.95), bg = wholeRef(bp, 0.95), tg = wholeRef(tp, 0.95), kw = wholeRef(kp, C.ref), bw = wholeRef(bp, C.ref), tw = wholeRef(tp, 0.5), tpw = wholeRef(tp, C.ref), hits = [], all = [], j = 0, jFrom = 0;
    kp.forEach(function (h) { var r = localRef(kp, h.t, C.ref, kw); if (h.v >= C.kick[offGrid(h.t) ? 1 : 0] * r) all.push({ t: h.t, s: Math.min(1, h.v / r), g: h.v / kg, kind: 'low' }); });
    // Snares, toms, claps: a hit in the body band that comes with noise above it (a drum, not a note), either on the grid or clearly strong.
    bp.forEach(function (h) {
      var r = localRef(bp, h.t, C.ref, bw);
      if (h.v < C.body[offGrid(h.t) ? 1 : 0] * r) return;
      var noise = 0; for (j = 0; j < tp.length; j++) { if (tp[j].t > h.t + 0.04) break; if (Math.abs(tp[j].t - h.t) <= 0.04 && tp[j].v > noise) noise = tp[j].v; }
      if (noise < C.bodyTop * localRef(tp, h.t, C.ref, tpw)) return;
      all.push({ t: h.t, s: Math.min(1, h.v / r), g: h.v / bg, kind: 'high' });
    });
    tp.forEach(function (h) { if (h.v >= C.crash * localRef(tp, h.t, 0.5, tw)) all.push({ t: h.t, s: 1, g: h.v / tg, kind: 'high' }); }); // big accents stand far above the usual hats
    all.sort(function (a, b) { return a.t - b.t; });
    for (i = 0; i < all.length; i++) {
      var last = hits[hits.length - 1];
      if (last && all[i].t - last.t < mergeGap) { if (all[i].s > last.s) { last.s = all[i].s; last.kind = all[i].kind; } if (all[i].g > last.g) last.g = all[i].g; } else hits.push(all[i]);
    }
    for (i = 0; i < hits.length; i++) { hits[i].s = Math.round(hits[i].s * 100) / 100; hits[i].g = Math.round(hits[i].g * 100) / 100; }
    return hits;
  }
  // 1.4.0: what Zeni "hears": the hits (with kick or snare character), a loudness curve and the quiet parts.
  function detail(result, o, fps, n) {
    var i, j, hits = percussiveHits(result, o, fps, n);
    var step = Math.max(1, Math.round(0.25 * fps)), loud = [], maxL = 0;
    for (i = 0; i < n; i += step) { var r = 0, c = 0; for (j = i; j < Math.min(n, i + step); j++) { r += o.rms[j]; c++; } r /= Math.max(1, c); loud.push(r); if (r > maxL) maxL = r; }
    for (i = 0; i < loud.length; i++) loud[i] = maxL ? Math.round(loud[i] / maxL * 100) / 100 : 0;
    result.hits = hits; result.loudness = { step: step / fps, values: loud }; result.duration = n / fps;
  }
  var api = { analyze: analyze };
  if (typeof window !== 'undefined') window.ZenframeTempo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
