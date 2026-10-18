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
    var re = new Float64Array(N), im = new Float64Array(N);
    for (f = 0; f < frames; f++) {
      var off = f * hop, e = 0;
      for (i = 0; i < N; i++) { var v = x[off + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      rms[f] = Math.sqrt(e / N);
      fft(re, im);
      var flux = 0;
      for (k = 1; k < bins; k++) {
        var mag = Math.log(1 + 100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        var d = mag - prev[k]; if (d > 0) { flux += d * (k < 30 ? 1.5 : 1); if (k < 14) low[f] += d; else if (k > 40) high[f] += d; } prev[k] = mag;
      }
      env[f] = flux;
    }
    // Remove slow trend so loud sections don't dominate.
    var w = 32, out = new Float32Array(env.length), acc = 0, q = [];
    for (f = 0; f < env.length; f++) { acc += env[f]; q.push(env[f]); if (q.length > 2 * w + 1) acc -= q.shift(); out[f] = Math.max(0, env[f] - acc / q.length); }
    return { env: out, fps: sr / hop, rms: rms, low: low, high: high, raw: env };
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
    if (opts.detail) detail(result, o, fps, n);
    return result;
  }
  // 1.4.0: what Zeni "hears": the hits (with kick or snare character), a loudness curve and the quiet parts.
  function detail(result, o, fps, n) {
    var env = o.env, i, j, mean = 0, sd = 0;
    for (i = 0; i < n; i++) mean += env[i]; mean /= Math.max(1, n);
    for (i = 0; i < n; i++) sd += (env[i] - mean) * (env[i] - mean); sd = Math.sqrt(sd / Math.max(1, n));
    var win = Math.max(1, Math.round(0.07 * fps)), hits = [], top = 0;
    for (i = 1; i < n - 1; i++) {
      var v = env[i]; if (v < mean + 1.2 * sd) continue;
      var peak = true; for (j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) if (env[j] > v || (env[j] === v && j < i)) { peak = false; break; }
      if (!peak) continue;
      var lo = 0, hi = 0; for (j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j++) { lo += o.low[j]; hi += o.high[j]; }
      hits.push({ t: i / fps, s: v, kind: lo / 13 > hi / 179 * 1.5 ? 'low' : 'high' }); if (v > top) top = v;
    }
    for (i = 0; i < hits.length; i++) hits[i].s = top ? Math.round(hits[i].s / top * 100) / 100 : 0;
    var step = Math.max(1, Math.round(0.25 * fps)), loud = [], maxL = 0;
    for (i = 0; i < n; i += step) { var r = 0, c = 0; for (j = i; j < Math.min(n, i + step); j++) { r += o.rms[j]; c++; } r /= Math.max(1, c); loud.push(r); if (r > maxL) maxL = r; }
    for (i = 0; i < loud.length; i++) loud[i] = maxL ? Math.round(loud[i] / maxL * 100) / 100 : 0;
    result.hits = hits; result.loudness = { step: step / fps, values: loud }; result.duration = n / fps;
  }
  var api = { analyze: analyze };
  if (typeof window !== 'undefined') window.ZenframeTempo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
