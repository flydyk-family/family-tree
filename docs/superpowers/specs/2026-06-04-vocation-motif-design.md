# Vocation Motif — Design Spec

- **Date:** 2026-06-04
- **Status:** Approved for planning
- **Branch:** `feature-frontend-interactions`
- **Refines:** [`2026-06-03-family-tree-design.md`](2026-06-03-family-tree-design.md) §7 ("Vocation motifs")

## 1. Purpose

Spec §7 calls for "a subtle icon/motif per vocation (teacher, church, writer, office, other), shown at least in the popup; optionally a small mark on the node." The frontend-interactions phase shipped only the localized vocation *label* text (`PersonPopup.vue` — the `vocationLabel` computed and the `.popup__vocation` paragraph). No visual motif exists yet.

This change adds a subtle per-vocation motif beside the vocation label in the person popup.

## 2. Scope

**In scope**
- A reusable `VocationIcon.vue` presentational component that renders a line-art motif for a given vocation.
- Integration into `PersonPopup.vue` next to the existing vocation label.
- Vitest unit coverage (TDD).

**Out of scope (now)**
- The optional mark on the oak node (`OakTree.vue`) — deliberately deferred to keep the oak uncluttered at zoom-out. The component is built to be reusable there later.
- New i18n strings — the icon is decorative; localized vocation labels already exist under the `vocation.*` key block.
- New dependencies.

## 3. The five motifs

Subtle, single-color line-art on a `0 0 24 24` viewBox, `stroke-width ~1.4`, round joins/caps, `fill="none"`:

| Vocation  | Motif         |
|-----------|---------------|
| `teacher` | open book     |
| `church`  | cross         |
| `writer`  | quill pen     |
| `office`  | ledger sheet  |
| `other`   | oak leaf      |

Exact path geometry is refined with real screenshots during implementation; the table fixes the *concept* per vocation.

## 4. Component: `VocationIcon.vue`

Location: `src/frontend/src/components/VocationIcon.vue`.

- **Props:** `vocation: string` — the `PersonDetail.vocation` enum value (`teacher | church | writer | office | other`).
- **Rendering:** a `const MOTIFS: Record<string, string>` (or `Record<string, ...>` of path data) maps each known vocation to its SVG path markup. The template renders a single `<svg viewBox="0 0 24 24">` containing the selected motif.
- **Graceful degradation:** an unknown or empty `vocation` renders **nothing** (no `<svg>`), so the popup never shows a broken or placeholder icon for data outside the enum.
- **Subtlety / palette:** strokes use `stroke="currentColor"` and `fill="none"`. The icon therefore inherits the surrounding text color (`--ink-soft`) rather than hardcoding hex — subtle by construction and automatically palette-correct.
- **Accessibility:** the svg is decorative — `aria-hidden="true"` and `focusable="false"`. The visible vocation label already conveys the meaning, so the icon must not double-announce to assistive tech.
- **Test hooks:** `data-test="vocation-icon"` and `data-vocation="<value>"` on the root svg.

Rationale for a dedicated component (vs inlining SVG in the popup): matches the spec's "SVG rendered by Vue components", keeps the popup template lean, and makes the motif trivially reusable if a node mark is added later.

## 5. Integration: `PersonPopup.vue`

The existing vocation line:

```html
<p class="popup__vocation">{{ vocationLabel }}</p>
```

becomes an inline-flex row pairing the icon with the label, rendered only when a vocation label is present:

```html
<p v-if="vocationLabel" class="popup__vocation">
  <VocationIcon :vocation="detail.vocation" />
  {{ vocationLabel }}
</p>
```

SCSS additions (scoped): `.popup__vocation` gains `display: inline-flex; align-items: center; gap: 6px;`, and the icon is sized `width: 15px; height: 15px; color: var(--ink-soft);` to match the 13px label.

The icon component also no-ops on unknown values (§4), so the two guards are complementary: the label stays for any non-empty vocation, and the icon appears only for known motifs.

## 6. Testing (TDD, Vitest + Vue Test Utils)

Write tests first, watch them fail, then implement.

**New `src/frontend/src/components/VocationIcon.spec.ts`:**
- For each of the five vocations, mounting with that `vocation` renders an svg whose `data-vocation` matches and which contains the expected motif (assert on a distinguishing path / a per-motif marker).
- An unknown vocation (e.g. `"unknown"`) and an empty string render **no** svg.
- The rendered svg carries `aria-hidden="true"`.

**Extend `src/frontend/src/components/PersonPopup.spec.ts`:**
- The popup renders the vocation icon (`[data-test="vocation-icon"]` with `data-vocation="teacher"`) next to the label for the existing `teacher` fixture.
- The existing "renders the localized vocation label" test remains green.

## 7. Conventions

Follows `CLAUDE.md` and the established frontend patterns: Vue 3 `<script setup lang="ts">`, scoped SCSS using design tokens / CSS custom properties, `data-test` hooks, Vitest naming consistent with the existing frontend specs.
