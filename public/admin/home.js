import { api, mountTopbar, toast, guardUnsaved, faNumber } from './common.js';

mountTopbar('home');

const TEXT_FIELDS = ['hero_title', 'hero_text', 'list_title', 'site_name', 'tagline', 'footer_text', 'meta_description'];
const $ = (id) => document.getElementById(id);
const showHero = $('show_hero');
let dirty = false;
let loaded = false;

function setDirty(v) {
  dirty = v;
  $('dirty').textContent = v ? 'تغییرات ذخیره نشده' : '';
  $('dirty').classList.toggle('on', v);
}

function counter(el, value, min, max) {
  el.textContent = `${faNumber(value.length)} / ${faNumber(max)}`;
  el.classList.toggle('warn', value.length > 0 && (value.length < min || value.length > max));
}

function preview() {
  const box = $('preview');
  box.replaceChildren();
  const add = (tag, text, style) => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.dir = 'auto';
    e.style.cssText = style;
    box.append(e);
  };
  if (showHero.checked && ($('hero_title').value || $('hero_text').value)) {
    if ($('hero_title').value) add('div', $('hero_title').value, 'font-size:1.4rem;font-weight:700;margin-bottom:6px');
    if ($('hero_text').value) add('div', $('hero_text').value, 'color:#6b6558;white-space:pre-wrap');
  } else {
    add('div', 'بخش متن بالای صفحه مخفیه.', 'color:#6b6558');
  }
  const title = $('tagline').value ? `${$('site_name').value} | ${$('tagline').value}` : $('site_name').value;
  const desc = $('meta_description').value || $('hero_text').value || $('tagline').value;
  $('serp-url').textContent = location.host;
  $('serp-title').textContent = title;
  $('serp-desc').textContent = desc.length > 160 ? desc.slice(0, 157) + '…' : desc;
  counter($('c_hero_text'), $('hero_text').value, 0, 1500);
  counter($('c_meta'), $('meta_description').value, 70, 160);
}

function collect() {
  const out = { show_hero: showHero.checked };
  for (const k of TEXT_FIELDS) out[k] = $(k).value;
  return out;
}

async function load() {
  const s = await api('/api/settings');
  showHero.checked = s.show_hero !== '0';
  for (const k of TEXT_FIELDS) $(k).value = s[k] ?? '';
  loaded = true;
  setDirty(false);
  preview();
}

for (const el of [showHero, ...TEXT_FIELDS.map($)]) {
  el.addEventListener('input', () => {
    if (!loaded) return;
    setDirty(true);
    preview();
  });
}

async function save() {
  const btn = $('save');
  btn.disabled = true;
  const msg = $('msg');
  try {
    if (!$('site_name').value.trim()) throw new Error('نام وبلاگ نمی‌تونه خالی باشه.');
    await api('/api/settings', { method: 'PUT', body: collect() });
    setDirty(false);
    msg.classList.add('hidden');
    toast('ذخیره شد ✓');
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg error';
  } finally {
    btn.disabled = false;
  }
}

$('save').addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});
guardUnsaved(() => dirty);
load().catch((err) => {
  $('msg').textContent = err.message;
  $('msg').className = 'msg error';
});
