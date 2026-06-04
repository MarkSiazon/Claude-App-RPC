// Coverage for public exports that were previously exercised only indirectly
// or not at all: the MCP stdio transport (runMcpServer), the SVG entry-point
// wrappers (calendarSvg/cardSvg/sessionCardSvg), the side-effecting notify
// helpers (postWebhook/desktopNotify), and runDoctor's exit-code contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

const { runMcpServer, toolList } = await import('../src/mcp.js');
const { calendarSvg } = await import('../src/calendar.js');
const { cardSvg } = await import('../src/card.js');
const { sessionCardSvg } = await import('../src/session-card.js');
const { postWebhook, desktopNotify } = await import('../src/notify.js');
const { runDoctor } = await import('../src/doctor.js');

const fakeAgg = {
  activeMs: 100 * 3_600_000,
  sessions: 50,
  userMessages: 1000,
  inputTokens: 1_000_000,
  outputTokens: 200_000,
  cacheReadTokens: 500_000,
  cacheWriteTokens: 50_000,
  linesAdded: 24_000,
  linesRemoved: 6_000,
  estimatedCost: 89.42,
  streak: 23,
  longestStreak: 30,
  daysSinceFirst: 53,
  topEditedFiles: [{ path: 'src/scanner.js', count: 32 }],
  languages: { JavaScript: { edits: 200, files: 12 } },
  byDay: {
    '2026-05-22': { activeMs: 4 * 3_600_000, userMessages: 18, linesAdded: 320, cost: 1.23, inputTokens: 12000, outputTokens: 6000, cacheReadTokens: 4000, cacheWriteTokens: 0, sessions: 1 },
  },
  byWeekday: { 1: { activeMs: 12 * 3_600_000 } },
  peakHour: { hour: 14, activeMs: 20 * 3_600_000 },
};

// ── runMcpServer (stdio JSON-RPC transport) ───────────────────────────
// Drive it with an in-memory PassThrough. We deliberately never end() the
// input stream — runMcpServer calls process.exit(0) on 'end'.
test('runMcpServer: handles initialize / tools.list / ping / unknown / tools.call', async () => {
  const input = new PassThrough();
  let out = '';
  const output = { write: (s) => { out += s; } };
  runMcpServer({ input, output });

  const reqs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'ping' },
    { jsonrpc: '2.0', id: 4, method: 'totally/bogus' },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_today' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' }, // notification: no reply
  ];
  for (const r of reqs) input.write(JSON.stringify(r) + '\n');
  await new Promise((r) => setTimeout(r, 60));

  const byId = Object.fromEntries(
    out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]),
  );
  assert.equal(byId[1].result.serverInfo.name, 'claude-rpc');
  assert.equal(byId[1].result.protocolVersion, '2024-11-05');
  assert.equal(byId[2].result.tools.length, toolList().length);
  assert.ok(byId[2].result.tools.length > 0);
  assert.deepEqual(byId[3].result, {});
  assert.equal(byId[4].error.code, -32601);
  // tools/call always replies with a content array (isError true OR false).
  assert.ok(Array.isArray(byId[5].result.content));
  // Notifications get no reply, so no message carries id === undefined.
  assert.ok(!('undefined' in byId));

  input.destroy(); // emits 'close', not 'end' — won't trip the exit handler
});

// ── SVG entry-point wrappers ──────────────────────────────────────────
test('calendarSvg / cardSvg / sessionCardSvg delegate and return SVG markup', () => {
  const cal = calendarSvg({ aggregate: fakeAgg });
  assert.ok(cal.includes('<svg'), 'calendarSvg returns svg');

  const card = cardSvg({ aggregate: fakeAgg, range: 'month' });
  assert.ok(card.includes('<svg'), 'cardSvg returns svg');
  assert.ok(card.includes('month on claude'), 'cardSvg honors range');

  const sc = sessionCardSvg({ vars: { project: 'claude-rpc', todayHours: '2.5h' } });
  assert.ok(sc.includes('<svg'), 'sessionCardSvg returns svg');
});

test('SVG wrappers tolerate an empty/absent payload without throwing', () => {
  assert.doesNotThrow(() => cardSvg({ aggregate: {}, range: 'year' }));
  assert.doesNotThrow(() => calendarSvg({ aggregate: {} }));
  assert.doesNotThrow(() => sessionCardSvg({}));
});

// ── notify side-effects ───────────────────────────────────────────────
test('postWebhook: POSTs JSON to the url, swallows rejections, never throws', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    calls.push({ url, opts });
    return Promise.reject(new Error('network down')); // must be swallowed
  };
  try {
    assert.doesNotThrow(() => postWebhook('https://example.test/hook', { status: 'working' }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.test/hook');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { status: 'working' });
    // No url → no call.
    postWebhook('', { a: 1 });
    assert.equal(calls.length, 1);
    await new Promise((r) => setImmediate(r)); // let the rejected promise settle
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('desktopNotify: returns a boolean and never throws (missing binary is swallowed)', () => {
  let result;
  assert.doesNotThrow(() => { result = desktopNotify('claude-rpc', 'test body'); });
  assert.equal(typeof result, 'boolean');
});

// ── runDoctor ─────────────────────────────────────────────────────────
test('runDoctor: runs the full checklist and returns a 0|1 exit code', () => {
  const realLog = console.log;
  console.log = () => {}; // silence the checklist output during the test
  try {
    const code = runDoctor();
    assert.ok(code === 0 || code === 1, 'returns a documented exit code');
  } finally {
    console.log = realLog;
  }
});
