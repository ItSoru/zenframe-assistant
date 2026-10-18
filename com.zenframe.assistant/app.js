/* Zenframe Assistant panel, v1.4.2. */
(function () {
  'use strict';

  var VERSION = '1.4.2';
  // Set this to your download page to show a "Check for updates" link in Settings.
  var UPDATE_URL = '';
  var MAX_CONVS = 20, MAX_MESSAGES = 80, PRIOR_MESSAGES = 16, MAX_SAVED_CHARS = 20000;
  var warnedStorage = false;

  var $ = function (id) { return document.getElementById(id); };
  var runtime = null, settings = {}, busy = false, openCard = null, applyingCard = null;
  var convs = [], activeId = null, runningId = null;
  var hostChain = Promise.resolve();
  var acknowledgedRiskyCode = null;
  var PRESETS = {};
  var CUSTOM_MODEL = '__custom__';
  var modelLists = {};
  var effort = null;
  // Effort levels per kind of provider (replaced by the backend's list when it loads).
  var EFFORT_LEVELS = { claude: ['low', 'medium', 'high', 'xhigh', 'max'], openai: ['low', 'medium', 'high'], codex: ['low', 'medium', 'high', 'xhigh', 'ultra'] };
  var EFFORT_LABELS = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max' };
  var CODEX_MODELS = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
  var CODEX_EFFORT_LABELS = { low: 'Light', medium: 'Medium', high: 'High', xhigh: 'Extra high', ultra: 'Ultra' };
  var CC_MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];
  var nativeCEP = window.__adobe_cep__;
  var nodeRequire = window.cep_node ? window.cep_node.require : typeof require === 'function' ? require : null;

  /* ---------- Local storage (never holds API keys) ---------- */
  function readStore(k, fallback) { try { return JSON.parse(localStorage.getItem('zenframeAssistant.' + k)) || fallback; } catch (e) { return fallback; } }
  function store(k, v) { try { localStorage.setItem('zenframeAssistant.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  // Usage gauge: ask the runtime for the current provider's numbers (debounced).
  var usageTimer = 0;
  function refreshUsage() {
    clearTimeout(usageTimer);
    usageTimer = setTimeout(function () {
      var u = window.ZenframeUsage;
      if (!u) return;
      var id = settings.provider || 'claude-code';
      u.provider(id, id === 'claude-code' ? 'Claude Code' : id === 'codex' ? 'Codex' : (PRESETS[id] || {}).label || id);
      if (runtime && runtime.usage) runtime.usage(settings).then(function (s) { u.update(s); }, function () {});
    }, 150);
  }
  function saveSettings() {
    refreshUsage();
    store('settings', { provider: settings.provider, claudePath: settings.claudePath || '', codexPath: settings.codexPath || '', nodePath: settings.nodePath || '', authMode: settings.authMode, confirmEdits: settings.confirmEdits, models: settings.models, baseUrls: settings.baseUrls, freeOnly: settings.freeOnly, efforts: settings.efforts, voiceEngine: settings.voiceEngine || 'auto', voiceMic: settings.voiceMic || '', editStyle: settings.editStyle || '', editStyles: settings.editStyles || [], pythonPath: settings.pythonPath || '' });
  }

  /* ---------- Bridge to ExtendScript ---------- */
  function host(name, args) {
    var run = function () {
      return new Promise(function (resolve, reject) {
        if (!nativeCEP) return reject(Error('Open Zenframe Assistant inside After Effects to use project tools.'));
        var finished = false;
        var timer = setTimeout(function () {
          if (!finished) { finished = true; reject(Error('After Effects has not responded. Close any open dialogs. A running script may still finish.')); }
        }, name === 'run_installed_script' || name === 'render_frames' ? 15 * 60000 : 90000); // installed scripts may open their own dialogs
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
    // Zeni's music watcher checks this so a slow tool call is never mistaken for playback.
    var counted = function () { window.ZenframeHostBusy = (window.ZenframeHostBusy || 0) + 1; return run().then(function (r) { window.ZenframeHostBusy--; return r; }, function (e) { window.ZenframeHostBusy--; throw e; }); };
    var pending = hostChain.then(counted);
    hostChain = pending.catch(function () {});
    return pending;
  }

  /* ---------- Workspace tabs (Conversation / Scripts) ---------- */
  function view(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('active', t.dataset.view === name); });
    $('chatView').classList.toggle('active', name === 'chat');
    $('scriptsView').classList.toggle('active', name === 'scripts');
    if (name === 'scripts') $('scriptBadge').hidden = true;
    if (window.ZenframeMotion) window.ZenframeMotion.view(name);
  }
  function scroll() { var el = $('messages'); el.scrollTop = el.scrollHeight; }

  /* ---------- Messages ---------- */
  function codeBlock(parent, code) {
    var pre = document.createElement('pre'); pre.textContent = code; parent.appendChild(pre);
    var bar = document.createElement('div'); bar.className = 'code-actions';
    var button = document.createElement('button'); button.textContent = 'Open in script editor';
    button.onclick = function () { stage({ title: 'Script from conversation', code: code, explanation: 'Review this code before running it.' }); view('scripts'); };
    bar.appendChild(button); parent.appendChild(bar);
  }
  // Zeni's replies are shown as formatted Markdown; your own messages and errors stay plain text.
  function renderBody(el, text, role) {
    if (role !== 'user' && role !== 'error' && window.ZenframeMarkdown) {
      window.ZenframeMarkdown.render(el, text, { code: codeBlock });
      return;
    }
    el.textContent = '';
    String(text).split(/(```[\s\S]*?```)/g).forEach(function (part) {
      if (part.slice(0, 3) === '```') codeBlock(el, part.replace(/^```[^\n]*\n?/, '').replace(/```$/, ''));
      else el.appendChild(document.createTextNode(part));
    });
  }
  // Attached files shown on a sent message (thumbnails only while the panel is open; names are saved).
  function fileChips(files) {
    var row = document.createElement('div'); row.className = 'msg-files';
    files.forEach(function (f) {
      var chip = document.createElement('div'); chip.className = 'attach-chip attach-' + (f.kind === 'image' ? 'image' : 'text');
      var thumb = document.createElement('span'); thumb.className = 'attach-thumb'; thumb.setAttribute('aria-hidden', 'true');
      if (f.preview) { var img = document.createElement('img'); img.src = f.preview; img.alt = ''; thumb.appendChild(img); }
      else thumb.textContent = f.kind === 'image' ? 'IMG' : ((/\.([a-z0-9]{1,5})$/i.exec(f.name) || [0, 'TXT'])[1]).toUpperCase();
      var meta = document.createElement('span'); meta.className = 'attach-meta';
      var name = document.createElement('span'); name.className = 'attach-name'; name.textContent = f.name; name.title = f.name;
      meta.appendChild(name); chip.appendChild(thumb); chip.appendChild(meta); row.appendChild(chip);
    });
    return row;
  }
  function messageElement(conv, role, text, files) {
    var wrapper = document.createElement('article'); wrapper.className = 'message ' + role;
    var author = document.createElement('div'); author.className = 'author';
    author.textContent = role === 'user' ? 'YOU' : role === 'error' ? 'CONNECTION / ERROR' : 'Zeni';
    var body = document.createElement('div'); body.className = 'body'; renderBody(body, text, role);
    wrapper.appendChild(author);
    if (files && files.length) wrapper.appendChild(fileChips(files));
    wrapper.appendChild(body);
    conv.el.appendChild(wrapper);
    return body;
  }
  // Adds a message to a conversation (saved), and keeps the welcome screen in sync.
  function message(conv, role, text, files) {
    var record = { role: role, text: text };
    if (files && files.length) record.files = files.map(function (f) { return { name: String(f.name), kind: f.kind === 'image' ? 'image' : 'text' }; });
    conv.messages.push(record);
    if (conv.messages.length > MAX_MESSAGES) conv.messages.splice(0, conv.messages.length - MAX_MESSAGES);
    var body = messageElement(conv, role, text, files);
    if (role === 'user' && !conv.customTitle && conv.title === 'New chat') { conv.title = titleFrom(text || (files && files[0] && files[0].name) || ''); renderTabs(); }
    if (conv.id === activeId) { $('welcome').hidden = true; scroll(); }
    persist();
    return { body: body, record: record };
  }
  function titleFrom(text) {
    var t = String(text).replace(/\s+/g, ' ').trim();
    return t.length > 28 ? t.slice(0, 27) + '…' : t || 'New chat';
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

  /* ---------- Conversations ---------- */
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function byId(id) { for (var i = 0; i < convs.length; i++) if (convs[i].id === id) return convs[i]; return null; }
  function activeConv() { return byId(activeId); }
  // Saves all conversations. Panel storage is limited (a few MB), so very long messages are
  // shortened when saved, and if space still runs out the oldest saved messages are dropped.
  function persist() {
    var keep = MAX_MESSAGES;
    while (keep >= 0) {
      var data = {
        activeId: activeId,
        list: convs.map(function (c) {
          return { id: c.id, title: c.title, custom: c.customTitle, created: c.created, messages: (keep ? c.messages.slice(-keep) : []).map(function (m) {
            var text = String(m.text);
            var saved = { role: m.role, text: text.length > MAX_SAVED_CHARS ? text.slice(0, MAX_SAVED_CHARS) + '\n…[shortened when saved]' : text };
            if (m.files) saved.files = m.files.slice(0, 6);
            return saved;
          }) };
        })
      };
      if (store('conversations', data)) {
        if (keep < MAX_MESSAGES && !warnedStorage) {
          warnedStorage = true;
          var c = activeConv();
          if (c) messageElement(c, 'assistant', 'Panel storage is full, so only the newest ' + keep + ' messages of each conversation are saved between sessions. Close conversations you no longer need to free space.');
        }
        return;
      }
      keep = keep > 10 ? Math.floor(keep / 2) : keep - 5;
    }
  }
  function makeConv(data) {
    data = data || {};
    var c = {
      id: data.id || newId(), title: data.title || 'New chat', customTitle: !!data.custom, created: data.created || Date.now(),
      messages: [], el: document.createElement('div'), reply: null, activeTool: null, attention: false
    };
    c.el.className = 'conv-pane'; c.el.hidden = true; c.el.dataset.conv = c.id;
    $('messages').appendChild(c.el);
    (data.messages || []).forEach(function (m) {
      if (!m || typeof m.text !== 'string') return;
      var files = Array.isArray(m.files) ? m.files.filter(function (f) { return f && typeof f.name === 'string'; }).slice(0, 6).map(function (f) { return { name: f.name, kind: f.kind === 'image' ? 'image' : 'text' }; }) : null;
      c.messages.push(files && files.length ? { role: m.role, text: m.text, files: files } : { role: m.role, text: m.text });
      messageElement(c, m.role, m.text, files);
    });
    return c;
  }
  function renderTabs() {
    var box = $('convTabs');
    box.textContent = '';
    convs.forEach(function (c) {
      var tab = document.createElement('div');
      tab.className = 'conv-tab' + (c.id === activeId ? ' active' : '') + (c.id === runningId ? ' running' : '') + (c.attention ? ' attention' : '');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(c.id === activeId));
      tab.tabIndex = c.id === activeId ? 0 : -1;
      tab.dataset.conv = c.id;
      tab.title = c.title + (c.id === runningId ? ' (Zeni is working)' : '') + ' · double-click to rename';
      var dot = document.createElement('span'); dot.className = 'conv-dot'; dot.setAttribute('aria-hidden', 'true');
      var title = document.createElement('span'); title.className = 'conv-title'; title.textContent = c.title;
      var close = document.createElement('button'); close.className = 'conv-close'; close.textContent = '×';
      close.setAttribute('aria-label', 'Close ' + c.title);
      close.disabled = c.id === runningId;
      close.title = c.id === runningId ? 'Stop the reply before closing this conversation' : 'Close conversation';
      close.onclick = function (e) { e.stopPropagation(); askClose(c, close); };
      tab.onclick = function () { if (c.id !== activeId) switchTo(c.id); };
      tab.onkeydown = function (e) {
        var i = convs.indexOf(c);
        if (e.key === 'ArrowRight' && convs[i + 1]) { switchTo(convs[i + 1].id); focusTab(convs[i + 1].id); }
        if (e.key === 'ArrowLeft' && convs[i - 1]) { switchTo(convs[i - 1].id); focusTab(convs[i - 1].id); }
        if (e.key === 'F2') rename(c, title);
      };
      title.ondblclick = function (e) { e.stopPropagation(); rename(c, title); };
      tab.appendChild(dot); tab.appendChild(title); tab.appendChild(close);
      box.appendChild(tab);
    });
    $('newConv').disabled = convs.length >= MAX_CONVS;
    $('newConv').title = convs.length >= MAX_CONVS ? 'Close a conversation to start another (limit ' + MAX_CONVS + ')' : 'New conversation';
    var current = box.querySelector('.conv-tab.active');
    if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // Update active/running/attention states on the existing tabs without rebuilding them,
  // so clicks and double-clicks keep landing on the same elements.
  function refreshTabStates() {
    var els = $('convTabs').querySelectorAll('.conv-tab');
    if (els.length !== convs.length) { renderTabs(); return; }
    Array.prototype.forEach.call(els, function (tab) {
      var c = byId(tab.dataset.conv);
      if (!c) { renderTabs(); return; }
      tab.classList.toggle('active', c.id === activeId);
      tab.classList.toggle('running', c.id === runningId);
      tab.classList.toggle('attention', c.attention);
      tab.setAttribute('aria-selected', String(c.id === activeId));
      tab.tabIndex = c.id === activeId ? 0 : -1;
      tab.title = c.title + (c.id === runningId ? ' (Zeni is working)' : '') + ' · double-click to rename';
      var close = tab.querySelector('.conv-close');
      if (close) {
        close.disabled = c.id === runningId;
        close.title = c.id === runningId ? 'Stop the reply before closing this conversation' : 'Close conversation';
      }
    });
    var current = $('convTabs').querySelector('.conv-tab.active');
    if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function focusTab(id) { var el = $('convTabs').querySelector('[data-conv="' + id + '"]'); if (el) el.focus(); }
  function rename(c, titleEl) {
    var input = document.createElement('input');
    input.className = 'conv-title-input'; input.value = c.title; input.maxLength = 40;
    input.setAttribute('aria-label', 'Conversation name');
    titleEl.replaceWith(input); input.focus(); input.select();
    var done = false;
    var finish = function (save) {
      if (done) return; done = true;
      var v = input.value.replace(/\s+/g, ' ').trim();
      if (save && v) { c.title = v; c.customTitle = true; persist(); }
      renderTabs();
    };
    input.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    input.onblur = function () { finish(true); };
    input.onclick = function (e) { e.stopPropagation(); };
  }
  function switchTo(id) {
    var c = byId(id);
    if (!c) return;
    activeId = id;
    convs.forEach(function (x) { x.el.hidden = x.id !== id; });
    $('welcome').hidden = c.el.childElementCount > 0;
    refreshTabStates(); persist(); view('chat'); scroll();
  }
  function newConversation() {
    if (convs.length >= MAX_CONVS) return;
    var c = makeConv();
    convs.push(c);
    renderTabs();
    switchTo(c.id);
    $('prompt').focus();
  }
  function askClose(c, button) {
    if (c.id === runningId) return;
    // Conversations with messages need a second click, so nothing is lost by accident.
    if (c.messages.length && !button.classList.contains('confirming')) {
      button.classList.add('confirming'); button.textContent = 'Close?';
      setTimeout(function () { if (button.isConnected) { button.classList.remove('confirming'); button.textContent = '×'; } }, 3000);
      return;
    }
    closeConversation(c.id);
  }
  function closeConversation(id) {
    var i = -1;
    for (var k = 0; k < convs.length; k++) if (convs[k].id === id) i = k;
    if (i < 0 || id === runningId) return;
    convs[i].el.remove();
    convs.splice(i, 1);
    if (runtime) { try { runtime.reset(id); } catch (e) {} }
    if (!convs.length) { newConversation(); return; }
    renderTabs();
    if (activeId === id) switchTo(convs[Math.max(0, i - 1)].id); else persist();
  }
  function deleteAll() {
    if (busy) return;
    var b = $('clearHistory');
    if (!b.classList.contains('confirming')) {
      b.classList.add('confirming'); b.textContent = 'Click again to delete all conversations';
      setTimeout(function () { b.classList.remove('confirming'); b.textContent = 'Delete all conversations'; }, 4000);
      return;
    }
    b.classList.remove('confirming'); b.textContent = 'Delete all conversations';
    convs.forEach(function (c) { c.el.remove(); });
    convs = [];
    if (runtime) { try { runtime.reset(); } catch (e) {} }
    newConversation();
  }
  // The visible earlier messages, so the AI can catch up when it has no memory of this conversation.
  function priorTranscript(c) {
    return c.messages.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-PRIOR_MESSAGES).map(function (m) {
      var t = String(m.text); if (t.length > 600) t = t.slice(0, 600) + '…';
      if (m.files && m.files.length) t += ' [attached: ' + m.files.map(function (f) { return f.name; }).join(', ') + ']';
      return (m.role === 'user' ? 'User: ' : 'Zeni: ') + t;
    }).join('\n');
  }
  function loadConversations() {
    var saved = readStore('conversations', null);
    if (!saved || !saved.list || !saved.list.length) {
      // Bring over the single conversation saved by earlier versions.
      var old = readStore('history', []);
      saved = { activeId: null, list: old.length ? [{ title: titleFrom((old.filter(function (m) { return m.role === 'user'; })[0] || {}).text || 'New chat'), messages: old }] : [] };
      try { localStorage.removeItem('zenframeAssistant.history'); } catch (e) {}
    }
    saved.list.slice(0, MAX_CONVS).forEach(function (d) { convs.push(makeConv(d)); });
    if (!convs.length) convs.push(makeConv());
    renderTabs();
    switchTo(byId(saved.activeId) ? saved.activeId : convs[convs.length - 1].id);
  }

  /* ---------- Edit approval ---------- */
  function setApproval(ask) {
    settings.confirmEdits = !!ask;
    if (runtime) runtime.setConfirmEdits(!!ask);
    saveSettings();
    $('confirmEdits').checked = !!ask;
    $('approval').value = ask ? 'ask' : 'auto';
    $('approval').classList.toggle('auto', !ask);
    showModeNote();
  }
  function finishCard(card, outcome, text) {
    if (window.ZenframeZeni) window.ZenframeZeni.confirm(false);
    card.classList.add('resolved', outcome);
    card.querySelector('.confirm-outcome').textContent = text;
    if (openCard && openCard.card === card) openCard = null;
  }
  function confirmEdits(data, answer) {
    if (window.ZenframeZeni) window.ZenframeZeni.confirm(true);
    var c = byId(runningId) || activeConv();
    var card = document.createElement('section'); card.className = 'confirm-card';
    var script = data.kind === 'script';
    card.setAttribute('aria-label', script ? 'Approve running a script' : 'Approve project edits');
    var title = document.createElement('div'); title.className = 'confirm-title';
    title.textContent = 'ZENI WANTS TO: ' + data.label.toUpperCase();
    var list = document.createElement('ol');
    data.summary.forEach(function (line) { var li = document.createElement('li'); li.textContent = line; list.appendChild(li); });
    var note = document.createElement('p'); note.className = 'confirm-note';
    note.textContent = script
      ? 'This is a script installed on your computer. It runs as one Undo step, but scripts can also do things Undo cannot reverse. Zeni asks every time.'
      : 'These changes were checked in After Effects. Applying them creates one Undo step.';
    var actions = document.createElement('div'); actions.className = 'confirm-actions';
    var apply = document.createElement('button'); apply.className = 'primary apply'; apply.textContent = script ? 'Run' : 'Apply';
    var always = document.createElement('button'); always.className = 'secondary always'; always.textContent = 'Always apply';
    always.title = 'Apply this and switch to auto-apply for future edits';
    var decline = document.createElement('button'); decline.className = 'secondary decline'; decline.textContent = 'Decline';
    var outcome = document.createElement('div'); outcome.className = 'confirm-outcome';
    var resolveCard = function () { c.attention = false; refreshTabStates(); };
    apply.onclick = function () { finishCard(card, 'approved', script ? 'Approved. Running…' : 'Approved. Applying…'); applyingCard = card; resolveCard(); answer(true); };
    always.onclick = function () { setApproval(false); finishCard(card, 'approved', 'Approved. Auto-apply is now on.'); applyingCard = card; resolveCard(); answer(true); };
    decline.onclick = function () { finishCard(card, 'declined', script ? 'Declined. The script did not run.' : 'Declined. Nothing was changed.'); resolveCard(); answer(false); };
    actions.appendChild(apply); if (!script) actions.appendChild(always); actions.appendChild(decline);
    [title, list, note, actions, outcome].forEach(function (el) { card.appendChild(el); });
    c.el.appendChild(card);
    openCard = { card: card };
    $('activity').textContent = 'Waiting for your approval…';
    // Bring the user to the conversation that is asking, and flag it until answered.
    if (c.id !== activeId) switchTo(c.id); else $('welcome').hidden = true;
    c.attention = true;
    refreshTabStates();
    scroll();
    apply.focus();
  }

  /* ---------- Busy state and runtime events ---------- */
  function setBusy(v) {
    if (window.ZenframeZeni) window.ZenframeZeni.setBusy(v);
    busy = v;
    $('send').hidden = v; $('stop').hidden = !v;
    ['mode', 'modelSelect', 'runScript', 'saveSettings', 'clearHistory', 'saveKey', 'removeKey', 'authMode', 'detectPaths', 'provider', 'loadModels'].forEach(function (id) { $(id).disabled = v; });
    $('activity').hidden = !v;
    $('activity').textContent = v ? 'Zeni is working…' : '';
  }
  function toolGroup(c) {
    var g = { el: document.createElement('details'), steps: [] };
    g.el.className = 'tool-group running';
    g.summary = document.createElement('summary');
    g.title = document.createElement('span'); g.title.className = 'tg-title';
    g.count = document.createElement('span'); g.count.className = 'tg-count';
    g.summary.appendChild(g.title); g.summary.appendChild(g.count);
    g.list = document.createElement('div'); g.list.className = 'tg-list';
    g.el.appendChild(g.summary); g.el.appendChild(g.list);
    c.el.appendChild(g.el);
    return g;
  }
  // Running: what Zeni is doing now. Finished: how many steps, grouped by kind ("Inspect layer properties x9").
  function updateGroup(g, current, finished) {
    var n = g.steps.length, errors = g.steps.filter(function (s) { return s.status === 'error'; }).length;
    if (finished) g.el.classList.remove('running');
    g.el.classList.toggle('has-error', errors > 0);
    var counts = {}, order = [];
    g.steps.forEach(function (s) { if (!counts[s.label]) { counts[s.label] = 0; order.push(s.label); } counts[s.label]++; });
    var kinds = order.map(function (l) { return counts[l] > 1 ? l + ' \u00d7' + counts[l] : l; }).join(' \u00b7 ');
    var running = g.el.classList.contains('running');
    g.title.textContent = running && current ? current + '\u2026' : running ? 'Working\u2026' : (n === 1 ? order[0] : 'Worked through ' + n + ' steps');
    g.count.textContent = running ? (n > 1 ? n + ' steps' : '') : (n > 1 ? kinds : '') + (errors ? (n > 1 ? ' \u00b7 ' : '') + errors + ' failed' : '');
    g.el.title = kinds;
  }
  function onEvent(e) {
    if (window.ZenframeZeni) window.ZenframeZeni.onEvent(e);
    var c = byId(runningId) || activeConv();
    if (e.type === 'start') setBusy(true);
    if (e.type === 'text') {
      // Text arrives as the whole reply so far. Text written after a tool runs goes in a new bubble below
      // that tool, so the final answer shows at the bottom instead of above a long list of tool steps.
      var full = String(e.data || ''), from = c.textUsed || 0;
      if (full.length < from) from = 0;
      var part = full.slice(from).replace(/^\s+/, '');
      c.lastText = full;
      if (part) {
        if (!c.reply) { c.reply = message(c, 'assistant', ''); if (c.toolGroup) { updateGroup(c.toolGroup, null, true); c.toolGroup = null; } }
        renderBody(c.reply.body, part, 'assistant'); c.reply.record.text = part;
        if (c.id === activeId) scroll();
      }
    }
    if (e.type === 'tool') {
      var labels = { ae_get_context: 'Read composition', ae_inspect_layer: 'Inspect layer properties', ae_search_effects: 'Find installed effects', ae_apply_actions: 'Edit project', ae_stage_script: 'Draft a script', ae_list_tools: 'Look through your installed tools', ae_open_panel: 'Open a panel', ae_run_script: 'Run your script', ae_render_frames: 'Look at rendered frames', ae_analyze_audio: 'Listen to the music', ae_style_guide: 'Read the style guide', ae_study_project: 'Study a project file' };
      if (e.data.status === 'running' && c.reply) { c.textUsed = (c.lastText || '').length; c.reply = null; }
      if (e.data.status === 'running') {
        // 1.4.0: back-to-back steps share one collapsible group, so long analyses don't flood the chat.
        if (!c.toolGroup) c.toolGroup = toolGroup(c);
        c.activeTool = document.createElement('details'); c.activeTool.className = 'tool';
        var summary = document.createElement('summary'); summary.textContent = labels[e.data.name] || e.data.name;
        c.activeTool.appendChild(summary); c.toolGroup.list.appendChild(c.activeTool);
        c.toolGroup.steps.push({ label: summary.textContent, status: 'running' });
        updateGroup(c.toolGroup, summary.textContent);
        $('activity').textContent = summary.textContent + '…';
      } else if (c.activeTool) {
        c.activeTool.className = 'tool ' + e.data.status;
        var p = document.createElement('p'); p.textContent = e.data.detail; c.activeTool.appendChild(p);
        if (e.data.image && /^data:image\/(jpeg|png);base64,/.test(e.data.image)) { var shot = document.createElement('img'); shot.className = 'tool-frames'; shot.alt = 'Frames Zeni looked at'; shot.src = e.data.image; c.activeTool.appendChild(shot); c.activeTool.open = true; }
        c.activeTool = null;
        if (c.toolGroup) { var st = c.toolGroup.steps[c.toolGroup.steps.length - 1]; if (st) st.status = e.data.status; updateGroup(c.toolGroup, null); }
      }
      if (applyingCard && (e.data.name === 'ae_apply_actions' || e.data.name === 'ae_run_script') && e.data.status !== 'running') {
        applyingCard.querySelector('.confirm-outcome').textContent = e.data.status === 'done' ? (e.data.name === 'ae_run_script' ? 'Ran. Use Undo in After Effects to revert.' : 'Applied. Use Undo in After Effects to revert.') : 'Could not finish: ' + e.data.detail;
        applyingCard = null;
      }
      if (c.id === activeId) { $('welcome').hidden = true; scroll(); }
    }
    if (e.type === 'error') {
      message(c, 'error', String(e.data));
      if (/oauth|session expired|rejected the api key|invalid x-api-key|401/i.test(String(e.data))) {
        $('connection').textContent = 'Check sign-in';
        $('connection').classList.remove('ready');
        $('settingsStatus').textContent = settings.provider === 'claude-code' && settings.authMode === 'claude'
          ? 'Your Claude Code login needs renewing. Run "claude auth login" in Command Prompt.'
          : 'Your API key was rejected. Check it with the provider and save it again.';
      }
    }
    if (e.type === 'notice') message(c, 'assistant', String(e.data));
    if (e.type === 'limits' && window.ZenframeUsage) window.ZenframeUsage.update(e.data);
    if (e.type === 'usage' && window.ZenframeUsage) window.ZenframeUsage.tokens(e.data);
    if (e.type === 'end') {
      if (openCard) finishCard(openCard.card, 'declined', 'Cancelled. Nothing was changed.');
      if (e.data.stopped) message(c, 'assistant', 'Stopped. Any project changes already applied remain in After Effects; use Undo to revert them.');
      if (c.toolGroup) { updateGroup(c.toolGroup, null, true); c.toolGroup = null; }
      c.reply = null; c.activeTool = null; c.attention = false; c.textUsed = 0; c.lastText = '';
      runningId = null;
      setBusy(false); persist(); refreshTabStates(); refresh();
    }
  }

  function refresh() {
    return host('ae_get_context', {}).then(function (ctx) {
      if (ctx.error) throw Error(ctx.error);
      $('contextName').textContent = ctx.activeComp ? ctx.activeComp.name + ' · ' + ctx.activeComp.layerCount + ' layers' : ctx.projectName + ' · no active composition';
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
    var id = settings.provider, cc = id === 'claude-code', codex = id === 'codex', p = preset();
    $('provider').value = id;
    $('authMode').value = settings.authMode === 'claude' ? 'claude' : 'apikey';
    $('claudeCodeGroup').hidden = !cc;
    $('codexGroup').hidden = !codex;
    $('pathsGroup').hidden = !(cc || codex);
    $('claudePathRow').hidden = !cc;
    $('codexPathRow').hidden = !codex;
    $('loginGroup').hidden = !(cc && settings.authMode === 'claude');
    $('directGroup').hidden = cc || codex;
    $('loadModels').hidden = false;
    var showKey = codex ? false : cc ? settings.authMode !== 'claude' : !!(p && (p.needsKey || p.optionalKey));
    $('apiKeyGroup').hidden = !showKey;
    $('apiKeyLabel').textContent = shortName() + ' API key' + (p && p.optionalKey ? ' (optional)' : '');
    $('apiKey').placeholder = cc ? 'sk-ant-…' : (p && p.keyHint) || 'Paste your key';
    var url = cc ? 'console.anthropic.com' : p && p.keyUrl;
    $('keyHelp').textContent = (url ? 'Get a key at ' + url + '. ' : '') + 'Each key is encrypted for your Windows account and only sent to its own provider. It is never shown, logged, or sent anywhere else.';
    settings.models = settings.models || {}; settings.baseUrls = settings.baseUrls || {};
    if (!cc && !codex && p) {
      $('baseUrl').value = (p.editableUrl && settings.baseUrls[id]) || p.baseUrl;
      $('baseUrl').readOnly = !p.editableUrl;
    }
    fillModels(id);
    $('freeOnlyRow').hidden = !(p && p.freeFilter);
    $('freeOnly').checked = settings.freeOnly !== false;
    if (effort) effort.refresh();
    if (runtime && refreshKeyStatus) {
      $('keyStatus').textContent = runtime.hasKey(id) ? 'A key is saved for this Windows account.' : 'No key saved yet.';
      $('modelStatus').textContent = '';
    }
  }
  // Fills the Model menu from the last list loaded for this provider (remembered between sessions).
  // A plain <select> is used because the After Effects panel browser cannot open <datalist> popups.
  // Friendly names for Claude model IDs, e.g. "claude-opus-5-5" -> "Opus 5.5".
  // Only the label changes: the real ID is still what gets sent to Claude.
  function modelLabel(id) {
    id = String(id || '');
    var alias = { opus: 'Opus (latest)', sonnet: 'Sonnet (latest)', haiku: 'Haiku (latest)', fable: 'Fable (latest)' };
    if (alias[id]) return alias[id];
    var g = /^gpt-([\d.]+)(?:-([a-z]+))?$/i.exec(id);
    if (g) return 'GPT-' + g[1] + (g[2] ? ' ' + g[2].charAt(0).toUpperCase() + g[2].slice(1) : '');
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    // Newer style: claude-opus-5-5, claude-opus-4-5-20251101, claude-opus-5
    var m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
    if (m) return cap(m[1]) + ' ' + m[2] + (m[3] ? '.' + m[3] : '');
    // Older style: claude-3-opus-20240229, claude-3-5-sonnet-20241022
    m = /^claude-(\d+)(?:-(\d))?-(opus|sonnet|haiku)(?:-\d{8}|-latest)?$/.exec(id);
    if (m) return cap(m[3]) + ' ' + m[1] + (m[2] ? '.' + m[2] : '');
    return id;
  }
  function modelChoices(id) { return modelLists[id] || (id === 'claude-code' ? CC_MODELS : id === 'codex' ? CODEX_MODELS : []); }
  function fillModels(id) {
    var sel = $('modelSelect'), list = modelChoices(id), current = (settings.models || {})[id] || '';
    sel.textContent = '';
    var add = function (value, text) { var o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); };
    // Claude Code can always fall back to its own default model.
    if (id === 'claude-code') add('', 'Default (Claude Code decides)');
    else if (id === 'codex') add('', 'Default (Codex decides)');
    else if (!current) add('', list.length ? 'Choose a model…' : 'Click Load models first');
    if (current && list.indexOf(current) < 0) add(current, modelLabel(current) + ' (saved)');
    list.forEach(function (m) { add(m, modelLabel(m)); });
    add(CUSTOM_MODEL, 'Type a model name…');
    sel.value = current;
    $('modelName').hidden = true;
  }
  /* ---------- Effort ---------- */
  function effortLevels() {
    var id = settings.provider, kind = id === 'claude-code' ? 'claude' : id === 'codex' && EFFORT_LEVELS.codex ? 'codex' : (PRESETS[id] || {}).effort || 'openai';
    var names = kind === 'codex' ? CODEX_EFFORT_LABELS : EFFORT_LABELS;
    return (EFFORT_LEVELS[kind] || EFFORT_LEVELS.openai).map(function (k) { return { key: k, label: names[k] || k }; });
  }
  function effortState() {
    var id = settings.provider, levels = effortLevels(), v = (settings.efforts || {})[id] || null;
    if (!levels.some(function (l) { return l.key === v; })) v = null;
    var model = (settings.models || {})[id] || '';
    return {
      levels: levels, value: v, defaultIndex: 1,
      model: model ? modelLabel(model) : (id === 'claude-code' || id === 'codex' ? 'Default model' : 'No model chosen'),
      models: modelChoices(id), current: model,
      topWarning: (id === 'claude-code' && settings.authMode === 'claude') || id === 'codex' ? 'Uses your plan limits faster' : 'Slower, and uses noticeably more tokens'
    };
  }
  function showModeNote() {
    var edit = $('mode').value === 'edit', ask = settings.confirmEdits !== false;
    $('approvalWrap').hidden = !edit;
    $('modeNote').textContent = edit ? (ask ? 'Undo in AE' : 'Edits apply right away · Undo in AE') : 'Code stays in the editor until you click Run';
  }
  function check() {
    showProvider(false);
    if (!runtime) {
      $('connection').textContent = 'Preview';
      $('settingsStatus').textContent = 'Open the panel in After Effects to connect to your AI.';
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

  /* ---------- Sending ---------- */
  async function send() {
    if (busy) return;
    var attach = window.ZenframeAttach;
    var text = $('prompt').value.trim();
    var hasFiles = !!(attach && attach.count());
    if (!text && !hasFiles) return;
    if (attach && attach.reading()) { $('prompt').focus(); return; } // files still loading; Send again in a moment
    var c = activeConv();
    if (!runtime) { message(c, 'error', 'Open this panel inside After Effects to chat with Zeni.'); return; }
    var prior = priorTranscript(c);
    var taken = hasFiles ? attach.take() : null;
    message(c, 'user', text, taken ? taken.meta : null);
    $('prompt').value = '';
    c.reply = null; c.textUsed = 0; c.lastText = '';
    runningId = c.id;
    setBusy(true); refreshTabStates();
    try { await runtime.send(text, $('mode').value, settings, c.id, prior, taken ? taken.files : []); }
    catch (e) {
      if (window.ZenframeZeni) window.ZenframeZeni.onEvent({ type: 'error', data: e.message });
      message(c, 'error', e.message); runningId = null; setBusy(false); refreshTabStates();
      if (taken) attach.restore(taken); // nothing was sent, so the files go back in the box
    }
  }

  function init() {
    settings = readStore('settings', {});
    if (settings.authMode !== 'claude') settings.authMode = 'apikey';
    if (!settings.provider) settings.provider = 'claude-code';
    settings.models = settings.models || {};
    settings.baseUrls = settings.baseUrls || {};
    settings.efforts = settings.efforts || {};
    // Earlier versions kept Claude Code's model as "default" / "sonnet" / "opus".
    if (settings.model && settings.model !== 'default' && !settings.models['claude-code']) settings.models['claude-code'] = settings.model;
    delete settings.model;
    if (settings.confirmEdits !== false) settings.confirmEdits = true;
    modelLists = readStore('modelLists', {});
    loadConversations();
    if (nativeCEP && nodeRequire) {
      try {
        var path = nodeRequire('path'), url = nodeRequire('url');
        var root = nativeCEP.getSystemPath('extension');
        if (/^file:/i.test(root)) root = url.fileURLToPath ? url.fileURLToPath(root) : decodeURIComponent(root.replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1'));
        var backend = nodeRequire(path.join(root, 'backend', 'runtime.cjs'));
        PRESETS = backend.PRESETS || {};
        if (backend.EFFORT_LEVELS) EFFORT_LEVELS = backend.EFFORT_LEVELS;
        if (backend.CLAUDE_CODE_MODELS) CC_MODELS = backend.CLAUDE_CODE_MODELS;
        if (backend.CODEX_MODELS) CODEX_MODELS = backend.CODEX_MODELS;
        var found = backend.findExecutables();
        settings.claudePath = settings.claudePath || found.claudePath;
        settings.codexPath = settings.codexPath || found.codexPath || '';
        settings.nodePath = settings.nodePath || found.nodePath;
        runtime = new backend.Runtime({ callHost: host, onEvent: onEvent, onScript: stage, onConfirm: confirmEdits,
          renderFrames: function (a) { return window.ZenframeFrames ? window.ZenframeFrames.render(a, host) : Promise.resolve({ error: 'Frame rendering is not loaded.' }); },
          analyzeAudioFile: function (p) { return window.ZenframeListen ? window.ZenframeListen.analyzePath(p) : Promise.reject(Error('Audio analysis is not loaded.')); },
          analyzeAudio: function (a) { return window.ZenframeListen ? window.ZenframeListen.analyze(a, host) : Promise.resolve({ error: 'Audio analysis is not loaded.' }); },
          openExtension: function (id) { nativeCEP.requestOpenExtension(id, ''); } });
        if (runtime.pickFile && /win/i.test(navigator.platform)) window.ZenframePickFile = function (o) { return runtime.pickFile(o); };
        if (window.ZenframeUsage) window.ZenframeUsage.onRefresh(refreshUsage);
        if (window.ZenframeVoice) window.ZenframeVoice.init({
          settings: function () { return settings; },
          update: function (o) { Object.keys(o).forEach(function (k) { settings[k] = o[k]; }); saveSettings(); },
          engines: function () { return runtime.voiceEngines ? runtime.voiceEngines() : {}; },
          transcribe: function (wav) { return runtime.transcribe(wav, settings); }
        });
        refreshUsage();
        $('detectPaths').onclick = function () {
          var again = backend.findExecutables();
          $('claudePath').value = again.claudePath || $('claudePath').value;
          $('codexPath').value = again.codexPath || $('codexPath').value;
          $('nodePath').value = again.nodePath || $('nodePath').value;
          var main = settings.provider === 'codex' ? again.codexPath : again.claudePath;
          $('settingsStatus').textContent = main && again.nodePath ? 'Found both. Click Save & check connection.' : 'Could not find everything. Enter the missing path, or install it first.';
        };
      } catch (e) { message(activeConv(), 'error', 'Could not start the local bridge: ' + e.message); }
    }
    if (!runtime) $('detectPaths').onclick = function () { $('settingsStatus').textContent = 'Open the panel inside After Effects first.'; };
    $('claudePath').value = settings.claudePath || '';
    $('codexPath').value = settings.codexPath || '';
    $('nodePath').value = settings.nodePath || '';
    effort = window.ZenframeEffort({
      pill: $('effortPill'), pop: $('effortPop'), state: effortState, label: modelLabel,
      onChange: function (key) {
        if (key) settings.efforts[settings.provider] = key; else delete settings.efforts[settings.provider];
        saveSettings();
      },
      onModel: function (id) {
        settings.models[settings.provider] = id;
        saveSettings(); fillModels(settings.provider); check();
      },
      openSettings: function () { window.ZenframeMotion.settings(true); }
    });
    $('versionLabel').textContent = VERSION;
    if (UPDATE_URL) $('updatesLink').hidden = false;
    setApproval(settings.confirmEdits !== false);
    var script = readStore('script', null);
    if (script) stage(script);
    showProvider(true); check(); refresh();
  }

  /* ---------- Wiring ---------- */
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
  $('stop').onclick = function () { if (window.ZenframeZeni) window.ZenframeZeni.stop(); if (runtime) runtime.stop(); $('activity').textContent = 'Stopping…'; };
  $('mode').onchange = showModeNote;
  $('approval').onchange = function () { setApproval($('approval').value === 'ask'); };
  $('refreshContext').onclick = refresh;
  $('newChat').onclick = newConversation;
  $('newConv').onclick = newConversation;
  $('clearHistory').onclick = deleteAll;
  $('settingsButton').onclick = function () { window.ZenframeMotion.settings(true); };
  $('closeSettings').onclick = function () { window.ZenframeMotion.settings(false); };
  $('authMode').onchange = function () { settings.authMode = $('authMode').value; saveSettings(); showProvider(true); check(); };
  $('provider').onchange = function () {
    if (busy) return;
    settings.provider = $('provider').value;
    saveSettings(); showProvider(true); check();
  };
  $('baseUrl').onchange = function () {
    var p = preset(); if (!p || !p.editableUrl) return;
    settings.baseUrls[settings.provider] = $('baseUrl').value.trim();
    saveSettings(); check();
  };
  $('modelSelect').onchange = function () {
    var v = $('modelSelect').value;
    if (v === CUSTOM_MODEL) {
      $('modelName').value = settings.models[settings.provider] || '';
      $('modelName').hidden = false;
      $('modelName').focus();
      return;
    }
    settings.models[settings.provider] = v;
    saveSettings(); fillModels(settings.provider); check();
    if (effort) effort.refresh();
  };
  $('modelName').onchange = function () {
    var v = $('modelName').value.trim();
    if (!v) return;
    settings.models[settings.provider] = v;
    saveSettings(); fillModels(settings.provider); check();
  };
  $('modelName').onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('modelName').onchange(); }
    if (e.key === 'Escape') { e.stopPropagation(); fillModels(settings.provider); }
  };
  $('freeOnly').onchange = function () { settings.freeOnly = $('freeOnly').checked; saveSettings(); };
  $('loadModels').onclick = async function () {
    if (!runtime) { $('modelStatus').textContent = 'Open the panel inside After Effects first.'; return; }
    var p = preset() || { label: settings.provider === 'codex' ? 'Codex' : 'Claude Code' };
    if (p.editableUrl) settings.baseUrls[settings.provider] = $('baseUrl').value.trim();
    $('loadModels').disabled = true;
    $('modelStatus').textContent = 'Loading models from ' + p.label + '…';
    try {
      var ids = await runtime.listModels(settings, p.freeFilter && $('freeOnly').checked);
      if (effort) setTimeout(effort.refresh, 0);
      modelLists[settings.provider] = ids;
      store('modelLists', modelLists);
      fillModels(settings.provider);
      $('modelStatus').textContent = ids.length
        ? 'Loaded ' + ids.length + ' models. Pick one from the Model menu.'
        : 'No matching models found' + (p.freeFilter && $('freeOnly').checked ? '. Try turning off "free models only".' : '.');
      saveSettings();
    } catch (e) { $('modelStatus').textContent = e.message; }
    finally { $('loadModels').disabled = busy; }
  };
  $('confirmEdits').onchange = function () { setApproval($('confirmEdits').checked); };
  // 1.4.0: project file reader (Python + py-aep).
  function readerStatus() {
    var el = $('aepReaderStatus'); if (!el || !runtime || !runtime.projectReaderStatus) return;
    el.textContent = 'Checking…';
    runtime.projectReaderStatus(settings).then(function (s) { el.textContent = s.message; $('aepReaderInstall').hidden = !!s.library; }, function (e) { el.textContent = e.message; });
  }
  if ($('aepReaderInstall')) $('aepReaderInstall').onclick = function () {
    var el = $('aepReaderStatus'), b = $('aepReaderInstall'); b.disabled = true; el.textContent = 'Installing the project reader (py-aep)… this can take a minute.';
    runtime.installProjectReader(settings).then(function (s) { el.textContent = s.message; b.hidden = !!s.library; b.disabled = false; }, function (e) { el.textContent = e.message; b.disabled = false; });
  };
  if ($('settingsButton')) $('settingsButton').addEventListener('click', function () { setTimeout(readerStatus, 50); });
  $('editStyle').value = settings.editStyle || '';
  Array.prototype.forEach.call(document.querySelectorAll('input[name="editStyles"]'), function (box) {
    box.checked = (settings.editStyles || []).indexOf(box.value) >= 0; box.parentNode.classList.toggle('on', box.checked);
    box.addEventListener('change', function () {
      box.parentNode.classList.toggle('on', box.checked);
      settings.editStyles = Array.prototype.filter.call(document.querySelectorAll('input[name="editStyles"]'), function (b) { return b.checked; }).map(function (b) { return b.value; });
      saveSettings();
    });
  });
  $('editStyle').addEventListener('input', function () { settings.editStyle = $('editStyle').value.slice(0, 600); saveSettings(); });
  $('saveSettings').onclick = function () {
    settings.claudePath = $('claudePath').value.trim();
    settings.codexPath = $('codexPath').value.trim();
    settings.nodePath = $('nodePath').value.trim();
    saveSettings(); check();
  };
  $('saveKey').onclick = async function () {
    if (!runtime) { $('keyStatus').textContent = 'Open the panel inside After Effects first.'; return; }
    var value = $('apiKey').value;
    $('apiKey').value = '';
    $('saveKey').disabled = true;
    $('keyStatus').textContent = 'Encrypting and saving…';
    try { await runtime.saveKey(settings.provider, value); $('keyStatus').textContent = 'Key saved and encrypted for this Windows account.'; check(); if (window.ZenframeVoice) window.ZenframeVoice.refresh(); }
    catch (e) { $('keyStatus').textContent = e.message; }
    finally { $('saveKey').disabled = busy; }
  };
  $('removeKey').onclick = function () {
    if (!runtime) return;
    try { runtime.removeKey(settings.provider); $('keyStatus').textContent = 'Key removed from this computer.'; check(); if (window.ZenframeVoice) window.ZenframeVoice.refresh(); }
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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('settingsView').hidden) $('closeSettings').click();
    // Ctrl+T: new conversation. Ctrl+Tab / Ctrl+Shift+Tab: next / previous conversation.
    if (e.ctrlKey && (e.key === 't' || e.key === 'T') && $('settingsView').hidden) { e.preventDefault(); newConversation(); }
    if (e.ctrlKey && e.key === 'Tab' && convs.length > 1) {
      e.preventDefault();
      var i = convs.indexOf(activeConv());
      switchTo(convs[(i + (e.shiftKey ? convs.length - 1 : 1)) % convs.length].id);
    }
  });

  init();
}());
