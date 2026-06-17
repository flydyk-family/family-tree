# Roadmap, Unimplemented Features & Spec Divergences

← back to [reference index](README.md)

Snapshot at `VERSION 0.5.0` (commit `20bee94`). This separates **what ships** from **what specs describe but isn't live**, so QA doesn't test absent features.

## Implemented (shipped on `main`)
A concise index — behavior detail is in [features/](features/README.md).

- **Backend:** .NET 10 clean-architecture API; read-only in-memory store from [`family.json`](../../src/backend/FamilyTree.Api/Data/family.json); `/api/family/graph`, `/api/people`, `/api/people/{id}`; `/health`; localized DTOs; rate limiting; security headers.
- **Oak:** SVG tree, layout engine (tidy + overlap nudge), vertical/horizontal orientation (with an animated **layout-switch glide** — see [features/oak-tree.md](features/oak-tree.md#layout-switch-glide)), time rail, gilt-frame medallions (gold/selected/match variants), pan/zoom (mouse/touch/pinch), era-focused initial framing.
- **Motion (foundation):** GSAP engine — viewport fade-in, medallion overlay crossfade, search camera glide; reduced-motion aware.
- **Oak entrance ceremony (PR 2):** once-per-session "grow the tree" — camera glides oldest→present centring each generation (slows, never stops), dawn-glow/star lead with a comet trace, branch-draw, year-strata era lines, finale framing the most recent four generations; orientation-aware (climb/pan), **"Grow the tree" replay button**, tap-to-skip, deep-link/reduced-motion gated. See [features/oak-tree.md](features/oak-tree.md#entrance-ceremony).
- **Medallion hover lift (PR 3):** a calm transform-only GSAP scale lift (to 1.03) on pointer hover, gated off during the entrance ceremony and under reduced motion. See [features/oak-tree.md](features/oak-tree.md#motion). Implemented in [`motion/interactions.ts`](../../src/frontend/src/motion/interactions.ts).
- **Person surfaces:** dockable/stackable panel rail (chips ↔ rectangles on mobile, animated min↔max), person popup ("bigger view") with a fixed header over a scrolling body, person detail (summary + **paginated biography reader** + residences/links), a custom **vine scrollbar** on the rail/popup, media fallback chain, accessible lightbox, vocation icons.
- **Search:** live substring search, cycle-with-Enter, camera centering, tree re-rooting, gold/green highlight, match counter.
- **Navigation:** `/person/:id` deep links, Back/forward sync.
- **App shell:** heraldic frame, top bar (tabs/search/language/orientation/theme toggle), mobile hamburger sheet.
- **'80s Film theme:** switchable via a labelled `ThemeToggle` in the app bar (desktop) and mobile sheet; persists to `localStorage['familytree.theme']`; applied as `data-theme="eighties"` on `<html>`. Reskins the entire chrome to a muted `#5c5c5c` studio-grey palette, with the top header on a dark-graphite gradient band. Replaces gilt-oval medallions with period-accurate photo cards keyed to birth year: cabinet card (< 1900), silver-gelatin print (1900–1944), colour film frame (1945–1989), and a holeless edge-print film frame (≥ 1990 or unknown defaults to film/holed). Film-frame details: transparent sprocket holes (holed variant; brighten on search match) or solid borders with corner frame-numbers (edge-print variant), Kodachrome portrait grade, vertical edge printing, seeded abrasion, hover grain flicker. See [features/oak-tree.md](features/oak-tree.md#eighties-film-theme-medallions).
- **Chronicle:** first-visit landing with stats + redirect guard.
- **Localization:** ru/be/en, detect + persist + instant switch, fallback chain.
- **Media infra:** R2-backed `/media` Pages Function (range requests), local-dev media plugin, upload script, AI portrait generator script.
- **CI/CD:** ci + codeql gates, tag-triggered Cloud Run + Cloudflare Pages deploy, auto GitHub Releases, Dependabot, `@claude` responder.
- **Polish:** monogram favicon, social-preview meta, localized `<title>`, version label.

## Planned / not implemented

### Oak motion program — PRs 3–4 (spec [`2026-06-12-oak-motion-design.md`](../../docs/superpowers/specs/2026-06-12-oak-motion-design.md))
A four-PR effort, now **closed**. PRs 1, 2, and 4 are implemented; PR 3 shipped only its hover lift (see Implemented above).
- **PR 3 — Choreographed interactions:** ⚠️ **partially shipped, now closed** — only the **medallion hover lift** landed. **Cut, will not be built:** **portrait fade-in** and **comes-alive shimmer** (built during PR 3, then dropped after live review), plus **search-match pulse** and **lightbox expansion** (never started; the owner has confirmed they are out of scope). No further motion work is planned.
- **PR 4 — Flip transitions:** ✅ **shipped** — the popup↔dock morph + medallion-open grow ([#80](https://github.com/flydyk-family/family-tree/pull/80), split as PR 4a) and the vertical↔horizontal **layout-switch glide** (PR 4b). The `morph`/`cascade`/`layoutSwitch` tokens are now in use. See [features/person-details.md](features/person-details.md) and [features/oak-tree.md](features/oak-tree.md#layout-switch-glide).

### Other unbuilt items (from specs / README / DESIGN)
- **Portrait fade-in** (medallion stills fading in over the dark mount on load) — built during PR 3, then **dropped after live review** (the owner chose to keep only the hover lift); not on `main`.
- **Comes-alive shimmer** (popup portrait ring reacting when the living clip starts) — built during PR 3, then **dropped after live review**; not on `main`.
- **Search-match pulse** — planned in the PR 3 motion spec but **cut by the owner; out of scope, will not be built.**
- **Lightbox expansion animation** — planned in the PR 3 motion spec but **cut by the owner; out of scope, will not be built.**
- **Members view** and **Timeline view** — tabs rendered but `disabled` ("Coming soon"); no routes/components.
- **Family selector / multi-family** — reserved in the bar, never built.
- **Custom domain** — production is the auto-suffixed `family-tree-4fl.pages.dev`; custom domain is future work.
- **Real database** — infrastructure is in-memory; repository interfaces exist for a future swap.
- **Authentication / editing UI / write API** — explicitly out of scope so far.
- **Portrait `gallery[]`** — field exists on the model but is empty in seed data and not surfaced in the UI.
- **URL-carried locale & orientation** for shareable links — deferred.
- **Vocation mark on oak nodes** — deferred (icons appear only in the detail surface).
- **Contour-based tidy layout** (replacing the overlap nudge) — deferred; see [technical-debt.md](technical-debt.md).
- **Dark mode** — not implemented (see Film theme for the dark palette option).
- **'80s Film theme — couple pairing:** render spouses born ≤ 5 years apart as a single side-by-side card. Documented in the spec; **not yet implemented**.
- **'80s Film theme — per-epoch background morph:** canvas colour cross-fades as the user scrolls the time axis through different eras. **Not yet implemented** (future goal).
- **Idle motion (leaf sway), drag-to-reorder panels, MorphSVG branch morphing, parallax backdrop** — all noted optional/out-of-scope; not built.
- **Sora video generation after 2026-09-24** — the generator's `--with-video` depends on the Sora 2 API, which sunsets then (still generation is unaffected).

## Shipped behavior that diverges from its spec
Where the code wins over the spec (QA should trust the code):
- **`stateTween` (FLIP-for-colors)** was added in PR #70 then **removed** in PR #74 — superseded by the two-image overlay crossfade. Not on `main`. The plan doc [`2026-06-12-motion-foundation.md`](../../docs/superpowers/plans/2026-06-12-motion-foundation.md) (tasks 7–8) still describes wiring it in and is now misleading.
- **Medallion portrait framing** — owner-tuned live: portrait offset `+2%` (spec said `−14%`), trunk zoom 0.64 (spec said 0.80). Frame ratio matches intent (1648/1362).
- **[`fade.ts`](../../src/frontend/src/motion/fade.ts)** ships `fadeIn` **plus** `fadeTo`/`setOpacity` (pulled forward to serve the medallion crossfade) — a superset of the PR-1 plan.
- **PersonPopup** is now the "bigger view" of the dockable rail (post-redesign), not the original standalone glass card. The earlier More/Less **expand-collapse biography toggle was removed** — the biography is now an always-visible, paginated, scrolling reader (see [features/person-details.md](features/person-details.md#paginated-biography-reader-chroniclepagervue)).
- **Spec [`2026-06-04-portrait-medallions-design.md`](../../docs/superpowers/specs/2026-06-04-portrait-medallions-design.md)** (scroll-cartouche cards) is **superseded** by [`2026-06-13-medallion-frame-design.md`](../../docs/superpowers/specs/2026-06-13-medallion-frame-design.md) (baroque oval) — a dead historical document.
- **AppFrame** ships CSS-drawn chrome; the raster botanical corner art described in [DESIGN.md](../../DESIGN.md) is a "drop-in enhancement" not yet committed.

> Note: the entrance ceremony (formerly tracked as the unmerged `feat/oak-ceremony` branch / "PR #73") is now part of the app — see the Implemented list above.
