// Server-side HTML for the public site (fast for visitors, readable for Google).

import { escapeHtml as esc, renderBlocksHTML, plainTextOfBlocks, safeUrl, textToHtml } from '../../public/assets/blocks.js';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Noto+Serif:wght@600;700&family=Vazirmatn:wght@400;500;600;700&display=swap';

export function faDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(d);
}

export const tagUrl = (tag) => '/tag/' + encodeURIComponent(tag);
export const postUrl = (slug) => '/p/' + encodeURIComponent(slug);

const brand = (name) => `<bdi dir="ltr">${esc(name)}</bdi>`;

function absoluteUrl(origin, url) {
  const safe = safeUrl(url);
  if (!safe) return '';
  return safe.startsWith('/') ? origin + safe : safe;
}

export function chips(tags) {
  if (!tags || !tags.length) return '';
  return (
    '<ul class="tag-list">' +
    tags.map((t) => `<li><a class="tag" href="${esc(tagUrl(t))}" rel="tag">${esc(t)}</a></li>`).join('') +
    '</ul>'
  );
}

export function layout(ctx, o) {
  const { settings: s, origin } = ctx;
  const canonical = o.path != null ? origin + o.path : '';
  const fullTitle = o.fullTitle || (o.title ? `${o.title} | ${s.site_name}` : s.site_name);
  const desc = (o.description || s.meta_description || s.tagline || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const image = o.image ? absoluteUrl(origin, o.image) : '';
  const jsonld = o.jsonld ? `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, '\\u003c')}</script>` : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${o.noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
${canonical && !o.noindex ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:site_name" content="${esc(s.site_name)}">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:title" content="${esc(o.title || fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="fa_IR">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(o.title || fullTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
<link rel="alternate" type="application/xml" title="Sitemap" href="/sitemap.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/style.css">
${jsonld}
</head>
<body class="${o.bodyClass || ''}">
<header class="site-header"><div class="wrap">
  <a class="brand" href="/">${brand(s.site_name)}</a>
  ${s.tagline ? `<p class="site-tagline">${esc(s.tagline)}</p>` : ''}
</div></header>
<main class="wrap">
${o.body}
</main>
<footer class="site-footer"><div class="wrap">
  ${s.footer_text ? `<p>${textToHtml(s.footer_text)}</p>` : ''}
  <p class="copy">${brand(s.site_name)}</p>
</div></footer>
</body>
</html>`;
}

function postItem(p) {
  const excerpt = p.meta_description || plainTextOfBlocks(p.blocks, 180);
  return `<li class="post-item">
  <h3 class="post-item-title"><a href="${esc(postUrl(p.slug))}">${esc(p.title)}</a></h3>
  <p class="post-meta"><time datetime="${esc(p.published_at || p.created_at)}">${esc(faDate(p.published_at || p.created_at))}</time></p>
  ${excerpt ? `<p class="post-excerpt" dir="auto">${esc(excerpt)}</p>` : ''}
  ${chips(p.tags)}
</li>`;
}

export function postList(posts) {
  return posts.length ? `<ul class="post-list">${posts.map(postItem).join('')}</ul>` : '<p class="empty">هنوز نوشته‌ای منتشر نشده.</p>';
}

export function homePage(ctx, posts, tagCounts) {
  const s = ctx.settings;
  const showHero = s.show_hero !== '0' && (s.hero_title || s.hero_text);
  const hero = showHero
    ? `<section class="home-intro">
  ${s.hero_title ? `<h1 dir="auto">${esc(s.hero_title)}</h1>` : ''}
  ${s.hero_text ? `<p dir="auto">${textToHtml(s.hero_text)}</p>` : ''}
</section>`
    : `<h1 class="visually-hidden">${esc(s.site_name)}</h1>`;
  const cloud = tagCounts.length
    ? `<section class="tag-cloud"><h2>موضوع‌ها</h2><ul class="tag-list">${tagCounts
        .slice(0, 30)
        .map((t) => `<li><a class="tag" href="${esc(tagUrl(t.tag))}">${esc(t.tag)} <span class="tag-count">${t.count.toLocaleString('fa-IR')}</span></a></li>`)
        .join('')}</ul></section>`
    : '';
  const body = `${hero}
<section class="posts"><h2 class="section-title">${esc(s.list_title || 'نوشته‌ها')}</h2>${postList(posts)}</section>
${cloud}`;
  return layout(ctx, {
    fullTitle: s.tagline ? `${s.site_name} | ${s.tagline}` : s.site_name,
    description: s.meta_description || s.hero_text || s.tagline,
    path: '/',
    body,
    bodyClass: 'is-home',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: s.site_name, url: ctx.origin + '/', inLanguage: 'fa' },
  });
}

export function postPage(ctx, p, { preview = false } = {}) {
  const s = ctx.settings;
  const desc = p.meta_description || plainTextOfBlocks(p.blocks, 160);
  const cover = safeUrl(p.cover_url);
  const date = p.published_at || p.created_at;
  const body = `<article class="post">
  ${preview ? '<p class="preview-note">پیش‌نمایش — این نوشته هنوز منتشر نشده و فقط خودت می‌بینی.</p>' : ''}
  <header class="post-header">
    <h1 dir="auto">${esc(p.title)}</h1>
    <p class="post-meta"><time datetime="${esc(date)}">${esc(faDate(date))}</time></p>
  </header>
  ${cover ? `<img class="cover" src="${esc(cover)}" alt="${esc(p.title)}">` : ''}
  <div class="post-body">${renderBlocksHTML(p.blocks)}</div>
  ${p.tags.length ? `<footer class="post-footer"><span class="label">برچسب‌ها:</span> ${chips(p.tags)}</footer>` : ''}
  <p class="back"><a href="/">← بازگشت به ${brand(s.site_name)}</a></p>
</article>`;
  const path = postUrl(p.slug);
  return layout(ctx, {
    title: p.title,
    description: desc,
    path,
    image: cover,
    ogType: 'article',
    body,
    noindex: preview,
    bodyClass: 'is-post',
    jsonld: preview
      ? null
      : {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: p.title,
          description: desc,
          inLanguage: 'fa',
          datePublished: date,
          dateModified: p.updated_at,
          ...(cover ? { image: absoluteUrl(ctx.origin, cover) } : {}),
          ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}),
          mainEntityOfPage: ctx.origin + path,
          author: { '@type': 'Person', name: s.site_name },
          publisher: { '@type': 'Organization', name: s.site_name },
        },
  });
}

export function tagPage(ctx, tag, posts) {
  const body = `<section class="posts"><p class="eyebrow">برچسب</p><h1 dir="auto">${esc(tag)}</h1>${postList(posts)}<p class="back"><a href="/">← همه‌ی نوشته‌ها</a></p></section>`;
  return layout(ctx, {
    title: `برچسب: ${tag}`,
    description: `نوشته‌های مربوط به «${tag}» در ${ctx.settings.site_name}`,
    path: tagUrl(tag),
    body,
  });
}

export function notFoundPage(ctx) {
  return layout(ctx, {
    title: 'صفحه پیدا نشد',
    noindex: true,
    body: '<section class="not-found"><h1>صفحه‌ای که دنبالش بودی پیدا نشد</h1><p><a href="/">برگرد به صفحه‌ی اصلی</a></p></section>',
  });
}
