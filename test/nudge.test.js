// src/nudge.js — milestone share-nudge selection + once-only dedup.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { pickShareNudge, maybeNudge } = await import('../src/nudge.js');

test('pickShareNudge: nothing crossed → null', () => {
  assert.equal(pickShareNudge({ sessions: 12, activeMs: 3.6e6 * 10, streak: 2, longestStreak: 2 }), null);
  assert.equal(pickShareNudge(null), null);
});

test('pickShareNudge: a streak record surfaces the streak milestone', () => {
  const n = pickShareNudge({ streak: 7, longestStreak: 7, sessions: 10, activeMs: 0 });
  assert.equal(n.key, 'streak:7');
  assert.match(n.message, /7-day streak/);
});

test('pickShareNudge: a non-record streak is NOT celebrated', () => {
  // streak below longest → mid-decline, no streak nudge (sessions too low too)
  assert.equal(pickShareNudge({ streak: 5, longestStreak: 14, sessions: 10, activeMs: 0 }), null);
});

test('pickShareNudge: picks the single biggest milestone (streak outranks sessions)', () => {
  const n = pickShareNudge({ streak: 30, longestStreak: 30, sessions: 100, activeMs: 3.6e6 * 60 });
  assert.equal(n.key, 'streak:30', 'streak record beats sessions/hours by weight');
});

test('pickShareNudge: rounds down to the largest reached milestone', () => {
  const n = pickShareNudge({ streak: 0, longestStreak: 0, sessions: 740, activeMs: 0 });
  assert.equal(n.key, 'sessions:500');
});

test('pickShareNudge: hours milestone when sessions/streak are quiet', () => {
  const n = pickShareNudge({ streak: 0, longestStreak: 0, sessions: 10, activeMs: 3.6e6 * 260 });
  assert.equal(n.key, 'hours:250');
});

test('maybeNudge: respects the config off-switch', () => {
  const agg = { streak: 7, longestStreak: 7 };
  assert.equal(maybeNudge(agg, { nudges: { enabled: false } }, { path: join(tmpdir(), 'crpc-nudge-off.json') }), null);
});

test('maybeNudge: shows once, then dedupes the same milestone', () => {
  const path = join(tmpdir(), `crpc-nudge-${process.pid}-${Math.floor(performance.now())}.json`);
  const agg = { streak: 14, longestStreak: 14, sessions: 10, activeMs: 0 };
  const first = maybeNudge(agg, {}, { path });
  assert.match(first || '', /14-day streak/, 'first call shows the nudge');
  const second = maybeNudge(agg, {}, { path });
  assert.equal(second, null, 'same milestone is not shown again');
});
