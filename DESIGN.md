# Design System — Family Tree ("Family Chronicle")

> Source of truth for the frontend visual language. Derived from the approved
> interactive prototype **v1** (`.superpowers/brainstorm/.../tree-prototype.html`)
> and the gstack design exploration (round-2 variant **B/C** references live under
> `~/.gstack/projects/flydyk-family-family-tree/designs/`). Read this before any UI change.

## Product context
- **What:** a read-only family-tree viewer that renders the family as an oak on a
  vintage "chronicle page", with a continuous time axis and pan/zoom.
- **Who:** family members across generations; primary language **ru**, also **be** / **en**.
- **Memorable thing:** *an heirloom you can explore* — a bright, warm, hand-made
  genealogical chart, not a sterile org-chart.

## Aesthetic direction
- **Direction:** sepia **heraldic engraving**, "little gothic" — warm, bright, *not* dark.
- **Decoration:** intentional. A framed "chronicle page": ornamental border + decorative
  side/corner botanicals over a light parchment ground. Static chrome may use **raster art
  assets**; the oak itself is always crisp **SVG**.
- **No heraldic coat of arms / crest.**
- **Mood:** heritage, heirloom, scholarly, warm, colourful-but-aged.

## Color
Light, warm, fresh — more green and brighter than the previous sage palette.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#f4ecd6` | page parchment ground |
| `--paper-2` | `#efe6cd` | secondary parchment / panels |
| `--panel` | `#f7f1dd` | control + panel fill |
| `--panel-edge` | `#e4d6b0` | hairline borders |
| `--ink` | `#43381f` | primary text |
| `--ink-soft` | `#6a5a3a` | secondary text, years |
| `--bark` | `#6f5a3c` | branches |
| `--bark-dark` | `#49391f` | union lines, dark rules |
| `--gilt` | `#b7913f` | frames, accents, active rules |
| `--gilt-light` | `#e3cf93` | gilt highlight |
| `--leaf` | `#7e9a45` | foliage |
| `--leaf-deep` | `#5d7a34` | foliage shadow, selected |
| `--leaf-bright` | `#94b255` | foliage highlight, active controls |
| `--umber` | `#9c5a32` | stat values, links, seals |
| `--shadow` | `rgba(74,58,36,.22)` | soft drop shadows |

**Portraits:** shown in **natural colour** inside vintage frames. Optional user-toggleable
*heirloom tint* theme (warm overlay ~15–25%) — off by default. No forced sepia duotone.

**Dark mode:** out of scope for v1 (the look is intrinsically a light parchment).

## Typography
- **Display / title:** **Cinzel** (500–600), elegant engraved Roman caps, letter-spaced.
  *Lighter than blackletter* — the centered title is Cinzel, not a heavy Fraktur.
- **Names / labels / stats:** Cinzel 600 (small) for nameplates and stat values.
- **Body / years / blurbs:** **EB Garamond** (400/600, italic for years & captions).
- **Decorative accent only:** **UnifrakturMaguntia** (Fraktur) for drop-caps / monograms — never for running text.
- Cyrillic must render (all three faces cover ru/be).

## Spacing & sizing
- **Base unit:** 4px. Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- **Medallion:** portrait ellipse ≈ `rx 26–32 / ry 30–36` by role (trunk largest, leaf smallest).
- **Sibling gap:** ≈ 150px (cross-axis). **Time scale:** ~7 px/year default (tunable, zoom-scaled).
- **Time rail:** 78–84px (vertical) / 54–56px (horizontal).
- **Radius:** controls 8–9px; panels 10–11px; nameplate 5–6px.

## Layout
- **Top bar:** tab nav left (**Chronicle · Tree · Members · Timeline**) + right cluster
  (**search** input, **language** selector showing the *full* name "Русский", **orientation
  toggle** Vertical/Horizontal). Controls = cream pills, gilt/sepia border, **green active state**.
- **Centered title** band below the bar.
- **Stage (3 zones):** `[ time-rail | tree viewport | stats panel ]`.
  - **Time rail** (left, framed): static frame; **dynamic** ticks + soft era bands inside.
  - **Tree viewport:** pan/zoom SVG oak.
  - **Stats panel** (right, **A skin**): gilt-bordered parchment card, drop-cap blurb, stat list
    (Total members · Generations · Earliest record · Places documented · Portraits & artifacts).
- **Mobile:** stats panel collapses; rail narrows; oak opens zoomed to the focus cluster.

## Components
- **AppFrame / chrome** — ornamental green+gilt border + botanical corners (raster-able).
- **PersonMedallion** — oval portrait (colour photo, or cameo silhouette placeholder) in an
  **engraved frame**; keep the era distinction: **gilt bevel** for classic (pre-1950),
  **engraved double-rule** for modern (1950+). **Nameplate** below: warm parchment tablet with a
  **gilt inner rule** + soft shadow + small roll/keystone — *avoid flat/plastic fills* (use a
  vignette + gradient). Name (Cinzel) + lifespan years (EB Garamond italic).
- **TimeRail** (replaces the bare `YearAxis`) — framed rail; continuous birth-year scale;
  **zoom-adaptive ticks**; optional era bands; orients left (vertical) or bottom (horizontal).
- **Controls** — TabNav, SearchField, LanguageSelector (full name), OrientationToggle.
- **StatsPanel** — A-skin card.
- **PersonPopup** — glass detail (existing), restyled to tokens.

## Motion
- **Minimal-functional.** Pan inertia subtle; zoom smooth; **tick/era reflow** on zoom;
  **orientation flip** animates the transpose (~250–350ms ease-in-out). Easing: enter `ease-out`,
  move `ease-in-out`. Durations: micro 100ms / short 200ms / medium 300ms.

## Decisions log
| Date | Decision | Rationale |
|---|---|---|
| 2026-06-08 | Base aesthetic = sepia heraldic engraving ("little gothic"), light & warm | User pick (C over A/B; B "too dark/ornament-heavy" rejected) |
| 2026-06-08 | Framed "chronicle page", hybrid: adaptive SVG/CSS chrome over parchment texture | User-locked foundation |
| 2026-06-08 | Brighter, greener, more colour; remove crest | User feedback round 2 |
| 2026-06-08 | Controls follow B; **stats panel** follows A | User feedback |
| 2026-06-08 | Title in Cinzel (lighter), not heavy blackletter | User: "title less heavy" |
| 2026-06-08 | Continuous birth-year axis + zoom-adaptive ticks (not fixed decade rows) | User: rows "won't adapt to scale" |
| 2026-06-08 | Visual baseline = prototype **v1** (lighter), B-skin richness optional polish | User: "move on with v1" |
| 2026-06-08 | Portraits in natural colour; optional light heirloom tint | User question resolved |
