# Rectangular family connectors — design

**Date:** 2026-06-27
**Status:** Approved (brainstorming)
**Topic:** Replace the per-(parent→child) diagonal "rope" connectors with orthogonal
(right-angle) routing through union junctions, to remove branch tangle.

## Problem

Today every parent emits a **separate** descent connector straight to each child
(`finishLayout` in `src/frontend/src/layout/treeLayout.ts`). A couple with N
children therefore produces **2N** diagonal lines fanning out from two different
origins and crossing each other — the visual "tangle". In the **Film** theme these
are sagging red-string ropes (`oakConnectors.ts`, `RopeLink.vue`); in **Classic**
they are bark-coloured cubic curves (`branchPath` in `OakTree.vue`). Both share the
same fan-out topology, so the tangle is independent of stroke style.

## Goal

Route each family with clean rectangular elbows that read as a single structure:
the two spouses' lines drop and **join into one** line, which travels to the
children's generation, **spreads horizontally** along a sibling bus bar, and each
child hangs from that bar. Apply to **both themes** and **both orientations**.

## Decisions (from brainstorming)

1. **Theme scope — both themes.** Film keeps its red colour and rope texture, but on
   straight orthogonal segments instead of sagging curves. Classic uses bark strokes.
2. **Siblings at different birth years — bus bar above siblings.** The vertical axis
   is time (birth year), so siblings are not on a shared row. One horizontal bus bar
   is placed just *before* the earliest-born child; each child drops to its node with
   its own stub (stub length encodes the age gap).
3. **Visible junction nodes.** A small themed marker (diamond/bead) at both the
   couple-join (marriage point) and the children-branch point.
4. **Both orientations.** Works in vertical (time ↓) and horizontal (time →); the
   junction/bus geometry mirrors per axis.

## Why render-time routing (Approach A)

Orientation and the orientation-morph animation are handled downstream of
`buildLayout`:

- `projection.ts` transposes node coordinates for horizontal mode and **recomputes
  link endpoints from the projected nodes**.
- `layoutFlip.ts` (`blendLayout`) lerps node positions during the morph and again
  **recomputes link endpoints from the blended nodes**.

Orthogonal routing needs more than two endpoints — junction points, a bus bar, and
per-child stubs — and those depend on the positions of **all** parents and children
of a union. Baking them in `buildLayout` would leave them stale after projection or a
morph frame. Therefore the layout emits only **topology (IDs)**, and the actual
segment geometry is derived from the **current** node positions at render time. This
makes both orientations and the morph work with no extra routing code in
`projection.ts` / `layoutFlip.ts`.

## Architecture

### 1. Topology model — `layout/treeLayout.ts`

Replace the coordinate-bearing `LayoutLink` model (`descent` + `union`) with an
ID-only union model:

```ts
export interface FamilyUnion {
  id: string;
  parentIds: string[]; // present partners (0–2 in practice)
  childIds: string[];  // present children
  generation: number;  // max child generation present — drives entrance reveal
}
```

- `TreeLayout.links: LayoutLink[]` → `TreeLayout.unions: FamilyUnion[]`.
- Emitted in `finishLayout` by walking `graph.unions`, filtering `partnerIds` /
  `childIds` to those with a present node, and recording `generation` as the max
  child generation present (matches the old `linkGeneration` bucketing for descent;
  childless unions fall back to the later partner's generation).
- Unions with no present parent **and** no present child are skipped.
- `projection.ts` and `layoutFlip.ts` **drop** their link-endpoint recomputation;
  `unions` carry no coordinates and pass through unchanged.

### 2. Pure routing geometry — `layout/familyRouting.ts` (new)

A pure module, fully unit-tested, working in abstract **(time T, spread S)**
coordinates so one function serves both orientations:

- **vertical:** T = y (increases downward = later), S = x.
- **horizontal:** T = x (increases rightward = later), S = y.

```ts
interface Pt { x: number; y: number; }
interface Seg { a: Pt; b: Pt; }
type Axis = 'y' | 'x'; // which screen axis is "time"

interface FamilyRoute {
  parentStubs: Seg[];   // each parent → couple bar
  coupleBar: Seg | null;// between two parents (null if <2 parents)
  trunk: Seg | null;    // couple/marriage point → bus bar (null if no children)
  busBar: Seg | null;   // along S across children (+ midS); null if no children
  childStubs: Seg[];    // bus bar → each child
  marriageJunction: Pt | null; // at (coupleT, midS) when ≥1 parent
  branchJunction: Pt | null;   // at (busT, midS) when there are children
}

function routeFamily(parents: Pt[], children: Pt[], axis: Axis, opts: RouteOpts): FamilyRoute;
```

Geometry (T grows toward the children):

- `coupleT = max(parentT) + COUPLE_DROP` — couple bar sits just past the latest parent.
- `midS = mean(parentS)` (couple centre); for a single parent, `midS = that parent's S`.
- **parentStubs:** for each parent, a segment along T from its node to `(coupleT, parentS)`.
- **coupleBar:** along S from `min(parentS)` to `max(parentS)` at `coupleT` — only when
  2 parents are present. **marriageJunction** at `(coupleT, midS)`.
- `busT = min(childT) − CHILD_RISE`, clamped to `≥ coupleT` so the trunk never inverts.
- **trunk:** along T from `(coupleT, midS)` to `(busT, midS)`. **branchJunction** at
  `(busT, midS)`.
- **busBar:** along S spanning `[min(childS, midS) … max(childS, midS)]` at `busT`
  (extended to include `midS` so the trunk always meets the bus).
- **childStubs:** for each child, a segment along T from `(busT, childS)` to its node.

Degenerate cases:

- **1 parent present** (other partner unknown/absent): no couple bar; marriage junction
  sits at the lone parent's drop point `(coupleT, parentS)`.
- **0 children** (childless couple): couple bar + marriage junction only; no trunk / bus
  / stubs. This replaces the old dashed `union` line.
- **1 child:** bus bar collapses toward a point; trunk and the single stub may be
  collinear — still renders correctly.
- **child(ren) earlier in time than the couple** (malformed data): `busT` clamp keeps
  the trunk length ≥ 0.

`opts` carries the tunables: `COUPLE_DROP`, `CHILD_RISE`, and is axis-agnostic. The
function converts every `(T, S)` back to `(x, y)` according to `axis`.

### 3. Themed renderer — `components/FamilyConnector.vue` (new)

Props: `union: FamilyUnion`, `nodeById: Map<string, LayoutNode>`, `axis: Axis`,
`film: boolean`, `drawGen: number`.

- Reads the **current** positions of the union's present parents/children from
  `nodeById` (reactive — recomputes on projection and on every morph frame), calls
  `routeFamily`, and renders the segments as orthogonal `<path>`/`<line>`.
- **Film theme:** red rope colour (`--rope`) plus the layered twist + shadow texture
  carried over from `RopeLink`, but on straight segments (no sag). Junction marker =
  a red knot/bead.
- **Classic theme:** `--bark` / `--bark-dark` strokes. Junction marker = a small gilt
  diamond node.
- **Junction nodes:** a small diamond glyph (`marriageJunction`, `branchJunction`),
  themed via CSS class, ~6px, matching the sketch.
- **Entrance hooks preserved:** descent segments (parent stubs, trunk, bus bar, child
  stubs) carry `data-entrance-draw = union.generation`; the couple bar carries
  `data-entrance-fade`. Verify the existing ceremony still draws/fades them (it selects
  by these data attributes; multiple paths per union all animate together).

### 4. Wiring + cleanup — `components/OakTree.vue`

- Replace the `oak__branches` and `oak__unions` template blocks with
  `<FamilyConnector v-for="u in layout.unions" :key="u.id" …>`, wrapped in the existing
  `branchOpacity` group so the morph cross-fade is unchanged.
- Remove `branchPath`, `ropePath`/`RopeLink` usage, `descentLinks` / `unionLinks`.
- Pass `axis` = `'x'` when the effective orientation is horizontal, else `'y'`
  (derive from `branchOrientation ?? orientation`).
- Delete `components/oakConnectors.ts`, `components/RopeLink.vue`, and their specs
  (`oakConnectors.spec.ts`, `RopeLink.spec.ts`) — superseded.

### 5. Tests

- **New:** `layout/familyRouting.spec.ts` — segment counts, junction coordinates,
  `busT`/`coupleT` clamps, both axes, degenerate cases (1 parent, 0/1 child).
- **New:** `components/FamilyConnector.spec.ts` — renders expected segments + junction
  markers per theme; entrance data attributes present.
- **Update:** `treeLayout.spec.ts` (links → unions), `OakTree.spec.ts`,
  `projection.spec.ts`, `layoutFlip.spec.ts`, `entranceCues.spec.ts` to the new model.

### 6. Docs

- `docs/reference/` — update the connector/visualization behaviour description.
- `CLAUDE.md` overview — the "red-string rope connectors" phrase becomes rectangular
  routing through union junction nodes (Film retains red colour/texture).

## Constants (initial, tuned live in preview)

| Name          | Purpose                                   | Start |
|---------------|-------------------------------------------|-------|
| `COUPLE_DROP` | parent node → couple bar offset along T   | 26 px |
| `CHILD_RISE`  | bus bar offset before earliest child along T | 26 px |
| junction size | diamond half-extent                       | 4 px  |
| stroke width  | per theme (Film rope ~1.5, Classic taper) | —     |

## Out of scope

- Re-introducing the sag/organic curve as an option.
- Changing node placement / the overlap separation pass (`separateOverlaps`).
- Couple pairing or per-epoch background changes (tracked elsewhere).

## Verification

Run the app (both themes, both orientations) and confirm: no fan-out crossings; each
couple joins into one trunk that spreads to a bus bar; junction nodes render; the
"Grow the tree" entrance still draws connectors in per generation; the orientation
toggle morph stays smooth.
