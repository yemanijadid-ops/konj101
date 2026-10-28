// Cleaning and limiting everything that comes from the admin panel.

import { sanitizeInline, textToHtml, safeUrl } from '../../public/assets/blocks.js';

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'quote', 'image', 'divider']);

// Arabic ي/ك -> Persian ی/ک, drop control characters (keeps the half-space U+200C).
export function normFa(s) {
  return String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​‍‎‏‪-‮⁦-⁩﻿]/g, '');
}

export function clip(s, max) {
  const t = normFa(s).trim();
  return t.length > max ? t.slice(0, max).trim() : t;
}

export function slugify(input) {
  return normFa(input)
    .trim()
    .toLowerCase()
    .replace(/[\s_‌]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');
}

export function cleanTags(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,،\n]/);
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const tag = normFa(raw).replace(/<[^>]*>/g, '').replace(/[<>"'`,،#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 15) break;
  }
  return out;
}

export function cleanBlocks(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const b of input.slice(0, 300)) {
    if (!b || typeof b !== 'object' || !BLOCK_TYPES.has(b.type)) continue;
    const c = b.content && typeof b.content === 'object' ? b.content : {};
    const id = String(b.id ?? '').replace(/[^\w-]/g, '').slice(0, 40) || Math.random().toString(36).slice(2, 10);
    let content = {};
    switch (b.type) {
      case 'heading':
        content = { text: clip(c.text, 200), level: Number(c.level) === 3 ? 3 : 2 };
        break;
      case 'paragraph': {
        const html = c.html != null ? sanitizeInline(normFa(c.html)) : textToHtml(String(c.text ?? '').trim());
        content = { html: html.slice(0, 30000) };
        break;
      }
      case 'quote':
        content = { text: clip(c.text, 2000), source: clip(c.source, 200) };
        break;
      case 'image':
        content = { url: safeUrl(c.url), caption: clip(c.caption, 300) };
        break;
      default:
        content = {};
    }
    out.push({ id, type: b.type, content });
  }
  return out;
}

export const SETTING_LIMITS = {
  site_name: 60,
  tagline: 160,
  hero_title: 200,
  hero_text: 1500,
  list_title: 80,
  footer_text: 300,
  meta_description: 300,
};

export function cleanSettings(input) {
  const out = {};
  for (const [key, max] of Object.entries(SETTING_LIMITS)) {
    if (input[key] != null) {
      const v = normFa(input[key]).replace(/\r\n/g, '\n').trim();
      out[key] = v.length > max ? v.slice(0, max).trim() : v;
    }
  }
  if (input.show_hero != null) out.show_hero = input.show_hero === false || input.show_hero === '0' ? '0' : '1';
  if (out.site_name === '') delete out.site_name; // the site must always have a name
  return out;
}
