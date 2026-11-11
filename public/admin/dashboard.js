import { api, h, mountTopbar, faDate, faNumber, toast } from './common.js';

mountTopbar('pages');

const list = document.getElementById('list');
const errorBox = document.getElementById('error');
const newBtn = document.getElementById('new');

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.toggle('hidden', !message);
}

function row(p) {
  const published = p.status === 'published';
  return h(
    'div',
    { class: 'page-row' },
    h('a', { class: 'title', href: `/admin/editor.html?id=${p.id}` }, p.title),
    h('span', { class: 'badge' + (published ? ' published' : '') }, published ? 'منتشرشده' : 'پیش‌نویس'),
    p.tags.length ? h('span', { class: 'row-tags' }, p.tags.map((t) => '#' + t).join(' ')) : null,
    h('span', { class: 'hint' }, faDate(p.updated_at)),
    h('a', { class: 'btn small', href: `/admin/editor.html?id=${p.id}` }, 'ویرایش'),
    h('a', {
      class: 'btn small',
      target: '_blank',
      rel: 'noopener',
      href: published ? `/p/${encodeURIComponent(p.slug)}` : `/preview/${p.id}`,
    }, published ? 'مشاهده' : 'پیش‌نمایش'),
    h('button', {
      class: 'btn small danger',
      type: 'button',
      text: 'حذف',
      onclick: async () => {
        if (!confirm(`«${p.title}» برای همیشه حذف بشه؟`)) return;
        try {
          await api(`/api/pages/${p.id}`, { method: 'DELETE' });
          toast('حذف شد');
          load();
        } catch (err) {
          showError(err.message);
        }
      },
    })
  );
}

async function load() {
  try {
    const { pages } = await api('/api/pages');
    document.getElementById('count').textContent = pages.length ? `(${faNumber(pages.length)})` : '';
    list.replaceChildren(...(pages.length ? pages.map(row) : [h('p', { class: 'hint' }, 'هنوز نوشته‌ای نداری. دکمه‌ی «نوشته‌ی جدید» رو بزن.')]));
    showError('');
  } catch (err) {
    showError(err.message);
  }
}

newBtn.addEventListener('click', async () => {
  newBtn.disabled = true;
  try {
    const { id } = await api('/api/pages', { method: 'POST', body: {} });
    location.href = `/admin/editor.html?id=${id}`;
  } catch (err) {
    showError(err.message);
    newBtn.disabled = false;
  }
});

load();
