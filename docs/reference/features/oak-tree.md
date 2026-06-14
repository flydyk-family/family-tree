# Feature: The Oak Tree

← back to [features index](README.md) · [reference index](../README.md)

The oak is a full-viewport SVG rendering the family graph. Pan/zoom and orientation are covered in [search-and-navigation.md](search-and-navigation.md); this document covers structure, the layout engine, medallions, the time rail, and motion.

Key components: [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue), [`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue) (+ [`components/medallion/`](../../../src/frontend/src/components/medallion/)), [`TimeRail.vue`](../../../src/frontend/src/components/TimeRail.vue); engine: [`layout/treeLayout.ts`](../../../src/frontend/src/layout/treeLayout.ts), [`layout/timeScale.ts`](../../../src/frontend/src/layout/timeScale.ts), [`layout/projection.ts`](../../../src/frontend/src/layout/projection.ts), [`layout/focusBounds.ts`](../../../src/frontend/src/layout/focusBounds.ts).

## SVG structure

The SVG fills its container (no `viewBox`); all coordinate mapping is a GSAP `transform` (`translate(x,y) scale(k)`) on an inner `<g class="oak__viewport">`. Z-order, back to front:

1. **`oak__branches`** — parent→child descent paths (`<path data-test="branch">`), `stroke: var(--bark)`, width `max(0.6, 2.6 − generation*0.6)` (trunk ~2.6 → leaf ~0.6), round caps. Cubic-bezier curves (vertical or horizontal form).
2. **`oak__unions`** — partner links (`<line>`), `stroke: var(--bark-dark)`, dashed `2 3`.
3. **`oak__nodes`** — one `<g data-test="node" :data-node-id="{id}" role="button" tabindex="0">` per person, translated to `(x,y)`, classes `oak__node oak__node--{role}` plus `--selected` / `--match`. Each holds a `<PersonMedallion>`. A **desktop click grows the bigger-view popup out of that medallion** (the `data-node-id` lets the open morph capture the clicked medallion's rect — see [person-details.md](person-details.md)).

A `<radialGradient id="oak-vignette">` seats portraits into their ovals. The parchment background is on the container, not the SVG.

## Node roles
Assigned by relationship to the focus person: `trunk` (focus + ancestors/descendants within depth 2), `branch`, `root` (ancestors deeper than gen −2), `leaf` (childless terminals). Role drives medallion size and branch width.

## Medallion ([`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue))

A person card. Frame artwork is rendered at ratio ≈ 1.21 (owner-tuned). Sizes by role: trunk 200×242, branch/root 186×225, leaf 158×191 px.

**Contents:**
- **Portrait** — `<image data-test="portrait" href="/media/portraits/{filename}">` clipped to an oval (`preserveAspectRatio="xMidYMid slice"`, slight downward offset `+2%`). Zoom by role: trunk 0.64, branch/root 0.70, leaf 0.60. **Tree nodes show only the still image — no video.**
- **Initials fallback** — when `portrait` is null: `<text class="oak__initial">` = first letter of the localized given name, gilt, `aria-hidden`. Rendered even when the name is empty (no divide-by-zero).
- **Name banner** — `<text class="oak__name">`, Cinzel/Forum, one line, auto-fit size (`nameFontSize`, clamped between ~6.7% and ~11.2% of frame width).
- **Years** — `<text class="oak__dates" data-test="lifespan">`, EB Garamond; **only rendered when a year span string is non-empty**.
- **Frame stack** — a base gold frame image always visible, plus one **overlay** image whose href + opacity animate (see states).

### Medallion states
| State | Visual |
|---|---|
| Plain | Base gold frame; overlay opacity 0 |
| Selected (`selected`) | [`frame-selected.svg`](../../../src/frontend/src/assets/medallion/frame-selected.svg) (brighter gold) crossfades in (0.3 s) |
| Search match (`match`) | [`frame-match.svg`](../../../src/frontend/src/assets/medallion/frame-match.svg) (green-gold) crossfades in — **match wins over selected** |
| Selected→Match | href swaps at opacity 1 (instant color change, intentional, not a crossfade) |
| Keyboard focus (`:focus-visible`) | Gilt drop-shadow glow on the frame |
| Hover | Cursor pointer |

> There is **no dimmed/faded state** for non-selected nodes. All nodes stay at full opacity.

## Layout engine ([`treeLayout.ts`](../../../src/frontend/src/layout/treeLayout.ts))
Builds abstract `{x, y, role, generation}` nodes from people + unions:
- Constants: `GENERATION_YEARS=28`, `xGap=180`, `pxPerYear=14`, `spouseGap=205`, trunk depths 2/2.
- **Tidy layout** in both directions from focus (descendants + ancestors), generations assigned (focus=0, ancestors negative, descendants positive).
- **Siblings** of focus placed beside the main tree in birth-year order; **married-in spouses** placed at `partner.x + 205`.
- **Year assignment** (`assignYears`): uses `birthYear`; if missing, estimates from parents (+28), children (−28), or spouse; fallback 1900.
- **Overlap separation** (`separateOverlaps`): same-generation rows pushed apart by card half-width (trunk 108 / branch 101 / root 101 / leaf 87, +14 gap), then re-centered and the focus re-anchored to x=0. *(This is a known pragmatic nudge — see [technical-debt.md](../technical-debt.md).)*
- **Links:** one descent link per (parent, child); one union link per 2-partner union.
- Throws on unknown `focusId`; silently skips dangling parent references.

### Orientation ([`projection.ts`](../../../src/frontend/src/layout/projection.ts))
`vertical`: X = spread, Y = time (newer = larger Y). `horizontal`: axes transposed (older left → newer right). Switching re-projects and re-fits the camera. Orientation persists in `localStorage['familytree.orientation']`. The **default** is responsive — **horizontal on slim screens (≤640 px), vertical otherwise** — until the user explicitly toggles, after which the manual choice wins (see [search-and-navigation.md](search-and-navigation.md#orientation)).

## Time rail ([`TimeRail.vue`](../../../src/frontend/src/components/TimeRail.vue))
A parchment rail with year ticks, kept perfectly aligned to nodes (it consumes the same viewport transform the oak emits).
- **Vertical mode:** left of the oak, 88 px wide (64 px ≤640 px). **Horizontal mode:** below the oak, 62 px tall.
- **Tick tiers:** `minor` / `decade` (bolder) / `century` (boldest, larger). Density chosen by zoom so ticks never crowd closer than 56 px (horizontal) / 24 px (vertical); candidate steps 1,2,5,10,25,50,100,200,500.

## Motion

The motion engine ([`motion/`](../../../src/frontend/src/motion/)) is GSAP-based; every animation checks `prefers-reduced-motion` and snaps instantly when reduced.

**What actually animates:**
| Trigger | Animation | Duration / ease |
|---|---|---|
| First view of the oak in a session | **Entrance ceremony** — the oak "grows" oldest→present (see below) | ~0.35× of a multi-second timeline; snaps to final view if reduced |
| Selection / search highlight changes | Medallion overlay opacity crossfade | 0.3 s `power1.out` |
| Search navigation | Camera pan/zoom glide to target | 0.35 s `power2.inOut` (see [search-and-navigation.md](search-and-navigation.md)) |

When the ceremony does **not** run (already played this session, deep-link arrival, or reduced motion), the oak simply fades in (viewport 0→1, 0.15 s `power1.out`).

Motion tokens also include `cascade`, `morph`, and `layoutSwitch`, which remain **defined and unused** (reserved for the not-yet-built choreographed interactions and Flip transitions — see [roadmap.md](../roadmap.md)).

### Entrance ceremony

Modules: [`useEntranceCeremony.ts`](../../../src/frontend/src/motion/useEntranceCeremony.ts) (gating/when), [`entrance.ts`](../../../src/frontend/src/motion/entrance.ts) (timeline/how), [`entranceCues.ts`](../../../src/frontend/src/motion/entranceCues.ts) (cue-sheet/what); wired in [`TreeView.vue`](../../../src/frontend/src/views/TreeView.vue).

The first time the oak and its layout are ready **in a browser session**, the camera plays a one-shot "grow the tree" sequence climbing the time axis from the oldest generation to the present.

- **Gating:** runs **once per session** (a flag at `sessionStorage['oak-entrance-played']`). It is **skipped** (and the flag set) when the user arrives via a `/person/:id` deep link, and under **`prefers-reduced-motion`** (the view jumps straight to the final framed state).
- **The climb:** a soft gilt **dawn-light glow** with a white **star** core leads each generation, trailing a **comet trace**; the star darts ahead to gesture toward the next generation. The camera **glides continuously and slows — but never fully stops — as it centres each generation**, so a new generation is met in the **middle** of the frame. As the camera centres a band, that generation's **branches draw** (stroke-dashoffset), and its **medallions, union links, and year-strata era line** fade in.
- **Year strata:** faint era lines labelled with the band's median year ride along the time axis (one per generation), their numerals kept whole inside the frame, then gliding to the screen edges at the finale.
- **Finale:** the camera steps back to frame **only the most recent four generations** (not the whole tree, which can span centuries), and every gilt ring pulses once.
- **Orientation-aware:** plays in whichever orientation is active — a vertical **climb** or a horizontal **pan** (strata and comet trace mirror onto the active axis).
- **Replay:** a **"Grow the tree"** button (`data-test="entrance-replay"`, localized `entrance.replay`) at the bottom of the tree view replays it on demand; it is hidden while the ceremony is active and under reduced motion.
- **Tap-to-skip:** any pointer / wheel / touch / key input during the ceremony immediately skips it to the final framed view (capture-phase handlers on the stage).
- **Pacing:** the whole timeline runs at ~0.35× (an owner-tuned calm speed).

## Formatting ([`format/`](../../../src/frontend/src/format/))
- **Year span (medallion):** `formatYearSpan(birthYear, deathYear)` → `"1762–1828"`, living `"1962–"`, birth-only-unknown `"–1900"`, both unknown `""` (line hidden). No `~` approx marker (bare years).
- **Lifespan (detail):** `formatLifespan(birth, death)` works from `LifeEvent` objects and **does** prefix `~` for approximate years (`"~1762–1828"`).
- **Name:** `formatPersonName` localizes given + surname and joins with a space (used in detail/rail; the medallion localizes each part itself).
- **[VocationIcon](../../../src/frontend/src/components/VocationIcon.vue):** inline SVG for `teacher`/`church`/`writer`/`office`/`other`; renders nothing for unknown vocations.
