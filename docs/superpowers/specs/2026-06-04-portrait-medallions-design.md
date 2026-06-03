# Portrait Medallions & Era-Focused Default View — Design Spec

- **Date:** 2026-06-04
- **Status:** Approved for planning
- **Branch:** `feature-frontend-portrait-medallions`
- **Refines:** [`2026-06-03-family-tree-design.md`](2026-06-03-family-tree-design.md) §7 ("Visual design"), §6 ("Layout concept")
- **Follows up:** frontend-interactions PR (#6) — explicit deferred item.

## 1. Purpose

The oak nodes in [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue) are currently plain SVG circles (`<circle class="oak__medallion">`, sized by `nodeRadius()`), with the person's name above and nothing below. This change makes each node read like a **framed portrait medallion** in a XIX-century family tree:

1. **Portrait oval** — a portrait-orientation ellipse that shows the person's portrait image when one exists, and a styled initials placeholder (the common path — seed data has no portraits) otherwise.
2. **Era-based frame** — the oval is framed in one of two period styles chosen by birth year, evoking 18th/19th-century portrait frames.
3. **Lifespan label** — birth–death years shown in a small label *below* the medallion.
4. **Era-focused default view** — on first load the camera frames the two most-recent generations (excluding the very newest tier), so portraits of the living family are legible instead of the whole tree being zoomed out.

## 2. Scope

**In scope (frontend only)**
- Replace the circle medallion with a portrait `<ellipse>` + portrait `<image>` / initials placeholder, in a new presentational `PersonMedallion.vue`.
- Two era-based frame styles (engraved double-rule / faded gilt bevel) selected by birth year.
- A birth–death label below the medallion, via a new `formatYearSpan` helper.
- Initial-load camera framing of the recent generations, via a pure `initialFocusBounds` helper wired into `usePanZoom`.
- New muted-gilt design tokens.
- `/assets` added to the Vite dev proxy so portrait URLs resolve in dev.
- Vitest (TDD) coverage for all of the above.

**Out of scope (now)**
- **Backend changes.** Seed `family.json` has no portrait values, so the `<image>` path is forward-wiring only; no `wwwroot/` assets, controllers, or DTO changes. The convention (§8) is documented so portraits "just work" when added.
- The vocation node-mark and gallery (deferred elsewhere).
- New dependencies.

## 3. Component split: `PersonMedallion.vue`

Location: `src/frontend/src/components/PersonMedallion.vue`.

The per-node visual (oval, frame, image/initials, name, dates) moves into a dedicated presentational component so the era/frame/portrait logic is unit-testable in isolation and `OakTree.vue` stays focused on tree geometry and pan/zoom.

- **Props:** `node: LayoutNode`, `selected?: boolean`.
- **Renders** (SVG fragment, no wrapping `<g>` transform — see below): the name `<text>`, the medallion ellipse(s), the portrait `<image>` or initials `<text>`, and the lifespan `<text>`. Name and initials are localized via the locale store + `localize`, exactly as `OakTree.displayName` does today (the component reads the store directly; `OakTree` keeps its own `displayName` for the node's `aria-label`).
- **Does NOT own** the node's `translate(...)` transform, click/keydown handlers, `role`/`tabindex`/`aria-label`, or the `oak__node` class. Those stay on the `<g data-test="node">` in `OakTree.vue`, which renders `<PersonMedallion>` as its child. This keeps interaction/accessibility in one place and presentation in the other.

`OakTree.vue` node loop becomes:

```html
<g data-test="node" ... :transform="`translate(${node.x}, ${node.y})`" :class="[...]"
   @click="onNodeActivate(node)" @keydown.enter... @keydown.space...>
  <PersonMedallion :node="node" :selected="node.id === selectedId" />
</g>
```

Because child SVG renders inline into the mounted tree, existing `OakTree.spec` selectors (`.oak__name`, `.oak__medallion`, `[data-test="node"]`) keep resolving.

## 4. Medallion geometry & sizing

Circle → portrait `<ellipse>` (`ry > rx`). `OakTree.nodeRadius()` is replaced by `nodeRadii(node): { rx: number; ry: number }` (living in the medallion module), role-scaled and slightly larger than today so a face/initial is legible:

| role          | rx | ry |
|---------------|----|----|
| `trunk`       | 15 | 19 |
| `branch` / `root` | 12 | 15 |
| `leaf`        | 10 | 13 |

These fit within the layout's `xGap` (70) and `spouseGap` (46) without overlap.

## 5. Era-based frame

`frameStyle(node): 'modern' | 'classic'` chooses by birth year, falling back to the layout's estimated year, then to classic:

```
const era = node.person.birthYear ?? node.year;   // node.year is always present
return era >= 1950 ? 'modern' : 'classic';
```

**Modern — engraved double-rule (birth ≥ 1950).** Two concentric strokes on the oval: an outer rule in `--ink-soft` (~`stroke-width` scaled with size, ≈2–2.5) and a thinner inner rule in `--bark`. Minimal, clean, quietly antique. Existing tokens only.

**Classic — faded gilt bevel (birth < 1950).** A thick beveled band stroked with a vertical **gilt gradient**, a faint top **sheen** line, and a thin dark inner edge where the band meets the portrait — the daguerreotype/cameo look. Uses the new gilt tokens (§7).

Selection/focus: both the engraved outer rule and the gilt band carry the `oak__medallion` class so the existing selected/focus stroke rules (`.oak__node--selected .oak__medallion`, `:focus-visible .oak__medallion`) apply unchanged.

## 6. Portrait image vs initials placeholder

Per medallion:

- **Base ellipse** `oak__medallion` — parchment fill + the era frame. Always present; it is the placeholder surface and the layer behind a portrait.
- **No portrait (common path):** a centered `oak__initials` `<text>` = first letter of the localized given name, uppercased (mirrors `PersonPopup`'s `initial`). Empty name → no glyph.
- **Has portrait:** a per-node `<clipPath>` containing an ellipse matching the medallion (default `userSpaceOnUse`, so a `(0,0)` ellipse clips in the node's local coordinates), an `<image>` filling `[-rx,-ry] → [rx,ry]` with `preserveAspectRatio="xMidYMid slice"` and `clip-path="url(#oak-clip-<id>)"`, then the frame ellipse(s) drawn **on top** so the border frames the photo. The `<image>` gets `data-test="portrait"`.

The gilt **gradient** is defined once in an `OakTree`-level `<defs>` (`id="oak-gilt"`, stops bound to the gilt tokens); each `PersonMedallion` references it and emits its own `clipPath` when it has a portrait.

## 7. Design tokens (`src/frontend/src/styles/tokens.scss`)

Add a muted, desaturated "faded gilt" ramp (kept low-chroma to sit inside the XIX-c. palette), as both SCSS vars and CSS custom properties:

| token         | value     | use                          |
|---------------|-----------|------------------------------|
| `--gilt-light`| `#dcc391` | gradient top                 |
| `--gilt`      | `#b2935c` | gradient mid / band body     |
| `--gilt-deep` | `#7c5f38` | gradient bottom              |
| `--gilt-sheen`| `#e8d6ab` | thin highlight line          |

The classic frame's inner edge reuses the existing `--ink` (`#4a3f33`).

## 8. Portrait asset URL convention

`portraitUrl(node)` builds a **relative** URL from the `portrait` filename:

```
`/assets/portraits/${node.person.portrait}`     // e.g. "p-0001.jpg" → /assets/portraits/p-0001.jpg
```

- **Production:** portraits live under the backend's static root at `wwwroot/assets/portraits/`; `app.UseStaticFiles()` already serves them at that path. (Creating the folder / adding images is a future data task, not part of this change.)
- **Development:** the Vue dev server (`:5173`) must forward `/assets` to the API (`:5037`), so add it next to the existing `/api` entry in [`vite.config.ts`](../../../src/frontend/vite.config.ts):

```ts
proxy: {
  '/api':    { target: 'http://localhost:5037', changeOrigin: true },
  '/assets': { target: 'http://localhost:5037', changeOrigin: true }
}
```

Relative URLs keep the same path working in both environments.

## 9. Lifespan label & helper

**Helper** — extend [`lifespan.ts`](../../../src/frontend/src/format/lifespan.ts). `PersonSummary` carries bare `birthYear`/`deathYear` numbers (no `approx`), so add:

```ts
export function formatYearSpan(birthYear: number | null, deathYear: number | null): string
```

It produces the same locale-neutral shape as `formatLifespan` — `"1762–1828"`, `"1962–"` (living), `"–1900"` (unknown birth), `""` (nothing known) — but with **no `~` tilde** (numbers carry no approximate flag). The existing `formatLifespan` is refactored to share the join/format core; its behaviour and tests are unchanged.

**Rendering** — in `PersonMedallion`:
- The name `<text class="oak__name">` moves up to clear the taller oval: `y = -(ry + 6)`.
- A new `<text class="oak__dates" data-test="lifespan">` sits below: `y = ry + 14`, `text-anchor="middle"`, ~9px, fill `--ink-soft`. Text = `formatYearSpan(node.person.birthYear, node.person.deathYear)`; renders empty (no visible label) when the span is `""`.

## 10. Era-focused default view

**Goal:** on first load, frame the two most-recent generations *after excluding the single newest tier* — e.g. for the seed tree (root Tadeusz), gens **+1 (1987–1995)** and **0 (1959–1967)**, leaving the 2018/2021 babies just above the frame. Nothing is removed; the full tree stays rendered and pannable.

**Pure helper** — `src/frontend/src/layout/focusBounds.ts`:

```ts
export function initialFocusBounds(
  nodes: LayoutNode[],
  opts?: { generations?: number; excludeNewest?: number }
): { minX: number; maxX: number; minY: number; maxY: number }
```

- `generations` default **2**, `excludeNewest` default **1**.
- Take the distinct generations, sorted descending. If there are **fewer than `excludeNewest + generations`** of them (i.e. < 3 by default), frame **all** nodes — the tree is too shallow to meaningfully exclude a tier, so fit everything.
- Otherwise drop the first `excludeNewest` (the newest tier) and take the next `generations` tiers; the framed nodes are those whose `generation` is in that window (for the default seed tree, gens `{max−1, max−2}`).
- Bounds computed from the framed nodes' `x`/`y` centers — identical shape/units to `layout.bounds`, so `fitToBounds` (with its existing 60px padding) frames them with breathing room. Empty `nodes` yields a degenerate/zero bounds.

**Wiring** — `usePanZoom` gains an optional `initialBoundsRef: Ref<Bounds | null>`. Its `fit()` uses `initialBoundsRef?.value ?? boundsRef.value`; everything else (re-fit on resize/bounds change while `!userAdjusted`, pan/zoom math) is untouched. `OakTree.vue` passes `initialBoundsRef = computed(() => initialFocusBounds(props.layout.nodes))` alongside the existing full `boundsRef`. Once the user pans/zooms (`userAdjusted`), auto-fit stops as today.

## 11. Testing (TDD, Vitest + Vue Test Utils)

Write tests first, watch them fail, then implement.

**Extend `src/frontend/src/format/lifespan.spec.ts`** (`formatYearSpan`):
- `(1762, 1828) → "1762–1828"`
- `(1962, null) → "1962–"`
- `(null, 1900) → "–1900"`
- `(null, null) → ""`
- existing `formatLifespan` tests remain green.

**New `src/frontend/src/components/PersonMedallion.spec.ts`:**
- Renders an `<ellipse class="oak__medallion">` (not a `<circle>`).
- `portrait: null` → renders the initials text (first letter of localized name), and **no** `[data-test="portrait"]`.
- `portrait: "p-0001.jpg"` → renders `[data-test="portrait"]` with `href` (or `xlink:href`) `"/assets/portraits/p-0001.jpg"` and **no** initials.
- Frame by era: `birthYear: 1980` → modern/engraved marker present; `birthYear: 1900` → classic/gilt marker present; `birthYear: null` falls back to `node.year`.
- Lifespan: renders `[data-test="lifespan"]` with `formatYearSpan(birthYear, deathYear)` below the medallion.
- `selected` adds the relevant class/state.

**New `src/frontend/src/layout/focusBounds.spec.ts`:**
- Nodes across ≥3 generations → bounds cover only the `{max−1, max−2}` tiers (newest excluded, older excluded).
- Fewer than 3 generations → falls back to bounds over all nodes.
- Empty nodes → safe zero/degenerate bounds.

**Extend `src/frontend/src/components/OakTree.spec.ts`:**
- One `<ellipse class="oak__medallion">` (or one `PersonMedallion`) per person; existing node/branch/select/locale tests stay green.

## 12. Conventions

Follows `CLAUDE.md` and established frontend patterns: Vue 3 `<script setup lang="ts">`, scoped SCSS using design tokens / CSS custom properties, `data-test` hooks, descriptive Vitest `it(...)` strings consistent with the existing frontend specs. Branch off `integration`, PR into `integration`.
