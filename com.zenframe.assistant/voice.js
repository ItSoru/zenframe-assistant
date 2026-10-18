/* Zenframe Assistant 1.3.0: voice input.
   Click the mic, talk, click again: your words are typed into the message box. Nothing is sent until you press Send.
   The recording is turned into a small 16 kHz WAV here and transcribed by the engine chosen in Settings
   (Groq or OpenAI Whisper with a saved key, or Windows' offline speech recognition). Nothing is saved to disk. */
(function () {
  'use strict';
  var MAX_SECONDS = 180, RATE = 16000;
  var $ = function (id) { return document.getElementById(id); };
  var button = $('micButton'), prompt = $('prompt'), micSelect = $('voiceMic'), engineSelect = $('voiceEngine'), voiceNote = $('voiceNote');
  if (!button || !prompt) return;
  var api = null, state = 'idle', stream = null, recorder = null, chunks = [], started = 0, tick = 0, meterFrame = 0, ctx = null, cancelled = false;

  function setState(s, label) {
    state = s;
    button.classList.toggle('mic-recording', s === 'recording');
    button.classList.toggle('mic-busy', s === 'busy');
    button.setAttribute('aria-pressed', String(s === 'recording'));
    var text = label || (s === 'recording' ? 'Stop and type what I said' : s === 'busy' ? 'Turning speech into text…' : 'Voice input: click and talk');
    button.title = text; button.setAttribute('aria-label', text);
    if (s !== 'recording') { button.style.removeProperty('--mic-level'); button.removeAttribute('data-time'); }
  }
  function note(text) {
    var attach = window.ZenframeAttach;
    if (attach && attach.note) attach.note(text); else if (voiceNote) voiceNote.textContent = text;
  }
  function insert(text) {
    text = String(text || '').trim();
    if (!text) { note('Zeni did not catch any words. Try again a little closer to the mic.'); return; }
    var start = prompt.selectionStart, end = prompt.selectionEnd, v = prompt.value;
    if (typeof start !== 'number' || document.activeElement !== prompt) { start = end = v.length; } // not typing in the box: add to the end
    var before = v.slice(0, start), after = v.slice(end);
    var pad = before && !/\s$/.test(before) ? ' ' : '';
    prompt.value = before + pad + text + (after && !/^\s/.test(after) ? ' ' : '') + after;
    var caret = (before + pad + text).length;
    prompt.focus(); prompt.setSelectionRange(caret, caret);
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------- WAV encoding ---------- */
  function toWav(buffer) {
    var length = Math.ceil(buffer.duration * RATE), off = new OfflineAudioContext(1, Math.max(1, length), RATE);
    var src = off.createBufferSource(); src.buffer = buffer; src.connect(off.destination); src.start();
    return off.startRendering().then(function (out) {
      var data = out.getChannelData(0), n = data.length, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab), i;
      function str(o, s) { for (var k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); }
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
      v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      for (i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, data[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
      var bytes = new Uint8Array(ab), bin = '', step = 0x8000;
      for (i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      return btoa(bin);
    });
  }

  /* ---------- Recording ---------- */
  function cleanup() {
    clearInterval(tick); cancelAnimationFrame(meterFrame);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (ctx) { try { ctx.close(); } catch (e) {} }
    stream = null; recorder = null; ctx = null;
  }
  function start() {
    if (!api) { note('Open the panel inside After Effects to use voice input.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { note('Voice input is not available in this version of After Effects.'); return; }
    var settings = api.settings(), id = settings.voiceMic || '';
    var constraints = { audio: id ? { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } };
    setState('busy', 'Starting the microphone…');
    navigator.mediaDevices.getUserMedia(constraints).catch(function (e) {
      if (id && e && e.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ audio: true }); // that mic was unplugged
      throw e;
    }).then(function (s) {
      stream = s; chunks = []; cancelled = false;
      var type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0];
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = finish;
      recorder.start(250);
      started = performance.now();
      setState('recording');
      listMics();
      // Level meter on the button.
      try {
        ctx = new AudioContext(); var an = ctx.createAnalyser(), arr = new Uint8Array(an.fftSize);
        ctx.createMediaStreamSource(stream).connect(an);
        (function meter() {
          an.getByteTimeDomainData(arr); var m = 0; for (var i = 0; i < arr.length; i += 4) m = Math.max(m, Math.abs(arr[i] - 128));
          button.style.setProperty('--mic-level', Math.min(1, m / 70).toFixed(2));
          meterFrame = requestAnimationFrame(meter);
        })();
      } catch (e) {}
      tick = setInterval(function () {
        var secs = Math.floor((performance.now() - started) / 1000);
        button.setAttribute('data-time', Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2));
        if (secs >= MAX_SECONDS) stop();
      }, 250);
    }).catch(function (e) {
      cleanup(); setState('idle');
      note(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Microphone access was blocked. Allow it for After Effects in Windows Settings > Privacy > Microphone.' : e && e.name === 'NotFoundError' ? 'No microphone found. Plug one in or pick one in Settings > Voice.' : 'Could not start the microphone: ' + (e && e.message || e));
    });
  }
  function stop(cancel) {
    if (state !== 'recording' || !recorder) return;
    cancelled = !!cancel;
    setState(cancel ? 'idle' : 'busy');
    try { recorder.stop(); } catch (e) { cleanup(); setState('idle'); }
  }
  function finish() {
    var blob = new Blob(chunks, { type: recorder && recorder.mimeType || 'audio/webm' }), secs = (performance.now() - started) / 1000;
    cleanup(); chunks = [];
    if (cancelled) { setState('idle'); return; }
    if (secs < 0.6) { setState('idle'); note('Hold on a little longer: click the mic, talk, then click it again.'); return; }
    blob.arrayBuffer().then(function (ab) {
      var dec = new AudioContext();
      return new Promise(function (res, rej) { dec.decodeAudioData(ab, function (b) { dec.close(); res(b); }, function () { dec.close(); rej(Error('The recording could not be decoded.')); }); });
    }).then(toWav).then(function (wav) { return api.transcribe(wav); }).then(function (r) {
      setState('idle'); insert(r && r.text);
    }).catch(function (e) { setState('idle'); note(e && e.message || String(e)); });
  }

  /* ---------- Settings ---------- */
  function listMics() {
    if (!micSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var keep = api ? api.settings().voiceMic || '' : micSelect.value;
      micSelect.textContent = '';
      var def = document.createElement('option'); def.value = ''; def.textContent = 'Windows default microphone'; micSelect.appendChild(def);
      ds.filter(function (d) { return d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'; }).forEach(function (d, i) {
        var o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || ('Microphone ' + (i + 1)); micSelect.appendChild(o);
      });
      micSelect.value = keep; if (micSelect.value !== keep) micSelect.value = '';
    }, function () {});
  }
  function engineHelp() {
    if (!voiceNote || !api) return;
    var have = api.engines(), e = api.settings().voiceEngine || 'auto';
    voiceNote.textContent = e === 'windows' ? 'Uses Windows speech recognition. Free and offline; less accurate than Whisper.'
      : e === 'groq' ? (have.groq ? 'Uses Groq Whisper with your saved Groq key. Fast and free within Groq limits.' : 'Save a Groq key first (pick Groq as the provider, paste the key, Save).')
      : e === 'openai' ? (have.openai ? 'Uses OpenAI Whisper with your saved OpenAI key (billed by OpenAI).' : 'Save an OpenAI key first (pick OpenAI as the provider, paste the key, Save).')
      : have.groq ? 'Automatic: Groq Whisper with your saved Groq key.' : have.openai ? 'Automatic: OpenAI Whisper with your saved OpenAI key.'
      : 'Automatic: Windows speech recognition (offline). Save a free Groq key for much better accuracy.';
  }

  button.addEventListener('click', function () { if (state === 'idle') start(); else if (state === 'recording') stop(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state === 'recording') { e.preventDefault(); stop(true); } });
  if (micSelect) { micSelect.addEventListener('focus', listMics); micSelect.addEventListener('change', function () { if (api) api.update({ voiceMic: micSelect.value }); }); }
  if (engineSelect) engineSelect.addEventListener('change', function () { if (api) { api.update({ voiceEngine: engineSelect.value }); engineHelp(); } });
  setState('idle');

  window.ZenframeVoice = {
    // app.js connects the backend once it has started.
    init: function (o) {
      api = o;
      if (engineSelect) engineSelect.value = api.settings().voiceEngine || 'auto';
      listMics(); engineHelp();
    },
    refresh: function () { listMics(); engineHelp(); },
    _toWav: toWav
  };
}());
