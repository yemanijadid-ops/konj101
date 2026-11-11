// /api/* - everything except login/logout/session needs a valid session.

import { json, fail, readJson } from './lib/http.js';
import {
  safeEqual, createSessionCookie, clearSessionCookie, isAuthenticated,
  checkLockout, recordFailure, clearFailures,
} from './lib/auth.js';
import { slugify, clip, cleanTags, cleanBlocks, cleanSettings } from './lib/validate.js';
import { getSettings, saveSettings } from './lib/settings.js';
import { safeUrl } from '../public/assets/blocks.js';

const parseJsonArray = (text) => {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

function pageOut(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    content: parseJsonArray(row.content),
    tags: parseJsonArray(row.tags),
    meta_description: row.meta_description || '',
    cover_url: row.cover_url || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at || null,
  };
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return fail('رمز ورود یا SESSION_SECRET در تنظیمات (Secrets) کلادفلر ثبت نشده است.', 500);
  }
  const lock = await checkLockout(request, env);
  if (lock.blocked) return fail(`چند بار رمز اشتباه وارد شد. ${lock.retryMinutes} دقیقه‌ی دیگر دوباره تلاش کن.`, 429);

  const body = await readJson(request, 10_000);
  const ok = body && typeof body.password === 'string' && (await safeEqual(body.password, env.ADMIN_PASSWORD));
  if (!ok) {
    await recordFailure(request, env);
    return fail('رمز عبور اشتباه است.', 401);
  }
  await clearFailures(request, env);
  return json({ ok: true }, 200, { 'set-cookie': await createSessionCookie(env.SESSION_SECRET) });
}

async function uniqueSlug(env, base, ignoreId = 0) {
  let slug = base;
  for (let n = 2; n < 200; n++) {
    const clash = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? AND id != ?').bind(slug, ignoreId).first();
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

async function listPages(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, slug, title, status, tags, created_at, updated_at, published_at FROM pages ORDER BY updated_at DESC'
  ).all();
  return json({
    pages: (results || []).map((r) => ({
      id: r.id, slug: r.slug, title: r.title, status: r.status,
      tags: parseJsonArray(r.tags), created_at: r.created_at, updated_at: r.updated_at, published_at: r.published_at || null,
    })),
  });
}

async function createPage(request, env) {
  const body = (await readJson(request, 100_000)) || {};
  const title = clip(body.title, 200) || 'نوشته‌ی بدون عنوان';
  const slug = await uniqueSlug(env, slugify(title) || `page-${Date.now()}`);
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "INSERT INTO pages (slug, title, content, status, tags, meta_description, cover_url, created_at, updated_at) VALUES (?, ?, '[]', 'draft', '[]', '', '', ?, ?)"
  ).bind(slug, title, now, now).run();
  return json({ id: res.meta.last_row_id, slug }, 201);
}

async function getPage(env, id) {
  const row = await env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first();
  return row ? json(pageOut(row)) : fail('صفحه پیدا نشد.', 404);
}

async function updatePage(request, env, id) {
  const body = await readJson(request);
  if (!body) return fail('درخواست نامعتبر است.', 400);
  const cur = await env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first();
  if (!cur) return fail('صفحه پیدا نشد.', 404);

  const title = body.title != null ? clip(body.title, 200) : cur.title;
  if (!title) return fail('عنوان نمی‌تواند خالی باشد.', 400);

  let slug = cur.slug;
  if (body.slug != null) {
    const wanted = slugify(body.slug) || slugify(title) || `page-${id}`;
    if (wanted !== cur.slug) {
      const clash = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? AND id != ?').bind(wanted, id).first();
      if (clash) return fail('این نشانی (اسلاگ) قبلاً برای نوشته‌ی دیگری استفاده شده.', 409);
      slug = wanted;
    }
  }

  const status = body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : cur.status;
  let content = cur.content;
  if (body.content != null) {
    const blocks = cleanBlocks(body.content);
    if (!blocks) return fail('محتوای صفحه نامعتبر است.', 400);
    content = JSON.stringify(blocks);
    if (content.length > 900_000) return fail('محتوای صفحه خیلی بزرگ است.', 413);
  }
  const tags = body.tags != null ? JSON.stringify(cleanTags(body.tags)) : cur.tags || '[]';
  const meta = body.meta_description != null ? clip(body.meta_description, 300) : cur.meta_description || '';
  const cover = body.cover_url != null ? safeUrl(body.cover_url) : cur.cover_url || '';
  const now = new Date().toISOString();
  const publishedAt = status === 'published' ? cur.published_at || now : cur.published_at || null;

  await env.DB.prepare(
    'UPDATE pages SET title = ?, slug = ?, content = ?, status = ?, tags = ?, meta_description = ?, cover_url = ?, published_at = ?, updated_at = ? WHERE id = ?'
  ).bind(title, slug, content, status, tags, meta, cover, publishedAt, now, id).run();

  return json({ ok: true, slug, status, updated_at: now, published_at: publishedAt });
}

async function allTags(env) {
  const { results } = await env.DB.prepare('SELECT tags FROM pages').all();
  const counts = new Map();
  for (const r of results || []) {
    for (const t of parseJsonArray(r.tags)) {
      const key = String(t).toLowerCase();
      const e = counts.get(key) || { tag: t, count: 0 };
      e.count++;
      counts.set(key, e);
    }
  }
  return json({ tags: [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fa')) });
}

export async function handleApi(request, env, path) {
  const method = request.method;

  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  if (path === '/api/session' && method === 'GET') return json({ authenticated: await isAuthenticated(request, env) });

  if (!(await isAuthenticated(request, env))) return fail('لطفاً وارد شوید.', 401);

  if (path === '/api/pages') {
    if (method === 'GET') return listPages(env);
    if (method === 'POST') return createPage(request, env);
  }
  const m = path.match(/^\/api\/pages\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (method === 'GET') return getPage(env, id);
    if (method === 'PUT') return updatePage(request, env, id);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/tags' && method === 'GET') return allTags(env);
  if (path === '/api/settings') {
    if (method === 'GET') return json(await getSettings(env));
    if (method === 'PUT') {
      const body = await readJson(request, 100_000);
      if (!body) return fail('درخواست نامعتبر است.', 400);
      await saveSettings(env, cleanSettings(body));
      return json({ ok: true, settings: await getSettings(env) });
    }
  }
  return fail('یافت نشد.', 404);
}
