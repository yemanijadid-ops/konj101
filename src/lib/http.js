// Small response / request helpers.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...headers,
    },
  });
}

export function fail(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}

export function htmlResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      ...headers,
    },
  });
}

export function textResponse(body, type = 'text/plain; charset=utf-8', headers = {}) {
  return new Response(body, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=300', ...headers },
  });
}

export function redirect(location, status = 302) {
  return new Response(null, { status, headers: { location } });
}

// Reads a JSON body. Returns null for anything that is not a JSON object.
export async function readJson(request, maxBytes = 2_000_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) return null;
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    const data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function parseCookies(request) {
  const out = {};
  for (const pair of (request.headers.get('cookie') || '').split(';')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    const key = pair.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(pair.slice(i + 1).trim());
    } catch {
      /* ignore broken cookie */
    }
  }
  return out;
}
