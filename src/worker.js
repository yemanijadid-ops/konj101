import { ensureSchema } from './lib/db.js';
import { fail, redirect } from './lib/http.js';
import { isAuthenticated } from './lib/auth.js';
import { getSettings } from './lib/settings.js';
import { handleApi } from './api.js';
import { handlePublic, notFound } from './public.js';

const ADMIN_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src * data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

// Admin screens other than the login page (served from /public/admin).
const PROTECTED_ADMIN = /^\/admin\/(dashboard|editor|home)(\.html)?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      await ensureSchema(env);

      if (path.startsWith('/api/')) {
        // Block cross-site writes (cookies are SameSite=Strict too; this is a second lock).
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          const origin = request.headers.get('origin');
          if (origin && new URL(origin).host !== url.host) return fail('درخواست مجاز نیست.', 403);
        }
        return await handleApi(request, env, path);
      }

      if (PROTECTED_ADMIN.test(path) && !(await isAuthenticated(request, env))) return redirect('/admin/');

      const publicResponse = await handlePublic(request, env, url);
      if (publicResponse) return publicResponse;

      // Static files are matched exactly (html_handling: none), so folders map to index.html here.
      if (path === '/admin') return redirect('/admin/');
      const assetRequest = path.endsWith('/') ? new Request(new URL(path + 'index.html', url), request) : request;
      const asset = await env.ASSETS.fetch(assetRequest);
      if (path === '/admin' || path.startsWith('/admin/')) {
        const res = new Response(asset.body, asset);
        res.headers.set('content-security-policy', ADMIN_CSP);
        res.headers.set('x-robots-tag', 'noindex, nofollow');
        res.headers.set('cache-control', 'no-cache');
        res.headers.set('x-frame-options', 'DENY');
        return res;
      }
      if (asset.status === 404) {
        return await notFound({ settings: await getSettings(env), origin: url.origin });
      }
      return asset;
    } catch (err) {
      console.error('worker error', err && err.stack ? err.stack : err);
      return fail('خطای داخلی سرور. اگر تازه آپدیت کرده‌ای، چند ثانیه صبر کن و دوباره امتحان کن.', 500);
    }
  },
};
