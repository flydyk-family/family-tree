# ’80s Film Theme — Design Spec

**Date:** 2026-06-16
**Status:** Draft for review
**Author:** brainstormed with the owner (visual companion)

## 1. Summary

A second, switchable UI theme for the family-tree app that re-imagines the tree as
**period-accurate photographic media laid out on a studio surface**. It coexists with
the classic sepia "oak" theme; a labelled switch in the app bar flips between them at
runtime and the choice persists.

The centrepiece: person medallions stop being gilt oval cameos and become
**photo-cards whose medium matches the person's lifetime** — a Victorian *cabinet card*,
a *silver-gelatin print*, or a 1980s-style *colour film frame*. The whole app chrome
re-skins to a muted, dark-grey, restrained palette (no neon, no "recording/VHS-OSD"
gimmickry).

This is an aesthetic/frontend-only change. The API, data model, and `family.json`
are untouched.

## 2. Goals & non-goals

**Goals**
- A runtime-switchable alternative theme covering the **whole app** (Tree + Chronicle
  views, person popup/detail, side panels, search, language picker, year axis, app bar).
- Epoch-accurate medallion media selected by **birth year** (hard cutoffs).
- A cohesive muted palette on a **#5C5C5C** studio-grey canvas.
- Persisted theme choice; classic theme remains the default and is unchanged.

**Non-goals (this version)**
- **Couple pairing** (side-by-side card for ≤5y spouses) — deferred to a fast-follow PR;
  v1 renders a single card per person (see §5.6).
- Smooth **cross-fade of the background/surface by epoch** as the axis scrolls — kept
  as a documented future extension (see §10). v1 uses a single #5C5C5C canvas.
- Per-epoch *chrome* changes. Chrome is one ’80s look regardless of where you scroll.
- Any backend, schema, or media-pipeline change.

## 3. Locked decisions (from brainstorming)

| Topic | Decision |
| --- | --- |
| Theme model | Switchable, **user-facing toggle** in the app bar. Classic stays default. |
| Direction | VHS-era *film*, but **restrained** — muted heritage tones, **no neon**, **no** ▶/REC/timecode OSD language. |
| Canvas | **#5C5C5C** studio grey (ref: 35mm film-card mockup on grey). Dark-grey accents. |
| Medallion (film era) | **Vertical** 35mm frame; **discrete rounded sprocket holes** (celluloid on all 4 sides) on left/right; **transparent** by default (canvas shows through via SVG mask); a **filled** variant for interaction states. Warm Kodachrome image grade. Authentic **edge printing** (stock name + frame numbers) on a solid inner strip. |
| Abrasion | **Light** wear (one faint scratch + a couple dust specks), **baked per person** (seeded from person id so it's stable), **plus a subtle running-film animation on hover**. |
| Name / years | **Name above** the card, **years below** as a grey "timecode" chip. Identical label system across all eras. Must handle long ru/be names. |
| Epoch media | Three tiers by **birth year** (hard cutoff): **< 1900** cabinet card · **1900–1944** silver-gelatin print · **1945+** colour film frame. |
| Couples | **Fast-follow, not v1.** Eventually render a spouse pair as one **side-by-side** card when their birth years differ by **≤ 5 years**; otherwise each spouse is its own single card. v1 ships single cards per person. |

## 4. Theme architecture

### 4.1 Approach (recommended)

**CSS custom-property override under a `data-theme` attribute, with theme state in `uiStore`.**

- All chrome already consumes `var(--…)` tokens from `:root` in
  `src/frontend/src/styles/tokens.scss`. Add a second token block scoped to
  `:root[data-theme='eighties'] { … }` (new file `styles/themes/eighties.scss`,
  imported once). Switching the theme = toggling the attribute on the root element;
  every component that reads tokens re-skins for free.
- **State:** extend the existing `uiStore` (Pinia) with `theme: 'classic' | 'eighties'`,
  a `setTheme` / `toggleTheme` action, and localStorage persistence + `init()` read —
  mirroring the existing `orientation` pattern exactly (`familytree.theme` key).
- **Applying it:** a small watcher (in `App.vue` `onMounted` + `watch`) writes
  `document.documentElement.dataset.theme`. Default/absent attribute = classic.

**Alternatives considered**
- *Separate compiled stylesheets swapped at runtime* — heavier, risks FOUC, and
  duplicates the token plumbing. Rejected.
- *Per-component theme props* — invasive, touches every component signature. Rejected;
  the attribute+token approach is why the design system exists.

### 4.2 What tokens the ’80s block defines

Canvas `#5C5C5C`; dark celluloid `#0d0e10`; grey accent surfaces (`#1b1c1f` bars,
`#26282c`/`#2c2f33` controls/chips, `#4a4f55` borders); light text `#ededea`/`#d7dade`;
a single restrained **neutral** signal colour — a bright signal-grey / near-white
(`~#e6e8ea`) for selection/search highlights, **no warm tint, no neon**. The film era's
interaction states reuse it: **selected** lights the edge to bright grey; **search-match**
swaps to the *filled* sprocket variant (§3). Typography: **names** keep a serif
(`--font-display`/`--font-body`); **labels, chips, edge-text, controls** use a new
`--font-mono` token (a clean monospace) for the OSD-but-tasteful feel.

## 5. Medallion: epoch-aware photo-cards

### 5.1 Rendering reality

Medallions render as **SVG** inside the oak (`OakTree.vue` → `PersonMedallion.vue`,
geometry from `components/medallion/geometry.ts`, frame art from `frameAssets.ts`).
The new cards are therefore **SVG**, not the HTML/CSS used in the brainstorming
mockups. SVG fully supports what we need: `<mask>`/`<pattern>` for sprocket holes,
`<filter feTurbulence>` for grain, `<image>` with CSS `filter` for the colour grade,
and `<clipPath>` for card shapes.

### 5.2 Era classifier

`components/medallion/era.ts` → `cardEra(birthYear: number | null): 'cabinet' | 'gelatin' | 'film'`
- `birthYear < 1900` → `cabinet`
- `1900 ≤ birthYear < 1945` → `gelatin`
- `birthYear ≥ 1945` (and unknown/null) → `film`

Hard cutoffs, no blending. Null/unknown birth year falls to `film` (the modern default).

### 5.3 Selecting the renderer

`PersonMedallion.vue` branches on theme:
- `theme === 'classic'` → existing gilt cameo (unchanged).
- `theme === 'eighties'` → a new `EightiesMedallion.vue` that picks one of three
  presentational sub-components by `cardEra`:
  - `medallion/eighties/CabinetCard.vue` — cream mount, sepia(.72) image, thin border,
    serif "Studio · …" imprint.
  - `medallion/eighties/GelatinPrint.vue` — white-bordered matte **grayscale** print.
  - `medallion/eighties/FilmFrame.vue` — dark celluloid, masked transparent sprocket
    holes, edge-printing strips, Kodachrome grade, seeded abrasion + hover animation.

All three share the **name-above / years-chip-below** label layout and a common
footprint so the tree stays visually even. Name uses the existing `nameFit` sizing.

### 5.4 Shared SVG defs

One `EightiesDefs.vue` (rendered once inside the oak `<svg>`) holds the reusable
`<pattern>`/`<mask>` for sprocket holes, the grain `<filter>`, and gradients — referenced
by `url(#…)` from every film frame instance (mirrors how `frameAssets` are shared today).

### 5.5 Abrasion

`medallion/eighties/abrasion.ts` → given a person id, deterministically produce a small
set of marks (1 scratch x-position + 2–3 dust specks) via a tiny seeded PRNG, so a
person's wear is **stable** across renders. A `:hover` class adds a subtle CSS animation
(faint scratch jitter / dust flicker) gated by `prefers-reduced-motion`.

### 5.6 Couple pairing — deferred (fast-follow, NOT in v1)

v1 renders **one card per person**; spouses are two separate nodes exactly as the classic
theme positions them today. Pairing is its own later PR because it touches the layout
engine (node count + positions). Recorded here so the fast-follow is unambiguous:

> When two spouses (from `unions`) have **|birthYearA − birthYearB| ≤ 5**, render them as a
> single **side-by-side** card (two portraits in one frame/mount). Implemented as an opt-in
> `treeLayout.ts` pass (’80s theme only) that collapses qualifying pairs into one "couple
> node" carrying both `PersonSummary`s; the union link between them is dropped and descent
> links re-point to the couple node. Non-qualifying pairs (>5y, or partner off-screen)
> render as singles.

## 6. UI chrome re-skin

Driven almost entirely by the §4.2 token block (bars, panels, popup glass, search,
language picker, tabs, year axis, dock). Component-level work expected only where a
component hard-codes a colour instead of a token (audit during implementation) and for:
- **AppBar** — dark-grey bar; add the **theme toggle** (§7).
- **PersonPopup / PersonDetail / DockPanel** — the translucent "glass" surface re-tints
  to a dark graphite glass via tokens (`--glass-bg`, `--glass-border`, `--scrim`).
- **YearAxis** — light-on-grey ticks.

## 7. Theme toggle

A small **labelled switch** in `AppBar`, always visible (a film ⟷ oak switch with a short
text label). Calls `uiStore.toggleTheme()`. Reflects current theme; keyboard-focusable
with an `aria-label`; localized label string added to `i18n/messages/{ru,be,en}.ts`.

## 8. Testing

- `era.spec.ts` — boundary cases (1899/1900/1944/1945, null).
- `abrasion.spec.ts` — deterministic output for a given id; differs across ids.
- `uiStore.spec.ts` — theme set/toggle/persist/init round-trip (extend existing).
- Component tests for `CabinetCard` / `GelatinPrint` / `FilmFrame` (renders portrait,
  name, years; film frame emits mask/edge markup).
- Toggle: AppBar test that clicking flips `document.documentElement.dataset.theme`.

(Couple-pairing layout tests land with that fast-follow PR, not v1.)

## 9. Docs impact (land with the PR)

Update `docs/reference/` (theme switching, the epoch-media behaviour + cutoff years,
couple-pairing rule) and the README/CLAUDE.md product overview (now "two themes").
Run `update-docs-for-pr` at PR time.

## 10. Future extensions (out of scope now)

- **Epoch surface morph:** the background/surface (and possibly frame stock) cross-fade
  smoothly as the time axis scrolls — per century or ~50-year bands (the owner's saved
  goal). v1 keeps a constant #5C5C5C canvas; the era system in §5.2 is the hook for it.
- Wooden-table / whiteboard surfaces as additional canvas options.
- Polaroid / digital tiers for late-20th-/21st-century births if finer granularity is wanted.

## 11. Risks

- **SVG fidelity** of the film grain/abrasion vs the HTML mockups — validate live early.
- **Token coverage** — any hard-coded colours in components must be migrated to tokens
  or the ’80s theme will leak the classic palette; an audit is part of the work.
