/* Zenframe Assistant 1.3.0: Zeni vibes to the music in your comp.
   The song's tempo and beat grid are worked out once, locally, from the audio file of the comp's music layer.
   Playback is detected from After Effects' own output level (a small Windows helper reads the level meter of
   After Effects' audio sessions, see backend/AudioMeter.cs): when After Effects starts making sound, the comp is
   playing from where the playhead was. Zeni then follows the beat grid with the panel's own clock (looping in
   the work area) until the sound stops or the playhead jumps. Where the helper can't run, a pause in After
   Effects' answers is used instead. Nothing here changes the project, and no audio is recorded or sent. */
(function () {
  'use strict';
  var cep = window.__adobe_cep__;
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;
  var POLL_MS = 50, STALL_MS = 150, LOUD = 0.002, QUIET_MS = 800, AUDIO_LAG_MS = 20, AUDIO_EVERY_MS = 2000, MAX_BYTES = 150 * 1024 * 1024, CACHE_KEY = 'zenframeAssistant.tempoCache';

  var enabled = false, timer = 0, pending = null, lastReply = null, playing = null, lastAudioCheck = -Infinity;
  var song = null, songKey = '', analyzing = '', failedKeys = {}, idleReplies = 0;
  var memo = {};
  var meter = { status: 'off', peak: 0, loudAt: 0, sessions: 0, stop: null, reason: '' };
  try { memo = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { memo = {}; }

  function hostBusy() { return (window.ZenframeHostBusy || 0) > 0; }
  function now() { return performance.now(); }
  function call(fn, done) {
    if (!cep) return;
    try { cep.evalScript(fn + '()', function (r) { var j = null; try { j = JSON.parse(r); } catch (e) {} done(j); }); } catch (e) { done(null); }
  }
  function saveMemo() {
    var keys = Object.keys(memo);
    if (keys.length > 24) keys.sort(function (a, b) { return memo[a].at - memo[b].at; }).slice(0, keys.length - 24).forEach(function (k) { delete memo[k]; });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(memo)); } catch (e) {}
  }

  /* ---------- Finding and analyzing the song ---------- */
  function pickLayer(layers) {
    var list = (layers || []).filter(function (l) { return l.bytes > 0 && l.bytes <= MAX_BYTES && l.stretch > 0 && l.out > l.in; });
    // Music first: audio-only files, then the longest.
    list.sort(function (a, b) { return (a.video - b.video) || ((b.out - b.in) - (a.out - a.in)); });
    return list[0] || null;
  }
  function analyze(layer) {
    var key = layer.path + '|' + layer.bytes + '|' + layer.mod;
    var timing = { start: layer.start, stretch: layer.stretch, inPoint: layer.in, outPoint: layer.out };
    if (memo[key]) { memo[key].at = Date.now(); song = Object.assign({}, memo[key].r, timing); songKey = key; return; }
    if (analyzing === key || failedKeys[key] || !nodeRequire) return;
    analyzing = key;
    setTimeout(function () {
      try {
        var fs = nodeRequire('fs'), buf = fs.readFileSync(layer.path), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.decodeAudioData(ab, function (audio) {
          setTimeout(function () {
            try {
              var ch = []; for (var i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
              var est = window.ZenframeTempo.analyze(ch, audio.sampleRate);
              var r = { bpm: est.bpm, period: est.period, offset: est.offset, energy: est.energy };
              memo[key] = { r: r, at: Date.now() }; saveMemo();
              if (analyzing === key) { song = Object.assign({}, r, timing); songKey = key; }
            } catch (e) { failedKeys[key] = true; }
            analyzing = ''; try { ctx.close(); } catch (e) {}
          }, 20);
        }, function () { failedKeys[key] = true; analyzing = ''; try { ctx.close(); } catch (e) {} });
      } catch (e) { failedKeys[key] = true; analyzing = ''; }
    }, 20);
  }
  function checkAudio() {
    lastAudioCheck = now();
    call('ZenframeVibeAudio', function (j) {
      if (!j || !j.c) { song = null; songKey = ''; return; }
      var layer = pickLayer(j.layers);
      if (!layer) { song = null; songKey = ''; return; }
      var key = layer.path + '|' + layer.bytes + '|' + layer.mod;
      if (key === songKey && song) { song.start = layer.start; song.stretch = layer.stretch; song.inPoint = layer.in; song.outPoint = layer.out; return; }
      analyze(layer);
    });
  }

  /* ---------- Hearing After Effects play ---------- */
  function meterUsable() { return meter.status === 'ok' && meter.sessions > 0; }
  function startMeter() {
    if (meter.stop || meter.status === 'failed' || !nodeRequire) { if (!nodeRequire) meter.status = 'failed'; return; }
    var root = '';
    try { root = cep.getSystemPath('extension'); } catch (e) {}
    if (!root) { meter.status = 'failed'; return; }
    try {
      var path = nodeRequire('path'), url = nodeRequire('url');
      if (/^file:/i.test(root)) root = url.fileURLToPath ? url.fileURLToPath(root) : decodeURIComponent(root.replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1'));
      var m = nodeRequire(path.join(root, 'backend', 'meter.cjs'));
      meter.status = 'starting';
      meter.stop = m.start(function (e) {
        if (e.ready) meter.status = 'ok';
        else if (e.sessions !== undefined) meter.sessions = e.sessions;
        else if (e.peak !== undefined) heard(e.peak);
        else if (e.ended) { meter.stop = null; meter.reason = e.reason || ''; if (meter.status !== 'off') meter.status = 'failed'; if (playing && playing.by === 'meter') playing = null; }
      });
    } catch (e) { meter.status = 'failed'; meter.reason = e.message; meter.stop = null; }
  }
  function stopMeter() { var s = meter.stop; meter.stop = null; meter.status = 'off'; meter.peak = 0; if (s) s(); }
  function heard(peak) {
    meter.peak = peak;
    var t = now();
    if (peak < LOUD) return;
    meter.loudAt = t;
    if (!playing && enabled && song && lastReply && t - lastReply.at < 1000) {
      playing = { by: 'meter', from: lastReply.t, cti: lastReply.t, wall: t - AUDIO_LAG_MS, ws: lastReply.ws, wd: lastReply.wd };
    }
  }

  /* ---------- Watching the playhead ---------- */
  function schedule(delay) { clearTimeout(timer); if (enabled) timer = setTimeout(poll, delay); }
  function poll() {
    if (!enabled) return;
    if (pending) return schedule(POLL_MS);
    if (!playing && now() - lastAudioCheck > AUDIO_EVERY_MS && !hostBusy()) { checkAudio(); return schedule(POLL_MS); }
    var sent = now(), token = pending = { sent: sent };
    call('ZenframeVibeTime', function (j) {
      if (pending !== token) return;
      pending = null;
      var t = now();
      if (playing && playing.by === 'stall') playing = null; // After Effects is answering again: playback stopped.
      if (playing && playing.by === 'meter') {
        if (!j || !j.c) playing = null;
        else if (Math.abs(j.t - playing.cti) > 0.02) {
          // The playhead moved. If it is following playback, sync to it; if it jumped, playback stopped or was moved.
          var est = compTime();
          if (est !== null && Math.abs(j.t - est) < 0.3) { playing.from = j.t; playing.cti = j.t; playing.wall = t; }
          else playing = null;
        }
      }
      if (j && j.c) { lastReply = { at: t, t: j.t, ws: j.ws, wd: j.wd, comp: j.c }; idleReplies++; }
      else { lastReply = null; idleReplies = 0; }
      schedule(POLL_MS);
    });
    watch(token);
  }
  // No answer after a short wait means After Effects is busy: if a song is ready and nothing else in the panel
  // is talking to After Effects, that is playback starting from the last known playhead position.
  function watch(token) {
    setTimeout(function () {
      if (pending !== token || playing || !enabled || meter.status === 'ok' || meter.status === 'starting') return; // the meter knows better: no dancing while scrubbing
      if (song && lastReply && idleReplies >= 3 && !hostBusy() && token.sent - lastReply.at < 400) {
        playing = { by: 'stall', from: lastReply.t, wall: token.sent, ws: lastReply.ws, wd: lastReply.wd };
      }
    }, STALL_MS);
  }

  /* ---------- What Zeni reads every frame ---------- */
  function compTime() {
    if (playing && playing.by === 'meter' && now() - meter.loudAt > QUIET_MS) playing = null; // the sound stopped
    if (!playing) return null;
    var t = playing.from + (now() - playing.wall) / 1000, end = playing.ws + playing.wd;
    if (playing.wd > 0.05 && t > end && playing.from <= end) t = playing.ws + ((t - end) % playing.wd);
    return t;
  }
  function state() {
    var t = compTime();
    if (t === null || !song) return null;
    if (t < song.inPoint || t > song.outPoint) return null; // the music isn't playing at this point of the comp
    var speed = 100 / song.stretch, fileTime = (t - song.start) * speed;
    var bpm = song.bpm * speed, beat = (fileTime - song.offset) / song.period;
    var e = song.energy && song.energy.length ? song.energy[Math.max(0, Math.min(song.energy.length - 1, Math.floor(beat)))] : 0.8;
    return { beat: beat, bpm: bpm, energy: e, mode: bpm < 105 ? 'chill' : bpm > 160 ? 'half' : 'bob' };
  }

  window.ZenframeVibe = {
    // Zeni turns this on only while he's shown and dancing is enabled, so nothing polls otherwise.
    setEnabled: function (v) {
      v = !!v && !!cep;
      if (v === enabled) return;
      enabled = v; pending = null; playing = null; idleReplies = 0;
      if (enabled) { lastAudioCheck = -Infinity; startMeter(); schedule(0); } else { clearTimeout(timer); stopMeter(); }
    },
    state: state,
    song: function () { return song ? { bpm: song.bpm * 100 / song.stretch } : null; },
    // For tests.
    _debug: function () { return { enabled: enabled, playing: playing, song: song, lastReply: lastReply, meter: { status: meter.status, sessions: meter.sessions, peak: meter.peak, reason: meter.reason } }; },
    _heard: heard,
    _setMeter: function (status, sessions) { meter.status = status; meter.sessions = sessions; }
  };
  window.addEventListener('beforeunload', stopMeter);
  // Settings > Zeni shows how playback is being detected.
  setInterval(function () {
    var el = document.getElementById('zeniMusicStatus'); if (!el || !el.offsetParent) return;
    var text = !enabled ? '' : meter.status === 'starting' ? 'Music: getting ready…'
      : meterUsable() ? (playing ? 'Music: dancing at ' + Math.round(song.bpm * 100 / song.stretch) + ' BPM.' : song ? 'Music: ready (' + Math.round(song.bpm * 100 / song.stretch) + ' BPM). Press play in your comp.' : 'Music: listening. Open a comp with a song.')
      : meter.status === 'ok' ? (song ? 'Music: ready (' + Math.round(song.bpm * 100 / song.stretch) + ' BPM). Press play; Zeni starts on the first sound.' : 'Music: listening. Open a comp with a song.')
      : 'Music: basic detection' + (meter.reason ? ' (' + meter.reason.split('\n')[0].slice(0, 120) + ')' : '') + '.';
    if (el.textContent !== text) el.textContent = text;
  }, 500);
}());
