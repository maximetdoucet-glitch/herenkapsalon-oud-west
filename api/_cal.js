// Shared helper for Cal.com API v2 calls.
// Reads CALCOM_API_KEY from env (set in Vercel dashboard).
// v2 uses Bearer auth + per-endpoint cal-api-version header.

export const CAL_BASE = 'https://api.cal.com/v2';
export const DEFAULT_TZ = process.env.TIMEZONE || 'Europe/Amsterdam';

export function getKey() {
  return process.env.CALCOM_API_KEY || '';
}

export async function callCal(pathname, { params = {}, method = 'GET', body, apiVersion } = {}) {
  const key = getKey();
  if (!key) {
    return { ok: false, status: 500, data: { error: 'CALCOM_API_KEY not configured on the server.' } };
  }

  const url = new URL(CAL_BASE + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const headers = {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  if (apiVersion) headers['cal-api-version'] = apiVersion;

  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const r = await fetch(url, init);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

export function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(payload));
}