// pause.js — the global presence snooze. Pure file-marker logic; the daemon
// side is just "pauseUntil() truthy → clearActivity", covered by reading the
// marker the same way the daemon does (via an explicit path override).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { parseDuration, setPause, clearPause, pauseUntil } = await import('../src/pause.js');

function tmpMarker() {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-pause-'));
  return { dir, path: join(dir, 'pause.json') };
}

test('parseDuration: minutes, hours, combined, bare numbers, default', () => {
  assert.equal(parseDuration('30m'), 30 * 60_000);
  assert.equal(parseDuration('2h'), 2 * 3_600_000);
  assert.equal(parseDuration('1h30m'), 90 * 60_000);
  assert.equal(parseDuration('45'), 45 * 60_000, 'bare number = minutes');
  assert.equal(parseDuration(undefined), 60 * 60_000, 'default 1h');
  assert.equal(parseDuration(''), 60 * 60_000);
});

test('parseDuration: rejects junk and zero', () => {
  assert.equal(parseDuration('soon'), null);
  assert.equal(parseDuration('0'), null);
  assert.equal(parseDuration('0m'), null);
  assert.equal(parseDuration('-5m'), null);
});

test('setPause / pauseUntil / clearPause round-trip', () => {
  const { dir, path } = tmpMarker();
  const now = Date.now();
  const until = setPause(30 * 60_000, { path, now });
  assert.equal(until, now + 30 * 60_000);
  assert.equal(pauseUntil({ path, now }), until, 'active pause reports its deadline');
  assert.equal(clearPause({ path }), true);
  assert.equal(pauseUntil({ path, now }), 0, 'cleared');
  assert.equal(clearPause({ path }), false, 'second clear is a no-op');
  rmSync(dir, { recursive: true });
});

test('pauseUntil: expired deadline and garbage marker read as not-paused', () => {
  const { dir, path } = tmpMarker();
  const now = Date.now();
  setPause(1000, { path, now: now - 5000 }); // until = now - 4000, in the past
  assert.equal(pauseUntil({ path, now }), 0, 'expired pause is over');
  writeFileSync(path, 'not json');
  assert.equal(pauseUntil({ path, now }), 0, 'unreadable marker fails open');
  rmSync(dir, { recursive: true });
});

test('pauseUntil: missing file is not paused', () => {
  assert.equal(pauseUntil({ path: '/no/such/dir/pause.json' }), 0);
});
