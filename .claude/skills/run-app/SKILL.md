---
name: run-app
description: Use when asked to run, start, launch, serve, preview, or smoke-test the family-tree app locally on this machine — the .NET API, the Vue dev server, or both end-to-end. Covers default ports, custom-port overrides, the hardcoded Vite proxy, and health checks.
---

# Run the family-tree app locally

## Overview

The app is two processes that run **together** for end-to-end use:

- **API** — .NET 10, serves `/api/...` on **http://localhost:5037** (Development).
- **SPA** — Vue 3 + Vite dev server on **http://localhost:5173**, which **proxies `/api` (and `/media`) to the API**. The browser only ever talks to the SPA origin.

Start the API first, then the SPA. The SPA is useless without the API (it reads the graph from `/api`).

## Quick reference

| Process | From | Command | URL |
|---|---|---|---|
| API | repo root | `dotnet run --project src/backend/FamilyTree.Api` | http://localhost:5037 |
| SPA (dev) | `src/frontend` | `npm install` (first run) then `npm run dev` | http://localhost:5173 |
| SPA (built) | `src/frontend` | `npm run build && npm run preview` | http://localhost:4173 |

The `.slnx` is picked up automatically from the repo root, so `dotnet build` / `dotnet test` need no path.

## Verify it's up (don't claim success without this)

```bash
curl http://localhost:5037/health                 # → {"status":"Healthy","version":"…","commit":"…"}
curl -o /dev/null -w "%{http_code}\n" http://localhost:5037/api/family/graph   # → 200
curl -o /dev/null -w "%{http_code}\n" http://localhost:5173/                   # → 200 (SPA)
```

The API root `/` returns **404** — that's normal (no route there); use `/health` or `/api/...` to check it.

## Gotchas

**1. Default ports are often already taken** by another session running the app. Check before starting:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5037/health   # non-000 = in use
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

- **Move the SPA port** freely: `npm run dev -- --port 5199`.
- **Moving the API port is not just a flag.** The Vite proxy target `http://localhost:5037` is **hardcoded in `src/frontend/vite.config.ts`**. `dotnet run … --urls http://localhost:5099` moves the API, but the SPA's `/api` proxy still points at 5037 — so either keep the API on 5037, or also edit the proxy target. If 5037 is owned by another session's API, the simplest path is to point your SPA at *that* API (the proxy already targets 5037) and not start your own.

**2. Media.** Family photos/clips are **not in the repo**. If a gitignored `media/` folder exists at the repo root it's served at `/media`; otherwise `/media` proxies to production. Missing media just falls back to initials — not an error.

## Notes

- To verify **frontend code changes in a browser**, prefer the harness `preview_*` tools over launching the dev server by hand.
- Run a custom-port API in the background and poll `/health` in a retry loop rather than a fixed sleep — it's serving within ~5s of build completion.
