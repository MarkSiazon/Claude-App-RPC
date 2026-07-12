import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeClaudeDesktop } from '../src/desktop-proc.js';

describe('looksLikeClaudeDesktop', () => {
  // ── Positive cases ─────────────────────────────────────────────────────

  it('matches Windows UWP (Store app) path', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude.exe', 'C:\\Program Files\\WindowsApps\\Claude_pzs8sxrjxfjjc\\claude.exe'),
      true,
    );
  });

  it('matches Windows UWP via Packages path', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude.exe', 'C:\\Users\\User\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\app\\claude.exe'),
      true,
    );
  });

  it('matches Windows traditional install (AnthropicClaude)', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude.exe', 'C:\\Users\\SomeUser\\AppData\\Local\\AnthropicClaude\\claude.exe'),
      true,
    );
  });

  it('matches macOS Claude.app bundle', () => {
    assert.equal(
      looksLikeClaudeDesktop('Claude', '/Applications/Claude.app/Contents/MacOS/Claude'),
      true,
    );
  });

  it('matches macOS Claude.app with lowercase name', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude', '/Applications/Claude.app/Contents/MacOS/Claude'),
      true,
    );
  });

  it('matches Linux snap path', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude', '/snap/claude/42/bin/claude'),
      true,
    );
  });

  it('matches Linux flatpak path', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude', '/var/lib/flatpak/app/com.anthropic.claude/current/bin/claude'),
      true,
    );
  });

  // ── Negative cases ─────────────────────────────────────────────────────

  it('rejects Claude Code via npm install', () => {
    assert.equal(
      looksLikeClaudeDesktop('node', '/home/user/.nvm/versions/node/v20/bin/node /home/user/node_modules/@anthropic-ai/claude-code/cli.js'),
      false,
    );
  });

  it('rejects Claude Code native installer', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude', '/home/user/.local/share/claude/versions/1.0.3/claude'),
      false,
    );
  });

  it('rejects claude-rpc daemon itself', () => {
    assert.equal(
      looksLikeClaudeDesktop('node', '/home/user/claude-rpc/src/daemon.js'),
      false,
    );
  });

  it('rejects bare claude without desktop-app path markers', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude', 'claude'),
      false,
    );
  });

  it('rejects bare claude.exe without path context', () => {
    assert.equal(
      looksLikeClaudeDesktop('claude.exe', 'claude.exe'),
      false,
    );
  });

  it('rejects empty/null inputs', () => {
    assert.equal(looksLikeClaudeDesktop(null, null), false);
    assert.equal(looksLikeClaudeDesktop('', ''), false);
  });

  it('rejects non-claude process names', () => {
    assert.equal(
      looksLikeClaudeDesktop('discord', 'C:\\Users\\User\\AppData\\Local\\AnthropicClaude\\discord.exe'),
      false,
    );
  });

  it('rejects node process even with desktop-like path', () => {
    // Process name must be claude/claude.exe — not a runtime.
    assert.equal(
      looksLikeClaudeDesktop('node.exe', 'C:\\Users\\User\\AppData\\Local\\AnthropicClaude\\node.exe'),
      false,
    );
  });

  it('rejects claude.exe with no cmdline (ambiguous)', () => {
    // When cmdline is empty, we can't distinguish desktop from Code.
    // Let claude-proc.js handle this case.
    assert.equal(
      looksLikeClaudeDesktop('claude.exe', ''),
      false,
    );
  });
});
