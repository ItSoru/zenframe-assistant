/* Zenframe motion controller, v1.0.7. Written from scratch for this release.
   Public API (used by app.js): window.ZenframeMotion.view(name), .settings(open). */
(function () {
  'use strict';

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var track = document.querySelector('.tab-track');
  var sheet = document.getElementById('settingsView');
  var workspace = document.querySelector('.workspace');
  var pill = document.createElement('span');
  var state = { current: 'chat', pulse: 0, exit: 0, close: 0 };
  var savedTabIndex = new WeakMap();

  function reduced() { return reduceQuery.matches; }

  pill.className = 'tab-indicator';
  pill.setAttribute('aria-hidden', 'true');
  track.insertBefore(pill, track.firstChild);

  function placePill(pulse) {
    var tab = track.querySelector('.tab.active');
    if (!tab) return;
    pill.style.left = tab.offsetLeft + 'px';
    pill.style.width = tab.offsetWidth + 'px';
    clearTimeout(state.pulse);
    track.classList.remove('is-animating');
    if (pulse && !reduced()) {
      void pill.offsetWidth; // restart the CSS animation
      track.classList.add('is-animating');
      state.pulse = setTimeout(function () { track.classList.remove('is-animating'); }, 460);
    }
  }

  // Remove hidden panes from keyboard focus, and restore it when they come back.
  function setFocusable(container, focusable) {
    container.setAttribute('aria-hidden', focusable ? 'false' : 'true');
    container.inert = !focusable;
    var nodes = container.querySelectorAll('button, input, textarea, select, a[href], summary, [tabindex]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!focusable) {
        if (!savedTabIndex.has(el)) savedTabIndex.set(el, el.getAttribute('tabindex'));
        el.setAttribute('tabindex', '-1');
      } else if (savedTabIndex.has(el)) {
        var previous = savedTabIndex.get(el);
        if (previous === null) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', previous);
        savedTabIndex.delete(el);
      }
    }
  }

  function view(name) {
    var from = document.getElementById(state.current + 'View');
    var to = document.getElementById(name + 'View');
    var changed = name !== state.current;
    var panes = document.querySelectorAll('.view');
    clearTimeout(state.exit);
    for (var i = 0; i < panes.length; i++) {
      panes[i].classList.remove('is-exiting');
      setFocusable(panes[i], panes[i] === to);
    }
    if (changed) {
      var forward = name === 'scripts';
      from.style.setProperty('--pane-out', forward ? '-16px' : '16px');
      to.style.setProperty('--pane-in', forward ? '16px' : '-16px');
      if (!reduced()) {
        from.classList.add('is-exiting');
        state.exit = setTimeout(function () { from.classList.remove('is-exiting'); }, 460);
      }
      if (from.contains(document.activeElement)) {
        document.getElementById(forward ? 'scriptCode' : 'prompt').focus();
      }
    }
    state.current = name;
    placePill(changed);
  }

  function settings(open) {
    clearTimeout(state.close);
    if (open) {
      sheet.hidden = false;
      sheet.inert = false;
      sheet.setAttribute('aria-hidden', 'false');
      setFocusable(workspace, false);
      requestAnimationFrame(function () {
        sheet.classList.add('is-open');
        var first = document.getElementById('provider');
        if (first) first.focus();
      });
      return;
    }
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    document.getElementById('settingsButton').focus();
    state.close = setTimeout(function () {
      sheet.hidden = true;
      sheet.inert = false;
      setFocusable(workspace, true);
      view(state.current);
    }, reduced() ? 0 : 280);
  }

  // Keep the pill aligned when the scripts badge appears or the panel resizes.
  new MutationObserver(function () { placePill(false); })
    .observe(track, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  if (window.ResizeObserver) new ResizeObserver(function () { placePill(false); }).observe(track);
  else window.addEventListener('resize', function () { placePill(false); });

  // Focus rings only for keyboard users.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') document.documentElement.classList.add('keyboard-navigation');
  });
  document.addEventListener('pointerdown', function () {
    document.documentElement.classList.remove('keyboard-navigation');
  });

  // Staggered entrance for the welcome suggestions.
  var welcome = document.getElementById('welcome');
  function introduceSuggestions() {
    if (reduced()) return;
    var buttons = document.querySelectorAll('.suggestions button');
    for (var i = 0; i < buttons.length; i++) {
      if (!buttons[i].animate) continue;
      buttons[i].animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 80 + i * 70, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' }
      );
    }
  }
  new MutationObserver(function () { if (!welcome.hidden) introduceSuggestions(); })
    .observe(welcome, { attributes: true, attributeFilter: ['hidden'] });

  window.ZenframeMotion = { view: view, settings: settings };
  introduceSuggestions();
  view(state.current);
  requestAnimationFrame(function () { placePill(false); });
}());
