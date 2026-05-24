// Opt-in community-totals client. Reads aggregate.json + a small cursor
// file to compute counter DELTAs (not absolute values — the cursor moves
// forward as we report), then POSTs to the configured worker endpoint.
//
// Three guarantees this module owes the rest of the codebase:
//
//   1. Never throws. The daemon calls this from a setInterval and must
//      not crash on a network burp or a malformed response. All failure
//      modes resolve to `{ ok: false, reason }` and move on.
//   2. Never sends anything beyond the documented payload. No file paths,
//      no prompts, no models, no cwd — the buildPayload function is the
//      complete schema, and it's audited by the worker's validateReport.
//   3. Never advances the cursor on a failed flush. A 5xx today + a
//      successful flush tomorrow still reports today's deltas.
//
// See worker/src/index.js for the receiving end.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';
import { AGGREGATE_PATH, STATE_DIR } from './paths.js';
import { VERSION } from './version.js';

const CURSOR_PATH = join(STATE_DIR, 'community-cursor.json');

export function readCursor(path = CURSOR_PATH) {
  if (!existsSync(path)) return { sessions: 0, tokens: 0, ts: 0 };
  try { return { sessions: 0, tokens: 0, ts: 0, ...JSON.parse(readFileSync(path, 'utf8')) }; }
  catch { return { sessions: 0, tokens: 0, ts: 0 }; }
}

export function writeCursor(c, path = CURSOR_PATH) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(c, null, 2));
  } catch {
    // Cursor write failure is recoverable — the next flush will resend
    // the same delta, which the worker accepts (we accumulate at the
    // server, not de-dup on payload content).
  }
}

export function osFamily() {
  const p = platform();
  if (p === 'win32') return 'win32';
  if (p === 'darwin') return 'darwin';
  // freebsd / openbsd / aix all collapse to 'linux' for telemetry
  // — the worker only accepts the three canonical values.
  return 'linux';
}

// Pure: given an aggregate and a cursor, produce the next payload. The
// worker's validateReport must accept this shape; if you add a field
// here, add it there too.
export function buildPayload(aggregate, cursor, { instanceId, now = Date.now() }) {
  const sessions = aggregate?.sessions || 0;
  const tokens = (aggregate?.inputTokens || 0)
    + (aggregate?.outputTokens || 0)
    + (aggregate?.cacheReadTokens || 0)
    + (aggregate?.cacheWriteTokens || 0);
  return {
    instanceId,
    sessionsDelta: Math.max(0, sessions - (cursor.sessions || 0)),
    tokensDelta:   Math.max(0, tokens   - (cursor.tokens   || 0)),
    version: VERSION,
    osFamily: osFamily(),
    ts: now,
  };
}

// Single best-effort flush. Returns { ok, reason, delta? } — never throws.
// Caller passes in the merged config so we can be tested without touching
// disk for config too.
export async function flushCommunity(cfg, {
  aggregatePath = AGGREGATE_PATH,
  cursorPath = CURSOR_PATH,
  fetchImpl = globalThis.fetch,
} = {}) {
  const community = cfg?.community || {};
  if (!community.enabled) return { ok: false, reason: 'disabled' };
  if (!community.instanceId) return { ok: false, reason: 'no-instance-id' };
  if (!community.endpoint) return { ok: false, reason: 'no-endpoint' };
  if (!existsSync(aggregatePath)) return { ok: false, reason: 'no-aggregate' };

  let aggregate;
  try { aggregate = JSON.parse(readFileSync(aggregatePath, 'utf8')); }
  catch { return { ok: false, reason: 'unreadable-aggregate' }; }

  const cursor = readCursor(cursorPath);
  const payload = buildPayload(aggregate, cursor, { instanceId: community.instanceId });
  if (payload.sessionsDelta === 0 && payload.tokensDelta === 0) {
    return { ok: true, reason: 'no-delta' };
  }

  const url = community.endpoint.replace(/\/+$/, '') + '/report';
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, reason: 'network', error: e.message };
  }
  if (!res.ok) {
    // 429 is rate-limit — not actually a failure, just "come back later".
    if (res.status === 429) return { ok: false, reason: 'rate-limited' };
    return { ok: false, reason: `http-${res.status}` };
  }

  // Only move the cursor on confirmed acceptance. If we crash between
  // the response and the cursor write, the next flush resends — the
  // worker accumulates blindly, so a duplicate would double-count.
  // Rate-limiting on the worker side bounds the damage to one
  // duplicate per minute per instance.
  writeCursor({
    sessions: (cursor.sessions || 0) + payload.sessionsDelta,
    tokens:   (cursor.tokens   || 0) + payload.tokensDelta,
    ts: payload.ts,
  }, cursorPath);

  return {
    ok: true,
    delta: { sessions: payload.sessionsDelta, tokens: payload.tokensDelta },
  };
}
