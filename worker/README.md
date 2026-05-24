# claude-rpc community-totals worker

A Cloudflare Worker that accepts opt-in counters from `claude-rpc` installs
and serves running totals as shields-style SVG badges. Powers the
**community · sessions** / **community · tokens** badges on the main
`claude-rpc` README.

The source lives in this repo so the privacy story is auditable: there is
no telemetry endpoint anywhere else.

## What it stores

Single KV namespace bound as `TOTALS`:

| Key                  | Value                                            | TTL     |
| -------------------- | ------------------------------------------------ | ------- |
| `total:sessions`     | running sum of `sessionsDelta` across all opt-ins | none   |
| `total:tokens`       | running sum of `tokensDelta` across all opt-ins   | none   |
| `seen:<instanceId>`  | last-seen metadata (`ts`, `version`, `osFamily`)  | 30 days |
| `rate:<instanceId>`  | rate-limiter marker                              | 60s     |

No IP addresses, paths, prompts, models, costs, or repos are accepted.
The validator in `validateReport` strictly checks the schema below and
rejects anything else.

## Schema

```jsonc
POST /report
{
  "instanceId":     "<uuid v4>",
  "sessionsDelta":  <int 0..100000>,
  "tokensDelta":    <int 0..5000000000>,
  "version":        "<claude-rpc version string>",
  "osFamily":       "linux" | "darwin" | "win32",
  "ts":             <unix ms>
}
```

`ts` is informational; the worker doesn't trust it (server time wins).

## Routes

- `POST /report`        — opt-in counter submission
- `GET  /sessions.svg`  — badge with the running total of sessions
- `GET  /tokens.svg`    — badge with the running total of tokens
- `GET  /total.json`    — JSON of both totals (for dashboards)
- `GET  /health`        — `{ "ok": true, "schemaVersion": 1 }`

Badge responses are cached for 5 minutes at the edge.

## Deploy

```sh
cd worker
npm install                       # pulls wrangler as a devDep
npx wrangler login                # one-time OAuth (browser)
npm run kv:create                 # paste the returned id into wrangler.toml
npm run deploy
```

The CLI's default `community.endpoint` should be updated to the resulting
`*.workers.dev` URL once deployed (see `src/default-config.js` in the main
repo).

## Local dev

```sh
wrangler kv:namespace create TOTALS --preview
# paste the preview_id into wrangler.toml
wrangler dev
```

`wrangler dev` runs an in-process worker on `http://127.0.0.1:8787`.

## Tests

`test/index.test.js` covers `validateReport` plus the route handlers using
an in-memory KV stub. Run via:

```sh
node --test test/*.test.js
```

(no deps needed — pure node test runner against the handlers).
