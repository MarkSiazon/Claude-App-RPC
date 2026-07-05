// looksLikeClaudeCode — the matcher behind OS-level "is Claude Code running?"
// detection. The stakes are asymmetric: a false NEGATIVE just falls back to
// the old transcript-only behavior (card clears while idle), but a false
// POSITIVE — most dangerously, matching the claude-rpc daemon itself — would
// keep the card up forever after Claude Code exits.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { looksLikeClaudeCode } = await import('../src/claude-proc.js');

test('matches the native binary by process name when no command line is visible', () => {
  assert.equal(looksLikeClaudeCode('claude.exe', ''), true);
  assert.equal(looksLikeClaudeCode('claude', ''), true);
  assert.equal(looksLikeClaudeCode('CLAUDE.EXE', null), true, 'case-insensitive');
});

test('matches a bare `claude` command line (argv[0] as typed in a shell)', () => {
  assert.equal(looksLikeClaudeCode('claude', 'claude'), true);
  assert.equal(looksLikeClaudeCode('claude.exe', 'claude --continue'), true);
});

test('does NOT match the Claude DESKTOP app (also named claude.exe)', () => {
  assert.equal(looksLikeClaudeCode('claude.exe',
    '"C:\\Users\\o\\AppData\\Local\\AnthropicClaude\\app-0.9.2\\claude.exe" --autostart'), false);
  assert.equal(looksLikeClaudeCode('Claude',
    '/Applications/Claude.app/Contents/MacOS/Claude'), false);
});

test('matches npm/npx installs by @anthropic-ai/claude-code in the command line', () => {
  assert.equal(looksLikeClaudeCode('node.exe',
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\o\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"'), true);
  assert.equal(looksLikeClaudeCode('node',
    'node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js --resume'), true);
});

test('matches a native-binary command line path ending in claude(.exe)', () => {
  assert.equal(looksLikeClaudeCode('node.exe', 'C:\\Users\\o\\.local\\bin\\claude.exe'), true);
  assert.equal(looksLikeClaudeCode('', '"/Users/o/.local/bin/claude" --continue'), true);
});

test('matches the native installer version store', () => {
  assert.equal(looksLikeClaudeCode('2.1.39',
    '/home/o/.local/share/claude/versions/2.1.39 --print'), true);
});

test('does NOT match claude-rpc itself (daemon, hook, cli)', () => {
  assert.equal(looksLikeClaudeCode('node.exe',
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\o\\Documents\\GitHub\\claude-rpc\\src\\daemon.js"'), false);
  assert.equal(looksLikeClaudeCode('node',
    'node /home/o/node_modules/claude-rpc/src/hook.js SessionStart'), false);
  assert.equal(looksLikeClaudeCode('claude-rpc.exe',
    'C:\\Users\\o\\AppData\\Roaming\\claude-rpc\\bin\\claude-rpc.exe daemon'), false);
});

test('does NOT match unrelated processes or a bare "claude" substring', () => {
  assert.equal(looksLikeClaudeCode('node.exe', 'node C:\\work\\my-claude-tools\\index.js'), false);
  assert.equal(looksLikeClaudeCode('chrome.exe', '"C:\\Program Files\\chrome.exe" https://claude.ai'), false);
  assert.equal(looksLikeClaudeCode('', ''), false);
  assert.equal(looksLikeClaudeCode(null, null), false);
});
