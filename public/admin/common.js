// Shared admin helpers.

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not json */
  }
  if (res.status === 401 && path !== '/api/login') {
    location.href = '/admin/';
    throw new Error('نیاز به ورود');
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'مشکلی پیش آمد. دوباره امتحان کن.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status', text: message });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

export function faNumber(n) {
  return Number(n).toLocaleString('fa-IR');
}

export function faDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(d);
}

export function mountTopbar(active) {
  const bar = h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '/admin/dashboard.html' }, 'پنل ', h('bdi', { dir: 'ltr', id: 'brand-name', text: 'konj.101' })),
      h(
        'nav',
        {},
        h('a', { href: '/admin/dashboard.html', class: active === 'pages' ? 'active' : '' }, 'نوشته‌ها'),
        h('a', { href: '/admin/home.html', class: active === 'home' ? 'active' : '' }, 'صفحه‌ی اصلی'),
        h('a', { href: '/', target: '_blank', rel: 'noopener' }, 'دیدن سایت ↗')
      ),
      h('slot', { id: 'topbar-extra' }),
      h('button', {
        class: 'btn small',
        type: 'button',
        text: 'خروج',
        onclick: async () => {
          try {
            await api('/api/logout', { method: 'POST', body: {} });
          } finally {
            location.href = '/admin/';
          }
        },
      })
    )
  );
  document.body.prepend(bar);
  api('/api/settings')
    .then((s) => {
      const el = document.getElementById('brand-name');
      if (el && s.site_name) el.textContent = s.site_name;
    })
    .catch(() => {});
  return bar;
}

// Warn before leaving with unsaved changes.
export function guardUnsaved(isDirty) {
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
