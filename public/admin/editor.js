import { api, h, mountTopbar, toast, guardUnsaved, faNumber } from './common.js';
import { createRich } from './editor-core.js';
import { createTagsInput } from './tags-input.js';
import { plainTextOfBlocks, safeUrl } from '/assets/blocks.js';

mountTopbar('pages');

const $ = (id) => document.getElementById(id);
const id = Number(new URLSearchParams(location.search).get('id'));
const KINDS = {
  heading: { label: 'تیتر', make: () => ({ text: '', level: 2 }) },
  paragraph: { label: 'متن', make: () => ({ html: '' }) },
  quote: { label: 'نقل‌قول از کتاب', make: () => ({ text: '', source: '' }) },
  image: { label: 'عکس', make: () => ({ url: '', caption: '' }) },
  divider: { label: 'خط جداکننده', make: () => ({}) },
};

let page = null;
let blocks = []; // { id, type, content, getHtml? }
let dirty = false;
let siteName = 'konj.101';
let tagsInput;
let autoSlug = false; // keep the address in step with the title until the user edits it by hand
const blocksBox = $('blocks');

// same rules as the server (src/lib/validate.js)
const slugify = (input) =>
  String(input ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .toLowerCase()
    .replace(/[\s_\u200c]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');

const uid = () => Math.random().toString(36).slice(2, 10);
const showMessage = (text, kind = 'error') => {
  $('msg').textContent = text;
  $('msg').className = text ? `msg ${kind}` : 'msg hidden';
};

function setDirty(v) {
  dirty = v;
  $('dirty').textContent = v ? 'تغییرات ذخیره نشده' : page ? 'ذخیره شده ✓' : '';
  $('dirty').classList.toggle('on', v);
}
const touch = () => {
  setDirty(true);
  updateSeo();
};

/* ---------- blocks ---------- */

function field(label, control) {
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

function renderBody(block) {
  const c = block.content;
  switch (block.type) {
    case 'heading': {
      const text = h('input', { type: 'text', value: c.text, dir: 'auto', placeholder: 'متن تیتر', maxlength: '200', 'aria-label': 'متن تیتر' });
      text.addEventListener('input', () => { c.text = text.value; touch(); });
      const level = h('select', { 'aria-label': 'اندازه تیتر' }, h('option', { value: '2' }, 'تیتر بزرگ'), h('option', { value: '3' }, 'تیتر کوچک'));
      level.value = String(c.level === 3 ? 3 : 2);
      level.addEventListener('change', () => { c.level = Number(level.value); touch(); });
      return h('div', { style: 'display:grid;grid-template-columns:1fr 140px;gap:10px' }, text, level);
    }
    case 'paragraph': {
      const rich = createRich({ html: c.html ?? '', placeholder: 'اینجا بنویس… یه تکه از متن رو انتخاب کن تا هایلایتش کنی', onInput: touch });
      block.getHtml = rich.getHtml;
      block.focus = rich.focus;
      return rich.el;
    }
    case 'quote': {
      const text = h('textarea', { rows: '3', dir: 'auto', placeholder: 'متن نقل‌قول', maxlength: '2000', 'aria-label': 'متن نقل‌قول' });
      text.value = c.text;
      text.addEventListener('input', () => { c.text = text.value; touch(); });
      const src = h('input', { type: 'text', value: c.source, dir: 'auto', placeholder: 'منبع (مثلاً نام کتاب و نویسنده)', maxlength: '200', 'aria-label': 'منبع' });
      src.addEventListener('input', () => { c.source = src.value; touch(); });
      return h('div', {}, text, h('div', { style: 'height:8px' }), src);
    }
    case 'image': {
      const preview = h('img', { alt: '', style: 'max-width:100%;max-height:220px;border-radius:8px;margin-top:8px' });
      const syncPreview = () => {
        const ok = safeUrl(c.url);
        preview.classList.toggle('hidden', !ok);
        if (ok) preview.src = ok;
      };
      const url = h('input', { type: 'url', value: c.url, class: 'ltr', placeholder: 'https://… آدرس عکس', 'aria-label': 'آدرس عکس' });
      url.addEventListener('input', () => { c.url = url.value; syncPreview(); touch(); });
      const cap = h('input', { type: 'text', value: c.caption, dir: 'auto', placeholder: 'توضیح زیر عکس (اختیاری)', maxlength: '300', 'aria-label': 'توضیح عکس' });
      cap.addEventListener('input', () => { c.caption = cap.value; touch(); });
      syncPreview();
      return h('div', {}, url, h('div', { style: 'height:8px' }), cap, preview);
    }
    default:
      return h('hr', { style: 'border:0;border-top:2px dashed var(--line);margin:6px 0' });
  }
}

function move(from, to) {
  if (to < 0 || to >= blocks.length || from === to) return;
  syncRich();
  const [b] = blocks.splice(from, 1);
  blocks.splice(to, 0, b);
  renderBlocks();
  touch();
}

function renderBlocks(focusId) {
  const cards = blocks.map((block, i) => {
    const card = h('div', { class: 'block-card', 'data-id': block.id });
    const grip = h('span', { class: 'grip', title: 'بکش تا جابه‌جا بشه', role: 'img', 'aria-label': 'دستگیره جابه‌جایی' }, '⠿');
    grip.addEventListener('pointerdown', (e) => startDrag(e, i, card));
    card.append(
      h(
        'div',
        { class: 'block-head' },
        grip,
        h('span', { class: 'kind' }, KINDS[block.type].label),
        h('button', { class: 'icon-btn', type: 'button', title: 'بالا', 'aria-label': 'ببر بالا', disabled: i === 0, onclick: () => move(i, i - 1) }, '▲'),
        h('button', { class: 'icon-btn', type: 'button', title: 'پایین', 'aria-label': 'ببر پایین', disabled: i === blocks.length - 1, onclick: () => move(i, i + 1) }, '▼'),
        h('button', {
          class: 'icon-btn', type: 'button', title: 'حذف', 'aria-label': 'حذف بخش',
          onclick: () => {
            syncRich();
            blocks.splice(i, 1);
            renderBlocks();
            touch();
          },
        }, '✕')
      ),
      h('div', { class: 'block-body' }, renderBody(block))
    );
    return card;
  });
  blocksBox.replaceChildren(...(cards.length ? cards : [h('p', { class: 'hint' }, 'هنوز چیزی ننوشتی. از دکمه‌های «افزودن» پایین شروع کن.')]));
  if (focusId) {
    const b = blocks.find((x) => x.id === focusId);
    const first = blocksBox.querySelector(`[data-id="${focusId}"] input, [data-id="${focusId}"] textarea, [data-id="${focusId}"] [contenteditable]`);
    if (b && first) first.focus();
  }
}

// Rich blocks keep their text in the DOM; copy it into the data before a re-render / save.
function syncRich() {
  for (const b of blocks) if (b.type === 'paragraph' && b.getHtml) b.content.html = b.getHtml();
}

function addBlock(type) {
  syncRich();
  const block = { id: uid(), type, content: KINDS[type].make() };
  blocks.push(block);
  renderBlocks(block.id);
  touch();
  block.focus?.();
  blocksBox.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

for (const [type, k] of Object.entries(KINDS)) {
  $('add-bar').append(h('button', { class: 'btn', type: 'button', onclick: () => addBlock(type) }, '+ ' + k.label));
}

/* ---------- drag and drop (pointer events: mouse, touch and pen) ---------- */

function startDrag(e, from, card) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const grip = e.currentTarget;
  grip.setPointerCapture(e.pointerId);
  card.classList.add('dragging');
  let target = from; // index where the block will land (in the list without the dragged one)
  let raf = 0;
  let lastY = e.clientY;

  const others = () => [...blocksBox.querySelectorAll('.block-card')].filter((c) => c !== card);
  const clearMarks = () => blocksBox.querySelectorAll('.drop-before,.drop-after').forEach((c) => c.classList.remove('drop-before', 'drop-after'));

  function update() {
    const list = others();
    let idx = list.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return lastY < r.top + r.height / 2;
    });
    if (idx === -1) idx = list.length;
    target = idx;
    clearMarks();
    if (list.length) {
      if (idx < list.length) list[idx].classList.add('drop-before');
      else list[list.length - 1].classList.add('drop-after');
    }
  }
  function autoscroll() {
    const margin = 70;
    if (lastY < margin) window.scrollBy(0, -14);
    else if (lastY > window.innerHeight - margin) window.scrollBy(0, 14);
    update();
    raf = requestAnimationFrame(autoscroll);
  }
  const onMove = (ev) => { lastY = ev.clientY; update(); };
  function finish(commit) {
    cancelAnimationFrame(raf);
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', onUp);
    grip.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);
    clearMarks();
    card.classList.remove('dragging');
    if (commit && target !== from) {
      syncRich();
      const [b] = blocks.splice(from, 1);
      blocks.splice(target, 0, b);
      renderBlocks();
      touch();
    }
  }
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKey = (ev) => { if (ev.key === 'Escape') finish(false); };
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onUp);
  grip.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey);
  update();
  raf = requestAnimationFrame(autoscroll);
}

/* ---------- SEO side panel ---------- */

function excerpt() {
  syncRich();
  return plainTextOfBlocks(blocks, 160);
}

function updateSeo() {
  const title = $('title').value.trim() || 'عنوان نوشته';
  const metaText = $('meta').value.trim();
  const slug = $('slug').value.trim() || page?.slug || '';
  const desc = metaText || excerpt();
  $('serp-url').textContent = `${location.host} › p › ${slug}`;
  $('serp-title').textContent = `${title} | ${siteName}`.slice(0, 70);
  $('serp-desc').textContent = desc.length > 160 ? desc.slice(0, 157) + '…' : desc || 'هنوز توضیحی نداری.';
  const c = $('c_meta');
  c.textContent = `${faNumber(metaText.length)} / ${faNumber(160)}`;
  c.classList.toggle('warn', metaText.length > 160);
  $('slug-hint').textContent = slug ? `${location.origin}/p/${slug}` : '';

  const tags = tagsInput ? tagsInput.getTags().length : 0;
  const tips = [
    [title.length >= 15 && title.length <= 60, `عنوان ۱۵ تا ۶۰ حرف باشه (الان ${faNumber(title.length)})`],
    [metaText.length >= 70 && metaText.length <= 160, `توضیح کوتاه ۷۰ تا ۱۶۰ حرف باشه (الان ${faNumber(metaText.length)})`],
    [tags >= 2, 'حداقل ۲ تا تگ بذار'],
    [!!safeUrl($('cover').value), 'یه عکس شاخص اضافه کن'],
  ];
  $('seo-tips').replaceChildren(...tips.map(([ok, text]) => h('li', { style: ok ? 'color:var(--ok)' : '' }, (ok ? '✓ ' : '• ') + text)));
}

/* ---------- load / save ---------- */

function applyLinks() {
  const published = $('status').value === 'published' && page.status === 'published';
  $('view').href = published ? `/p/${encodeURIComponent(page.slug)}` : `/preview/${page.id}`;
  $('view').textContent = published ? 'مشاهده در سایت ↗' : 'پیش‌نمایش ↗';
}

async function save() {
  const btn = $('save');
  btn.disabled = true;
  showMessage('');
  try {
    syncRich();
    const res = await api(`/api/pages/${id}`, {
      method: 'PUT',
      body: {
        title: $('title').value,
        slug: $('slug').value,
        status: $('status').value,
        content: blocks.map(({ id: bid, type, content }) => ({ id: bid, type, content })),
        tags: tagsInput.getTags(),
        meta_description: $('meta').value,
        cover_url: $('cover').value,
      },
    });
    page.slug = res.slug;
    page.status = res.status;
    $('slug').value = res.slug;
    setDirty(false);
    updateSeo();
    applyLinks();
    toast('ذخیره شد ✓');
  } catch (err) {
    showMessage(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  if (!id) return void (location.href = '/admin/dashboard.html');
  const [p, tagData, settings] = await Promise.all([
    api(`/api/pages/${id}`),
    api('/api/tags').catch(() => ({ tags: [] })),
    api('/api/settings').catch(() => ({})),
  ]);
  page = p;
  siteName = settings.site_name || siteName;
  document.title = `${p.title} — ویرایش`;
  $('title').value = p.title;
  $('slug').value = p.slug;
  $('status').value = p.status;
  $('meta').value = p.meta_description;
  $('cover').value = p.cover_url;
  blocks = p.content.map((b) => ({ id: b.id || uid(), type: b.type, content: { ...KINDS[b.type]?.make(), ...b.content } })).filter((b) => KINDS[b.type]);
  tagsInput = createTagsInput({
    tags: p.tags,
    suggestions: tagData.tags.map((t) => t.tag),
    onChange: touch,
  });
  $('tags-mount').append(tagsInput.el);
  renderBlocks();
  autoSlug = p.status === 'draft' && !p.published_at && (p.slug === slugify(p.title) || /^نوشته-ی-بدون-عنوان(-\d+)?$/.test(p.slug));
  applyLinks();
  setDirty(false);
  updateSeo();
}

$('title').addEventListener('input', () => {
  if (autoSlug) $('slug').value = slugify($('title').value);
});
$('slug').addEventListener('input', () => {
  autoSlug = false;
});
for (const el of ['title', 'slug', 'status', 'meta', 'cover']) {
  $(el).addEventListener('input', touch);
  $(el).addEventListener('change', () => {
    if (el === 'status' && page) applyLinks();
  });
}
$('save').addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});
guardUnsaved(() => dirty);
init().catch((err) => showMessage(err.message));
