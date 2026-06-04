# Launch Board

A tiny local app to draft, queue, and post **build-in-public** updates to **your own X account**. You connect your account once; then you (in the browser) or Claude (from the CLI) can post. Everything stays on your machine — credentials live in `.data/` (gitignored) and only ever go to `api.x.com`.

This is your own megaphone — not community posting. It will only ever post to the account whose tokens you paste in.

## 1. Create an X app + get 4 keys (~2 minutes, one time)

X requires the app owner (you) to do this — it's tied to your X login.

1. Go to **https://developer.x.com/en/portal/dashboard** and sign in. If prompted, sign up for **Free** access (enough for ~500 posts/month).
2. Create a **Project + App** (any name).
3. Open the app → **Settings → User authentication settings → Set up**:
   - **App permissions: Read and write** ← required to post
   - App type: *Web App / Automated App or Bot*
   - Callback URL + Website URL: anything valid, e.g. `https://claude-rpc.vercel.app` (not used by this flow, but the form requires it)
   - Save.
4. Open the app → **Keys and tokens**:
   - Copy **API Key** and **API Key Secret** (the "consumer" keys).
   - Under **Access Token and Secret**, click **Generate**, copy **Access Token** and **Access Token Secret**.
   - ⚠️ If you generated the access token *before* setting permissions to Read+Write, regenerate it — it bakes in the permission level.

## 2. Run the board

```sh
node tools/launch-board/server.js      # → http://localhost:8787
```

By default the board binds to **loopback only (`127.0.0.1`)** — it is *not*
reachable from the LAN or your tailnet, because anyone who reaches it could
post to your X account. On startup it prints an **open URL with a one-time
token** and the token itself, e.g.:

```
  open:      http://localhost:8787/?token=ab12…cd
  token:     ab12…cd
  bind:      127.0.0.1 (loopback only — set HOST=0.0.0.0 to expose on LAN/Tailscale)
```

Open that URL. The served page embeds the token automatically, so composing
and posting from the browser just works. Paste the 4 keys under
**X account → Connect & verify** (confirms `@yourhandle`), then compose →
**Post now**, or **Add to queue**.

### Auth & exposure

- **Token.** Every mutating request (connect / queue / post / delete) requires
  the token via the `X-Auth-Token` header (the browser page sends it for you)
  or a `?token=` query param. A fresh random token is generated each startup;
  pin a stable one with `LAUNCH_BOARD_TOKEN=…` if you want the URL to survive
  restarts. Read-only `GET`s stay open on the loopback bind.
- **Host-header allowlist.** Requests whose `Host` header isn't
  `localhost`/`127.0.0.1` (plus this machine's own LAN/Tailscale IPs *only when
  you opt into a non-loopback bind*) are rejected with `403`. This blocks
  DNS-rebinding attacks where a malicious web page tries to reach the board.
- **Exposing on LAN/Tailscale (opt-in).** Set `HOST=0.0.0.0` (or a specific
  interface IP) to bind non-loopback. The startup banner then prints the
  reachable network URLs (with token). The token is your only gate in that
  mode — keep it secret.

## 3. Let Claude post

Once connected, Claude can post from the terminal:

```sh
node tools/launch-board/post.js "shipped v0.13 — npx claude-rpc setup 🎉"
node tools/launch-board/post.js --next     # post the next queued draft
node tools/launch-board/post.js --list     # show the queue
```

So the workflow is: **Claude drafts into the queue → you glance at the board → Claude (or you) posts.**

## Notes
- Free tier limits posting (~500/month, ~17/day). Plenty for a drip; if you hit limits, Basic is ~$100/mo.
- **Plaintext creds.** `.data/creds.json` stores your 4 X keys *in plaintext*
  on your machine (the queue lives next to it in `.data/queue.json`). The
  directory is gitignored, but anyone with read access to your filesystem can
  read the keys — revoke anytime in the X portal (Keys and tokens →
  Regenerate). `post.js` reads the same `.data/creds.json` directly.
- The board defaults to a **loopback bind** and gates all posting behind a
  startup **token** (see *Auth & exposure* above).
- Not published to npm (the package `files` list excludes `tools/`).
