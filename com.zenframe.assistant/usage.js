/* Zenframe Assistant 1.2.0: usage gauge.
   A small ring next to the connection status shows how much of your limit is left; click it for details.
   The same details appear in Settings under AI provider. Data comes from the runtime's usage snapshot:
   { label, kind, remaining (0..1 or null), status, title, items: [{ label, value, fraction, resetAt }], note }
   plus the tokens this panel session has used with the current provider. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ring = $('usageRing'), pop = $('usagePop'), card = $('usageCard');
  if (!ring || !pop) return;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var snap = null, tokens = { input: 0, output: 0 }, provider = '', onOpen = null, tick = 0;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
  function inTime(at) {
    var ms = at - Date.now();
    if (!(ms > 0)) return 'resets soon';
    var m = Math.round(ms / 60000);
    if (m < 1) return 'resets in ' + Math.max(1, Math.round(ms / 1000)) + 's';
    if (m < 60) return 'resets in ' + m + 'm';
    var h = Math.floor(m / 60);
    if (h < 48) return 'resets in ' + h + 'h ' + (m % 60) + 'm';
    return 'resets ' + new Date(at).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }

  // A ring: the bright arc is what's left. Unknown amounts show a soft dashed ring.
  function gauge(size, stroke, s) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var g = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, 'aria-hidden': 'true', 'class': 'usage-gauge' });
    g.appendChild(svg('circle', { cx: size / 2, cy: size / 2, r: r, 'class': 'usage-track', 'stroke-width': stroke }));
    var known = s && s.remaining !== null && s.remaining !== undefined;
    var arc = svg('circle', { cx: size / 2, cy: size / 2, r: r, 'class': 'usage-arc' + (known ? '' : ' usage-arc-unknown'), 'stroke-width': stroke,
      'stroke-dasharray': known ? c : (c / 14) + ' ' + (c / 14), 'stroke-dashoffset': known ? c * (1 - Math.max(0, Math.min(1, s.remaining))) : 0,
      transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' });
    g.appendChild(arc);
    return g;
  }
  // Claude Code often reports only "within limit" (no percentage): show a healthy full ring with a check.
  function statusOnly(s) { return !!s && s.kind === 'plan' && s.remaining === null && (s.status === 'ok' || s.status === 'warn'); }
  function shown(s) { return statusOnly(s) ? { remaining: s.status === 'ok' ? 1 : .15 } : s; }
  function stateClass(s) { return 'usage-' + (s ? s.status : 'unknown') + (s && s.kind === 'local' ? ' usage-local' : '') + (statusOnly(s) ? ' usage-status-only' : ''); }

  function details(target, big) {
    target.textContent = '';
    var s = snap || { label: provider || 'AI provider', kind: 'none', remaining: null, status: 'unknown', title: 'Not checked yet', items: [], note: 'Open Zenframe inside After Effects to see usage.' };
    target.className = (big ? 'usage-card ' : 'usage-pop-inner ') + stateClass(s);
    var head = el('div', 'usage-head');
    var g = el('div', 'usage-big');
    g.appendChild(gauge(big ? 58 : 54, 5, shown(s)));
    var pct = el('span', 'usage-pct', s.kind === 'local' ? '∞' : s.remaining !== null ? Math.round(s.remaining * 100) + '%' : s.status === 'limit' ? '0%' : statusOnly(s) ? (s.status === 'ok' ? '✓' : '!') : '—');
    g.appendChild(pct);
    var titles = el('div', 'usage-titles');
    titles.appendChild(el('div', 'usage-eyebrow', s.label.toUpperCase()));
    titles.appendChild(el('div', 'usage-title', s.title));
    head.appendChild(g); head.appendChild(titles);
    target.appendChild(head);
    if (s.items && s.items.length) {
      var list = el('div', 'usage-items');
      s.items.forEach(function (it) {
        var row = el('div', 'usage-item');
        var top = el('div', 'usage-item-top');
        top.appendChild(el('span', 'usage-item-label', it.label));
        top.appendChild(el('span', 'usage-item-value', it.value));
        row.appendChild(top);
        if (it.fraction !== null && it.fraction !== undefined) {
          var bar = el('div', 'usage-bar'), fill = el('span');
          fill.style.width = Math.round(Math.max(0, Math.min(1, it.fraction)) * 100) + '%';
          if (it.fraction < .15) fill.className = 'low';
          bar.appendChild(fill); row.appendChild(bar);
        }
        if (it.resetAt) row.appendChild(el('div', 'usage-reset', inTime(it.resetAt)));
        list.appendChild(row);
      });
      target.appendChild(list);
    }
    var session = el('div', 'usage-session');
    session.appendChild(el('span', '', 'This session'));
    session.appendChild(el('span', 'usage-session-value', tokens.input + tokens.output ? fmt(tokens.input) + ' in · ' + fmt(tokens.output) + ' out' : 'No messages yet'));
    target.appendChild(session);
    if (s.note) target.appendChild(el('p', 'usage-note', s.note));
    var refresh = el('button', 'usage-refresh', 'Refresh'); refresh.type = 'button';
    refresh.onclick = function () { refresh.textContent = 'Checking…'; if (onOpen) onOpen(); };
    target.appendChild(refresh);
  }

  function renderRing() {
    var s = snap;
    ring.textContent = '';
    ring.className = 'usage-ring ' + stateClass(s);
    ring.appendChild(gauge(18, 2.6, shown(s)));
    var label = !s ? 'Usage' : s.kind === 'local' ? 'Usage: runs on your PC, no limits' : 'Usage: ' + s.title;
    ring.setAttribute('aria-label', label + '. Show details');
    ring.title = label;
  }
  function render() {
    renderRing();
    if (!pop.hidden) details(pop.firstChild || pop.appendChild(el('div')), false);
    if (card) details(card, true);
  }

  function open(v) {
    pop.hidden = !v;
    ring.setAttribute('aria-expanded', String(!!v));
    clearInterval(tick);
    if (v) {
      pop.textContent = ''; pop.appendChild(el('div'));
      render();
      requestAnimationFrame(function () { pop.classList.add('usage-open'); });
      tick = setInterval(render, 30000);
      if (onOpen) onOpen();
    } else pop.classList.remove('usage-open');
  }
  ring.addEventListener('click', function (e) { e.stopPropagation(); open(pop.hidden); });
  document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target) && e.target !== ring) open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { open(false); ring.focus(); } });

  window.ZenframeUsage = {
    update: function (s) { if (s) { snap = s; render(); } },
    tokens: function (u) { if (!u) return; tokens.input += Number(u.input) || 0; tokens.output += Number(u.output) || 0; render(); },
    // A different provider starts a fresh count.
    provider: function (id, label) { if (id !== provider) { provider = id; tokens = { input: 0, output: 0 }; snap = null; } if (!snap && label) provider = id; render(); },
    onRefresh: function (fn) { onOpen = fn; }
  };
  ring.setAttribute('aria-haspopup', 'dialog'); ring.setAttribute('aria-expanded', 'false');
  render();
})();
