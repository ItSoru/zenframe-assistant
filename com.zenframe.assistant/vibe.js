/* Zenframe Assistant 1.3.0 (1.4.0: several songs, video files and precomps): Zeni vibes to the music in your comp.
   Each song's tempo and beat grid are worked out once, locally, from its file. By default Zeni picks the music
   layer himself; in Settings > Zeni you can pick one or more layers (audio, video files or precomps with sound)
   and he follows whichever of them is playing at that moment.
   Playback is detected from After Effects' own output level (a small Windows helper reads the level meter of
   After Effects' audio sessions, see backend/AudioMeter.cs): when After Effects starts making sound, the comp is
   playing from where the playhead was. Zeni then follows the beat grid with the panel's own clock (looping in
   the work area) until the sound stops or the playhead jumps. Where the helper can't run, a pause in After
   Effects' answers is used instead. Nothing here changes the project, and no audio is recorded or sent. */
(function () {
  'use strict';
  var cep = window.__adobe_cep__;
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;
  var POLL_MS = 50, STALL_MS = 150, LOUD = 0.002, QUIET_MS = 800, AUDIO_LAG_MS = 20, AUDIO_EVERY_MS = 2000, MAX_BYTES = 150 * 1024 * 1024, MAX_VIDEO_BYTES = 600 * 1024 * 1024, CACHE_KEY = 'zenframeAssistant.tempoCache', PICK_KEY = 'zenframeAssistant.musicPick';

  var enabled = false, timer = 0, pending = null, lastReply = null, playing = null, lastAudioCheck = -Infinity;
  var songs = [], compId = 0, compName = '', sources = [], analyzing = '', failedKeys = {}, idleReplies = 0, picks = {};
  try { picks = JSON.parse(localStorage.getItem(PICK_KEY)) || {}; } catch (e) { picks = {}; }
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

  /* ---------- Finding and analyzing the songs ---------- */
  function sourceId(l) { return l.name + '|' + l.path; }
  function fileKey(l) { return l.path + '|' + l.bytes + '|' + l.mod; }
  function usable(l) { return l.bytes > 0 && l.bytes <= (l.video ? MAX_VIDEO_BYTES : MAX_BYTES) && l.stretch > 0 && l.out > l.in; }
  function pickLayer(layers) {
    var list = (layers || []).filter(usable);
    // Music first: audio-only files, then the longest.
    list.sort(function (a, b) { return (a.video - b.video) || ((b.out - b.in) - (a.out - a.in)); });
    return list[0] || null;
  }
  // Automatic: every layer that sounds like music (long enough to be a song or a section of one, audio files
  // first), so split songs, several songs, MP4s and precomps all work without picking anything.
  // Short layers (sound effects) are left out. Zeni follows whichever of them is playing.
  var MUSIC_MIN_SECONDS = 6, AUTO_MAX = 8;
  function autoPick(layers) {
    var list = (layers || []).filter(usable);
    var long = list.filter(function (l) { return l.out - l.in >= MUSIC_MIN_SECONDS; });
    if (!long.length) { var one = pickLayer(list); return one ? [one] : []; }
    long.sort(function (a, b) { return (a.video - b.video) || ((b.out - b.in) - (a.out - a.in)); });
    return long.slice(0, AUTO_MAX);
  }
  // The layers Zeni follows in this comp: the ones picked in Settings, or the automatic choice.
  function chosen(layers, id) {
    var pick = picks[id] || [];
    if (pick.length) return (layers || []).filter(function (l) { return pick.indexOf(sourceId(l)) >= 0 && usable(l); });
    return autoPick(layers);
  }
  function analyze(layer) {
    var key = fileKey(layer);
    if (memo[key]) { memo[key].at = Date.now(); return; }
    if (analyzing || failedKeys[key] || !nodeRequire) return;
    analyzing = key;
    var done = function () { analyzing = ''; rebuild(); };
    setTimeout(function () {
      try {
        var fs = nodeRequire('fs'), buf = fs.readFileSync(layer.path), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.decodeAudioData(ab, function (audio) {
          setTimeout(function () {
            try {
              var ch = []; for (var i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
              var est = window.ZenframeTempo.analyze(ch, audio.sampleRate);
              memo[key] = { r: { bpm: est.bpm, period: est.period, offset: est.offset, energy: est.energy }, at: Date.now() }; saveMemo();
            } catch (e) { failedKeys[key] = true; }
            try { ctx.close(); } catch (e) {}
            done();
          }, 20);
        }, function () { failedKeys[key] = true; try { ctx.close(); } catch (e) {} done(); });
      } catch (e) { failedKeys[key] = true; done(); }
    }, 20);
  }
  var lastLayers = [];
  function rebuild() {
    var list = chosen(lastLayers, compId);
    songs = list.filter(function (l) { return memo[fileKey(l)]; }).map(function (l) {
      return Object.assign({}, memo[fileKey(l)].r, { name: l.name, start: l.start, stretch: l.stretch, inPoint: l.in, outPoint: l.out });
    });
    // Analyze what's missing, one file at a time.
    for (var i = 0; i < list.length; i++) if (!memo[fileKey(list[i])] && !failedKeys[fileKey(list[i])]) { analyze(list[i]); break; }
  }
  function checkAudio(done) {
    lastAudioCheck = now();
    call('ZenframeVibeAudio', function (j) {
      if (!j || !j.c) { songs = []; sources = []; compId = 0; lastLayers = []; if (done) done(); return; }
      compId = j.c; compName = j.name || ''; lastLayers = j.layers || [];
      var autoIds = autoPick(lastLayers).map(sourceId);
      sources = lastLayers.map(function (l) { return { id: sourceId(l), auto: autoIds.indexOf(sourceId(l)) >= 0, name: l.name, video: l.video, inPrecomp: l.inPrecomp, from: l.in, to: l.out, usable: usable(l), bpm: memo[fileKey(l)] ? memo[fileKey(l)].r.bpm * 100 / l.stretch : null, failed: !!failedKeys[fileKey(l)] }; });
      rebuild();
      if (done) done();
    });
  }
  // The song playing at comp time t (the first picked one that covers t).
  function songAt(t) {
    for (var i = 0; i < songs.length; i++) if (t >= songs[i].inPoint && t <= songs[i].outPoint) return songs[i];
    return null;
  }
  function anySong() { return songs[0] || null; }

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
    if (!playing && enabled && songs.length && lastReply && t - lastReply.at < 1000) {
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
      if (songs.length && lastReply && idleReplies >= 3 && !hostBusy() && token.sent - lastReply.at < 400) {
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
    if (t === null) return null;
    var song = songAt(t);
    if (!song) return null; // none of the music is playing at this point of the comp
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
    song: function () { var s = anySong(); return s ? { bpm: s.bpm * 100 / s.stretch, name: s.name } : null; },
    // 1.4.0: the comp's sound sources, and the ones picked for dancing (empty = automatic).
    sources: function (cb) { checkAudio(function () { cb({ compId: compId, compName: compName, sources: sources, pick: (picks[compId] || []).slice() }); }); },
    setPick: function (id, list) {
      if (list && list.length) picks[id] = list.slice(0, 20); else delete picks[id];
      var keys = Object.keys(picks); if (keys.length > 40) delete picks[keys[0]];
      try { localStorage.setItem(PICK_KEY, JSON.stringify(picks)); } catch (e) {}
      if (id === compId) rebuild();
    },
    pick: function (id) { return (picks[id] || []).slice(); },
    // For tests.
    _debug: function () { return { enabled: enabled, playing: playing, song: anySong(), songs: songs, lastReply: lastReply, meter: { status: meter.status, sessions: meter.sessions, peak: meter.peak, reason: meter.reason } }; },
    _heard: heard,
    _setMeter: function (status, sessions) { meter.status = status; meter.sessions = sessions; }
  };
  window.addEventListener('beforeunload', stopMeter);
  /* ---------- Settings > Zeni: which layers he dances to ---------- */
  var shownFor = null;
  function clockText(t) { var m = Math.floor(Math.max(0, t) / 60), sec = Math.max(0, t) - m * 60; return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1); }
  function renderPick(info) {
    var list = document.getElementById('musicPickList'), hint = document.getElementById('musicPickHint');
    if (!list || !hint) return;
    shownFor = info.compId;
    list.textContent = '';
    if (!info.compId) { hint.textContent = 'Open a comp to see its sound layers.'; return; }
    if (!info.sources.length) { hint.textContent = 'No layers with sound from a file in "' + info.compName + '".'; return; }
    var autoText = function () { var n = info.sources.filter(function (s) { return s.auto; }).length; return 'Automatic: Zeni follows the ' + (n === 1 ? 'music layer' : n + ' music layers') + ' marked "auto" in "' + info.compName + '", whichever is playing. Check layers only to choose yourself.'; };
    hint.textContent = info.pick.length ? 'Zeni follows the checked layers in "' + info.compName + '", whichever is playing.' : autoText();
    info.sources.forEach(function (src) {
      var row = document.createElement('label'), box = document.createElement('input'), text = document.createElement('span'), sub = document.createElement('small');
      box.type = 'checkbox'; box.value = src.id; box.checked = info.pick.indexOf(src.id) >= 0; box.disabled = !src.usable;
      text.textContent = src.name;
      sub.textContent = [!info.pick.length && src.auto ? 'auto' : '', src.inPrecomp ? 'in a precomp' : src.video ? 'video file' : 'audio file', clockText(src.from) + '–' + clockText(src.to), src.bpm ? Math.round(src.bpm) + ' BPM' : src.failed ? 'could not read its sound' : '', src.usable ? '' : 'too large to analyze'].filter(Boolean).join(' · ');
      text.appendChild(sub); row.appendChild(box); row.appendChild(text);
      if (!src.usable) row.className = 'off';
      box.addEventListener('change', function () {
        var ids = Array.prototype.slice.call(list.querySelectorAll('input:checked')).map(function (b) { return b.value; });
        window.ZenframeVibe.setPick(info.compId, ids);
        info.pick = ids;
        hint.textContent = ids.length ? 'Zeni follows the checked layers in "' + info.compName + '", whichever is playing.' : autoText();
      });
      list.appendChild(row);
    });
  }
  function refreshPick() { if (cep) window.ZenframeVibe.sources(renderPick); }
  var refreshBtn = document.getElementById('musicPickRefresh');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshPick);
  // Fill the list when Settings opens, and again if the active comp changes while it's open.
  setInterval(function () {
    var box = document.getElementById('musicPick');
    if (!box || !box.offsetParent) { shownFor = null; return; }
    if (shownFor === null || (compId && shownFor !== compId)) { shownFor = compId || 0; refreshPick(); }
  }, 700);
  // Settings > Zeni shows how playback is being detected.
  setInterval(function () {
    var el = document.getElementById('zeniMusicStatus'); if (!el || !el.offsetParent) return;
    var song = anySong(), st = state(), bpmText = function (x) { return Math.round(x.bpm * 100 / x.stretch) + ' BPM'; };
    var ready = songs.length > 1 ? songs.length + ' songs ready (' + songs.map(bpmText).join(', ') + ')' : song ? 'ready (' + bpmText(song) + ')' : '';
    var text = !enabled ? '' : meter.status === 'starting' ? 'Music: getting ready…'
      : meter.status === 'ok' ? (st ? 'Music: dancing at ' + Math.round(st.bpm) + ' BPM.' : song ? 'Music: ' + ready + '. Press play in your comp.' : analyzing ? 'Music: finding the beat…' : 'Music: listening. Open a comp with a song.')
      : 'Music: basic detection' + (meter.reason ? ' (' + meter.reason.split('\n')[0].slice(0, 120) + ')' : '') + (song ? '. ' + ready : '') + '.';
    if (el.textContent !== text) el.textContent = text;
  }, 500);
}());
