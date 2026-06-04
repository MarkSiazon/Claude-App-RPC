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

Open it, paste the 4 keys under **X account → Connect & verify**. It'll confirm `@yourhandle`. Then compose → **Post now**, or **Add to queue**.

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
- `.data/creds.json` holds your tokens in plaintext on your machine — it's gitignored. Revoke anytime in the X portal (Keys and tokens → Regenerate).
- Not published to npm (the package `files` list excludes `tools/`).
