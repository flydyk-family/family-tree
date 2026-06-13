# Roadmap, Unimplemented Features & Spec Divergences

← back to [reference index](README.md)

Snapshot at `VERSION 0.5.0` (commit `20bee94`). This separates **what ships** from **what specs describe but isn't live**, so QA doesn't test absent features.

## Implemented (shipped on `main`)
A concise index — behavior detail is in [features/](features/README.md).

- **Backend:** .NET 10 clean-architecture API; read-only in-memory store from `family.json`; `/api/family/graph`, `/api/people`, `/api/people/{id}`; `/health`; localized DTOs; rate limiting; security headers.
- **Oak:** SVG tree, layout engine (tidy + overlap nudge), vertical/horizontal orientation, time rail, gilt-frame medallions (gold/selected/match variants), pan/zoom (mouse/touch/pinch), era-focused initial framing.
- **Motion (foundation):** GSAP engine — viewport fade-in, medallion overlay crossfade, search camera glide; reduced-motion aware.
- **Person surfaces:** dockable/stackable panel rail (chips ↔ rectangles on mobile), person popup ("bigger view"), person detail with biography/residences/links, media fallback chain, accessible lightbox, vocation icons.
- **Search:** live substring search, cycle-with-Enter, camera centering, tree re-rooting, gold/green highlight, match counter.
- **Navigation:** `/person/:id` deep links, Back/forward sync.
- **App shell:** heraldic frame, top bar (tabs/search/language/orientation), mobile hamburger sheet.
- **Chronicle:** first-visit landing with stats + redirect guard.
- **Localization:** ru/be/en, detect + persist + instant switch, fallback chain.
- **Media infra:** R2-backed `/media` Pages Function (range requests), local-dev media plugin, upload script, AI portrait generator script.
- **CI/CD:** ci + codeql gates, tag-triggered Cloud Run + Cloudflare Pages deploy, auto GitHub Releases, Dependabot, `@claude` responder.
- **Polish:** monogram favicon, social-preview meta, localized `<title>`, version label.

## Planned / not implemented

### Oak motion program — PRs 2–4 (spec `2026-06-12-oak-motion-design.md`)
A four-PR effort. **PR 1 (motion foundation) is the only part on `main`.**
- **PR 2 — Entrance "ceremony":** era strata, dawn glow, branch-draw grow-the-tree, per-session gating, **replay button**, tap-to-skip. **Complete on the unmerged `feat/oak-ceremony` branch; NOT on `main` / production.** This is the single biggest "spec'd but not live" item — do not QA it against production.
- **PR 3 — Choreographed interactions:** popup cascade, "comes-alive" shimmer, portrait fade-in, hover lift, search pulse, lightbox expansion. **Not started.**
- **PR 4 — Flip transitions:** popup↔dock morph, layout-switch glide (the `morph`/`layoutSwitch` motion tokens exist but the tween modules don't). **Not started.**

### Other unbuilt items (from specs / README / DESIGN)
- **Members view** and **Timeline view** — tabs rendered but `disabled` ("Coming soon"); no routes/components.
- **Family selector / multi-family** — reserved in the bar, never built.
- **Custom domain** — production is the auto-suffixed `family-tree-4fl.pages.dev`; custom domain is future work.
- **Real database** — infrastructure is in-memory; repository interfaces exist for a future swap.
- **Authentication / editing UI / write API** — explicitly out of scope so far.
- **Portrait `gallery[]`** — field exists on the model but is empty in seed data and not surfaced in the UI.
- **URL-carried locale & orientation** for shareable links — deferred.
- **Vocation mark on oak nodes** — deferred (icons appear only in the detail surface).
- **Contour-based tidy layout** (replacing the overlap nudge) — deferred; see [technical-debt.md](technical-debt.md).
- **Heirloom tint / theme toggle, dark mode, idle motion (leaf sway), drag-to-reorder panels, MorphSVG branch morphing, parallax backdrop** — all noted optional/out-of-scope; not built.
- **Sora video generation after 2026-09-24** — the generator's `--with-video` depends on the Sora 2 API, which sunsets then (still generation is unaffected).

## Shipped behavior that diverges from its spec
Where the code wins over the spec (QA should trust the code):
- **`stateTween` (FLIP-for-colors)** was added in PR #70 then **removed** in PR #74 — superseded by the two-image overlay crossfade. Not on `main`. The plan doc `2026-06-12-motion-foundation.md` (tasks 7–8) still describes wiring it in and is now misleading.
- **Medallion portrait framing** — owner-tuned live: portrait offset `+2%` (spec said `−14%`), trunk zoom 0.64 (spec said 0.80). Frame ratio matches intent (1648/1362).
- **`fade.ts`** ships `fadeIn` **plus** `fadeTo`/`setOpacity` (pulled forward to serve the medallion crossfade) — a superset of the PR-1 plan.
- **PersonPopup** is now the "bigger view" of the dockable rail (post-redesign), not the original standalone glass card. Functionally equivalent (expand/collapse biography via `PersonDetail`).
- **Spec `2026-06-04-portrait-medallions-design.md`** (scroll-cartouche cards) is **superseded** by `2026-06-13-medallion-frame-design.md` (baroque oval) — a dead historical document.
- **AppFrame** ships CSS-drawn chrome; the raster botanical corner art described in DESIGN.md is a "drop-in enhancement" not yet committed.

> Note: the memory/automation note that once called the ceremony "PR #73 (open)" is stale — track it as the `feat/oak-ceremony` branch, unmerged.
