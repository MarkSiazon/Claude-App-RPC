# Changelog

All notable changes to claude-rpc. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

_No changes yet._

## [0.6.0] - 2026-05-23

Polish pass. Install once, never think about it again.

**Highlights**

- Default Discord clientId ships working. `setup` test-fires a real `SessionStart` hook through the same launcher Claude Code uses and prints `hook pipe ✓ …` on success — a broken hook command can't hide until the next session.
- `claude-rpc` with no args is now a one-screen overview (daemon state, today/streak, four most useful next-step commands). Full help moved to `--help`.
- `--version` / `-V` / `-v` print `claude-rpc <version>`, sourced from `package.json` with a baked fallback for SEA builds.
- `claude-rpc upgrade-config` exposes the idempotent config migration directly.
- Unknown commands exit 1 with a hint to `--help` (was silently exit 0 with the help dump).
- Every failure surface (`backfill`, `badge`, `card`, unknown command, missing aggregate) prints a `↳` hint pointing at the next step — usually `claude-rpc doctor`.
- Exit codes documented in `--help`: 0 ok / 1 user error / 2 system error / 3 wrong state.

**Resilience**

- Bad / missing `config.json` no longer hard-exits the daemon. Parse errors log one line and fall back to baked defaults — a mid-edit save from the Electron GUI can't brick anything.
- Discord reconnect uses exponential backoff (5s → 10s → 20s → … cap 5min) with ±30% jitter, resetting to base on a successful connect. The old fixed 10s loop pounded the IPC socket forever when Discord was closed.
- `daemon.log` rotates at 5MB to `daemon.log.1` — same policy `events.jsonl` already used.
- A 30s mtime-poll fallback alongside `fs.watch` catches state/aggregate changes when Windows drops watcher events on atomic-rename writes.

**Internals**

- `loadConfig` deep-merges the user's `config.json` over `DEFAULT_CONFIG` (objects merge, arrays replace) — user file can be `{ "clientId": "..." }` and everything else picks up shipped defaults.
- `config.example.json` trimmed to a comment + clientId.
- `pricingKeyFor` anchored on the explicit `opus`/`sonnet`/`haiku` token between dashes instead of `String.includes`. A hypothetical `claude-sonneteer-x` model id no longer silently routes to sonnet pricing via a substring match; dated `-YYYYMMDD` suffixes are ignored.
- `src/ui.js` centralises the SYM_OK/SYM_FAIL/SYM_WARN/SYM_INFO + colour table that `doctor.js` already had; `cli.js` and `doctor.js` now share it.
- Image-precedence cascade (statusAssets → modelAssets → presence.largeImageKey) documented in one place at the resolution site.
- `card` poster's tape sticker reads the current version instead of the hardcoded `v0.4`.
- Every empty `catch {}` in `src/` carries a one-line justification comment (no silent failures without intent).
- `src/server/page.js` (1,277 LOC, four sibling string blocks) gained a TOC at the top and §1–§4 section markers.

**README**

- Rewritten. First 200 words are what / who / install. One install path leads (Windows portable exe — 4 lines to working presence); other platforms and "use your own Discord app" moved to `<details>`. Drift-prone "What's new in v0.2.0" callout removed. Command table reconciled — added `doctor`, `card`, `backfill`, `private`/`public`/`privacy`, `upgrade-config`. Troubleshooting leads with `claude-rpc doctor`.

**Tests**

- 81 → 134 tests. New coverage for `format.humanModel / humanTool / humanProject / fmtNum / fmtDuration / fmtHours / plural`, `languages.languageOf`, `insights.generateInsights`, `scanner.dayKey / weekKey / hourKey`, `state.readState / writeState / updateState / resetState`, `server/api.windowedAggregate / rangeToDays`, `server/page.buildHtml`, and a live route-walker over the dashboard. Every public `src/*.js` export is exercised at least once.
