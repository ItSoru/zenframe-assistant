/* Zenframe Assistant panel, v1.0.3. */
(function () {
  'use strict';

  var VERSION = '1.0.3';
  // Set this to your product or download page to show a "Check for updates" link in Settings.
  var UPDATE_URL = '';

  var $ = function (id) { return document.getElementById(id); };
  var runtime = null, settings = {}, busy = false, history = [], reply = null, activeTool = null, openCard = null, applyingCard = null;
  var hostChain = Promise.resolve();
  var acknowledgedRiskyCode = null;
  var PRESETS = {};
  var nativeCEP = window.__adobe_cep__;
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;

  /* ---------- Local storage (never holds the API key) ---------- */
  function readStore(k, fallback) { try { return JSON.parse(localStorage.getItem('zenframeAssistant.' + k)) || fallback; } catch (e) { return fallback; } }
  function store(k, v) { try { localStorage.setItem('zenframeAssistant.' + k, JSON.stringify(v)); } catch (e) {} }
  function saveSettings() {
    store('settings', { provider: settings.provider, claudePath: settings.claudePath || '', nodePath: settings.nodePath || '', model: settings.model || 'default', authMode: settings.authMode, confirmEdits: settings.confirmEdits, models: settings.models, baseUrls: settings.baseUrls, freeOnly: settings.freeOnly });
  }

  /* ---------- Bridge to ExtendScript ---------- */
  function host(name, args) {
    var run = function () {
      return new Promise(function (resolve, reject) {
        if (!nativeCEP) return reject(Error('Open Zenframe Assistant inside After Effects to use project tools.'));
        var finished = false;
        var timer = setTimeout(function () {
          if (!finished) { finished = true; reject(Error('After Effects has not responded. Close any open dialogs. A running script may still finish.')); }
        }, 90000);
        var payload = JSON.stringify(encodeURIComponent(JSON.stringify(args))).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        var code = 'ZenframeAssistant.invoke(' + JSON.stringify(name) + ',' + payload + ')';
        nativeCEP.evalScript(code, function (result) {
          if (finished) return;
          finished = true; clearTimeout(timer);
          try { resolve(JSON.parse(result)); }
          catch (e) { reject(Error('After Effects bridge is unavailable. Close and reopen the panel. ' + String(result).slice(0, 150))); }
        });
      });
    };
    var pending = hostChain.then(run);
    hostChain = pending.catch(function () {});
    return pending;
  }

  /* ---------- Conversation UI ---------- */
  function view(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('active', t.dataset.view === name); });
    $('chatView').classList.toggle('active', name === 'chat');
    $('scriptsView').classList.toggle('active', name === 'scripts');
    if (name === 'scripts') $('scriptBadge').hidden = true;
    if (window.ZenframeMotion) window.ZenframeMotion.view(name);
  }
  function scroll() { var el = $('messages'); el.scrollTop = el.scrollHeight; }
  function persist() { store('history', history.slice(-80)); }
  function renderBody(el, text) {
    el.textContent = '';
    String(text).split(/(```[\s\S]*?```)/g).forEach(function (part) {
      if (part.slice(0, 3) === '```') {
        var code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
        var pre = document.createElement('pre'); pre.textContent = code; el.appendChild(pre);
        var bar = document.createElement('div'); bar.className = 'code-actions';
        var button = document.createElement('button'); button.textContent = 'Open in script editor';
        button.onclick = function () { stage({ title: 'Script from conversation', code: code, explanation: 'Review this code before running it.' }); view('scripts'); };
        bar.appendChild(button); el.appendChild(bar);
      } else el.appendChild(document.createTextNode(part));
    });
  }
  function message(role, text, save) {
    $('welcome').hidden = true;
    var wrapper = document.createElement('article'); wrapper.className = 'message ' + role;
    var author = document.createElement('div'); author.className = 'author';
    author.textContent = role === 'user' ? 'YOU' : role === 'error' ? 'CONNECTION / ERROR' : 'Zeni';
    var body = document.createElement('div'); body.className = 'body'; renderBody(body, text);
    wrapper.appendChild(author); wrapper.appendChild(body); $('messages').appendChild(wrapper);
    if (save !== false) { history.push({ role: role, text: text }); persist(); }
    scroll();
    return { body: body, record: history[history.length - 1], wrapper: wrapper };
  }
  function stage(data) {
    $('scriptTitle').textContent = data.title;
    $('scriptCode').value = data.code;
    $('scriptExplanation').textContent = data.explanation;
    $('scriptBadge').hidden = false;
    store('script', data);
    resetRiskWarning();
    $('scriptResult').textContent = 'Ready for review. Not executed.';
  }

  /* ---------- Edit approval card ---------- */
  function finishCard(card, outcome, text) {
    card.classList.add('resolved', outcome);
    card.querySelector('.confirm-outcome').textContent = text;
    if (openCard && openCard.card === card) openCard = null;
  }
  function confirmEdits(data, answer) {
    $('welcome').hidden = true;
    var card = document.createElement('section'); card.className = 'confirm-card';
    card.setAttribute('aria-label', 'Approve project edits');
    var title = document.createElement('div'); title.className = 'confirm-title';
    title.textContent = 'ZENI WANTS TO: ' + data.label.toUpperCase();
    var list = document.createElement('ol');
    data.summary.forEach(function (line) { var li = document.createElement('li'); li.textContent = line; list.appendChild(li); });
    var note = document.createElement('p'); note.className = 'confirm-note';
    note.textContent = 'These changes were checked in After Effects. Applying them creates one Undo step.';
    var actions = document.createElement('div'); actions.className = 'confirm-actions';
    var apply = document.createElement('button'); apply.className = 'primary'; apply.textContent = 'Apply';
    var decline = document.createElement('button'); decline.className = 'secondary'; decline.textContent = 'Decline';
    var outcome = document.createElement('div'); outcome.className = 'confirm-outcome';
    apply.onclick = function () { finishCard(card, 'approved', 'Approved. Applying…'); applyingCard = card; answer(true); };
    decline.onclick = function () { finishCard(card, 'declined', 'Declined. Nothing was changed.'); answer(false); };
    actions.appendChild(apply); actions.appendChild(decline);
    [title, list, note, actions, outcome].forEach(function (el) { card.appendChild(el); });
    $('messages').appendChild(card);
    openCard = { card: card };
    $('activity').textContent = 'Waiting for your approval…';
    scroll();
    apply.focus();
  }

  /* ---------- Busy state and runtime events ---------- */
  function setBusy(v) {
    busy = v;
    $('send').hidden = v; $('stop').hidden = !v;
    ['mode', 'model', 'newChat', 'runScript', 'saveSettings', 'clearHistory', 'saveKey', 'removeKey', 'authMode', 'detectPaths', 'provider', 'loadModels'].forEach(function (id) { $(id).disabled = v; });
    $('activity').hidden = !v;
    $('activity').textContent = v ? 'Zeni is working…' : '';
  }
  function onEvent(e) {
    if (e.type === 'start') setBusy(true);
    if (e.type === 'text') {
      if (!reply) reply = message('assistant', '');
      renderBody(reply.body, e.data); reply.record.text = e.data; scroll();
    }
    if (e.type === 'tool') {
      var labels = { ae_get_context: 'Read composition', ae_inspect_layer: 'Inspect layer properties', ae_search_effects: 'Find installed effects', ae_apply_actions: 'Edit project', ae_stage_script: 'Draft a script' };
      if (e.data.status === 'running') {
        activeTool = document.createElement('details'); activeTool.className = 'tool';
        var summary = document.createElement('summary'); summary.textContent = labels[e.data.name] || e.data.name;
        activeTool.appendChild(summary); $('messages').appendChild(activeTool);
        $('activity').textContent = summary.textContent + '…';
      } else if (activeTool) {
        activeTool.className = 'tool ' + e.data.status;
        var p = document.createElement('p'); p.textContent = e.data.detail; activeTool.appendChild(p);
        activeTool = null;
      }
      if (applyingCard && e.data.name === 'ae_apply_actions' && e.data.status !== 'running') {
        applyingCard.querySelector('.confirm-outcome').textContent = e.data.status === 'done' ? 'Applied. Use Undo in After Effects to revert.' : 'Could not finish: ' + e.data.detail;
        applyingCard = null;
      }
      $('welcome').hidden = true; scroll();
    }
    if (e.type === 'error') {
      message('error', String(e.data));
      if (/oauth|session expired|rejected the api key|invalid x-api-key|401/i.test(String(e.data))) {
        $('connection').textContent = 'Check sign-in';
        $('connection').classList.remove('ready');
        $('settingsStatus').textContent = settings.provider === 'claude-code' && settings.authMode === 'claude'
          ? 'Your Claude Code login needs renewing. Run "claude auth login" in Command Prompt.'
          : 'Your API key was rejected. Check it with the provider and save it again.';
      }
    }
    if (e.type === 'notice') message('assistant', String(e.data));
    if (e.type === 'end') {
      if (openCard) finishCard(openCard.card, 'declined', 'Cancelled. Nothing was changed.');
      if (e.data.stopped) message('assistant', 'Stopped. Any project changes already applied remain in After Effects; use Undo to revert them.');
      setBusy(false); persist(); refresh();
    }
  }

  function refresh() {
    return host('ae_get_context', {}).then(function (c) {
      if (c.error) throw Error(c.error);
      $('contextName').textContent = c.activeComp ? c.activeComp.name + ' · ' + c.activeComp.layerCount + ' layers' : c.projectName + ' · no active composition';
      $('contextName').title = $('contextName').textContent;
    }).catch(function (e) {
      $('contextName').textContent = nativeCEP ? 'Project context unavailable' : 'Preview · open in After Effects';
      $('contextName').title = e.message;
    });
  }

  /* ---------- Settings ---------- */
  function preset() { return PRESETS[settings.provider] || null; }
  function shortName() {
    if (settings.provider === 'claude-code') return 'Anthropic';
    var p = preset();
    return p ? p.label.replace(/ \(.*\)$/, '') : 'Provider';
  }
  function showProvider(refreshKeyStatus) {
    var id = settings.provider, cc = id === 'claude-code', p = preset();
    $('provider').value = id;
    $('authMode').value = settings.authMode === 'claude' ? 'claude' : 'apikey';
    $('claudeCodeGroup').hidden = !cc;
    $('pathsGroup').hidden = !cc;
    $('loginGroup').hidden = !(cc && settings.authMode === 'claude');
    $('directGroup').hidden = cc;
    $('model').hidden = !cc;
    var showKey = cc ? settings.authMode !== 'claude' : !!(p && (p.needsKey || p.optionalKey));
    $('apiKeyGroup').hidden = !showKey;
    $('apiKeyLabel').textContent = shortName() + ' API key' + (p && p.optionalKey ? ' (optional)' : '');
    $('apiKey').placeholder = cc ? 'sk-ant-…' : (p && p.keyHint) || 'Paste your key';
    var url = cc ? 'console.anthropic.com' : p && p.keyUrl;
    $('keyHelp').textContent = (url ? 'Get a key at ' + url + '. ' : '') + 'Each key is encrypted for your Windows account and only sent to its own provider. It is never shown, logged, or sent anywhere else.';
    if (!cc && p) {
      settings.models = settings.models || {}; settings.baseUrls = settings.baseUrls || {};
      $('baseUrl').value = (p.editableUrl && settings.baseUrls[id]) || p.baseUrl;
      $('baseUrl').readOnly = !p.editableUrl;
      $('modelName').value = settings.models[id] || '';
      $('freeOnlyRow').hidden = !p.freeFilter;
      $('freeOnly').checked = settings.freeOnly !== false;
    }
    if (runtime && refreshKeyStatus) {
      $('keyStatus').textContent = runtime.hasKey(id) ? 'A key is saved for this Windows account.' : 'No key saved yet.';
      $('modelStatus').textContent = '';
      $('modelList').textContent = '';
    }
  }
  function showModeNote() {
    $('modeNote').textContent = $('mode').value === 'edit'
      ? (settings.confirmEdits !== false ? 'Edits wait for your approval · Undo in AE' : 'Supported edits apply directly · Undo in AE')
      : 'Code stays in the editor until you click Run';
  }
  function check() {
    showProvider(false);
    if (!runtime) {
      $('connection').textContent = 'Preview';
      $('settingsStatus').textContent = 'Open the panel in After Effects to connect to Claude.';
      return Promise.resolve();
    }
    $('connection').textContent = 'Checking…';
    return runtime.status(settings).then(function (s) {
      $('connection').textContent = s.ok ? 'Ready' : 'Setup needed';
      $('connection').classList.toggle('ready', s.ok);
      $('settingsStatus').textContent = s.message;
    }).catch(function (e) {
      $('connection').textContent = 'Setup needed';
      $('settingsStatus').textContent = e.message;
    });
  }

  /* ---------- Script safety scan ---------- */
  var RISKS = [
    [/\bnew\s+File\b|\bFile\s*\(|\bnew\s+Folder\b|\bFolder\s*\(|\.(open|write|writeln|remove|rename|copy|execute)\s*\(/, 'reads, writes, deletes or opens files on your computer'],
    [/system\s*\.\s*callSystem/, 'runs commands on your computer'],
    [/\bSocket\b/, 'opens network connections'],
    [/app\s*\.\s*(quit|exit)\b/, 'closes After Effects'],
    [/app\s*\.\s*executeCommand/, 'triggers After Effects menu commands'],
    [/\beval\s*\(|\$\s*\.\s*(evalFile|include)/, 'runs other code that you cannot review here'],
    [/app\s*\.\s*(newProject|open)\s*\(|app\s*\.\s*project\s*\.\s*(save|close)\s*\(/, 'saves, closes or opens projects'],
    [/app\s*\.\s*(preferences|settings)\b/, 'changes After Effects preferences']
  ];
  function scanScript(code) {
    var found = [];
    RISKS.forEach(function (r) { if (r[0].test(code)) found.push(r[1]); });
    return found;
  }
  function resetRiskWarning() {
    acknowledgedRiskyCode = null;
    $('scriptWarning').hidden = true;
    $('cancelRisky').hidden = true;
    $('runScript').firstChild.nodeValue = 'Run in After Effects ';
  }

  /* ---------- Actions ---------- */
  function reset() {
    if (busy) return;
    if (runtime) runtime.reset();
    history = []; persist();
    Array.prototype.forEach.call($('messages').querySelectorAll('.message,.tool,.confirm-card'), function (e) { e.remove(); });
    $('welcome').hidden = false; reply = null; view('chat'); $('prompt').focus();
  }
  async function send() {
    if (busy) return;
    var text = $('prompt').value.trim();
    if (!text) return;
    if (!runtime) { message('error', 'Open this panel inside After Effects to chat with Claude.'); return; }
    message('user', text); $('prompt').value = ''; reply = null; setBusy(true);
    try { await runtime.send(text, $('mode').value, settings); }
    catch (e) { message('error', e.message); setBusy(false); }
  }

  function init() {
    settings = readStore('settings', {});
    if (settings.authMode !== 'claude') settings.authMode = 'apikey';
    if (!settings.provider) settings.provider = 'claude-code';
    settings.models = settings.models || {};
    settings.baseUrls = settings.baseUrls || {};
    if (settings.confirmEdits !== false) settings.confirmEdits = true;
    if (nativeCEP && nodeRequire) {
      try {
        var path = nodeRequire('path'), url = nodeRequire('url');
        var root = nativeCEP.getSystemPath('extension');
        if (/^file:/i.test(root)) root = url.fileURLToPath ? url.fileURLToPath(root) : decodeURIComponent(root.replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1'));
        var backend = nodeRequire(path.join(root, 'backend', 'runtime.cjs'));
        PRESETS = backend.PRESETS || {};
        var found = backend.findExecutables();
        settings.claudePath = settings.claudePath || found.claudePath;
        settings.nodePath = settings.nodePath || found.nodePath;
        runtime = new backend.Runtime({ callHost: host, onEvent: onEvent, onScript: stage, onConfirm: confirmEdits });
        $('detectPaths').onclick = function () {
          var again = backend.findExecutables();
          $('claudePath').value = again.claudePath || $('claudePath').value;
          $('nodePath').value = again.nodePath || $('nodePath').value;
          $('settingsStatus').textContent = again.claudePath && again.nodePath ? 'Found both. Click Save & check connection.' : 'Could not find everything. Enter the missing path, or install it first.';
        };
      } catch (e) { message('error', 'Could not start the local bridge: ' + e.message); }
    }
    if (!runtime) $('detectPaths').onclick = function () { $('settingsStatus').textContent = 'Open the panel inside After Effects first.'; };
    $('claudePath').value = settings.claudePath || '';
    $('nodePath').value = settings.nodePath || '';
    $('model').value = settings.model || 'default';
    $('confirmEdits').checked = settings.confirmEdits !== false;
    $('versionLabel').textContent = VERSION;
    if (UPDATE_URL) $('updatesLink').hidden = false;
    saveSettings();
    history = readStore('history', []).slice(-80);
    history.forEach(function (m) { message(m.role, m.text, false); });
    if (history.length) message('assistant', 'Showing your saved conversation. The next message starts a fresh Claude session; include any details you want to continue from.', false);
    var script = readStore('script', null);
    if (script) stage(script);
    showModeNote(); showProvider(true); check(); refresh();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.onclick = function () { view(t.dataset.view); }; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-prompt]'), function (b) {
    b.onclick = function () {
      if (busy) return;
      if (b.dataset.mode) { $('mode').value = b.dataset.mode; $('mode').onchange(); }
      $('prompt').value = b.dataset.prompt; $('prompt').focus();
    };
  });
  $('send').onclick = send;
  $('prompt').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
  $('stop').onclick = function () { if (runtime) runtime.stop(); $('activity').textContent = 'Stopping…'; };
  $('mode').onchange = function () { if (runtime) runtime.reset(); showModeNote(); };
  $('model').onchange = function () { settings.model = $('model').value; saveSettings(); };
  $('refreshContext').onclick = refresh;
  $('newChat').onclick = reset;
  $('clearHistory').onclick = reset;
  $('settingsButton').onclick = function () { window.ZenframeMotion.settings(true); };
  $('closeSettings').onclick = function () { window.ZenframeMotion.settings(false); };
  $('authMode').onchange = function () { settings.authMode = $('authMode').value; saveSettings(); showProvider(true); check(); };
  $('provider').onchange = function () {
    if (runtime && busy) return;
    settings.provider = $('provider').value;
    if (runtime) runtime.reset();
    saveSettings(); showProvider(true); check();
  };
  $('baseUrl').onchange = function () {
    var p = preset(); if (!p || !p.editableUrl) return;
    settings.baseUrls[settings.provider] = $('baseUrl').value.trim();
    saveSettings(); check();
  };
  $('modelName').onchange = function () {
    settings.models[settings.provider] = $('modelName').value.trim();
    saveSettings(); check();
  };
  $('freeOnly').onchange = function () { settings.freeOnly = $('freeOnly').checked; saveSettings(); };
  $('loadModels').onclick = async function () {
    if (!runtime) { $('modelStatus').textContent = 'Open the panel inside After Effects first.'; return; }
    var p = preset(); if (!p) return;
    if (p.editableUrl) settings.baseUrls[settings.provider] = $('baseUrl').value.trim();
    $('loadModels').disabled = true;
    $('modelStatus').textContent = 'Loading models from ' + p.label + '…';
    try {
      var ids = await runtime.listModels(settings, p.freeFilter && $('freeOnly').checked);
      var list = $('modelList'); list.textContent = '';
      ids.forEach(function (id) { var o = document.createElement('option'); o.value = id; list.appendChild(o); });
      $('modelStatus').textContent = ids.length
        ? 'Loaded ' + ids.length + ' models. Click the Model box (or start typing) to pick one.'
        : 'No matching models found' + (p.freeFilter && $('freeOnly').checked ? '. Try turning off "free models only".' : '.');
      saveSettings();
    } catch (e) { $('modelStatus').textContent = e.message; }
    finally { $('loadModels').disabled = busy; }
  };
  $('confirmEdits').onchange = function () { settings.confirmEdits = $('confirmEdits').checked; saveSettings(); showModeNote(); };
  $('saveSettings').onclick = function () {
    settings.claudePath = $('claudePath').value.trim();
    settings.nodePath = $('nodePath').value.trim();
    saveSettings(); check();
  };
  $('saveKey').onclick = async function () {
    if (!runtime) { $('keyStatus').textContent = 'Open the panel inside After Effects first.'; return; }
    var value = $('apiKey').value;
    $('apiKey').value = '';
    $('saveKey').disabled = true;
    $('keyStatus').textContent = 'Encrypting and saving…';
    try { await runtime.saveKey(settings.provider, value); $('keyStatus').textContent = 'Key saved and encrypted for this Windows account.'; check(); }
    catch (e) { $('keyStatus').textContent = e.message; }
    finally { $('saveKey').disabled = busy; }
  };
  $('removeKey').onclick = function () {
    if (!runtime) return;
    try { runtime.removeKey(settings.provider); $('keyStatus').textContent = 'Key removed from this computer.'; check(); }
    catch (e) { $('keyStatus').textContent = e.message; }
  };
  $('updatesLink').onclick = function (e) {
    e.preventDefault();
    if (UPDATE_URL && window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) window.cep.util.openURLInDefaultBrowser(UPDATE_URL);
  };
  $('scriptCode').oninput = function () {
    resetRiskWarning();
    store('script', { title: $('scriptTitle').textContent, explanation: $('scriptExplanation').textContent, code: $('scriptCode').value });
  };
  $('copyScript').onclick = function () {
    $('scriptCode').focus(); $('scriptCode').select();
    var ok = document.execCommand('copy');
    $('scriptResult').textContent = ok ? 'Copied.' : 'Select the code and press Ctrl+C.';
  };
  $('cancelRisky').onclick = function () { resetRiskWarning(); $('scriptResult').textContent = 'Not run.'; };
  $('runScript').onclick = async function () {
    if (busy) return;
    var code = $('scriptCode').value;
    if (!code.trim()) { $('scriptResult').textContent = 'Add a script first.'; return; }
    var risks = scanScript(code);
    if (risks.length && acknowledgedRiskyCode !== code) {
      acknowledgedRiskyCode = code;
      var w = $('scriptWarning');
      w.textContent = '';
      var strong = document.createElement('strong'); strong.textContent = 'Check this before running. This script ';
      w.appendChild(strong);
      w.appendChild(document.createTextNode(risks.join('; ') + '.\nOnly run it if you understand why it needs to. Undo cannot reverse changes outside the project.'));
      w.hidden = false;
      $('cancelRisky').hidden = false;
      $('runScript').firstChild.nodeValue = 'Run anyway ';
      $('scriptResult').textContent = '';
      return;
    }
    resetRiskWarning();
    setBusy(true); $('stop').disabled = true;
    $('scriptResult').textContent = 'Running in After Effects…';
    try {
      var r = await host('run_reviewed_script', { code: code });
      $('scriptResult').textContent = r.error ? 'Error: ' + r.error + '\nEarlier edits may remain. Use Undo in AE.' : r.result;
    } catch (e) { $('scriptResult').textContent = e.message; }
    finally { $('stop').disabled = false; setBusy(false); refresh(); }
  };
  window.addEventListener('beforeunload', function () { if (runtime) runtime.close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('settingsView').hidden) $('closeSettings').click(); });

  init();
}());
