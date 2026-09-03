#!/usr/bin/env bash
# One-shot: create Pages project, deploy (Workers AI free tier, no API key), push to GitHub.
# Run from the an-idea folder:  chmod +x deploy.sh && ./deploy.sh
set -e
PROJECT=an-idea
command -v npx >/dev/null || { echo "Install Node first (brew install node)"; exit 1; }

echo "→ Cloudflare login (skips if already logged in)"
npx wrangler whoami >/dev/null 2>&1 || npx wrangler login

echo "→ Create Pages project (ignore 'already exists')"
npx wrangler pages project create $PROJECT --production-branch main 2>/dev/null || true

echo "→ Deploy (AI binding comes from wrangler.toml)"
npx wrangler pages deploy public --project-name $PROJECT --branch main

if command -v gh >/dev/null; then
  echo "→ GitHub"
  git init -q 2>/dev/null || true
  git add -A && git commit -qm "An Idea: initial release" 2>/dev/null || true
  git branch -M main
  gh repo create $PROJECT --private --source=. --push 2>/dev/null || git push -u origin main
else
  echo "gh CLI not found — install with: brew install gh && gh auth login, then re-run"
fi
echo
echo "Done. Open the URL above on your iPhone in Safari → Share → Add to Home Screen."
