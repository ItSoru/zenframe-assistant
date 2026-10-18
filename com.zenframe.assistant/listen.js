/* Zenframe Assistant 1.4.0: how Zeni "hears" an edit.
   Most AI models can't take audio, so the comp's music is analyzed here, on this computer (tempo.js), and Zeni
   gets a timeline in comp time: the beat grid, the hits (kick-like or snare/hat-like), the loudness curve and the
   loud and quiet sections, lined up with the cuts, adjustment layers, keyframes and markers of the comp.
   Nothing about the project changes and no audio leaves this computer. */
(function () {
  'use strict';
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;
  var MAX_BYTES = 150 * 1024 * 1024, MAX_VIDEO_BYTES = 600 * 1024 * 1024, cache = {};

  function evalJSON(code) {
    return new Promise(function (resolve) {
      var cep = window.__adobe_cep__;
      if (!cep) return resolve(null);
      cep.evalScript(code, function (r) { var j = null; try { j = JSON.parse(r); } catch (e) {} resolve(j); });
    });
  }
  function decode(path) {
    return new Promise(function (resolve, reject) {
      if (!nodeRequire) return reject(Error('Reading audio files needs the panel inside After Effects.'));
      var buf = nodeRequire('fs').readFileSync(path), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.decodeAudioData(ab, function (audio) { try { ctx.close(); } catch (e) {} resolve(audio); }, function () { try { ctx.close(); } catch (e) {} reject(Error('After Effects can play it, but this audio format could not be decoded here.')); });
    });
  }
  function analyzeFile(layer) {
    var key = layer.path + '|' + layer.bytes + '|' + layer.mod;
    if (cache[key]) return Promise.resolve(cache[key]);
    return decode(layer.path).then(function (audio) {
      var ch = []; for (var i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
      var r = window.ZenframeTempo.analyze(ch, audio.sampleRate, { detail: true });
      cache[key] = r;
      return r;
    });
  }

  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  // Pure part (tested on its own): music analysis + timeline -> the report Zeni reads.
  function report(tl, music) {
    var fd = 1 / (tl.frameRate || 30), out = { comp: { name: tl.name, frameRate: tl.frameRate, duration: r2(tl.duration) } };
    if (!music.length) { out.music = 'No audio layers from files in this comp.'; }
    var main = music[0], beats = [], hits = [];
    music.forEach(function (m) {
      var k = m.layer.stretch / 100, toComp = function (ft) { return m.layer.start + ft * k; };
      var inside = function (t) { return t >= m.layer.in - 1e-6 && t <= m.layer.out + 1e-6; };
      m.r.hits.forEach(function (h) { var t = toComp(h.at !== undefined ? h.at : h.t); if (inside(t)) hits.push({ t: t, s: h.s, g: h.g, kind: h.kind, layer: m.layer.name }); });
      m.firstBeat = null;
      var off0 = m.r.offsetExact !== undefined ? m.r.offsetExact : m.r.offset;
      for (var b = 0; ; b++) { var t = toComp(off0 + b * m.r.period); if (t > m.layer.out) break; if (inside(t)) { beats.push(t); if (m.firstBeat === null) m.firstBeat = t; } if (b > 5000) break; }
    });
    hits.sort(function (a, b) { return a.t - b.t; });
    beats.sort(function (a, b) { return a - b; });
    if (main) {
      var k = main.layer.stretch / 100, per = main.r.period * k;
      out.music = music.map(function (m) { return { layer: m.layer.name, bpmInComp: r2(m.r.bpm / (m.layer.stretch / 100)), stretch: m.layer.stretch, from: r2(m.layer.in), to: r2(m.layer.out) }; });
      out.beatGrid = music.map(function (m) { var e = m.r.period * m.layer.stretch / 100; return { layer: m.layer.name, firstBeat: r3(m.firstBeat || 0), every: r3(e), framesPerBeat: r2(e / fd), from: r2(m.layer.in), to: r2(m.layer.out) }; });
      out.beatGridNote = 'While a layer plays, its beats are firstBeat + n * every (comp seconds). Counted in 4s from the first beat; the downbeat may differ.';
      // Loudness in comp time, 0-9, one digit per quarter second.
      var L = main.r.loudness, step = 0.25, digits = '', sections = [], prev = null;
      for (var t = 0; t < Math.min(tl.duration, 600); t += step) {
        var v = 0;
        if (t >= main.layer.in && t <= main.layer.out) { var ft = (t - main.layer.start) / k, ix = Math.floor(ft / L.step); v = ix >= 0 && ix < L.values.length ? L.values[ix] : 0; }
        var d = Math.min(9, Math.round(v * 9)); digits += d;
        var level = d >= 6 ? 'loud' : d >= 3 ? 'medium' : 'quiet';
        if (level !== prev) { sections.push({ from: r2(t), level: level }); prev = level; }
      }
      // Merge flickers shorter than a second.
      var merged = [];
      sections.forEach(function (sec, i) {
        var end = sections[i + 1] ? sections[i + 1].from : tl.duration;
        if (merged.length && (end - sec.from < 1 || merged[merged.length - 1].level === sec.level)) return;
        merged.push(sec);
      });
      sections = merged;
      out.loudness = { every: step, scale: '0 silent - 9 loudest', values: digits };
      out.sections = sections;
      var listed = hits.filter(function (h) { return h.s >= 0.3; });
      out.hitsTotal = listed.length;
      if (listed.length > 80) out.hitsNote = 'Only the first 80 of ' + listed.length + ' hits are listed. To put markers on the hits, use ae_add_markers: it finds all of them itself.';
      out.hits = listed.slice(0, 80).map(function (h) {
        var nb = nearest(beats, h.t);
        return [r3(h.t), h.s, h.kind === 'low' ? 'kick/bass' : 'snare/hat', nb === null ? '' : Math.abs(h.t - nb) < per / 8 ? 'on beat' : 'off beat'];
      });
      out.hitsFormat = '[time, strength 0-1, sound, beat]';
    }
    // The edit: cuts, effect layers, keyframes and markers, each with how far it sits from the music in frames.
    var strong = hits.filter(function (h) { return h.s >= 0.45; }).map(function (h) { return h.t; });
    var cuts = [], seen = {};
    tl.layers.forEach(function (l) {
      if (!l.on || !(l.type === 'footage' || l.type === 'precomp')) return;
      var f = Math.round(l.in / fd); if (seen[f] || l.in <= fd / 2) return; seen[f] = 1; cuts.push(l.in);
    });
    cuts.sort(function (a, b) { return a - b; });
    function sync(t) {
      var o = [r3(t)];
      var nb = nearest(beats, t), nh = nearest(strong, t);
      o.push(nb === null ? null : Math.round((t - nb) / fd));
      o.push(nh === null || Math.abs(t - nh) > 0.5 ? null : Math.round((t - nh) / fd));
      return o;
    }
    out.cuts = cuts.map(sync);
    out.syncFormat = '[time, frames from nearest beat (+ late, - early), frames from nearest strong hit within 0.5 s or null]';
    var onBeat = out.cuts.filter(function (c) { return c[1] !== null && Math.abs(c[1]) <= 1; }).length;
    if (beats.length && cuts.length) out.summary = onBeat + ' of ' + cuts.length + ' cuts land within 1 frame of a beat.';
    var fx = [];
    tl.layers.forEach(function (l) {
      if (!l.on) return;
      var times = {}, props = [];
      if (l.type === 'adjustment' || l.type === 'solid' || l.type === 'shape' || l.type === 'text') times[Math.round(l.in / fd)] = l.in;
      l.keys.forEach(function (kp) { props.push(kp.prop); kp.keys.forEach(function (kt) { times[Math.round(kt / fd)] = kt; }); });
      var list = Object.keys(times).map(function (f) { return times[f]; }).sort(function (a, b) { return a - b; });
      if (!list.length) return;
      fx.push({ layer: l.i + ' ' + l.name, type: l.type, span: [r2(l.in), r2(l.out)], animates: uniq(props).slice(0, 6), events: list.slice(0, 24).map(sync) });
    });
    out.effects = fx.slice(0, 60);
    if (tl.markers && tl.markers.length) out.markers = tl.markers.slice(0, 40).map(function (m) { return [r3(m.t), m.text || '', m.layer || null]; });
    var lastVideo = 0; tl.layers.forEach(function (l) { if (l.on && (l.type === 'footage' || l.type === 'precomp')) lastVideo = Math.max(lastVideo, l.out); });
    if (main && lastVideo && lastVideo < Math.min(tl.duration, main.layer.out) - 0.5) out.afterLastClip = { from: r2(lastVideo), to: r2(Math.min(tl.duration, main.layer.out)), note: 'Music continues with no footage layer.' };
    return out;
  }
  function nearest(list, t) { var best = null; for (var i = 0; i < list.length; i++) if (best === null || Math.abs(list[i] - t) < Math.abs(best - t)) best = list[i]; return best; }
  function uniq(a) { var o = [], s = {}; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // The comp's timeline and the analysed music of the layers Zeni listens to (picked in Settings, else the music first).
  function loadMusic(args, host) {
    args = args || {};
    var compId = Number(args.compId) || 0;
    return host('timeline_events', compId ? { compId: compId } : {}).then(function (tl) {
      if (!tl || tl.error) return { error: (tl && tl.error) || 'Could not read the comp.' };
      return evalJSON('ZenframeVibeAudio(' + tl.compId + ')').then(function (a) {
        var layers = (a && a.layers || []).filter(function (l) { return l.bytes > 0 && l.bytes <= (l.video ? MAX_VIDEO_BYTES : MAX_BYTES) && l.stretch > 0 && l.out > l.in; });
        var pick = window.ZenframeVibe && window.ZenframeVibe.pick ? window.ZenframeVibe.pick(tl.compId) : [];
        if (pick.length) layers = layers.filter(function (l) { return pick.indexOf(l.name + '|' + l.path) >= 0; });
        else layers.sort(function (x, y) { return (x.video - y.video) || ((y.out - y.in) - (x.out - x.in)); });
        layers = layers.slice(0, 4);
        var music = [], problems = [];
        return layers.reduce(function (p, l) {
          return p.then(function () { return analyzeFile(l).then(function (r) { music.push({ layer: l, r: r }); }, function (e) { problems.push(l.name + ': ' + e.message); }); });
        }, Promise.resolve()).then(function () { return { tl: tl, music: music, problems: problems }; });
      });
    });
  }
  function analyze(args, host) {
    return loadMusic(args, host).then(function (lm) {
      if (lm.error) return { error: lm.error };
      var out = report(lm.tl, lm.music);
      if (lm.problems.length) out.unreadAudio = lm.problems;
      out.howToUse = 'Times are in comp seconds. Use ae_render_frames on times that matter (a cut, a strong hit, the drop) to see them. To put markers on hits or beats use ae_add_markers.';
      return out;
    });
  }

  // 1.5.1: comp markers on the hits (or beats) of the music. The times come straight from the analysis, never through the
  // model, so they are exact and complete. Pure part (tested on its own): analysed music -> the markers to add.
  var STRONG = { bass: { strong: 1.0, medium: 0.75, all: 0 }, snare: { strong: 0.8, medium: 0.6, all: 0 } };
  function markerPlan(tl, music, args) {
    args = args || {};
    var what = ['bass', 'snare', 'bass_and_snare', 'beats'].indexOf(args.what) >= 0 ? args.what : 'bass';
    var level = ['strong', 'medium', 'all'].indexOf(args.strength) >= 0 ? args.strength : 'strong';
    var fps = tl.frameRate || 30, found = [], names = [];
    var label = typeof args.label === 'string' && args.label.trim() ? args.label.trim().slice(0, 60) : null;
    music.forEach(function (m) {
      var k = m.layer.stretch / 100, toComp = function (ft) { return m.layer.start + ft * k; };
      var inside = function (t) { return t >= m.layer.in - 1e-6 && t <= m.layer.out + 1e-6; };
      names.push(m.layer.name);
      if (what === 'beats') {
        var off0 = m.r.offsetExact !== undefined ? m.r.offsetExact : m.r.offset;
        for (var b = 0; b < 20000; b++) { var tb = toComp(off0 + b * m.r.period); if (tb > m.layer.out) break; if (inside(tb)) found.push({ t: tb, kind: 'beat', g: 1 }); }
        return;
      }
      m.r.hits.forEach(function (h) {
        var isBass = h.kind === 'low', g = h.g !== undefined ? h.g : h.s;
        if (isBass ? what === 'snare' : what === 'bass') return;
        if (g < STRONG[isBass ? 'bass' : 'snare'][level]) return;
        var t = toComp(h.at !== undefined ? h.at : h.t);
        if (inside(t)) found.push({ t: t, kind: isBass ? 'bass' : 'snare', g: g });
      });
    });
    found.sort(function (x, y) { return x.t - y.t; });
    var kept = [];
    found.forEach(function (h) { var l = kept[kept.length - 1]; if (l && h.t - l.t < 0.07) { if (h.g > l.g) kept[kept.length - 1] = h; } else kept.push(h); });
    var markers = kept.map(function (h) {
      var t = Math.round(h.t * fps) / fps;
      return { t: r3(t), text: label || (h.kind === 'bass' ? 'Bass hit' : h.kind === 'snare' ? 'Snare' : 'Beat'), kind: h.kind };
    }).filter(function (x) { return x.t >= 0 && x.t <= tl.duration; });
    var counts = { bass: 0, snare: 0, beat: 0 }; markers.forEach(function (x) { counts[x.kind]++; });
    var clock = function (t) { var m = Math.floor(t / 60), sec = t - m * 60; return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2); };
    var kinds = what === 'beats' ? 'beats' : what === 'bass' ? level + ' bass hits' : what === 'snare' ? level + ' snare hits' : level + ' bass and snare hits';
    var summary = ['Add ' + markers.length + ' comp markers to "' + tl.name + '" on the ' + kinds + ' of ' + names.join(', ') +
      (what === 'bass_and_snare' ? ' (' + counts.bass + ' bass, ' + counts.snare + ' snare)' : '')];
    if (markers.length) summary.push('From ' + clock(markers[0].t) + ' to ' + clock(markers[markers.length - 1].t) + ', each on its own frame. Existing markers stay as they are.');
    return { compId: tl.compId, compName: tl.name, frameRate: fps, what: what, strength: level, markers: markers, counts: counts, layers: names, summary: summary };
  }
  function planMarkers(args, host) {
    return loadMusic(args, host).then(function (lm) {
      if (lm.error) return { error: lm.error };
      if (!lm.music.length) return { error: 'There is no music from a file in this comp to place markers on.' + (lm.problems.length ? ' ' + lm.problems.join(' ') : '') };
      return markerPlan(lm.tl, lm.music, args);
    });
  }

  // 1.4.0: beat grid of one sound file by path (for studying a project file).
  function analyzePath(p) {
    var fs = nodeRequire && nodeRequire('fs'), st = fs ? fs.statSync(p) : null;
    if (!st) return Promise.reject(Error('Not available here.'));
    return analyzeFile({ path: p, bytes: st.size, mod: st.mtimeMs, video: /\.(mp4|mov)$/i.test(p) }).then(function (r) { return { bpm: r.bpm, period: r.period, offset: r.offset }; });
  }
  window.ZenframeListen = { analyze: analyze, analyzePath: analyzePath, planMarkers: planMarkers, _report: report, _markerPlan: markerPlan };
}());
