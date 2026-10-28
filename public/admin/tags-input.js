// Tag chips input (like WordPress): Enter or comma adds, Backspace removes the last.

import { h } from './common.js';

const MAX_TAGS = 15;

function clean(raw) {
  return String(raw)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[<>"'`,،#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}

export function createTagsInput({ tags = [], suggestions = [], onChange = () => {} } = {}) {
  let list = [];
  const box = h('div', { class: 'tags-box' });
  const input = h('input', { type: 'text', placeholder: 'تگ بنویس و Enter بزن', 'aria-label': 'افزودن برچسب', maxlength: '60' });
  const suggest = h('div', { class: 'suggest' });
  const count = h('p', { class: 'hint' });

  const has = (t) => list.some((x) => x.toLowerCase() === t.toLowerCase());

  function add(raw) {
    for (const part of String(raw).split(/[,،]/)) {
      const t = clean(part);
      if (!t || has(t) || list.length >= MAX_TAGS) continue;
      list.push(t);
    }
    input.value = '';
    draw();
    onChange(list.slice());
  }
  function remove(i) {
    list.splice(i, 1);
    draw();
    onChange(list.slice());
  }

  function draw() {
    box.replaceChildren(
      ...list.map((t, i) =>
        h('span', { class: 'chip' }, t, h('button', { type: 'button', 'aria-label': `حذف ${t}`, title: 'حذف', onclick: () => remove(i) }, '×'))
      ),
      input
    );
    suggest.replaceChildren(
      ...suggestions
        .filter((s) => !has(s))
        .slice(0, 12)
        .map((s) => h('button', { type: 'button', onclick: () => add(s) }, '+ ' + s))
    );
    suggest.classList.toggle('hidden', !suggest.childNodes.length || list.length >= MAX_TAGS);
    count.textContent = `${list.length.toLocaleString('fa-IR')} از ${MAX_TAGS.toLocaleString('fa-IR')} تگ`;
  }

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
      e.preventDefault();
      if (input.value.trim()) add(input.value);
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      remove(list.length - 1);
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) add(input.value);
  });
  box.addEventListener('click', () => input.focus());

  list = [];
  for (const t of tags) {
    const c = clean(t);
    if (c && !has(c) && list.length < MAX_TAGS) list.push(c);
  }
  draw();

  return {
    el: h('div', {}, box, count, suggest),
    getTags: () => list.slice(),
    setSuggestions(s) {
      suggestions = s;
      draw();
    },
  };
}
