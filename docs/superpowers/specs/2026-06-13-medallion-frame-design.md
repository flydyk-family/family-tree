# Medallion Frame — gilt oval + parchment banner

**Date:** 2026-06-13
**Status:** approved in brainstorming (visual-companion session); pending implementation plan
**Owner decisions baked in:** replace the procedural scroll-cartouche medallion with the supplied baroque **gilt oval + parchment banner** artwork; portrait shown as a **dark-mounted cameo** (zoomed-out, panned low); **full name on one line** in the banner; per-state **gilt recolour** (no glow) — selected = **lit gold**, search-match = **subtle green-gold**, parchment always warm; recolour delivered as **asset crossfade** (not inline-symbol); container ratio **1362/1648**.

## 1. Goal

Replace today's procedurally-drawn person card in `PersonMedallion.vue` (a paper-roll scroll cartouche + coloured-disc portrait ellipse + gilt ring) with a single ornate art asset: an **oval gilt frame holding the portrait, above a parchment banner holding the name + years**. The card must:

- read as one cohesive antique medallion at every zoom and every role size (trunk → leaf);
- keep the portrait's oval **centred on the node origin** so the time-axis alignment is unchanged;
- express the three interaction states (normal / selected / search-match) by **recolouring the gilt itself**, animated as a smooth crossfade;
- stay cheap enough to render across a whole tree under live pan/zoom.

This supersedes the scroll-cartouche look from `2026-06-08-frontend-redesign-design.md` for the person card only; the rest of the oak (branches, axis, layout engine, popup) is untouched except for spacing constants (§7).

## 2. The artwork asset

Source: a hand-vectorised illustration supplied by the owner, optimised to **`medalion1-vector1-less-colors-minimized.svg`** — `1362 × 1548`, **6 flat fill colours**, **623 `<path>`s, ~89 KB**. It depicts an empty gilt oval (transparent interior, for the portrait) above an empty parchment cartouche (for the name).

It is **UI artwork, not family media**, so it is committed to the repo (unlike photos, which live in R2). Add it under `src/frontend/src/assets/medallion/` as the base asset.

Measured interior geometry (fraction of the native `1362 × 1548` canvas), for reference:

| Region | Centre | Radii / extent |
| --- | --- | --- |
| Oval hole | `(49.78%, 40.99%)` | `rx 28.49% W`, `ry 29.43% H` |
| Parchment banner | `cy 84%` | `x 7–96%`, `y 71–97%` |

The six fills and their roles:

| Fill | Role | Recoloured per state? |
| --- | --- | --- |
| `#f7bb50` | gilt — light/highlight | **yes** |
| `#cb9137` | gilt — mid | **yes** |
| `#7a4d1c` | gilt — deep | **yes** |
| `#edd5a6` | parchment fill | no (always warm) |
| `#412000` | brown shadow | no |
| `#010101` | black outline | no |

## 3. Locked visual specification

All values below were tuned by the owner in the live companion and are authoritative. They are expressed as the mockup CSS; §6 maps them to the real SVG scene.

### 3.1 Container

```
.med { aspect-ratio: 1362 / 1648; }   /* deliberately ~6.5% taller than the
                                          native 1548 — stretches the frame
                                          vertically; owner-approved */
```

### 3.2 Portrait (dark-mounted cameo)

```
background-size: <per-role>;          /* trunk 80% · branch/root 70% · leaf 60% */
background-position: center -14%;
background-color: #241a0d;            /* dark mount shows where the zoomed-out
                                         portrait doesn't reach the oval edge */
clip-path: ellipse(30% 35% at 49.8% 42%);
```

- The portrait is intentionally **smaller than the oval** (zoom < 100%), so it sits as a cameo on the dark mount rather than filling the frame. Smaller roles zoom out more (face stays legible in less space).
- A soft inner **vignette** seats the portrait and blends the mount edge:
  ```
  /* same oval clip */
  background: radial-gradient(125% 95% at 50% 32%, transparent 64%, rgba(28,18,7,.42) 100%);
  ```

### 3.3 Name banner

- **Full name on one line** (`given + surname`), **auto-sized to fit** the banner width (long names shrink; short names cap out). Years on the line below.
- Placed **low** in the banner where the parchment is widest:
  ```
  .banner { left:9%; right:9%; top:78%; height:18%;
            display:flex; flex-direction:column; justify-content:center; }
  .name  { font-family:'Cinzel'; font-weight:600; color:#2b2113; white-space:nowrap; }
  .years { font-family:'EB Garamond'; color:#5e4a26; }   /* ~5.4cqw */
  ```
  One-line fit heuristic from the mockup: `font ≈ clamp(4.6cqw, 82 / (len·0.58) cqw, 7.6cqw)`.

### 3.4 State colours (recolour the 3 gilt fills only)

| State | `#f7bb50` → | `#cb9137` → | `#7a4d1c` → |
| --- | --- | --- | --- |
| **Normal** (gold) | — | — | — |
| **Selected** (lit gold) | `#ffe79e` | `#eac266` | `#a2792f` |
| **Search-match** (subtle green-gold) | `#d6c45e` | `#9c9a3f` | `#586322` |

Parchment, brown, and black are never recoloured, so both states read as "the gilt changed" while the banner stays warm. Match's hue shift makes found people pop out of a field of gold without any glow (a green *glow* and an all-frame `hue-rotate` were both prototyped and rejected — the glow was a foreign colour, the hue-rotate greened the parchment).

## 4. Component architecture (`PersonMedallion.vue`)

Rewrite the template as layered SVG per node, drawn back-to-front:

1. **Dark mount** — `<ellipse>` filled `#241a0d` at the oval geometry.
2. **Portrait** — `<image>` (`preserveAspectRatio="xMidYMid meet/slice"` per the zoom math), clipped by the oval `<clipPath>`, sized < the oval and offset by the `-14%` rule.
3. **Vignette** — `<ellipse>` filled by a `<radialGradient>` matching §3.2, clipped to the oval.
4. **Frame** — the gilt artwork `<image>` (base gold) **+ a state-overlay `<image>`** (§5).
5. **Banner text** — `<text>` for the one-line name (auto-fit) and the years.

Removed: the scroll body/roll `<rect>`s, the `oak-roll` linear gradient, the portrait tint `radialGradient`s and the monogram-disc styling (the monogram is reworked in §8). The role geometry helper (`geomFor`) is replaced by a frame-size-per-role helper.

## 5. Frame asset + recolour mechanism (asset crossfade)

Produce **three colour variants** of the optimised SVG by string-substituting the 3 gilt fills (§3.4): `frame-gold.svg`, `frame-selected.svg`, `frame-match.svg`. Generate the two recoloured files from the base with a tiny committed build step (or commit all three) so the colour map lives in one place.

Per node, render **two stacked `<image>`s**:

- a **base** `<image href=frame-gold>` (always opaque);
- a **state overlay** `<image>` whose `href` is set to the selected/match variant and whose **opacity crossfades** `0 → 1` on state change (and back).

Rationale: the browser caches three ~89 KB assets; the DOM stays light (two `<image>` per node); it is vector-crisp at any zoom; and the crossfade is free. **Rejected alternative:** inline the SVG once as a `<symbol>` with CSS-variable fills and `<use>` per node — it allows pure-CSS colour retuning and a true fill tween, but instantiates 623 paths per `<use>`, a real cost during pan/zoom across many nodes. *(If colour retuning later becomes frequent, revisit the symbol approach.)*

## 6. Mapping the mockup CSS to the SVG scene

The mockup uses HTML/CSS; the app renders inside the one big `OakTree` `<svg>`. Translations:

| Mockup | SVG scene |
| --- | --- |
| `.med aspect-ratio 1362/1648` | per-node viewport `W × H` with `H = W · 1648/1362`; the frame `<image>` is drawn at that `W × H` (the ~6.5% vertical stretch is intentional). |
| `clip-path: ellipse(rx ry at cx cy)` | a `<clipPath><ellipse cx cy rx ry>` in node-local units (`cx=0.498·W`, `cy=0.42·H`, `rx=0.30·W`, `ry=0.35·H`). |
| `background-size %` + `background-position: center -14%` | the portrait `<image>` width/height set to the zoom fraction of the oval box, centred horizontally, offset vertically by the `-14%` rule; `xMidYMid slice`. |
| `background-color #241a0d` | the dark mount `<ellipse>` beneath the portrait. |
| `radial-gradient` vignette | an SVG `<radialGradient>` on the vignette `<ellipse>`. |
| frame opacity crossfade | GSAP/`<animate>`-free opacity tween via the motion layer (§9). |

The oval is positioned so its **centre sits at the node origin `(0,0)`** (today's portrait-centre invariant), with the banner hanging below — preserving time-axis alignment.

## 7. Per-role sizing & layout spacing

- **Frame size per role:** trunk largest → branch/root → leaf smallest, keeping the `1362/1648` ratio. Concrete widths chosen during implementation against the live oak (today's tiers: trunk > branch/root > leaf).
- **Portrait zoom per role:** trunk **80%**, branch/root **70%**, leaf **60%** (`-14%` offset constant). *Tunable live.*
- **`treeLayout.ts`:** update `CARD_HALF_WIDTH` per role and the vertical pitch to the new framed footprint (the medallion is taller than the old scroll and has ornament margins) so same-generation neighbours and stacked generations don't overlap.

## 8. States, motion, focus, fallback

- **States:** normal / selected (lit gold) / search-match (green-gold). Selected and match can co-occur; **match (green) wins the frame colour** when both apply (search context dominates), matching today's "selection vs match" precedence intent — confirm during implementation.
- **Motion:** reuse the deliberate state-tween pattern (`src/frontend/src/motion/`), but the highlight animation is the **opacity crossfade** of the overlay frame `<image>`. Honour `prefers-reduced-motion` (instant swap). This replaces today's fill/stroke `tweenFromPaint` on the ring/scroll.
- **Keyboard focus:** `:focus-visible` maps to the **selected (lit-gold)** treatment (replacing today's green ring), so focus and hover/selection share one visual language.
- **Missing portrait:** not every person has a portrait file. Fallback = the **dark mount + the given-name initial** in Cinzel (carrying over today's monogram idea), centred in the oval.

## 9. Testing

- **Unit:** role → frame-geometry mapping; the one-line name-fit heuristic; state → frame-variant selection.
- **Component (Vitest):** renders the correct overlay `href`/opacity per `selected`/`match` prop; portrait `<image>` vs initial fallback; `data-test="portrait"` / `data-test="lifespan"` hooks preserved.
- **Motion:** crossfade fires on state change; reduced-motion jumps to end state (verify live, not only with mocks — per prior motion learnings).
- **Live:** preview pass against the real oak at trunk/branch/leaf and on selection + search.

## 10. Out of scope / YAGNI

- No change to branches, year axis, popup, pan/zoom, search logic, or the layout algorithm (only its spacing constants).
- No per-portrait crop tuning UI — a single per-role crop is used (individual outliers tuned later if needed).
- No new colour-theming system — three baked variants suffice; revisit only if retuning becomes frequent (§5).

## 11. Tunable-at-implementation values

Branch/root portrait zoom (default 70%), exact per-role frame widths, the banner text-fit constants, and the final `CARD_HALF_WIDTH`/pitch numbers are all expected to be nudged against the live preview; the locked §3 values (container ratio, oval clip, `-14%`, dark mount, vignette, the state colour maps, one-line name) are fixed.
