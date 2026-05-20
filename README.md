# claude-rpc

Discord Rich Presence for [Claude Code](https://claude.com/claude-code).
Shows your current model, project, tokens, active session, and lifetime stats
in your Discord profile — driven by Claude Code's hook system, so no polling.

```
  Playing Claude Code
  Working in CLAUDE
  Opus 4.7
  00:23 elapsed
  [Claude Code]
```

## Features

- **Live status** — Discord shows the model, project, current tool/file, and
  token counts as you work
- **Status-driven art** — large image swaps between working / thinking / idle /
  stale / notification (use uploaded asset keys or external URLs)
- **Rotation frames** — your presence cycles through whatever you configure
  (today's stats, streak, top file, lifetime totals, etc.)
- **Auto-GitHub button** — when your cwd is a git repo with a github origin,
  a "View on GitHub" button is automatically added
- **All-time aggregates** — incremental scanner over `~/.claude/projects/*.jsonl`
  computes active time, prompts, tools, tokens, streaks, peak hour, hotspots
- **CLI dashboard** — `claude-rpc status` prints a sleek terminal dashboard
  with a 13-week heatmap, hour-of-day histogram, top tools / files / projects
- **Web dashboard** — `claude-rpc serve` opens a local web UI with the same
  data
- **Config GUI** — `dashboard/` is an Electron app for editing timing and
  rotation frames visually; compiles to a portable `.exe`

## Requirements

- Node 18+
- Discord desktop app (the RPC IPC server only runs in the desktop client)
- Claude Code (the CLI), with hook support

## Install

```sh
git clone https://github.com/<you>/claude-rpc.git
cd claude-rpc
npm install
cp config.example.json config.json
```

## Discord app setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and create a new application. Name it something like `Claude Code`.
2. Copy the **Application ID** into `config.json` under `clientId`.
3. (Optional) Under **Rich Presence → Art Assets**, upload images and name
   them `claude`, `working`, `thinking`, `idle`, `notification`. These map to
   the asset keys in `statusAssets` and `presence.largeImageKey`.
4. Alternatively, replace those asset keys with direct URLs (e.g.
   `"https://example.com/working.gif"`); modern Discord clients fetch them
   through their media proxy.

## Run

```sh
node ./src/cli.js setup      # install hooks into ~/.claude/settings.json
node ./src/cli.js start      # launch the daemon (detached)
node ./src/cli.js status     # CLI dashboard
node ./src/cli.js serve      # local web dashboard
```

If you symlink or `npm link` the package, all of the above become
`claude-rpc <command>`.

Open Claude Code in any project — the hooks fire on `SessionStart`,
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, and
`SessionEnd`, and the daemon pushes updated presence to Discord within a
second.

## Commands

| Command   | Description                                                        |
|-----------|--------------------------------------------------------------------|
| `setup`   | Install hooks into `~/.claude/settings.json`                       |
| `uninstall` | Remove hooks                                                     |
| `start`   | Start the daemon (detached)                                        |
| `stop`    | Stop the daemon                                                    |
| `restart` | Stop then start                                                    |
| `status`  | Print current session + all-time dashboard                         |
| `today`   | Today's stats + 24h histogram                                      |
| `week`    | This week's stats + daily breakdown                                |
| `serve`   | Open the local web dashboard (port 47474)                          |
| `preview` | Show how each rotation frame renders right now                     |
| `scan`    | Incrementally rescan `~/.claude/projects` for aggregates           |
| `rescan`  | Force re-parse every transcript                                    |
| `tail`    | Tail the daemon log                                                |
| `daemon`  | Run the daemon in the foreground (for debugging)                   |

## Config GUI

A small Electron app for editing timing and rotation frames lives in
`dashboard/`. It reads and writes `config.json` directly; the daemon
hot-reloads.

```sh
cd dashboard
npm install
npm start                      # dev mode
npm run build                  # produces dist/claude-rpc-dashboard.exe (Windows portable)
```

## Configuration

`config.json` keys, all optional unless noted:

| Key                       | Default  | Notes                                              |
|---------------------------|----------|----------------------------------------------------|
| `clientId`                | —        | **Required.** Discord application ID               |
| `updateIntervalMs`        | `4000`   | How often the daemon pushes to Discord             |
| `rotationIntervalMs`      | `12000`  | How fast rotation frames cycle                     |
| `rescanIntervalSec`       | `300`    | How often transcripts are re-aggregated            |
| `idleThresholdSec`        | `60`     | No activity for this long → status `idle`          |
| `staleSessionMin`         | `720`    | No activity for this long → status `stale`         |
| `notificationWindowSec`   | `8`      | How long the `notification` status sticks          |
| `showElapsed`             | `true`   | Whether to include the elapsed timer               |
| `activityType`            | `0`      | `0` Playing, `2` Listening, `3` Watching, `5` Competing |
| `statusAssets`            | `{}`     | Image per status (working / thinking / idle / stale / notification) |
| `presence.largeImageKey`  | —        | Fallback large image when no `statusAssets` match  |
| `presence.largeImageText` | —        | Tooltip on hover                                   |
| `presence.smallImageKey`  | —        | Small badge in the corner of the large image      |
| `presence.smallImageText` | —        | Tooltip on hover                                   |
| `presence.rotation`       | `[]`     | Array of frames, each `{ details, state, requires? }` |
| `presence.buttons`        | `[]`     | Up to 2 `{ label, url }` buttons                   |
| `statusIcons`             | `{}`     | Small image key per status (empty string hides it) |

### Rotation frames

Each frame in `presence.rotation` has:

- `details` — bold first line (Discord max 128 chars)
- `state` — lighter second line (Discord max 128 chars)
- `requires` — optional. A variable name or array of names; the frame is
  skipped if any required variable is empty / `0`. Lets you have
  context-dependent frames (e.g. only show the "current tool" frame when
  there's actually a tool running).

### Template variables

Both `details` and `state` (and button labels and URLs) support `{name}`
substitution. Some commonly useful ones:

| Variable                | Sample              |
|-------------------------|---------------------|
| `{statusVerbose}`       | `Working`           |
| `{project}`             | `CLAUDE`            |
| `{modelPretty}`         | `Opus 4.7`          |
| `{currentToolPretty}`   | `Edit`              |
| `{currentFilePretty}`   | `src/app/page.tsx`  |
| `{tokensFmt}`           | `2.3k`              |
| `{messagesLabel}`       | `8 prompts`         |
| `{projectSessionLabel}` | `Session #1`        |
| `{projectHours}`        | `22m`               |
| `{todayHours}`          | `56m`               |
| `{weekHours}`           | `3.1h`              |
| `{streakLabel}`         | `7-day streak`      |
| `{daysSinceFirstLabel}` | `Day 31`            |
| `{allHours}`            | `52h`               |
| `{allTokensFmt}`        | `2.82B`             |
| `{peakHour}`            | `22:00`             |
| `{topEditedFile}`       | `index.html`        |

Run `node ./src/cli.js preview` to see every frame rendered with your real
data, including which ones would be hidden by their `requires`.

## How it works

Three cooperating pieces, glued together by JSON files on disk:

1. **Hook script** (`src/hook.js`) — installed into `~/.claude/settings.json`
   as a Claude Code lifecycle hook. Claude Code spawns it on every lifecycle
   event; it parses the event JSON from stdin and mutates the shared state
   file at `%TEMP%/claude-rpc/state.json` (linux: `/tmp/claude-rpc/...`).
2. **Daemon** (`src/daemon.js`) — long-running background process. Connects
   to Discord's local IPC, watches the state file + periodic transcript
   scans, and pushes presence frames to Discord every few seconds.
3. **Scanner** (`src/scanner.js`) — walks `~/.claude/projects/**/*.jsonl`
   transcripts to compute all-time aggregates (active time, prompts, tool
   calls, tokens, streaks, hour-of-day, top files / projects). Cached at
   `~/.claude-rpc/aggregate.json` so subsequent scans are incremental.

Persistent state:
- `%TEMP%/claude-rpc/state.json` — current session state, volatile
- `~/.claude-rpc/aggregate.json` — all-time aggregates
- `~/.claude-rpc/scan-cache.json` — per-transcript scan cache
- `~/.claude/settings.json` — hook registrations (managed by `claude-rpc setup`)

## Troubleshooting

**Discord not picking up presence.** Make sure Discord desktop is running
(the IPC bridge isn't available in the browser client) and that `clientId`
matches your Discord application. `node ./src/cli.js tail` shows daemon
errors live.

**Hooks don't fire.** Run `node ./src/cli.js setup` and check the `hooks`
section of `~/.claude/settings.json`. Restart Claude Code afterwards so it
re-reads the hooks.

**Elapsed timer resets on rotation.** Make sure you're on the current
version — older builds passed timestamps in seconds, Discord expects
milliseconds.

## License

[MIT](LICENSE)
