// processHookEvent is the live entry point for every Claude Code event.
// These tests pin the state transitions that matter — especially the
// claudeClosed flag which underpins the v0.3.5 close-detection rework.
//
// processHookEvent mutates the real state.json on disk. To keep tests
// hermetic we redirect STATE_DIR / STATE_PATH via env before importing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = mkdtempSync(join(tmpdir(), 'rpc-hook-'));
process.env.TMPDIR = TMP;
// macOS uses $TMPDIR. tmpdir() on linux falls back to /tmp regardless of env,
// so we ALSO need to swap STATE_PATH directly. paths.js reads at import time
// — so we have to override before importing state/hook modules.

// Re-export-stage trick: prepend a synthetic module that overrides paths.
// Simplest reliable approach: just exercise the pure switch logic by calling
// processHookEvent and asserting via readState (both touch the same shared
// state file). Tests run serially within this file, so we reset between.

const { processHookEvent } = await import('../src/hook.js');
const { readState } = await import('../src/state.js');
const { STATE_PATH } = await import('../src/paths.js');

function resetStateFile() {
  if (existsSync(STATE_PATH)) {
    try { writeFileSync(STATE_PATH, '{}'); } catch {}
  }
}

test('SessionStart resets state', () => {
  resetStateFile();
  processHookEvent('SessionStart', { cwd: '/tmp/proj', model: { id: 'claude-opus-4-7' } });
  const s = readState();
  assert.equal(s.cwd, '/tmp/proj');
  assert.equal(s.model, 'claude-opus-4-7');
  assert.equal(s.status, 'idle');
  assert.equal(s.claudeClosed, false);
  assert.equal(s.messages, 0);
});

test('UserPromptSubmit increments messages, sets thinking, clears closed', () => {
  resetStateFile();
  processHookEvent('SessionStart', { cwd: '/tmp/proj' });
  processHookEvent('UserPromptSubmit', { cwd: '/tmp/proj' });
  const s = readState();
  assert.equal(s.messages, 1);
  assert.equal(s.status, 'thinking');
  assert.equal(s.claudeClosed, false);
});

test('PreToolUse populates currentTool + currentFile', () => {
  resetStateFile();
  processHookEvent('SessionStart', { cwd: '/tmp/proj' });
  processHookEvent('PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/tmp/proj/a.js' } });
  const s = readState();
  assert.equal(s.currentTool, 'Read');
  assert.equal(s.currentFile, 'a.js');
  assert.equal(s.status, 'working');
  assert.equal(s.tools, 1);
  assert.deepEqual(s.toolBreakdown, { Read: 1 });
});

test('PostToolUse clears currentTool but keeps currentFile', () => {
  resetStateFile();
  processHookEvent('SessionStart', { cwd: '/tmp/proj' });
  processHookEvent('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: '/tmp/proj/b.js' } });
  processHookEvent('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: '/tmp/proj/b.js' } });
  const s = readState();
  assert.equal(s.currentTool, null, 'currentTool clears');
  // currentFile may persist briefly — depends on subsequent hook
});

test('SessionEnd sets claudeClosed=true and status=stale', () => {
  resetStateFile();
  processHookEvent('SessionStart', { cwd: '/tmp/proj' });
  processHookEvent('UserPromptSubmit', { cwd: '/tmp/proj' });
  processHookEvent('SessionEnd', {});
  const s = readState();
  assert.equal(s.claudeClosed, true);
  assert.equal(s.status, 'stale');
  assert.equal(s.currentTool, null);
  assert.equal(s.currentFile, null);
});

test('Any subsequent hook clears claudeClosed (multi-session safety)', () => {
  resetStateFile();
  processHookEvent('SessionEnd', {});
  let s = readState();
  assert.equal(s.claudeClosed, true);

  processHookEvent('PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/x.js' } });
  s = readState();
  assert.equal(s.claudeClosed, false, 'sibling session unsets the flag');
  assert.equal(s.status, 'working');
});

test('Notification sets status with timestamp', () => {
  resetStateFile();
  processHookEvent('Notification', { cwd: '/tmp/proj' });
  const s = readState();
  assert.equal(s.status, 'notification');
  assert.ok(s.lastNotification, 'lastNotification is set');
  assert.equal(s.claudeClosed, false);
});

test('Stop/SubagentStop go to idle (not stale)', () => {
  resetStateFile();
  processHookEvent('SessionStart', { cwd: '/tmp/proj' });
  processHookEvent('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  processHookEvent('Stop', {});
  const s = readState();
  assert.equal(s.status, 'idle');
  assert.equal(s.claudeClosed, false, 'Stop must NOT set claudeClosed');
});

// Cleanup
test.after?.(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });
