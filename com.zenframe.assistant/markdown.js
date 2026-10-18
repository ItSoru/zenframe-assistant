/* Zenframe Markdown renderer, v1.0.6.
   Turns Zeni's replies into formatted text: headings, bold/italic, lists, tables, quotes, inline code
   and code blocks. It builds DOM nodes with textContent only and never uses innerHTML, so nothing in
   a reply can run code or load anything. Links are shown as text with their address on hover; the
   panel never navigates. */
(function () {
  'use strict';

  var FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
  var HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  var RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
  var QUOTE = /^ {0,3}>\s?(.*)$/;
  var ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  var TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function isClosing(line, fence) {
    var s = line.trim();
    return s.length >= fence.length && s.split('').every(function (ch) { return ch === fence.charAt(0); });
  }
  function indentOf(s) { return s.match(/^\s*/)[0].replace(/\t/g, '    ').length; }
  function isTableRow(s) { return s.indexOf('|') >= 0; }
  function startsBlock(lines, i) {
    var s = lines[i];
    return FENCE.test(s) || HEADING.test(s) || RULE.test(s) || QUOTE.test(s) || ITEM.test(s) ||
      (isTableRow(s) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf('-') >= 0);
  }

  /* ---------- Inline: `code`, **bold**, *italic*, ~~strike~~, [links](url) ---------- */
  var INLINE = /`([^`\n]+)`|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__(?!\w)|~~(?=\S)([\s\S]*?\S)~~|\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)|(?:^|(?<=[^\w]))_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)|\[([^\]\n]+)\]\(([^()\s]+)\)/;

  function inline(parent, text) {
    var rest = String(text), m;
    while (rest && (m = INLINE.exec(rest))) {
      if (m.index) parent.appendChild(document.createTextNode(rest.slice(0, m.index)));
      if (m[1] !== undefined) el('code', 'md-code', parent).textContent = m[1];
      else if (m[2] !== undefined || m[3] !== undefined) inline(el('strong', null, parent), m[2] !== undefined ? m[2] : m[3]);
      else if (m[4] !== undefined) inline(el('s', null, parent), m[4]);
      else if (m[5] !== undefined || m[6] !== undefined) inline(el('em', null, parent), m[5] !== undefined ? m[5] : m[6]);
      else { var link = el('span', 'md-link', parent); inline(link, m[7]); link.title = m[8]; }
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) parent.appendChild(document.createTextNode(rest));
  }
  // Several lines of a paragraph or list item, keeping the reply's own line breaks.
  function inlineLines(parent, lines) {
    lines.forEach(function (line, i) { if (i) el('br', null, parent); inline(parent, line.trim()); });
  }

  /* ---------- Tables ---------- */
  function cells(row) {
    var s = row.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(function (c) { return c.trim().replace(/\\\|/g, '|'); });
  }
  function table(parent, lines, i) {
    var head = cells(lines[i]), aligns = cells(lines[i + 1]).map(function (c) {
      var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
      return l && r ? 'center' : r ? 'right' : '';
    });
    var wrap = el('div', 'md-table-wrap', parent), t = el('table', 'md-table', wrap);
    var tr = el('tr', null, el('thead', null, t));
    head.forEach(function (c, k) { var th = el('th', null, tr); if (aligns[k]) th.style.textAlign = aligns[k]; inline(th, c); });
    var body = el('tbody', null, t);
    i += 2;
    while (i < lines.length && lines[i].trim() && isTableRow(lines[i])) {
      var row = cells(lines[i]), r = el('tr', null, body);
      for (var k = 0; k < head.length; k++) { var td = el('td', null, r); if (aligns[k]) td.style.textAlign = aligns[k]; inline(td, row[k] || ''); }
      i++;
    }
    return i;
  }

  /* ---------- Lists (nested by indentation) ---------- */
  function list(parent, lines, i) {
    var first = lines[i].match(ITEM), base = indentOf(first[1]), ordered = /\d/.test(first[2]);
    var node = el(ordered ? 'ol' : 'ul', 'md-list', parent);
    if (ordered && parseInt(first[2], 10) !== 1) node.start = parseInt(first[2], 10);
    while (i < lines.length) {
      var m = lines[i].match(ITEM);
      if (!m || indentOf(m[1]) !== base || /\d/.test(m[2]) !== ordered) break;
      var li = el('li', null, node), text = [m[3]];
      i++;
      while (i < lines.length) {
        var line = lines[i];
        if (!line.trim()) {
          // A blank line ends the item unless the list continues underneath it.
          var next = i + 1 < lines.length ? lines[i + 1] : '';
          var nm = next.match(ITEM);
          if (nm && indentOf(nm[1]) >= base) { i++; continue; }
          break;
        }
        var sub = line.match(ITEM);
        if (sub && indentOf(sub[1]) > base) { flushItem(li, text); text = []; i = list(li, lines, i); continue; }
        if (sub || indentOf(line) <= base && startsBlock(lines, i)) break;
        if (indentOf(line) <= base && !text.length) break;
        text.push(line); i++;
      }
      flushItem(li, text);
    }
    return i;
  }
  function flushItem(li, text) {
    if (!text.length) return;
    var task = /^\[([ xX])\]\s+/.exec(text[0]);
    if (task) { el('span', 'md-check' + (task[1] === ' ' ? '' : ' done'), li).textContent = task[1] === ' ' ? '☐ ' : '☑ '; text[0] = text[0].slice(task[0].length); }
    var span = el('span', null, li);
    inlineLines(span, text);
  }

  /* ---------- Blocks ---------- */
  function blocks(parent, lines, options) {
    var i = 0, m;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }
      if ((m = line.match(FENCE))) {
        var fence = m[1], code = [];
        i++;
        while (i < lines.length && !isClosing(lines[i], fence)) { code.push(lines[i]); i++; }
        i++; // closing fence (or end of a reply that is still streaming)
        if (options.code) options.code(parent, code.join('\n'), m[2]);
        else el('pre', null, parent).textContent = code.join('\n');
        continue;
      }
      if ((m = line.match(HEADING))) { inline(el('h' + Math.min(6, m[1].length + 2), 'md-h md-h' + m[1].length, parent), m[2]); i++; continue; }
      if (RULE.test(line)) { el('hr', 'md-rule', parent); i++; continue; }
      if (isTableRow(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf('-') >= 0) { i = table(parent, lines, i); continue; }
      if (QUOTE.test(line)) {
        var quoted = [];
        while (i < lines.length && (m = lines[i].match(QUOTE))) { quoted.push(m[1]); i++; }
        blocks(el('blockquote', 'md-quote', parent), quoted, options);
        continue;
      }
      if (ITEM.test(line)) { i = list(parent, lines, i); continue; }
      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) { para.push(lines[i]); i++; }
      inlineLines(el('p', 'md-p', parent), para);
    }
  }

  // options.code(parent, code, language): draws a code block (the panel adds its buttons there).
  function render(target, text, options) {
    target.textContent = '';
    target.classList.add('md');
    blocks(target, String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n'), options || {});
  }

  window.ZenframeMarkdown = { render: render };
})();
