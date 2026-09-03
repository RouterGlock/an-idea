# An Idea ☝️💡 — Claude Code handoff

You are finishing deployment of a small PWA. Everything is already built; your job is to get it live on Cloudflare Pages, push it to GitHub, and verify it works end-to-end. Do not redesign the app or change the visual style unless asked.

## What this is
An Instagram-style feed of AI-generated idea cards (pick a topic → 5 cards → like / save / share, daily streak). Single-file frontend, one Pages Function, Workers AI for generation (free tier, no API key).

- `public/index.html` — entire frontend, no build step
- `public/manifest.json`, `public/sw.js`, `public/icons/` — PWA install + home-screen icon
- `functions/api/ideas.js` — POST `{topic}` → `{cards:[...], model}` via `env.AI.run()`
- `wrangler.toml` — Pages config + `[ai] binding = "AI"`
- `deploy.sh` — the whole deploy in one script

## Tasks, in order

1. **Preflight**
   - `node -v` (need 18+), `npx wrangler --version`, `gh --version`. Install anything missing with Homebrew.
   - `npx wrangler whoami` — if not logged in, run `npx wrangler login` and tell the user to finish it in the browser.
   - `gh auth status` — same deal.

2. **Check Workers AI models are current** (Cloudflare retires models)
   - `npx wrangler ai models list | grep -iE "llama|qwen"`
   - Make sure every entry in `MODELS` in `functions/api/ideas.js` still exists. Replace any that are gone with a current instruct model of similar size. Keep the array order: best quality first, cheapest last.

3. **Deploy**
   - `./deploy.sh` (or run its steps manually). Project name is `an-idea`.
   - Capture the `*.pages.dev` URL it prints.

4. **Verify the API**
   - `curl -s -X POST https://<url>/api/ideas -H 'content-type: application/json' -d '{"topic":"Stoicism"}' | head -c 600`
   - Expect JSON with `cards` (5 objects with title/body/note/source). If you get `AI binding missing`, the `[ai]` block in wrangler.toml didn't apply — open the Pages project in the dashboard → Settings → Bindings and add a Workers AI binding named `AI`, then redeploy.
   - If output is unparseable, the model is ignoring the JSON instruction: try `response_format: { type: 'json_schema', ... }` in the `env.AI.run` call, or move a different model to the front of `MODELS`.

5. **Verify the PWA**
   - `curl -sI https://<url>/manifest.json` returns 200 and `content-type: application/json`.
   - `curl -sI https://<url>/icons/apple-touch-icon.png` returns 200.

6. **GitHub**
   - Confirm `git remote -v` shows the `an-idea` repo and `git status` is clean. If `deploy.sh` skipped this, do: `git init && git add -A && git commit -m "An Idea: initial release" && gh repo create an-idea --private --source=. --push`.

7. **Optional but recommended**
   - Connect the GitHub repo to the Pages project (dashboard → Pages → an-idea → Settings → Builds) so future `git push` auto-deploys.
   - If the user wants a custom domain, add it under Pages → Custom domains.
   - If the URL will be shared publicly, put Cloudflare Access (Zero Trust → Access → Applications) in front of it so strangers can't drain the free daily AI allowance.

## Report back
When done, print a short summary the user can paste into Claude chat:
- live URL
- which model actually served the test request (from the `model` field)
- GitHub repo URL
- anything you had to change and why

## Guardrails
- Never commit secrets. There should be none in this project.
- Don't upgrade to a paid Cloudflare plan or enable anything that bills without asking.
- Keep `public/index.html` a single file with no build step.
