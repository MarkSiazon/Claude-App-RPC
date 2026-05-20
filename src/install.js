// One-shot installer logic invoked by the bundled exe.
// Seeds %APPDATA%\claude-rpc\config.json, points Claude Code's hooks at the
// exe, and registers a Windows startup entry so the daemon comes up on login.

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import {
  CLAUDE_SETTINGS, CONFIG_PATH, USER_CONFIG_DIR, BUNDLED_CONFIG_EXAMPLE,
  HOOK_SCRIPT, IS_PACKAGED,
} from './paths.js';

const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const STARTUP_VALUE = 'ClaudeRPC';

const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'Stop', 'SubagentStop', 'Notification', 'SessionEnd',
];

function readJson(p, fb) {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return fb; }
}

function writeJson(p, d) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(d, null, 2));
}

function isOurHookCommand(cmd) {
  if (!cmd) return false;
  return /claude-rpc/i.test(cmd) || /hook\.js/i.test(cmd);
}

export function installHooks(exePath) {
  const settings = readJson(CLAUDE_SETTINGS, {});
  settings.hooks = settings.hooks || {};
  // Packaged: `"<exe>" hook <event>`. Dev: `node "<src/hook.js>" <event>`.
  const cmdFor = IS_PACKAGED
    ? (event) => `"${exePath}" hook ${event}`
    : (event) => `node "${HOOK_SCRIPT.replace(/\\/g, '/')}" ${event}`;

  for (const event of EVENTS) {
    const bucket = settings.hooks[event] = settings.hooks[event] || [];
    const wanted = cmdFor(event);
    const existingEntry = bucket.find((b) =>
      Array.isArray(b.hooks) && b.hooks.some((h) => isOurHookCommand(h.command))
    );
    if (existingEntry) {
      existingEntry.hooks = existingEntry.hooks.map((h) =>
        isOurHookCommand(h.command) ? { ...h, command: wanted } : h
      );
    } else {
      bucket.push({ matcher: '', hooks: [{ type: 'command', command: wanted }] });
    }
  }
  writeJson(CLAUDE_SETTINGS, settings);
  console.log(`  hooks → ${CLAUDE_SETTINGS}`);
}

export function uninstallHooks() {
  const settings = readJson(CLAUDE_SETTINGS, {});
  if (!settings.hooks) return;
  for (const event of EVENTS) {
    const bucket = settings.hooks[event];
    if (!Array.isArray(bucket)) continue;
    settings.hooks[event] = bucket
      .map((entry) => ({ ...entry, hooks: (entry.hooks || []).filter((h) => !isOurHookCommand(h.command)) }))
      .filter((entry) => (entry.hooks || []).length > 0);
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  writeJson(CLAUDE_SETTINGS, settings);
  console.log(`  hooks removed from ${CLAUDE_SETTINGS}`);
}

function regCommand(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('reg', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => err += d.toString());
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(err || `reg.exe exit ${code}`)));
  });
}

export async function addStartupEntry(exePath) {
  await regCommand([
    'add', STARTUP_KEY,
    '/v', STARTUP_VALUE,
    '/t', 'REG_SZ',
    '/d', `"${exePath}" daemon`,
    '/f',
  ]);
  console.log(`  startup → HKCU\\...\\Run\\${STARTUP_VALUE}`);
}

export async function removeStartupEntry() {
  try {
    await regCommand(['delete', STARTUP_KEY, '/v', STARTUP_VALUE, '/f']);
    console.log(`  startup entry removed`);
  } catch {
    // Already absent — fine.
  }
}

export function seedConfig() {
  if (existsSync(CONFIG_PATH)) {
    console.log(`  config exists → ${CONFIG_PATH}`);
    return false;
  }
  mkdirSync(USER_CONFIG_DIR, { recursive: true });
  if (existsSync(BUNDLED_CONFIG_EXAMPLE)) {
    copyFileSync(BUNDLED_CONFIG_EXAMPLE, CONFIG_PATH);
    console.log(`  config seeded → ${CONFIG_PATH}`);
    return true;
  }
  writeFileSync(CONFIG_PATH, JSON.stringify({ clientId: 'YOUR_DISCORD_CLIENT_ID' }, null, 2));
  console.log(`  empty config → ${CONFIG_PATH}`);
  return true;
}

export async function install({ exePath, withStartup = true } = {}) {
  if (process.platform !== 'win32') {
    console.warn('Note: startup registration only works on Windows; other steps still run.');
  }
  const target = exePath || process.execPath;
  console.log('Installing Claude RPC…');
  seedConfig();
  installHooks(target);
  if (withStartup && process.platform === 'win32') {
    try { await addStartupEntry(target); }
    catch (e) { console.warn(`  startup entry failed: ${e.message}`); }
  }
  console.log('\nDone.');
  console.log(`Edit ${CONFIG_PATH} to set your Discord clientId, then either reboot or run:`);
  console.log(`  "${target}" daemon`);
}

export async function uninstall() {
  console.log('Uninstalling Claude RPC…');
  uninstallHooks();
  if (process.platform === 'win32') await removeStartupEntry();
  console.log('\nDone. (Config at %APPDATA%\\claude-rpc\\ left intact — delete manually if you want.)');
}

export function isInstalled() {
  return IS_PACKAGED && existsSync(CONFIG_PATH);
}
