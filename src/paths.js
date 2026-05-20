import { homedir, tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(__dirname, '..');
export const CONFIG_PATH = join(ROOT, 'config.json');
export const STATE_DIR = join(tmpdir(), 'claude-rpc');
export const STATE_PATH = join(STATE_DIR, 'state.json');
export const PID_PATH = join(STATE_DIR, 'daemon.pid');
export const LOG_PATH = join(STATE_DIR, 'daemon.log');
export const DATA_DIR = join(homedir(), '.claude-rpc');
export const AGGREGATE_PATH = join(DATA_DIR, 'aggregate.json');
export const SCAN_CACHE_PATH = join(DATA_DIR, 'scan-cache.json');
export const CLAUDE_HOME = join(homedir(), '.claude');
export const CLAUDE_PROJECTS = join(CLAUDE_HOME, 'projects');
export const CLAUDE_SETTINGS = join(CLAUDE_HOME, 'settings.json');
export const HOOK_SCRIPT = join(ROOT, 'src', 'hook.js');
export const DAEMON_SCRIPT = join(ROOT, 'src', 'daemon.js');
