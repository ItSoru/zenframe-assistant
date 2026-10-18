/* Zenframe effort slider, v1.0.7.
   A popover above the message box: level name, model picker, and a slider whose thumb follows the
   pointer continuously and springs onto the nearest stop on release. The top stop glows purple
   with twinkling sparkles.

   window.ZenframeEffort({ pill, pop, state, onChange, onModel, openSettings }) -> { open, close, refresh }
     state() -> { levels: [{ key, label }], value: key|null, defaultIndex, model, models: [id], current }
*/
(function () {
  'use strict';

  var SVG = 'http://www.w3.org/2000/svg';
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function icon(paths, cls) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', cls || 'ef-icon');
    paths.forEach(function (d) {
      var p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d); s.appendChild(p);
    });
    return s;
  }
  var BOLT = ['M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z'];
  var CHEVRON = ['M6 9l6 6 6-6'];

  window.ZenframeEffort = function (opts) {
    var pill = opts.pill, pop = opts.pop;
    var levels = [], value = null, defaultIndex = 1, models = [], current = '';
    var pos = 0, stops = [], radius = 0, dragging = false, moved = false, frame = 0, warnTimer = 0, shadeTimer = 0;
    var lastIndex = -1, isOpen = false;

    /* ---------- Build ---------- */
    pop.textContent = '';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Effort');
    var head = el('div', 'ef-head');
    var titles = el('div', 'ef-titles');
    var title = el('div', 'ef-title');
    var sub = el('button', 'ef-sub'); sub.type = 'button';
    var subText = el('span', 'ef-sub-text');
    var chev = el('span', 'ef-chev', '›');
    sub.appendChild(subText); sub.appendChild(chev);
    titles.appendChild(title); titles.appendChild(sub);
    head.appendChild(titles);

    var track = el('div', 'ef-track');
    track.setAttribute('role', 'slider'); track.tabIndex = 0;
    track.setAttribute('aria-label', 'Effort');
    var ultra = el('div', 'ef-ultra');
    var shimmer = el('div', 'ef-shimmer');
    var sparkles = el('div', 'ef-sparkles');
    for (var s = 0; s < 26; s++) {
      var dot = el('i');
      var size = (Math.random() * 1.6 + 1).toFixed(2);
      dot.style.left = (Math.random() * 96 + 2).toFixed(1) + '%';
      dot.style.top = (Math.random() * 70 + 15).toFixed(1) + '%';
      dot.style.width = dot.style.height = size + 'px';
      dot.style.animationDelay = (-Math.random() * 3).toFixed(2) + 's, ' + (-Math.random() * 6).toFixed(2) + 's';
      dot.style.animationDuration = (1.4 + Math.random() * 1.8).toFixed(2) + 's, ' + (5 + Math.random() * 4).toFixed(2) + 's';
      sparkles.appendChild(dot);
    }
    var shade = el('div', 'ef-shade');
    ultra.appendChild(shimmer); ultra.appendChild(sparkles); ultra.appendChild(shade);
    var fill = el('div', 'ef-fill');
    var dots = el('div', 'ef-dots');
    var thumb = el('div', 'ef-thumb');
    var knob = el('div', 'ef-knob');
    thumb.appendChild(knob);
    // Purple layer sits on top of the black fill and only covers the filled part of the bar.
    track.appendChild(fill); track.appendChild(ultra); track.appendChild(dots); track.appendChild(thumb);

    var list = el('div', 'ef-models'); list.hidden = true;
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Model');

    pop.appendChild(head); pop.appendChild(track); pop.appendChild(list);

    /* ---------- Geometry ---------- */
    function measure() {
      var w = track.clientWidth, h = track.clientHeight;
      radius = Math.max(14, h * 0.62);
      stops = levels.map(function (_, i) { return radius + i * (w - 2 * radius) / Math.max(1, levels.length - 1); });
      dots.textContent = '';
      stops.forEach(function (x) { var d = el('span'); d.style.left = x + 'px'; dots.appendChild(d); });
      knob.style.width = knob.style.height = (radius * 2) + 'px';
      ultra.style.setProperty('--ef-track-w', w + 'px');
    }
    function nearest(x) {
      var best = 0;
      for (var i = 1; i < stops.length; i++) if (Math.abs(stops[i] - x) < Math.abs(stops[best] - x)) best = i;
      return best;
    }
    function indexOfValue() {
      if (value === null) return defaultIndex;
      for (var i = 0; i < levels.length; i++) if (levels[i].key === value) return i;
      return defaultIndex;
    }

    /* ---------- Render ---------- */
    function render() {
      frame = 0;
      thumb.style.transform = 'translateX(' + (pos - radius) + 'px)';
      fill.style.width = Math.max(0, pos) + 'px';
      ultra.style.width = Math.max(0, pos + radius) + 'px';
      var n = stops.length, top = n > 1 ? (pos - stops[n - 2]) / (stops[n - 1] - stops[n - 2]) : 0;
      var glow = Math.max(0, Math.min(1, top));
      ultra.style.opacity = String(glow * glow);
      pop.classList.toggle('ef-is-top', glow > 0.55);
      var i = dragging ? nearest(pos) : indexOfValue();
      if (i !== lastIndex || dragging) setTitle(i);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }
    function setTitle(i) {
      var text = value === null && !dragging && i === defaultIndex ? 'Default' : levels[i] ? levels[i].label : '';
      if (title.textContent !== text) {
        title.textContent = text;
        if (!reduceQuery.matches) { title.classList.remove('ef-pop-in'); void title.offsetWidth; title.classList.add('ef-pop-in'); }
      }
      lastIndex = i;
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(levels.length - 1));
      track.setAttribute('aria-valuenow', String(i));
      track.setAttribute('aria-valuetext', text);
    }
    function showSubtitle(warn) {
      clearTimeout(warnTimer);
      sub.classList.toggle('ef-warn', !!warn);
      subText.textContent = warn || opts.state().model;
      chev.hidden = !!warn;
      if (warn) warnTimer = setTimeout(function () { showSubtitle(''); }, 2200);
    }

    /* ---------- Moving the thumb ---------- */
    function snapTo(i, animate) {
      track.classList.toggle('ef-snap', !!animate && !reduceQuery.matches);
      pos = stops[i];
      schedule();
      if (animate) setTimeout(function () { track.classList.remove('ef-snap'); }, 460);
    }
    function commit(i, animate) {
      var key = levels[i] ? levels[i].key : null;
      var wasTop = value === (levels[levels.length - 1] || {}).key;
      value = key;
      snapTo(i, animate);
      setTitle(i);
      if (i === levels.length - 1 && !wasTop && levels.length > 1) enterTop();
      opts.onChange(key);
      updatePill();
    }
    function enterTop() {
      clearTimeout(shadeTimer);
      ultra.classList.remove('ef-swept'); void ultra.offsetWidth; ultra.classList.add('ef-swept');
      showSubtitle(opts.state().topWarning || 'Slower, and uses noticeably more tokens');
    }
    function pointerX(e) { return e.clientX - track.getBoundingClientRect().left; }
    function clamp(x) { return Math.max(stops[0], Math.min(stops[stops.length - 1], x)); }

    track.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      track.focus();
      dragging = true; moved = false;
      track.classList.add('ef-dragging');
      track.classList.remove('ef-snap');
      track.setPointerCapture(e.pointerId);
      var x = clamp(pointerX(e));
      // A tap jumps smoothly; a press on the thumb starts dragging from where it is.
      if (Math.abs(x - pos) > radius) { track.classList.add('ef-snap'); pos = x; schedule(); setTimeout(function () { if (dragging) track.classList.remove('ef-snap'); }, 180); }
    });
    track.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moved = true;
      pos = clamp(pointerX(e));
      schedule();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('ef-dragging');
      try { track.releasePointerCapture(e.pointerId); } catch (err) {}
      commit(nearest(pos), true);
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('keydown', function (e) {
      var i = indexOfValue(), n = levels.length - 1, next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(n, i + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, i - 1);
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = n;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); resetToDefault(); return; }
      if (next !== null) { e.preventDefault(); commit(next, true); }
    });
    // Back to the model's own default (no effort setting sent). Keyboard: Delete or Backspace.
    function resetToDefault() {
      value = null;
      ultra.classList.remove('ef-swept');
      snapTo(defaultIndex, true);
      lastIndex = -1; setTitle(defaultIndex);
      showSubtitle('');
      opts.onChange(null);
      updatePill();
    }

    /* ---------- Model list ---------- */
    function renderModels() {
      var st = opts.state();
      list.textContent = '';
      if (!st.models.length) {
        list.appendChild(el('p', 'ef-empty', 'No models loaded yet.'));
        var go = el('button', 'ef-settings', 'Open Settings to load models'); go.type = 'button';
        go.onclick = function () { close(); opts.openSettings(); };
        list.appendChild(go);
        return;
      }
      st.models.forEach(function (id) {
        var item = el('button', 'ef-model' + (id === st.current ? ' ef-current' : ''), opts.label ? opts.label(id) : id);
        item.title = id;
        item.type = 'button'; item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(id === st.current));
        item.onclick = function () { opts.onModel(id); list.hidden = true; pop.classList.remove('ef-list-open'); showSubtitle(''); pill.focus(); close(); };
        list.appendChild(item);
      });
      var chosen = list.querySelector('.ef-current');
      if (chosen) setTimeout(function () { chosen.scrollIntoView({ block: 'nearest' }); }, 0);
    }
    sub.addEventListener('click', function () {
      if (sub.classList.contains('ef-warn')) { showSubtitle(''); }
      list.hidden = !list.hidden;
      pop.classList.toggle('ef-list-open', !list.hidden);
      if (!list.hidden) renderModels();
    });

    /* ---------- Open / close ---------- */
    function refresh() {
      var st = opts.state();
      levels = st.levels; value = st.value; defaultIndex = Math.min(st.defaultIndex, levels.length - 1);
      models = st.models; current = st.current;
      measure();
      pos = stops[indexOfValue()];
      ultra.classList.toggle('ef-swept', value !== null && indexOfValue() === levels.length - 1);
      lastIndex = -1;
      render();
      showSubtitle('');
      updatePill();
    }
    function updatePill() {
      var st = opts.state(), i = -1;
      for (var k = 0; k < st.levels.length; k++) if (st.levels[k].key === st.value) i = k;
      var label = pill.querySelector('.ef-pill-label');
      label.textContent = i >= 0 ? st.levels[i].label : 'Select effort';
      pill.classList.toggle('ef-pill-top', i >= 0 && i === st.levels.length - 1 && st.levels.length > 1);
      pill.title = 'Effort and model · ' + st.model;
    }
    function open() {
      if (isOpen) return;
      isOpen = true;
      pop.hidden = false;
      list.hidden = true; pop.classList.remove('ef-list-open');
      pill.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(function () { refresh(); pop.classList.add('ef-open'); track.focus(); });
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      pop.classList.remove('ef-open');
      pill.setAttribute('aria-expanded', 'false');
      setTimeout(function () { if (!isOpen) pop.hidden = true; }, reduceQuery.matches ? 0 : 200);
    }

    pill.setAttribute('aria-haspopup', 'dialog');
    pill.setAttribute('aria-expanded', 'false');
    if (!pill.querySelector('.ef-pill-label')) {
      pill.textContent = '';
      pill.appendChild(icon(BOLT, 'ef-pill-icon'));
      pill.appendChild(el('span', 'ef-pill-label', 'Select effort'));
      pill.appendChild(icon(CHEVRON, 'ef-pill-chev'));
    }
    pill.addEventListener('click', function () { if (isOpen) close(); else open(); });
    document.addEventListener('pointerdown', function (e) {
      if (isOpen && !pop.contains(e.target) && !pill.contains(e.target)) close();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { e.stopPropagation(); close(); pill.focus(); }
    }, true);
    if (window.ResizeObserver) new ResizeObserver(function () { if (isOpen && !dragging) { measure(); pos = stops[indexOfValue()]; render(); } }).observe(track);

    updatePill();
    return { open: open, close: close, refresh: function () { if (isOpen) refresh(); else updatePill(); }, isOpen: function () { return isOpen; } };
  };
}());
