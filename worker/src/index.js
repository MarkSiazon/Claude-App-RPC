// claude-rpc community-totals worker.
//
// This is the entire server. Three routes:
//   POST /report         — opt-in counters from a CLI install
//   GET  /sessions.svg   — shields-style badge for the README
//   GET  /tokens.svg     — same, for tokens
//   GET  /total.json     — JSON for arbitrary consumers / dashboards
//   GET  /ref?s=<src>    — referral beacon (counts an allowlisted source)
//   GET  /refs.json      — referral breakdown by source
//   GET  /health         — sanity check
//
// Storage is a single KV namespace bound as `TOTALS`. We keep:
//   total:sessions       integer string, running sum
//   total:tokens         integer string, running sum
//   seen:<instanceId>    last-seen counters, 30d TTL (dedup window)
//
// No PII is persisted. Cloudflare's request log retains IPs briefly for
// abuse mitigation — that's a Cloudflare property, not something this
// worker writes. The CLI ships consent text that names both layers.

import { renderBadge, fmtNum } from './badge.js';

const SCHEMA_VERSION = 1;
const MAX_DELTA_SESSIONS = 100_000;       // per single report — bigger gets rejected
const MAX_DELTA_TOKENS   = 5_000_000_000; // 5B; ~5 years of heavy use
const SEEN_TTL_SECONDS   = 30 * 24 * 60 * 60;
const RATE_WINDOW_SEC    = 60;            // 1 report/minute/instance
const RATE_LIMIT_KEY     = (id) => `rate:${id}`;

// IP-scoped fixed-window limiter, layered on top of the per-instance one.
// The per-instance limiter is keyed on an attacker-supplied UUID, so rotating
// UUIDs trivially defeats it — this bounds total volume per source IP instead.
// Fixed window of IP_RATE_WINDOW_SEC; up to IP_RATE_MAX accepted reports per
// window. Keyed `rate:ip:<ip>:<epochWindow>`. When CF-Connecting-IP is absent
// (e.g. unit tests, or a misconfigured edge) we fall back to a single shared
// bucket so the limiter still caps anonymous volume rather than failing open
// per-request.
const IP_RATE_WINDOW_SEC = 60;
const IP_RATE_MAX        = 20;            // accepted reports per IP per window
const IP_FALLBACK_BUCKET = 'noip';
const IP_RATE_KEY        = (ip, win) => `rate:ip:${ip}:${win}`;

// Referral attribution. The landing page fires a beacon `GET /ref?s=<source>`
// on first touch so we can see which surface actually drives visits. We count
// against a fixed ALLOWLIST only — anything else is ignored, so a stray query
// param can't pollute KV with junk keys. No PII: a per-source counter, nothing
// tied to a person. Stored as `ref:<source>`.
const REF_SOURCES = new Set([
  'discord',     // the presence-card button
  'wrapped',     // Claude Wrapped share
  'card',        // poster / calendar / profile / session card footers
  'badge',       // README badge click-through
  'readme',      // links in the GitHub README
  'github',      // the repo About / homepage link
  'npm',         // npmjs.com package page
  'hn',          // Hacker News
  'reddit',      // Reddit
  'producthunt', // Product Hunt
  'devto',       // dev.to
  'twitter',     // X / Twitter
]);

// Permissive CORS for the read-only JSON endpoints — the stats page is served
// from the Vercel origin and fetches these cross-origin.
const CORS = { 'Access-Control-Allow-Origin': '*' };

// ── Validation ─────────────────────────────────────────────────────────

function isUuidish(s) {
  // We don't require a strict v4; any 8-4-4-4-12 hex shape is fine. The
  // CLI mints with crypto.randomUUID() but a determined contributor
  // shouldn't get rejected for using a non-v4 generator.
  return typeof s === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function validateReport(body) {
  if (!body || typeof body !== 'object') return 'body must be an object';
  if (!isUuidish(body.instanceId)) return 'instanceId must be a UUID';
  const sd = Number(body.sessionsDelta);
  const td = Number(body.tokensDelta);
  if (!Number.isFinite(sd) || sd < 0 || sd > MAX_DELTA_SESSIONS) return 'sessionsDelta out of range';
  if (!Number.isFinite(td) || td < 0 || td > MAX_DELTA_TOKENS) return 'tokensDelta out of range';
  if (sd === 0 && td === 0) return 'no delta';
  if (typeof body.version !== 'string' || body.version.length > 32) return 'version missing or too long';
  if (typeof body.osFamily !== 'string' || !/^(linux|darwin|win32)$/.test(body.osFamily)) return 'osFamily invalid';
  return null;
}

// ── KV helpers ─────────────────────────────────────────────────────────

async function getInt(env, key) {
  const v = await env.TOTALS.get(key);
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

async function addInt(env, key, delta) {
  // KV has no atomic increment, so this is a best-effort read-modify-write:
  // read the current value, add the delta, write it back. There is no
  // locking or compare-and-set, so two reports that interleave their
  // read/write can clobber each other and rarely lose a single increment.
  // That's acceptable for a vanity community counter where the exact total
  // doesn't matter. True atomicity would require migrating this state to a
  // Durable Object (which can serialize read-modify-write); we don't do that
  // here because the cost isn't worth it for an approximate aggregate.
  const cur = await getInt(env, key);
  const next = cur + delta;
  await env.TOTALS.put(key, String(next));
  return next;
}

// IP-scoped fixed-window rate limit. Returns true if the request is within
// budget for the current window, false if it should be rejected with 429.
// Uses KV read-modify-write per window key with a short TTL; like addInt this
// is best-effort (a racing pair of requests could both read the same count),
// which only ever makes the limiter slightly more permissive at the margin —
// fine for abuse mitigation. A missing IP collapses to a single shared bucket
// so anonymous/headerless volume is still bounded in aggregate.
async function ipRateOk(env, ip) {
  const bucket = ip || IP_FALLBACK_BUCKET;
  const win = Math.floor(Date.now() / 1000 / IP_RATE_WINDOW_SEC);
  const key = IP_RATE_KEY(bucket, win);
  const count = await getInt(env, key);
  if (count >= IP_RATE_MAX) return false;
  await env.TOTALS.put(key, String(count + 1), { expirationTtl: IP_RATE_WINDOW_SEC });
  return true;
}

// Extract the client IP from Cloudflare's trusted header. Returns null when
// absent (callers fall back to a shared bucket).
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || null;
}

// Rate-limit: one report per instance per RATE_WINDOW_SEC. Cheap to
// implement on KV via a TTL'd marker. Returns true if the report should
// be accepted (no marker present), false if rate-limited.
async function rateOk(env, instanceId) {
  const key = RATE_LIMIT_KEY(instanceId);
  const cur = await env.TOTALS.get(key);
  if (cur) return false;
  // expirationTtl is seconds; KV honors a minimum of 60s, which is what we want.
  await env.TOTALS.put(key, '1', { expirationTtl: RATE_WINDOW_SEC });
  return true;
}

// ── Route handlers ─────────────────────────────────────────────────────

export async function handleReport(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON');
  }
  const why = validateReport(body);
  if (why) return jsonError(400, why);

  // IP-scoped limiter first — bounds total volume per source even when an
  // attacker rotates instanceIds to dodge the per-instance limiter.
  if (!(await ipRateOk(env, clientIp(request)))) {
    return jsonError(429, 'rate limited (ip)');
  }
  if (!(await rateOk(env, body.instanceId))) {
    return jsonError(429, 'rate limited');
  }

  // Record dedup marker. We don't *enforce* dedup with this key — the
  // rate limiter already prevents floods — but downstream analytics can
  // count distinct instances from the existence of seen:<id> entries.
  await env.TOTALS.put(
    `seen:${body.instanceId}`,
    JSON.stringify({ ts: Date.now(), version: body.version, osFamily: body.osFamily }),
    { expirationTtl: SEEN_TTL_SECONDS },
  );

  const sessions = await addInt(env, 'total:sessions', Number(body.sessionsDelta));
  const tokens   = await addInt(env, 'total:tokens',   Number(body.tokensDelta));

  return new Response(JSON.stringify({
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    totals: { sessions, tokens },
  }), { headers: { 'Content-Type': 'application/json' } });
}

export async function handleBadge(metric, env) {
  const sessions = await getInt(env, 'total:sessions');
  const tokens   = await getInt(env, 'total:tokens');
  let label, value, color;
  if (metric === 'sessions') {
    label = 'community · sessions';
    value = fmtNum(sessions);
    color = { left: '#555', right: '#5865F2' }; // discord blurple
  } else if (metric === 'tokens') {
    label = 'community · tokens';
    value = fmtNum(tokens);
    color = { left: '#555', right: '#a55' };
  } else {
    return jsonError(404, 'unknown metric');
  }
  const svg = renderBadge({ label, value, color });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

// Record a referral hit. Returns 204 regardless (it's a fire-and-forget
// beacon) but only actually counts allowlisted sources. Never throws.
export async function handleRef(url, env, ip = null) {
  const s = (url.searchParams.get('s') || '').toLowerCase();
  // Only count an allowlisted source AND only when within the IP budget, so a
  // single host can't inflate a referral counter by hammering the beacon.
  // Still always returns 204 — it's a fire-and-forget beacon, never an error
  // surface — we just skip the write when rate-limited.
  if (REF_SOURCES.has(s) && (await ipRateOk(env, ip))) {
    try { await addInt(env, `ref:${s}`, 1); } catch { /* best-effort */ }
  }
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Cache-Control': 'no-store' },
  });
}

// Referral breakdown: { discord: 12, wrapped: 5, ... }. Only allowlisted
// sources are ever present (handleRef gates writes), so a list() over `ref:`
// is bounded by REF_SOURCES.size.
export async function handleRefs(env) {
  const out = {};
  let total = 0;
  try {
    const { keys } = await env.TOTALS.list({ prefix: 'ref:' });
    for (const { name } of keys) {
      const source = name.slice('ref:'.length);
      const n = await getInt(env, name);
      out[source] = n;
      total += n;
    }
  } catch { /* list unsupported / empty → {} */ }
  return new Response(JSON.stringify({ schemaVersion: SCHEMA_VERSION, refs: out, total, ts: Date.now() }, null, 2), {
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
  });
}

export async function handleJson(env) {
  const sessions = await getInt(env, 'total:sessions');
  const tokens   = await getInt(env, 'total:tokens');
  return new Response(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    sessions,
    tokens,
    ts: Date.now(),
  }, null, 2), {
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Entry point ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/report') {
      return handleReport(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/sessions.svg') {
      return handleBadge('sessions', env);
    }
    if (request.method === 'GET' && url.pathname === '/tokens.svg') {
      return handleBadge('tokens', env);
    }
    if (request.method === 'GET' && url.pathname === '/total.json') {
      return handleJson(env);
    }
    if (request.method === 'GET' && url.pathname === '/ref') {
      return handleRef(url, env, clientIp(request));
    }
    if (request.method === 'GET' && url.pathname === '/refs.json') {
      return handleRefs(env);
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, schemaVersion: SCHEMA_VERSION }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return jsonError(404, 'not found');
  },
};
