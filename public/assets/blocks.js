// Shared block helpers.
// Used by the Worker (server-side rendering + validation) and by the admin editor.
// Plain string handling only - no DOM - so it runs anywhere.

export const HL_CLASSES = ['hl-yellow', 'hl-pink', 'hl-green', 'hl-blue'];

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Plain text -> HTML (line breaks kept, nothing else allowed through).
export function textToHtml(text) {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

export function decodeEntities(str) {
  return String(str ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Text that came out of innerHTML already has entities. Keep the known ones, escape the rest.
function cleanText(text) {
  return text
    .replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Only http(s), mailto, tel, same-site paths and #anchors are allowed.
export function safeUrl(raw) {
  let url = String(raw ?? '').trim();
  url = url.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (!url || url.length > 2000) return '';
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(url)) return url;
  if (/^\/(?!\/)/.test(url)) return url;
  return '';
}

const BLOCK_TAGS = new Set([
  'div', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'tr', 'section', 'article', 'figure', 'pre',
]);

const TAG_RE = /^<(\/)?([a-zA-Z][a-zA-Z0-9]*)(?=[\s/>])([\s\S]*)>$/;

function attrValue(attrs, name) {
  const re = new RegExp('(?:^|[\\s"\'])' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

// Whitelist sanitizer for the little bit of inline formatting we allow:
// <strong> <em> <mark class="hl-*"> <a href> <br>.  Everything else is dropped (its text is kept).
// The output is always balanced and safe to place inside a <p>.
export function sanitizeInline(input) {
  const src = String(input ?? '').replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  const out = [];
  const stack = [];

  const closeTag = (name) => {
    const i = stack.lastIndexOf(name);
    if (i === -1) return;
    while (stack.length > i) out.push('</' + stack.pop() + '>');
  };
  const lineBreak = () => {
    if (out.length && out[out.length - 1] !== '<br>') out.push('<br>');
  };

  for (const part of src.split(/(<[^>]*>)/)) {
    if (!part) continue;

    if (part[0] === '<' && part.length > 1 && part[part.length - 1] === '>') {
      if (part.startsWith('<!') || part.startsWith('<?')) continue; // comments, doctype

      const m = TAG_RE.exec(part);
      if (!m) {
        out.push(cleanText(part));
        continue;
      }
      const closing = m[1] === '/';
      let name = m[2].toLowerCase();
      const attrs = m[3] || '';
      if (name === 'b') name = 'strong';
      else if (name === 'i') name = 'em';

      if (name === 'br') {
        if (!closing) out.push('<br>');
      } else if (BLOCK_TAGS.has(name)) {
        lineBreak();
      } else if (name === 'strong' || name === 'em') {
        if (closing) closeTag(name);
        else {
          out.push('<' + name + '>');
          stack.push(name);
        }
      } else if (name === 'mark') {
        if (closing) closeTag('mark');
        else {
          closeTag('mark'); // never nest highlights
          const classes = (attrValue(attrs, 'class') || '').split(/\s+/);
          const cls = HL_CLASSES.find((c) => classes.includes(c)) || 'hl-yellow';
          out.push('<mark class="' + cls + '">');
          stack.push('mark');
        }
      } else if (name === 'a') {
        if (closing) closeTag('a');
        else {
          closeTag('a');
          const href = safeUrl(decodeEntities(attrValue(attrs, 'href') ?? ''));
          if (href) {
            const external = /^https?:/i.test(href);
            out.push('<a href="' + escapeHtml(href) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>');
            stack.push('a');
          }
        }
      }
      // any other tag: dropped, inner text stays
    } else {
      out.push(cleanText(part));
    }
  }
  while (stack.length) out.push('</' + stack.pop() + '>');

  return out
    .join('')
    .replace(/(?:<br>){3,}/g, '<br><br>')
    .replace(/^(?:<br>)+/, '')
    .replace(/(?:<br>)+$/, '');
}

export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + '…';
}

export function paragraphHtml(content) {
  const c = content || {};
  if (c.html != null) return sanitizeInline(c.html);
  return textToHtml(String(c.text ?? '').trim());
}

// First paragraph as plain text - used for excerpts and meta descriptions.
export function plainTextOfBlocks(blocks, max = 160) {
  for (const block of blocks || []) {
    if (block && block.type === 'paragraph') {
      const text = htmlToText(paragraphHtml(block.content));
      if (text) return truncate(text, max);
    }
  }
  return '';
}

export function renderBlockHTML(block) {
  const c = (block && block.content) || {};
  switch (block && block.type) {
    case 'heading': {
      const text = String(c.text ?? '').trim();
      if (!text) return '';
      const tag = Number(c.level) === 3 ? 'h3' : 'h2';
      return `<${tag} class="block block-heading" dir="auto">${escapeHtml(text)}</${tag}>`;
    }
    case 'paragraph': {
      const html = paragraphHtml(c);
      return html ? `<p class="block block-paragraph" dir="auto">${html}</p>` : '';
    }
    case 'quote': {
      const text = String(c.text ?? '').trim();
      if (!text) return '';
      const source = String(c.source ?? '').trim();
      return (
        `<blockquote class="block block-quote" dir="auto"><p>${textToHtml(text)}</p>` +
        (source ? `<cite>${escapeHtml(source)}</cite>` : '') +
        '</blockquote>'
      );
    }
    case 'image': {
      const url = safeUrl(c.url);
      if (!url) return '';
      const caption = String(c.caption ?? '').trim();
      return (
        `<figure class="block block-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" loading="lazy">` +
        (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
        '</figure>'
      );
    }
    case 'divider':
      return '<hr class="block block-divider">';
    default:
      return '';
  }
}

export function renderBlocksHTML(blocks) {
  return (blocks || []).map(renderBlockHTML).filter(Boolean).join('\n');
}
