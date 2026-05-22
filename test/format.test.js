// applyIdle and buildVars — the two functions every push tick depends on.
// applyIdle decides what the visible status is; buildVars produces the
// template-substitution table. Bugs here = wrong card text or stuck states.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { applyIdle, buildVars, fillTemplate, framePasses } = await import('../src/format.js');

const now = () => Date.now();

function baseState(overrides = {}) {
  return {
    sessionStart: now(),
    lastActivity: now(),
    status: 'working',
    cwd: '/tmp/proj',
    model: 'claude-opus-4-7',
    messages: 1,
    tools: 1,
    filesEdited: [],
    filesRead: [],
    filesOpened: [],
    tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
    toolBreakdown: {},
    claudeClosed: false,
    ...overrides,
  };
}

// ── applyIdle ──────────────────────────────────────────────────────────

test('applyIdle: claudeClosed=true returns stale immediately', () => {
  const s = baseState({ claudeClosed: true, lastActivity: now() });
  const r = applyIdle(s, { staleSessionMin: 5 });
  assert.equal(r.status, 'stale');
  assert.equal(r.cwd, '');
  assert.equal(r.messages, 0);
  assert.equal(r.currentTool, null);
  assert.equal(r.claudeClosed, true, 'flag preserved through subsequent ticks');
});

test('applyIdle: working stays working with fresh activity', () => {
  const s = baseState({ status: 'working' });
  const r = applyIdle(s, { staleSessionMin: 5 });
  assert.equal(r.status, 'working');
});

test('applyIdle: notification expires after window', () => {
  const past = now() - 30_000;
  const s = baseState({ status: 'notification', lastNotification: past });
  const r = applyIdle(s, { notificationWindowSec: 8, staleSessionMin: 5 });
  assert.notEqual(r.status, 'notification', 'should fall through after window');
});

test('applyIdle: stale when no activity AND no live sessions', () => {
  const past = now() - 10 * 60 * 1000; // 10 minutes ago
  const s = baseState({ lastActivity: past, liveSessions: [] });
  const r = applyIdle(s, { staleSessionMin: 5 });
  assert.equal(r.status, 'stale');
});

test('applyIdle: borrows live transcript when local state stale', () => {
  const past = now() - 10 * 60 * 1000;
  const recent = now() - 30_000;
  const s = baseState({
    lastActivity: past,
    liveSessions: [{ cwd: '/tmp/other', mtime: recent }],
  });
  const r = applyIdle(s, { staleSessionMin: 5 });
  assert.equal(r.status, 'working', 'should resurrect from disk activity');
  assert.equal(r.cwd, '/tmp/other');
});

test('applyIdle: respects legacy state with no claudeClosed field', () => {
  const s = baseState();
  delete s.claudeClosed;
  const r = applyIdle(s, { staleSessionMin: 5 });
  assert.equal(r.status, 'working', 'undefined flag is falsy, no crash');
});

// ── buildVars ──────────────────────────────────────────────────────────

test('buildVars: produces core session vars', () => {
  const s = baseState({ currentTool: 'Edit', currentFile: 'src/scanner.js' });
  const vars = buildVars(s, { appName: 'Claude Code' }, {});
  assert.equal(vars.project, 'proj');
  assert.equal(vars.modelPretty, 'Opus 4.7');
  assert.equal(vars.currentToolPretty, 'Edit');
  assert.equal(vars.currentFilePretty, 'src/scanner.js');
  assert.equal(vars.messages, 1);
  assert.equal(vars.appName, 'Claude Code');
});

test('buildVars: derives fileLang/fileExt from currentFile', () => {
  const s = baseState({ currentFile: 'src/foo/bar.tsx' });
  const vars = buildVars(s, {}, {});
  assert.equal(vars.fileExt, '.tsx');
  assert.equal(vars.fileLang, 'TypeScript');
  assert.equal(vars.fileLangUpper, 'TYPESCRIPT');
  assert.equal(vars.dirName, 'foo');
});

test('buildVars: token total includes cache', () => {
  const s = baseState({
    tokens: { input: 100, output: 50, cacheRead: 20, cacheWrite: 5 },
  });
  const vars = buildVars(s, {}, {});
  assert.equal(vars.tokens, 175, 'grand total includes all four buckets');
});

test('buildVars: aggregate vars zeroed when no aggregate', () => {
  const vars = buildVars(baseState(), {}, null);
  assert.equal(vars.allSessions, 0);
  assert.equal(vars.allHours, '0h');
  // Empty streak renders as "no streak" (the friendly fallback) rather than
  // a literal "0 days" — better for the card.
  assert.equal(vars.streakLabel, 'no streak');
});

// ── fillTemplate ───────────────────────────────────────────────────────

test('fillTemplate: substitutes known vars', () => {
  const out = fillTemplate('Hello {name}!', { name: 'world' });
  assert.equal(out, 'Hello world!');
});

test('fillTemplate: leaves unknown vars as-is', () => {
  const out = fillTemplate('Hello {unknown}', { name: 'world' });
  assert.equal(out, 'Hello {unknown}');
});

test('fillTemplate: passes non-string through', () => {
  assert.equal(fillTemplate(null, {}), null);
  assert.equal(fillTemplate(undefined, {}), undefined);
  assert.equal(fillTemplate(42, {}), 42);
});

// ── framePasses ────────────────────────────────────────────────────────

test('framePasses: no requires → always true', () => {
  assert.equal(framePasses({}, {}), true);
});

test('framePasses: requires array fails on any empty/zero value', () => {
  const vars = { a: 1, b: 0, c: '' };
  assert.equal(framePasses({ requires: 'a' }, vars), true);
  assert.equal(framePasses({ requires: 'b' }, vars), false, 'zero is falsy');
  assert.equal(framePasses({ requires: 'c' }, vars), false, 'empty string is falsy');
  assert.equal(framePasses({ requires: ['a', 'b'] }, vars), false, 'any falsy fails');
});

test('framePasses: em-dash counts as falsy (used for empty fallbacks)', () => {
  assert.equal(framePasses({ requires: 'x' }, { x: '—' }), false);
});
