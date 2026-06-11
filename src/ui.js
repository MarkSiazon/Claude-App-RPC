// Shared CLI output primitives.
//
// Three duplicates of the same ANSI table + symbol set existed in cli.js,
// doctor.js, and tui.js. This is the one place; everything else imports.
//
// All output goes to stdout/stderr via console.log/console.error. The
// daemon's file-bound `log()` is a separate concern (no tty, no color)
// and stays in src/daemon.js — these helpers are for human-facing
// surfaces only.
//
// Standard exit codes (also documented in --help):
//   0  success
//   1  user error  — bad args, unknown command, malformed input
//   2  system error — IO failed, Discord unreachable, etc.
//   3  wrong state — daemon already running, no aggregate yet, etc.

import process from 'node:process';

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;

export const c = {
  reset:   TTY ? '\x1b[0m'  : '',
  dim:     TTY ? '\x1b[2m'  : '',
  bold:    TTY ? '\x1b[1m'  : '',
  red:     TTY ? '\x1b[31m' : '',
  green:   TTY ? '\x1b[32m' : '',
  yellow:  TTY ? '\x1b[33m' : '',
  blue:    TTY ? '\x1b[34m' : '',
  magenta: TTY ? '\x1b[35m' : '',
  cyan:    TTY ? '\x1b[36m' : '',
  gray:    TTY ? '\x1b[90m' : '',
};

export const SYM_OK   = TTY ? `${c.green}✓${c.reset}`  : '[ok]  ';
export const SYM_FAIL = TTY ? `${c.red}✗${c.reset}`    : '[fail]';
export const SYM_WARN = TTY ? `${c.yellow}!${c.reset}` : '[warn]';
export const SYM_INFO = TTY ? `${c.cyan}·${c.reset}`   : '[info]';

// Standard exit-code values. Use these instead of process.exit(1) so
// intent is visible in the source.
export const EX_OK         = 0;
export const EX_USER_ERROR = 1;
export const EX_SYS_ERROR  = 2;
export const EX_BAD_STATE  = 3;

// Hint lines sit directly under the message they belong to, aligned with the
// label (the symbol column differs between TTY glyphs and [fail]-style tags).
const HINT_INDENT = ' '.repeat(TTY ? 5 : 10);

export function hintLine(text, stream = process.stdout) {
  stream.write(`${HINT_INDENT}${c.gray}↳ ${text}${c.reset}\n`);
}

// Print a one-line message plus aligned dim hint line(s) below it. A hint is
// the tired-user safety net: it tells you what to type next. Accepts a single
// string or an array (one ↳ line each); empty omits them.
function withHint(sym, label, hint, stream = process.stdout) {
  stream.write(`  ${sym}  ${label}\n`);
  const hints = Array.isArray(hint) ? hint : (hint ? [hint] : []);
  for (const h of hints) hintLine(h, stream);
}

export function ok(label, detail = '') {
  process.stdout.write(`  ${SYM_OK}  ${label}${detail ? `  ${c.dim}${detail}${c.reset}` : ''}\n`);
}

export function info(label, detail = '') {
  process.stdout.write(`  ${SYM_INFO}  ${label}${detail ? `  ${c.dim}${detail}${c.reset}` : ''}\n`);
}

export function warn(label, hint = '') {
  withHint(SYM_WARN, label, hint);
}

// Print a failure with an optional hint and exit with the given code. Hints
// must be contextual: point at `claude-rpc doctor` only for local wiring or
// state problems it actually diagnoses — for usage errors, remote rejections,
// and network failures, give a directly useful hint or none at all.
export function fail(label, { hint = '', code = EX_USER_ERROR } = {}) {
  withHint(SYM_FAIL, label, hint, process.stderr);
  process.exit(code);
}

// Return the last n lines of a log file's raw text, trimming the trailing
// empty element that split('\n') produces when the file ends with a newline.
// When the file lacks a trailing newline the last element is the last real
// line — the old raw.slice(-31,-1) pattern silently dropped it.
export function tailLines(raw, n = 30) {
  const lines = raw.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-n);
}

// Compatibility with doctor.js's existing API. Same `check(label, status,
// detail, hint)` signature; doctor.js can switch its private copy out for
// this without behavior change.
export function check(label, status, detail = '', hint = '') {
  let sym;
  if (status === 'pass')      sym = SYM_OK;
  else if (status === 'fail') sym = SYM_FAIL;
  else if (status === 'warn') sym = SYM_WARN;
  else                        sym = SYM_INFO;
  const tail = detail ? `  ${c.dim}${detail}${c.reset}` : '';
  process.stdout.write(`  ${sym}  ${label}${tail}\n`);
  if (hint && status !== 'pass') hintLine(hint);
}
