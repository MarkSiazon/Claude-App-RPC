// Global presence snooze — `claude-rpc pause [30m|2h]` / `claude-rpc resume`.
//
// Privacy controls are per-cwd; this is the orthogonal "I'm screen-sharing
// for an hour" switch. The CLI writes a tiny { until } marker and the daemon
// checks it on every push tick, clearing the Discord card while the deadline
// is in the future. Expiry is passive: once `until` passes, the next tick
// resumes presence — no timer, no daemon restart, nothing to clean up.

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { PAUSE_PATH, STATE_DIR } from './paths.js';

const DEFAULT_PAUSE_MS = 60 * 60 * 1000; // bare `pause` = 1 hour

// Parse a human duration: "30m", "2h", "1h30m", or a bare number (minutes).
// Returns milliseconds, or null when the input doesn't parse / is <= 0.
export function parseDuration(raw) {
  if (raw == null || raw === '') return DEFAULT_PAUSE_MS;
  const s = String(raw).trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const min = Number(s);
    return min > 0 ? min * 60_000 : null;
  }
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const ms = (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60_000;
  return ms > 0 ? ms : null;
}

export function setPause(ms, { path = PAUSE_PATH, now = Date.now() } = {}) {
  const until = now + ms;
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify({ until }));
  return until;
}

export function clearPause({ path = PAUSE_PATH } = {}) {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
  } catch { /* already gone, or unwritable tmp — either way not paused anymore */ }
  return false;
}

// Epoch ms the pause runs until, or 0 when not paused (missing file,
// unreadable JSON, or a deadline already in the past).
export function pauseUntil({ path = PAUSE_PATH, now = Date.now() } = {}) {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const until = Number(raw?.until);
    return Number.isFinite(until) && until > now ? until : 0;
  } catch {
    return 0;
  }
}
