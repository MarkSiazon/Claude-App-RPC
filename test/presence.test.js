// presence.js — the frame-selection / rotation / large-image logic lifted out
// of daemon.js (which can't be imported under test). These are the most
// regression-prone bits of the Discord payload, previously untested.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { makeRotationCursor, pickFrames, selectFrame, resolveLargeImageKey, shouldShowGithubButton, pickActiveSession, throttleDecision } =
  await import('../src/presence.js');

// ── pickFrames ─────────────────────────────────────────────────────────
test('pickFrames: byStatus base + rotation renders base first', () => {
  const p = { byStatus: { idle: { details: 'Idle', state: 'S', largeImageText: 'L',
    rotation: [{ details: 'R1' }, { details: 'R2' }] } } };
  const { frames, largeImageTextTpl } = pickFrames(p, 'idle');
  assert.equal(frames.length, 3);
  assert.deepEqual(frames[0], { details: 'Idle', state: 'S', largeImageText: 'L' });
  assert.equal(frames[1].details, 'R1');
  assert.equal(largeImageTextTpl, 'L');
});

test('pickFrames: byStatus single frame (no rotation)', () => {
  const { frames } = pickFrames({ byStatus: { working: { details: 'W', state: 'X' } } }, 'working');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].details, 'W');
});

test('pickFrames: falls back to legacy top-level rotation, then a single frame', () => {
  assert.deepEqual(pickFrames({ rotation: [{ details: 'A' }] }, 'idle').frames, [{ details: 'A' }]);
  assert.deepEqual(pickFrames({ details: 'D', state: 'E' }, 'idle').frames, [{ details: 'D', state: 'E' }]);
});

// ── selectFrame ────────────────────────────────────────────────────────
const pass = () => true; // framePasses stub: every frame passes

test('selectFrame: first tick after a status change stays on the BASE frame (#5)', () => {
  const cursor = makeRotationCursor();
  const frames = [{ details: 'base' }, { details: 'r1' }, { details: 'r2' }];
  // Entering a new status: must render index 0, not immediately advance.
  const f = selectFrame(frames, {}, 'idle', cursor, 12000, pass, 1_000_000);
  assert.equal(f.details, 'base');
  assert.equal(cursor.index, 0);
});

test('selectFrame: advances once per interval, wraps around', () => {
  const cursor = makeRotationCursor();
  const frames = [{ details: 'a' }, { details: 'b' }];
  let now = 1_000_000;
  assert.equal(selectFrame(frames, {}, 'idle', cursor, 12000, pass, now).details, 'a'); // seed
  now += 5000;  // < interval: no advance
  assert.equal(selectFrame(frames, {}, 'idle', cursor, 12000, pass, now).details, 'a');
  now += 8000;  // crosses interval since lastAt
  assert.equal(selectFrame(frames, {}, 'idle', cursor, 12000, pass, now).details, 'b');
  now += 12000; // wraps back to a
  assert.equal(selectFrame(frames, {}, 'idle', cursor, 12000, pass, now).details, 'a');
});

test('selectFrame: a single frame never advances', () => {
  const cursor = makeRotationCursor();
  const f1 = selectFrame([{ details: 'solo' }], {}, 'working', cursor, 12000, pass, 0);
  const f2 = selectFrame([{ details: 'solo' }], {}, 'working', cursor, 12000, pass, 999999);
  assert.equal(f1.details, 'solo');
  assert.equal(f2.details, 'solo');
  assert.equal(cursor.index, 0);
});

test('selectFrame: filters by requires, keeping the base frame if all fail', () => {
  const cursor = makeRotationCursor();
  const frames = [{ details: 'base' }, { details: 'gated', requires: ['x'] }];
  const framePasses = (f) => !(f.requires && f.requires.length); // only the base passes
  const f = selectFrame(frames, {}, 'idle', cursor, 12000, framePasses, 0);
  assert.equal(f.details, 'base', 'gated frame dropped, base survives');
});

test('selectFrame: resets the cursor on a status transition', () => {
  const cursor = makeRotationCursor();
  // Advance within idle...
  let now = 0;
  selectFrame([{ details: 'a' }, { details: 'b' }], {}, 'idle', cursor, 10, pass, now);
  now += 100;
  selectFrame([{ details: 'a' }, { details: 'b' }], {}, 'idle', cursor, 10, pass, now);
  assert.equal(cursor.index, 1, 'advanced within idle');
  // ...switching to working resets to the base frame.
  const f = selectFrame([{ details: 'work' }], {}, 'working', cursor, 10, pass, now + 100);
  assert.equal(cursor.index, 0);
  assert.equal(cursor.status, 'working');
  assert.equal(f.details, 'work');
});

// ── resolveLargeImageKey ───────────────────────────────────────────────
test('resolveLargeImageKey: statusAssets > modelAssets > global', () => {
  const config = {
    statusAssets: { working: 'work-gif' },
    modelAssets: { opus: 'opus-art', sonnet: 'sonnet-art', default: 'default-art' },
  };
  const p = { largeImageKey: 'global' };
  // statusAssets wins.
  assert.equal(resolveLargeImageKey(config, p, 'working', 'claude-opus-4-8'), 'work-gif');
  // no statusAssets entry → modelAssets by tier.
  assert.equal(resolveLargeImageKey(config, p, 'idle', 'claude-opus-4-8'), 'opus-art');
  assert.equal(resolveLargeImageKey(config, p, 'idle', 'claude-sonnet-4-6'), 'sonnet-art');
  // unknown model tier → modelAssets.default.
  assert.equal(resolveLargeImageKey(config, p, 'idle', 'mystery'), 'default-art');
});

test('resolveLargeImageKey: never uses model art when stale; global fallback', () => {
  const config = { modelAssets: { opus: 'opus-art' } };
  assert.equal(resolveLargeImageKey(config, { largeImageKey: 'global' }, 'stale', 'claude-opus-4-8'), 'global');
  assert.equal(resolveLargeImageKey({}, { largeImageKey: 'global' }, 'idle', 'claude-opus-4-8'), 'global');
  assert.equal(resolveLargeImageKey({}, {}, 'idle', null), null);
});

// ── shouldShowGithubButton ─────────────────────────────────────────────
test('shouldShowGithubButton: default shows for a public, non-stale cwd', () => {
  assert.equal(shouldShowGithubButton({}, { status: 'working', _privacy: { visibility: 'public' } }), true);
  assert.equal(shouldShowGithubButton({}, { status: 'idle' }), true);
});

test('shouldShowGithubButton: presence.githubButton:false is an absolute off switch', () => {
  // The privacy fix: kills the button even on a public repo with no gh CLI.
  assert.equal(shouldShowGithubButton({ githubButton: false }, { status: 'working', _privacy: { visibility: 'public' } }), false);
});

test('shouldShowGithubButton: suppressed when stale or under any non-public privacy verdict', () => {
  assert.equal(shouldShowGithubButton({}, { status: 'stale' }), false);
  assert.equal(shouldShowGithubButton({}, { status: 'working', _privacy: { visibility: 'hidden' } }), false);
  assert.equal(shouldShowGithubButton({}, { status: 'working', _privacy: { visibility: 'name-only' } }), false);
});

// ── pickActiveSession (multi-session stickiness) ───────────────────────
const IDLE = 60_000;
test('pickActiveSession: empty → nulls', () => {
  assert.deepEqual(pickActiveSession([], null, 1_000_000, IDLE), { state: null, sessionId: null, liveCount: 0 });
});

test('pickActiveSession: single session is always shown', () => {
  const now = 1_000_000;
  const r = pickActiveSession([{ sessionId: 'a', lastActivity: now, cwd: '/a' }], null, now, IDLE);
  assert.equal(r.sessionId, 'a');
  assert.equal(r.liveCount, 1);
});

test('pickActiveSession: sticks to the shown session while it stays active', () => {
  const now = 1_000_000;
  const states = [
    { sessionId: 'a', lastActivity: now - 5_000 },  // shown, still active
    { sessionId: 'b', lastActivity: now - 1_000 },  // slightly more recent
  ];
  // Already showing 'a' and it's still within the idle window → DON'T thrash to b.
  const r = pickActiveSession(states, 'a', now, IDLE);
  assert.equal(r.sessionId, 'a', 'stays on a (no flip-flop while you work in it)');
  assert.equal(r.liveCount, 2);
});

test('pickActiveSession: switches once the shown session goes idle', () => {
  const now = 1_000_000;
  const states = [
    { sessionId: 'a', lastActivity: now - 90_000 }, // shown, now idle (> IDLE)
    { sessionId: 'b', lastActivity: now - 2_000 },  // active elsewhere
  ];
  const r = pickActiveSession(states, 'a', now, IDLE);
  assert.equal(r.sessionId, 'b', 'switches to where you are now active');
  assert.equal(r.liveCount, 1, 'only b is live');
});

test('pickActiveSession: with no prior selection, shows the most-recently-active', () => {
  const now = 1_000_000;
  const states = [
    { sessionId: 'a', lastActivity: now - 30_000 },
    { sessionId: 'b', lastActivity: now - 3_000 },
  ];
  assert.equal(pickActiveSession(states, null, now, IDLE).sessionId, 'b');
});

test('pickActiveSession: all idle → follows the most-recent rather than blanking', () => {
  const now = 1_000_000;
  const states = [
    { sessionId: 'a', lastActivity: now - 200_000 },
    { sessionId: 'b', lastActivity: now - 120_000 },
  ];
  const r = pickActiveSession(states, 'x', now, IDLE);
  assert.equal(r.sessionId, 'b', 'most-recent overall when none are live');
  assert.equal(r.liveCount, 0);
});

// ── throttleDecision (Discord SET_ACTIVITY rate-limit guard) ───────────
const GAP = 4000;

test('throttleDecision: identical hash → skip (wire already shows it)', () => {
  const d = throttleDecision({ hash: 'A', lastSentHash: 'A', lastSentAt: 1000, now: 9_999_999, gapMs: GAP, flushPending: false });
  assert.deepEqual(d, { action: 'skip', waitMs: 0 });
});

test('throttleDecision: first write ever (lastSentAt 0) sends immediately', () => {
  const d = throttleDecision({ hash: 'A', lastSentHash: '', lastSentAt: 0, now: 50_000, gapMs: GAP, flushPending: false });
  assert.equal(d.action, 'send');
});

test('throttleDecision: gap elapsed, nothing queued → send', () => {
  const now = 100_000;
  const d = throttleDecision({ hash: 'B', lastSentHash: 'A', lastSentAt: now - GAP, now, gapMs: GAP, flushPending: false });
  assert.equal(d.action, 'send');
});

test('throttleDecision: inside the gap → defer with the remaining wait', () => {
  const now = 100_000;
  const d = throttleDecision({ hash: 'B', lastSentHash: 'A', lastSentAt: now - 1000, now, gapMs: GAP, flushPending: false });
  assert.equal(d.action, 'defer');
  assert.equal(d.waitMs, GAP - 1000, 'flushes when the gap expires');
});

test('throttleDecision: gap elapsed but a flush is already queued → still defer (no double-send)', () => {
  const now = 100_000;
  const d = throttleDecision({ hash: 'C', lastSentHash: 'A', lastSentAt: now - GAP, now, gapMs: GAP, flushPending: true });
  assert.equal(d.action, 'defer');
  assert.equal(d.waitMs, 0, 'the armed flush fires this tick with the latest payload');
});

test('throttleDecision: a burst coalesces — each change re-defers to the latest, one flush', () => {
  // Simulate the daemon: first change sends (lastSentAt then becomes `base`);
  // the next changes within the gap all defer (the daemon overwrites
  // pendingSend with the latest each time and arms exactly one flush timer).
  const base = 1_000_000;
  const sent = throttleDecision({ hash: 'h1', lastSentHash: '', lastSentAt: 0, now: base, gapMs: GAP, flushPending: false });
  assert.equal(sent.action, 'send');
  let flushPending = false;
  for (let i = 2; i <= 10; i++) {
    const d = throttleDecision({ hash: `h${i}`, lastSentHash: 'h1', lastSentAt: base, now: base + i * 100, gapMs: GAP, flushPending });
    assert.equal(d.action, 'defer', `change ${i} defers rather than hammering Discord`);
    flushPending = true; // the daemon arms exactly one timer for the burst
  }
});
