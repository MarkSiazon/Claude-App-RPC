// Minimal X (Twitter) API v2 client using OAuth 1.0a user-context signing.
// No dependencies — just node:crypto. OAuth 1.0a is used (rather than the
// OAuth2 browser flow) because X's developer portal hands you a ready-made
// "Access Token & Secret" for your OWN account in two clicks, so there's no
// redirect/PKCE dance to get wrong. This only ever posts to the account whose
// tokens you paste in — your own megaphone.
//
// creds = { apiKey, apiSecret, accessToken, accessSecret }

import crypto from 'node:crypto';

// RFC-3986 percent-encoding (stricter than encodeURIComponent).
function pct(s) {
  return encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Build the OAuth 1.0a Authorization header for a request. For JSON bodies
// (what /2/tweets uses) the body is NOT part of the signature base string —
// only the oauth_* params and any query params are. That's per spec and is
// what X expects for v2 JSON posts.
function authHeader(method, url, creds, queryParams = {}) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const allParams = { ...oauth, ...queryParams };
  const paramString = Object.keys(allParams).sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`).join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const signingKey = `${pct(creds.apiSecret)}&${pct(creds.accessSecret)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort()
    .map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ');
}

// Verify the credentials by fetching the authenticated user. Returns
// { ok, handle } or { ok:false, error }.
export async function verify(creds) {
  const url = 'https://api.x.com/2/users/me';
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader('GET', url, creds) } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.title || j?.detail || `HTTP ${res.status}` };
    return { ok: true, handle: j?.data?.username || '(unknown)', name: j?.data?.name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Post a tweet. Returns { ok, id, url } or { ok:false, error }.
export async function postTweet(text, creds) {
  if (!text || !text.trim()) return { ok: false, error: 'empty text' };
  if (text.length > 280) return { ok: false, error: `too long (${text.length} > 280)` };
  const url = 'https://api.x.com/2/tweets';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader('POST', url, creds), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.detail || j?.title || `HTTP ${res.status}`, raw: j };
    const id = j?.data?.id;
    return { ok: true, id, url: id ? `https://x.com/i/web/status/${id}` : null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
