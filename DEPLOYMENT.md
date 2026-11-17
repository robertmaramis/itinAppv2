# Deploying to Vercel

This app is a static, offline-first PWA — plain HTML/CSS/JS, no build step, no
server. Vercel just needs to serve the files as-is, so there is nothing to
configure beyond what's already in this repo.

## What's already set up

- **`vercel.json`** — sets cache headers so the service worker and manifest
  are never served stale from Vercel's edge cache, and lets static assets
  (icons, seed data) cache normally.
- **`package.json`** — minimal metadata so Vercel's project setup has a name
  to default to. No dependencies, no build command.
- **`.gitignore`** — excludes `.vercel/` (the local project link Vercel's CLI
  creates) and OS/log cruft.
- A local git repo has been initialized with one commit containing the app at
  its current state. Nothing has been pushed anywhere.

No environment variables or secrets are needed — the trip data comes from a
Google Sheet published as "anyone with the link can view" and fetched via its
public `gviz` JSON endpoint (see `js/sheet-sync.js`), so there's no API key to
configure for the new domain.

## Option A — Vercel CLI (fastest, no GitHub needed)

1. Install the CLI once: `npm i -g vercel`
2. From the project root: `vercel login` (opens a browser to authenticate)
3. Deploy a preview: `vercel`
   - When asked, confirm the project root, accept the auto-detected "Other"
     framework preset (no build command, no output directory override).
4. Once you're happy with the preview URL, ship it: `vercel --prod`

Every subsequent `vercel --prod` from this directory redeploys the latest
local files to the same production URL.

## Option B — Git + Vercel dashboard (continuous deployment)

1. Push this repo to GitHub (or GitLab/Bitbucket):
   ```
   gh repo create maramis-japan-2027 --private --source=. --remote=origin
   git push -u origin main
   ```
2. In the [Vercel dashboard](https://vercel.com/new), import that repository.
3. Leave the framework preset as "Other" — no build command, no install
   command, output directory is the repo root.
4. Deploy. From then on, every push to `main` auto-deploys.

## Updating the app after this is live

Browsers treat a PWA's service worker as cache-first for app-shell files, so
a plain redeploy isn't always enough to make returning visitors see changes
immediately. Whenever you edit `index.html`, `css/app.css`, or any file in
`js/`, bump `CACHE_VERSION` in `service-worker.js` (currently `v5`) so the
service worker installs a fresh cache and old entries get cleaned up on
activate. This is already how the Japan-theme UI update in this repo was
shipped.

## A privacy note before you make this public

Deploying puts the app at a public URL anyone can open. The Google Sheet ID
baked into `js/sheet-sync.js` is only as private as the sheet's own sharing
setting ("anyone with the link") — deploying doesn't change that exposure,
but it does make the itinerary reachable without needing the direct sheet
link. If you'd rather it not be publicly discoverable, consider:

- Vercel's **Password Protection** (Pro plan) on the project, or
- Deploying it and just not sharing/indexing the URL (it won't appear in
  search engines unless linked from somewhere public).

## Local preview before deploying

```
npm run dev
```

This serves the app at `http://localhost:4173` via Python's built-in server
(no bundler involved — it's the same files Vercel will serve).
