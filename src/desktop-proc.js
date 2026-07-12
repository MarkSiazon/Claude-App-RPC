// "Is the Claude Desktop App running?" — process-level detection.
//
// Parallel to claude-proc.js (which detects Claude Code), this module detects
// the Claude Desktop App (the Electron/UWP chat application). The two are
// deliberately kept separate so they can't cross-match:
//   - claude-proc.js EXCLUDES paths containing 'anthropicclaude' / 'claude.app/'
//   - this module REQUIRES those markers (or the Windows UWP package path)
//
// Detection is conservative: a bare `claude.exe` without desktop-app path
// markers returns false — ambiguous processes are left to claude-proc.js.
//
// Privacy: process paths are used ONLY for matching. They are never logged,
// stored, or sent to Discord. Only a boolean "running" verdict leaves this
// module (plus an optional window title and start time for idle detection).

import { execText } from './claude-proc.js';

// Does this (name, command line) pair look like the Claude Desktop App?
// Exported for tests. Pure function — no IO.
export function looksLikeClaudeDesktop(name, cmdline) {
  const n = String(name || '').toLowerCase();
  const c = String(cmdline || '').replace(/\\/g, '/').toLowerCase();

  // Must be named claude or claude.exe to even consider.
  if (n !== 'claude' && n !== 'claude.exe') return false;

  // Windows UWP (Store app): path contains the package family name.
  // e.g. C:/Program Files/WindowsApps/Claude_pzs8sxrjxfjjc/claude.exe
  if (c.includes('packages/claude_') || c.includes('windowsapps/claude_')) return true;

  // Windows traditional install: AnthropicClaude in AppData.
  // e.g. C:/Users/X/AppData/Local/AnthropicClaude/claude.exe
  if (c.includes('anthropicclaude')) return true;

  // macOS: Claude.app bundle.
  // e.g. /Applications/Claude.app/Contents/MacOS/Claude
  if (c.includes('claude.app/')) return true;

  // Linux (future-proof): Anthropic's desktop app packaging.
  // Snap/Flatpak might use paths like /snap/claude/ or com.anthropic.claude
  if (c.includes('/snap/claude/') || c.includes('com.anthropic.claude')) return true;

  // No recognizable desktop-app path markers — this is ambiguous.
  // Don't match bare `claude.exe` without context (could be Claude Code).
  // If cmdline is empty (platform hid it), still don't claim it — safer to
  // let claude-proc.js handle the fallback.
  return false;
}

// Detect whether the Claude Desktop App is running. Returns:
//   { running: true/false, windowTitle: string|null, startTime: Date|null }
// Returns { running: null, ... } when the query itself failed (unknown state).
// Never throws.
export async function detectClaudeDesktop() {
  const result = { running: null, windowTitle: null, startTime: null };

  if (process.platform === 'win32') {
    // Two-phase detection on Windows:
    // 1. Get the command line of claude.exe processes via CIM to validate the path
    //    matches a known Desktop App location (UWP/AppData/AnthropicClaude).
    // 2. If validated, get the window title + start time from the main-window process.
    // This prevents matching a hypothetical future Claude Code GUI or unrelated exe.
    const cimScript = "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | ForEach-Object { $_.Name + [char]9 + $_.CommandLine }";
    const cimOut = await execText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cimScript]);
    if (cimOut === null) return result;

    let foundDesktop = false;
    for (const line of cimOut.split('\n')) {
      const tab = line.indexOf('\t');
      const name = tab === -1 ? line.trim() : line.slice(0, tab).trim();
      const cmd = tab === -1 ? '' : line.slice(tab + 1);
      if (looksLikeClaudeDesktop(name, cmd)) { foundDesktop = true; break; }
    }

    if (!foundDesktop) {
      result.running = false;
      return result;
    }

    // Confirmed Desktop App — get window title + start time.
    const titleScript = [
      '$p = Get-Process claude -ErrorAction SilentlyContinue |',
      '  Where-Object { $_.MainWindowTitle -ne \'\' };',
      'if ($p) {',
      '  $p | Select-Object -First 1 |',
      '  ForEach-Object {',
      '    $_.MainWindowTitle + [char]9 + $_.StartTime.ToString(\'o\')',
      '  }',
      '} else { Write-Output \'\' }',
    ].join(' ');

    const titleOut = await execText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', titleScript]);
    result.running = true;
    if (titleOut) {
      const line = titleOut.trim();
      const tab = line.indexOf('\t');
      if (tab !== -1) {
        result.windowTitle = line.slice(0, tab) || null;
        const timeStr = line.slice(tab + 1);
        if (timeStr) {
          const d = new Date(timeStr);
          if (!isNaN(d.getTime())) result.startTime = d;
        }
      } else if (line) {
        result.windowTitle = line;
      }
    }
    return result;
  }

  // macOS
  if (process.platform === 'darwin') {
    // Check if Claude.app is running via ps.
    const psOut = await execText('ps', ['-eo', 'comm=,args=']);
    if (psOut === null) return result;

    let found = false;
    for (const line of psOut.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const sp = trimmed.indexOf(' ');
      const comm = sp === -1 ? trimmed : trimmed.slice(0, sp);
      const args = sp === -1 ? '' : trimmed.slice(sp + 1);
      const base = comm.slice(comm.lastIndexOf('/') + 1);
      if (looksLikeClaudeDesktop(base, args)) { found = true; break; }
    }

    if (!found) {
      result.running = false;
      return result;
    }

    result.running = true;

    // Try to get window title via osascript (best-effort, may fail without
    // accessibility permissions — that's fine, we still know it's running).
    const title = await execText('osascript', [
      '-e', 'tell application "System Events" to get name of first window of (first process whose name is "Claude")',
    ]);
    if (title) result.windowTitle = title.trim() || null;

    return result;
  }

  // Linux — check via ps, similar to macOS.
  const psOut = await execText('ps', ['-eo', 'comm=,args=']);
  if (psOut === null) return result;

  let found = false;
  for (const line of psOut.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(' ');
    const comm = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const args = sp === -1 ? '' : trimmed.slice(sp + 1);
    const base = comm.slice(comm.lastIndexOf('/') + 1);
    if (looksLikeClaudeDesktop(base, args)) { found = true; break; }
  }

  result.running = found;
  return result;
}
