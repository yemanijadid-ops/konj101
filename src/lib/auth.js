// Password-only login with a signed session cookie and a simple lockout.

import { parseCookies } from './http.js';

const COOKIE = 'kj_session';
const TTL = 60 * 60 * 24 * 14; // 14 days
const MAX_FAILS = 5;
const WINDOW_SECONDS = 15 * 60;

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

// Constant-time comparison (both sides are hashed first so lengths do not leak).
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(String(a ?? '')), sha256(String(b ?? ''))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function createSessionCookie(secret) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const sig = await hmac(secret, 'kj1.' + exp);
  return `${COOKIE}=${exp}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = parseCookies(request)[COOKIE];
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(token.slice(dot + 1), await hmac(env.SESSION_SECRET, 'kj1.' + exp));
}

function clientId(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
}

// Returns { blocked, retryMinutes }.
export async function checkLockout(request, env) {
  const ip = clientId(request);
  const row = await env.DB.prepare('SELECT fails, first_at FROM login_attempts WHERE ip = ?').bind(ip).first();
  const now = Math.floor(Date.now() / 1000);
  if (row && now - row.first_at < WINDOW_SECONDS && row.fails >= MAX_FAILS) {
    return { blocked: true, retryMinutes: Math.max(1, Math.ceil((WINDOW_SECONDS - (now - row.first_at)) / 60)) };
  }
  return { blocked: false };
}

export async function recordFailure(request, env) {
  const ip = clientId(request);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT fails, first_at FROM login_attempts WHERE ip = ?').bind(ip).first();
  if (!row || now - row.first_at >= WINDOW_SECONDS) {
    await env.DB.prepare('INSERT OR REPLACE INTO login_attempts (ip, fails, first_at) VALUES (?, 1, ?)').bind(ip, now).run();
  } else {
    await env.DB.prepare('UPDATE login_attempts SET fails = fails + 1 WHERE ip = ?').bind(ip).run();
  }
}

export async function clearFailures(request, env) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(clientId(request)).run();
}
