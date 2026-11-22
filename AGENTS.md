# AGENTS.md

Repository-local guidance for `Claude-App-RPC` (`MarkSiazon/Claude-App-RPC`, fork of `rar-file/claude-rpc`).

## Overview and layout

Node.js (`>=18`, ESM `"type": "module"`, zero runtime dependencies in root `package.json`) daemon, CLI, and Claude Code hook handler for Discord Rich Presence, plus companion desktop, worker, extension, and static site packages.

- `bin/claude-rpc.js` and `src/` — CLI (`cli.js`), Discord IPC daemon (`daemon.js`, `discord-ipc.js`), Claude Code hook entrypoint (`hook.js`), transcript scanner (`scanner.js`), defaults (`default-config.js`), and pricing tables (`pricing.js`).
- `dashboard/` — Electron desktop settings GUI (`claude-rpc-dashboard`).
- `worker/` — Cloudflare Worker (`claude-rpc-totals-worker`, Wrangler) serving opt-in community totals and public profile badges/cards.
- `site/` — static web site, blog, docs, and install scripts.
- `vscode-extension/` — VS Code extension sources.
- `test/` and `scripts/` — test runner (`run-tests.mjs`), SEA executable build (`build-exe.js`), and dashboard bundling (`prep-dashboard.js`).

## Key commands

| Task | Command |
|---|---|
| Run root tests | `npm test` (`node ./scripts/run-tests.mjs`) |
| Lint JS sources | `npm run lint` (`eslint src test vscode-extension`) |
| Check formatting | `npm run format:check` (`prettier --check "src/**/*.js" "test/**/*.js"`) |
| Typecheck (JSDoc/JS) | `npm run typecheck` (`tsc -p jsconfig.json`) |
| Run worker tests | `npm --prefix worker test` (`node --test test/*.test.js`) |
| Launch Electron GUI | `npm run dashboard` (`npm --prefix dashboard start`) |

## Operational boundaries and security

- Never read, commit, or print user runtime state or credentials (`~/.claude-rpc/*`, `~/.claude/settings.json`, `%APPDATA%\claude-rpc\config.json`, or local `config.json`).
- Keep installer integrity verification and pinned artifact checks intact (`SECURITY.md`); preserve the minimal anonymous telemetry schema in `worker/src/index.js` (`sessionsDelta`, `tokensDelta`, version, OS family, anonymous UUID v4).
- When the main checkout has concurrent working-tree edits, use an isolated worktree for scoped changes instead of staging across dirty files.
