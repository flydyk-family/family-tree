# Unified photo manager — design

**Date:** 2026-06-28
**Status:** Design approved; ready for implementation plan.
**Builds on:** [2026-06-28-editor-photo-upload-design.md](2026-06-28-editor-photo-upload-design.md) (the photo feature this redesigns the UI of).

## Summary

Collapse the person popup's three separate photo blocks — the read-only gallery
strip (`GalleryViewer`), the portrait block, and the gallery block (both in
`PhotoManager`) — into **one unified photo grid**. The portrait is simply
whichever photo is flagged as the portrait; there is no separate portrait
concept in the UI. Every image carries its own on-image actions (set as
portrait, remove), and an "Add photo" tile lives in the grid. Visitors (not
signed in) see the same grid, read-only. This is a **frontend-only** rebuild:
the existing API (`promote` / `delete` / upload with `role`) and DTO already
support everything, so there is no backend change and no data migration.

## Goals

- One photo section in the popup instead of three.
- Per-image actions on the image: set as portrait, remove.
- An "Add photo" affordance inside the grid.
- The portrait is chosen from the same set of photos (star one).
- Visitors see the same grid, read-only, with a lightbox.
- No regression to the resilient-save UX (busy state, inline error, no data loss).

## Non-goals

- Backend / API / DTO changes (none needed).
- Reordering photos, captions, cropping (still out of scope).
- Editing seed (`family.json`) media in-app (uploaded photos remain overrides).
- Multi-select / bulk actions.

## Decisions locked during brainstorming

| Question | Decision |
|---|---|
| Layout | **A — unified equal-size grid** (portrait badged; per-tile star + trash; Add tile) |
| Visitor view | **Same grid, read-only** (no buttons, no Add tile; lightbox on click) |
| Portrait model | Portrait is one photo of the set, flagged; set by starring |
| Add behavior | If no portrait yet, the first added photo becomes the portrait; otherwise it appends to the grid |
| Backend | **Unchanged** — frontend composes the unified list over existing endpoints |

## The unified photo list

The component composes a single ordered list from the existing `PersonDetail`:

```
items = [ portraitItem? , ...galleryItems ]
```

- **`portraitItem`** exists when `detail.portrait` is set. It renders with a
  gold ring + a "Portrait" tag. Its identity comes from `detail.portrait` /
  `detail.portraitThumb` (strings). Because the portrait is never also in the
  gallery (promote moves the previous portrait back into the gallery), the
  list has no duplicates.
- **`galleryItems`** come from `detail.gallery` (`Photo[]` — each `{ id, full, thumb }`).

A photo's URL is resolved with the existing `resolveMediaUrl` (thumb for the
grid, full for the lightbox).

### Seed vs uploaded portrait

A portrait sourced from the `family.json` seed is a **bare filename**
(`p-0001.jpg`); an editor-uploaded portrait is a full key (`uploads/…`,
contains `/`). The component uses this existing rule (the same one
`resolveMediaUrl` keys on) to decide whether the portrait is removable:

- **Uploaded portrait** (key contains `/`) → shows the remove (trash) action;
  remove calls `deletePortrait`.
- **Seed portrait** (no `/`) → shows the "Portrait" badge but **no remove**;
  seed media is not editable in-app.

## On-image actions (editor)

Each tile (except the Add tile) shows small icon buttons, revealed on hover /
keyboard focus on pointer devices and always visible on touch
(`@media (hover: none)`); every button is focusable with an `aria-label`.

| Tile | ★ Set as portrait | 🗑 Remove |
|---|---|---|
| Gallery photo | `promoteGalleryPhoto(id)` — previous portrait drops back into the grid (lossless, already implemented) | `deleteGalleryPhoto(id)` |
| Uploaded portrait | not shown (it already is the portrait) | `deletePortrait()` |
| Seed portrait | not shown | not shown |

- **Add tile** (`＋ Add photo`): a file input (`accept="image/*"`). Uploads via
  `uploadPhoto(id, file, role)` where `role = 'portrait'` when the person has
  **no** portrait yet, else `'gallery'`. So a person with no face goes from
  initials → portrait in one action.
- Clicking the **image body** (not a button) opens `MediaLightbox` at that
  photo's index (the `initialIndex` prop already exists). Buttons
  `stopPropagation` so they don't also open the lightbox.
- Delete uses an **inline confirm** (per-tile two-step), not `window.confirm`
  (matches the current `PhotoManager` and stays testable).

## Visitor (read-only) view

The same grid renders for everyone, but for non-editors there are **no action
buttons and no Add tile**. When `items` is empty, the component renders
nothing. Clicking a tile opens the lightbox at that photo. The portrait still
also appears in the header/medallion (`PersonHeader`), unchanged.

## Resilience

A `busy` ref disables all inputs/buttons during an in-flight request. On
rejection, an inline error (`data-test="photo-error"`) is shown and the user's
state is preserved (no tiles disappear, no selection lost). Each successful
call emits `updated(PersonDetail)`; `PersonDossier` applies it via
`useSelectionStore().applyDetail(updated)` — the same path biography saves use.

## Components & data flow

- **New: `src/frontend/src/components/PersonPhotos.vue`** — props
  `{ detail: PersonDetail; canEdit: boolean }`, emits `updated(PersonDetail)`.
  Owns the unified list, the grid, editor actions, the Add tile, the inline
  delete-confirm, the busy/error state, and the lightbox (Teleport, reusing
  `MediaLightbox` + `MediaItem`).
- **Removed:** `GalleryViewer.vue`, `PhotoManager.vue` (and their specs) — their
  responsibilities move into `PersonPhotos.vue`.
- **Modified: `PersonDossier.vue`** — replace the two old mounts with a single
  `<PersonPhotos :detail="detail" :can-edit="canEdit" @updated="onDetailUpdated" />`
  (it already computes `canEdit` and has `onDetailUpdated → selection.applyDetail`).
- **Unchanged:** `photosApi.ts` (all four functions reused), `resolveMediaUrl`,
  `MediaLightbox.vue`, `PersonHeader.vue`, the backend, the DTO.
- **i18n:** consolidate the photo keys (set as portrait, remove, add photo,
  Portrait badge, confirm delete, save failed) across `ru` / `be` / `en` at
  structural parity; drop now-unused keys.

## Testing

- **`PersonPhotos.spec.ts`** (Vitest, mock `photosApi`, Pinia + i18n, Teleport stub):
  - renders the unified list = portrait first then gallery; portrait tile badged.
  - editor: star on a gallery tile → `promoteGalleryPhoto(id)`; trash on a gallery
    tile → `deleteGalleryPhoto(id)` (after inline confirm); trash on an uploaded
    portrait → `deletePortrait()`; Add with no portrait → `uploadPhoto(id, file, 'portrait')`;
    Add with a portrait present → `uploadPhoto(id, file, 'gallery')`; each emits `updated`.
  - seed portrait (`portrait` without `/`) → badge shown, no remove button.
  - upload rejection → `data-test="photo-error"` shown, state preserved.
  - read-only (`canEdit=false`) → no action buttons, no Add tile; empty → renders nothing.
  - clicking a tile image opens `MediaLightbox` with the clicked `initialIndex`.
- **`PersonDossier.spec.ts`** — `PersonPhotos` mounts; `@updated` calls
  `selection.applyDetail`; visible to visitors, editor-actions only when `canEdit`.
- Remove the obsolete `GalleryViewer.spec.ts` / `PhotoManager.spec.ts`.

## Risks & notes

- **Seed-portrait edge** is handled explicitly (badge, no remove) so the editor
  is never offered an action that silently no-ops.
- **No backend change** keeps the blast radius small; the redesign is reversible
  and ships behind the existing `canEdit` gate.
- **Lightbox index** relies on the `initialIndex` prop added in the post-review
  cleanup — already in place.
