# claude-rpc community-totals worker

A Cloudflare Worker that accepts opt-in counters from `claude-rpc` installs
and serves running totals as shields-style SVG badges. Powers the
**community · sessions** / **community · tokens** badges on the main
`claude-rpc` README.

The source lives in this repo so the privacy story is auditable: there is
no telemetry endpoint anywhere else.

## Leaderboard / public profiles (opt-in)

A second, separate opt-in (`claude-rpc profile`) publishes a public profile to
a leaderboard. Endpoints:

- `POST /profile` — upsert a profile (handle, display name, optional GitHub user)
  plus **server-validated** usage deltas. The board only ever sums deltas the
  worker accepted — never a client-asserted total.
- `GET /leaderboard?metric=tokens|sessions|activeMs|streak&limit=N` — top-N.
- `POST /verify/start` / `POST /verify/check` — GitHub verification via a public
  gist (the worker confirms a one-time token appears in one of the user's gists,
  then sets the verified ✓).

**Trust model (hybrid).** Self-reported usage can't be made fraud-*proof* — there
is no oracle for real token counts — so integrity is defense-in-depth:
per-report plausibility caps (`MAX_DELTA_*`), per-IP + per-instance rate limits,
**verified profiles rank above every unverified one**, and unverified token
counts are capped for ranking so a fake entry can't top the board. Verification
ties the ✓ to a real, attributable GitHub account. The board is best-effort and
unauthenticated by design.

## What it stores

Single KV namespace bound as `TOTALS`:

| Key                  | Value                                            | TTL     |
| -------------------- | ------------------------------------------------ | ------- |
| `total:sessions`     | running sum of `sessionsDelta` across all opt-ins | none   |
| `total:tokens`       | running sum of `tokensDelta` across all opt-ins   | none   |
| `seen:<instanceId>`  | last-seen metadata (`ts`, `version`, `osFamily`)  | 30 days |
| `rate:<instanceId>`  | per-instance rate-limiter marker                 | 60s     |
| `rate:ip:<ip>:<win>` | per-IP fixed-window report counter               | 60s     |

No IP addresses, paths, prompts, models, costs, or repos are *persisted as
analytics*. The per-IP rate-limiter does derive a short-lived KV key from
`CF-Connecting-IP` purely for abuse mitigation; it carries only a count and
expires within a minute. The validator in `validateReport` strictly checks
the schema below and rejects anything else.

### Trust model

These totals are **unauthenticated and best-effort**. Anyone can `POST /report`,
so the numbers are a community vanity metric, not an audited figure. We defend
against casual abuse with per-report magnitude caps (`MAX_DELTA_*`), a
per-instance rate limit, and a per-IP fixed-window limit (20 reports/IP/minute),
but a determined actor can still inflate the counters. The increment itself is a
best-effort KV read-modify-write (no atomic increment), so under concurrency a
report can rarely be lost; true atomicity would require Durable Objects. Treat
the totals as approximate.

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
