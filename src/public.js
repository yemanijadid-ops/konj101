// Public routes: home, posts, tags, preview, sitemap, robots.

import { htmlResponse, textResponse, redirect } from './lib/http.js';
import { isAuthenticated } from './lib/auth.js';
import { getSettings } from './lib/settings.js';
import { homePage, postPage, tagPage, notFoundPage, tagUrl, postUrl } from './lib/render.js';
import { escapeHtml } from '../public/assets/blocks.js';

const arr = (text) => {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const toPost = (r) => ({ ...r, blocks: arr(r.content), tags: arr(r.tags), meta_description: r.meta_description || '', cover_url: r.cover_url || '' });

async function publishedPosts(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM pages WHERE status = 'published' ORDER BY COALESCE(published_at, created_at) DESC"
  ).all();
  return (results || []).map(toPost);
}

function tagCounts(posts) {
  const m = new Map();
  for (const p of posts) {
    for (const t of p.tags) {
      const k = t.toLowerCase();
      const e = m.get(k) || { tag: t, count: 0 };
      e.count++;
      m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fa'));
}

async function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

export async function notFound(ctx) {
  return htmlResponse(notFoundPage(ctx), 404);
}

// Returns a Response, or null when the path is not a public route.
export async function handlePublic(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const path = url.pathname;
  const origin = url.origin;

  // Old links from the previous version of the site.
  if (path === '/index.html') return redirect('/', 301);
  if (path === '/page.html') {
    const slug = url.searchParams.get('slug');
    return redirect(slug ? postUrl(slug) : '/', 301);
  }

  if (path === '/robots.txt') {
    return textResponse(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nDisallow: /preview\n\nSitemap: ${origin}/sitemap.xml\n`);
  }

  const known = path === '/' || path === '/sitemap.xml' || /^\/(p|tag|preview)\/[^/]+\/?$/.test(path);
  if (!known) return null;

  const settings = await getSettings(env);
  const ctx = { settings, origin };

  if (path === '/') {
    const posts = await publishedPosts(env);
    return htmlResponse(homePage(ctx, posts, tagCounts(posts)));
  }

  if (path === '/sitemap.xml') {
    const posts = await publishedPosts(env);
    const entries = [{ loc: origin + '/', lastmod: posts[0]?.updated_at }];
    for (const p of posts) entries.push({ loc: origin + postUrl(p.slug), lastmod: p.updated_at });
    for (const t of tagCounts(posts)) entries.push({ loc: origin + tagUrl(t.tag) });
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      entries
        .map((e) => `<url><loc>${escapeHtml(e.loc)}</loc>${e.lastmod ? `<lastmod>${escapeHtml(e.lastmod.slice(0, 10))}</lastmod>` : ''}</url>`)
        .join('\n') +
      '\n</urlset>\n';
    return textResponse(xml, 'application/xml; charset=utf-8');
  }

  const m = path.match(/^\/(p|tag|preview)\/([^/]+)\/?$/);
  const kind = m[1];
  const value = await safeDecode(m[2]);
  if (value == null) return notFound(ctx);

  if (kind === 'p') {
    const row = await env.DB.prepare("SELECT * FROM pages WHERE slug = ? AND status = 'published'").bind(value).first();
    return row ? htmlResponse(postPage(ctx, toPost(row))) : notFound(ctx);
  }

  if (kind === 'preview') {
    if (!(await isAuthenticated(request, env))) return redirect('/admin/');
    const row = await env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(Number(value) || 0).first();
    return row
      ? htmlResponse(postPage(ctx, toPost(row), { preview: true }), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' })
      : notFound(ctx);
  }

  // tag
  const wanted = value.toLowerCase();
  const posts = (await publishedPosts(env)).filter((p) => p.tags.some((t) => t.toLowerCase() === wanted));
  if (!posts.length) return notFound(ctx);
  const label = posts[0].tags.find((t) => t.toLowerCase() === wanted);
  return htmlResponse(tagPage(ctx, label, posts));
}
