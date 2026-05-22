// Privacy resolution + applyPrivacy. The interesting cases are the
// resolution chain (per-project file > runtime list > config patterns >
// gh-private auto-detect > default) and the three visibility outputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { applyPrivacy, resolveVisibility } = await import('../src/privacy.js');

function baseState(overrides = {}) {
  return {
    status: 'working',
    cwd: '/home/foo/projects/proj',
    currentFile: 'src/scanner.js',
    currentTool: 'Edit',
    filesEdited: ['/x.js'],
    filesRead: [],
    filesOpened: ['/x.js'],
    tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
    messages: 1,
    ...overrides,
  };
}

test('default visibility is public — no privacy flag set', () => {
  const r = resolveVisibility('/tmp/no-config-here-xyz', {});
  assert.equal(r.visibility, 'public');
  assert.equal(r.reason, 'default');
});

test('config pattern triggers hidden mode', () => {
  const cfg = { privacy: { patterns: ['client-*'], mode: 'hidden', autoDetectGithubPrivate: false } };
  const r = resolveVisibility('/home/foo/work/client-acme', cfg);
  assert.equal(r.visibility, 'hidden');
  assert.match(r.reason, /client-\*/);
});

test('config pattern with mode=name-only honors the chosen mode', () => {
  const cfg = { privacy: { patterns: ['secret'], mode: 'name-only', autoDetectGithubPrivate: false } };
  const r = resolveVisibility('/some/path/secret', cfg);
  assert.equal(r.visibility, 'name-only');
});

test('per-project file wins over global config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-priv-'));
  try {
    writeFileSync(join(dir, '.claude-rpc.json'), JSON.stringify({
      visibility: 'name-only',
      projectName: 'client-acme',
    }));
    const cfg = { privacy: { patterns: ['*'], mode: 'hidden', autoDetectGithubPrivate: false } };
    const r = resolveVisibility(dir, cfg);
    assert.equal(r.visibility, 'name-only', 'per-project file overrides config patterns');
    assert.equal(r.projectName, 'client-acme');
    assert.equal(r.reason, '.claude-rpc.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shortcut: { "private": true } resolves to hidden', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-priv-'));
  try {
    writeFileSync(join(dir, '.claude-rpc.json'), JSON.stringify({ private: true }));
    const r = resolveVisibility(dir, { privacy: { autoDetectGithubPrivate: false } });
    assert.equal(r.visibility, 'hidden');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('broken .claude-rpc.json is ignored gracefully', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-priv-'));
  try {
    writeFileSync(join(dir, '.claude-rpc.json'), '{not valid json');
    const r = resolveVisibility(dir, { privacy: { autoDetectGithubPrivate: false } });
    assert.equal(r.visibility, 'public', 'broken JSON ≡ no override');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPrivacy: public is a no-op', () => {
  const s = baseState();
  const r = applyPrivacy(s, { privacy: { autoDetectGithubPrivate: false } });
  // No _privacy block, original fields intact.
  assert.equal(r.currentFile, 'src/scanner.js');
  assert.equal(r.currentTool, 'Edit');
});

test('applyPrivacy: name-only clears file/tool but keeps cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-priv-'));
  try {
    writeFileSync(join(dir, '.claude-rpc.json'), JSON.stringify({ visibility: 'name-only' }));
    const r = applyPrivacy(baseState({ cwd: dir }), {});
    assert.equal(r._privacy.visibility, 'name-only');
    assert.equal(r.currentTool, null);
    assert.equal(r.currentFile, null);
    assert.deepEqual(r.filesEdited, []);
    assert.equal(r.cwd, dir, 'cwd preserved so {project} still renders');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPrivacy: hidden clears cwd entirely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-priv-'));
  try {
    writeFileSync(join(dir, '.claude-rpc.json'), JSON.stringify({ private: true }));
    const r = applyPrivacy(baseState({ cwd: dir }), {});
    assert.equal(r._privacy.visibility, 'hidden');
    assert.equal(r.cwd, '');
    assert.equal(r.currentFile, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPrivacy: projectName aliases the cwd basename for public projects too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-priv-'));
  try {
    writeFileSync(join(dir, '.claude-rpc.json'), JSON.stringify({
      visibility: 'public',
      projectName: 'cool-codename',
    }));
    const r = applyPrivacy(baseState({ cwd: dir }), {});
    // cwd's last segment is replaced with the alias so buildVars's {project}
    // picks it up. File paths and tools still flow through normally.
    assert.match(r.cwd, /cool-codename$/);
    assert.equal(r.currentFile, 'src/scanner.js');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPrivacy: skips stale state', () => {
  const s = baseState({ status: 'stale' });
  const r = applyPrivacy(s, {});
  assert.equal(r, s, 'stale states pass through untouched');
});
