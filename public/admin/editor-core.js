// Rich paragraph field: bold, italic, link and free-form highlight in four colours.
// Highlights are shown as inline background colours while editing (browsers split those
// correctly and keep Ctrl+Z working) and converted to <mark class="hl-*"> when saving.

import { sanitizeInline, escapeHtml, safeUrl, HL_CLASSES } from '/assets/blocks.js';
import { h, toast } from './common.js';

const RGB = {
  'hl-yellow': [249, 228, 138],
  'hl-pink': [246, 201, 216],
  'hl-green': [201, 232, 201],
  'hl-blue': [199, 218, 245],
};
const HEX = { 'hl-yellow': '#f9e48a', 'hl-pink': '#f6c9d8', 'hl-green': '#c9e8c9', 'hl-blue': '#c7daf5' };
const LABEL = { 'hl-yellow': 'زرد', 'hl-pink': 'صورتی', 'hl-green': 'سبز', 'hl-blue': 'آبی' };
const BLOCK = new Set(['div', 'p', 'li', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function parseColor(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'initial' || v === 'inherit' || v === 'none') return null;
  let m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return a === 0 ? null : [+m[1], +m[2], +m[3]];
  }
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return undefined; // unknown colour string
}

function colorToClass(value) {
  const rgb = parseColor(value);
  if (rgb === null) return null; // no highlight
  if (rgb === undefined) return 'hl-yellow';
  let best = 'hl-yellow';
  let bestDist = Infinity;
  for (const [cls, c] of Object.entries(RGB)) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bestDist) [best, bestDist] = [cls, d];
  }
  return best;
}

// stored html -> html for the editable field
export function toEditorHtml(html) {
  const box = document.createElement('div');
  box.innerHTML = sanitizeInline(html);
  for (const mark of [...box.querySelectorAll('mark')]) {
    const cls = HL_CLASSES.find((c) => mark.classList.contains(c)) || 'hl-yellow';
    const span = document.createElement('span');
    span.style.backgroundColor = HEX[cls];
    span.append(...mark.childNodes);
    mark.replaceWith(span);
  }
  return box.innerHTML;
}

// editable field -> clean stored html
export function serialize(root) {
  const parts = [];
  const walk = (node, hl) => {
    if (node.nodeType === 3) {
      const text = escapeHtml(node.nodeValue).replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      if (text) parts.push(hl ? `<mark class="${hl}">${text}</mark>` : text);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return void parts.push('<br>');
    if (['script', 'style', 'template'].includes(tag)) return;

    let next = hl;
    if (tag === 'mark') next = HL_CLASSES.find((c) => node.classList.contains(c)) || next || 'hl-yellow';
    const bg = node.style && node.style.backgroundColor;
    if (bg) next = colorToClass(bg);

    const weight = node.style ? node.style.fontWeight : '';
    const bold = tag === 'b' || tag === 'strong' || weight === 'bold' || /^[6-9]00$/.test(weight);
    const ital = tag === 'i' || tag === 'em' || (node.style && node.style.fontStyle === 'italic');
    const href = tag === 'a' ? safeUrl(node.getAttribute('href')) : '';
    const block = BLOCK.has(tag);

    if (block) parts.push('<div>');
    if (href) parts.push(`<a href="${escapeHtml(href)}">`);
    if (bold) parts.push('<strong>');
    if (ital) parts.push('<em>');
    for (const child of node.childNodes) walk(child, next);
    if (ital) parts.push('</em>');
    if (bold) parts.push('</strong>');
    if (href) parts.push('</a>');
    if (block) parts.push('</div>');
  };
  for (const child of root.childNodes) walk(child, null);

  let html = parts.join('');
  let prev;
  do {
    prev = html;
    html = html.replace(/(<mark class="(hl-\w+)">(?:(?!<\/?mark)[^])*)<\/mark><mark class="\2">/g, '$1');
  } while (html !== prev);
  return sanitizeInline(html);
}

export function createRich({ html = '', placeholder = '', onInput = () => {} } = {}) {
  const field = h('div', {
    class: 'rich',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    dir: 'auto',
    'data-placeholder': placeholder,
  });
  field.innerHTML = toEditorHtml(html);

  const selectionInField = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    return field.contains(sel.anchorNode) && field.contains(sel.focusNode) ? sel : null;
  };
  const changed = () => {
    if (!field.textContent && !field.querySelector('img')) field.innerHTML = '';
    onInput();
  };
  const needSelection = () => {
    const sel = selectionInField();
    if (!sel || sel.isCollapsed) {
      toast('اول یه تکه از متن رو انتخاب کن');
      return false;
    }
    return true;
  };

  function highlight(cls) {
    if (!needSelection()) return;
    field.focus();
    let current = null;
    try {
      current = colorToClass(document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor'));
    } catch {
      /* ignore */
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, cls && cls !== current ? HEX[cls] : 'transparent');
    document.execCommand('styleWithCSS', false, false);
    changed();
  }

  function btn(label, title, action, extra = {}) {
    const b = h('button', { type: 'button', class: 'tbtn', title, 'aria-label': title, ...extra }, label);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the text selection
    b.addEventListener('click', action);
    return b;
  }

  const toolbar = h(
    'div',
    { class: 'toolbar', role: 'toolbar', 'aria-label': 'قالب‌بندی متن' },
    btn(h('b', {}, 'B'), 'پررنگ', () => { field.focus(); document.execCommand('bold'); changed(); }),
    btn(h('i', {}, 'I'), 'کج', () => { field.focus(); document.execCommand('italic'); changed(); }),
    btn('🔗', 'لینک', () => {
      if (!needSelection()) return;
      const saved = window.getSelection().getRangeAt(0).cloneRange();
      const url = prompt('آدرس لینک (با https:// شروع بشه):');
      if (!url) return;
      if (!safeUrl(url)) return toast('این آدرس معتبر نیست');
      field.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(saved);
      document.execCommand('createLink', false, safeUrl(url));
      changed();
    }),
    h('span', { class: 'sep' }),
    h('span', { class: 'hint', style: 'margin:0 4px' }, 'هایلایت:'),
    ...HL_CLASSES.map((cls) => {
      const b = h('button', { type: 'button', class: `swatch ${cls}`, title: `هایلایت ${LABEL[cls]} (دوباره بزنی برمی‌داره)`, 'aria-label': `هایلایت ${LABEL[cls]}` });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => highlight(cls));
      return b;
    }),
    btn('بدون هایلایت', 'برداشتن هایلایت از متن انتخاب‌شده', () => highlight(null), { style: 'font-size:.8rem' })
  );

  field.addEventListener('input', changed);
  field.addEventListener('paste', (e) => {
    e.preventDefault(); // paste as plain text so nothing odd sneaks in
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  field.addEventListener('drop', (e) => e.preventDefault());

  return {
    el: h('div', { class: 'rich-wrap' }, toolbar, field),
    field,
    getHtml: () => serialize(field),
    focus: () => field.focus(),
  };
}
