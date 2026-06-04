// Share nudges — the gentle half of the viral loop. When you cross a genuine
// milestone (a streak record, a round number of sessions or hours), the CLI
// offers a one-liner to share it. Deliberately conservative:
//
//   - Only ever surfaces the single biggest *new* milestone, and only once
//     (deduped by key in a tiny state file). Crossing nothing new → silence.
//   - Off-switch: config.nudges.enabled === false.
//   - Never throws and never blocks — it's the last thing printed, best-effort.
//
// pickShareNudge is pure (aggregate, lastKey) → nudge|null, so it's unit-tested
// without touching disk.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { STATE_DIR } from './paths.js';

const NUDGE_STATE = join(STATE_DIR, 'nudge-state.json');

// Largest milestone in `list` that `value` has reached, or null.
function reached(value, list) {
  let hit = null;
  for (const m of list) if (value >= m) hit = m;
  return hit;
}

const fmt = (n) => n >= 1000 ? n.toLocaleString('en-US') : String(n);

// Returns { key, weight, message } for the biggest milestone the aggregate has
// crossed, or null. `weight` ranks across milestone types so we only ever show
// the single most impressive one.
export function pickShareNudge(agg) {
  if (!agg || typeof agg !== 'object') return null;
  const out = [];

  const streak = agg.streak || 0;
  const longest = agg.longestStreak || 0;
  // Only celebrate a streak when it's also a personal record — otherwise the
  // "share your streak" prompt fires mid-decline, which feels off.
  if (streak >= 3 && streak === longest) {
    const m = reached(streak, [3, 7, 14, 30, 50, 100, 200, 365]);
    if (m) out.push({
      key: `streak:${m}`, weight: 1000 + m,
      message: `${m}-day streak — a personal record. Drop a live badge in your README: \`claude-rpc badge --metric streak --gist\``,
    });
  }

  const sessions = agg.sessions || 0;
  const s = reached(sessions, [50, 100, 250, 500, 1000, 2500, 5000, 10000]);
  if (s) out.push({
    key: `sessions:${s}`, weight: s / 50,
    message: `${fmt(s)} Claude Code sessions logged. Show it off: \`claude-rpc card --range all --out claude.svg\` (or --gist for a live one).`,
  });

  const hours = Math.floor((agg.activeMs || 0) / 3_600_000);
  const h = reached(hours, [50, 100, 250, 500, 1000, 2000, 5000]);
  if (h) out.push({
    key: `hours:${h}`, weight: h,
    message: `${fmt(h)}+ hours on Claude Code. Your year-in-review is ready — \`claude-rpc serve\` then open /wrapped and hit Share.`,
  });

  if (!out.length) return null;
  out.sort((a, b) => b.weight - a.weight);
  return out[0];
}

function readLastKey(path = NUDGE_STATE) {
  try { return JSON.parse(readFileSync(path, 'utf8')).key || null; }
  catch { return null; }
}

function writeLastKey(key, path = NUDGE_STATE) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ key, ts: Date.now() }));
  } catch { /* best-effort */ }
}

// Resolve a nudge to print right now, honoring the config gate and once-only
// dedup. Returns a string to print, or null. Marks the nudge as shown.
export function maybeNudge(agg, config = {}, { path = NUDGE_STATE } = {}) {
  if (config?.nudges?.enabled === false) return null;
  const n = pickShareNudge(agg);
  if (!n) return null;
  if (n.key === readLastKey(path)) return null;   // already shown this one
  writeLastKey(n.key, path);
  return n.message;
}
