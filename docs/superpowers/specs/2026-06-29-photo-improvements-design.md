# Photo improvements — design

**Date:** 2026-06-29
**Status:** Design approved; ready for implementation plan.
**Builds on:** [2026-06-28-unified-photo-manager-design.md](2026-06-28-unified-photo-manager-design.md) and the original [2026-06-28-editor-photo-upload-design.md](2026-06-28-editor-photo-upload-design.md).

## Summary

Five improvements to the unified person-photo grid: a 5-item media cap (front + back), two CSS fixes (delete-confirm readability, icon centering), live medallion updates on a portrait change, and keeping a displaced seed portrait in the gallery (re-selectable). Items 1 and 5 touch the backend; the rest are frontend.

---

## 1. Limit media to 5 per person (frontend + backend)

**Goal:** at most **5** total grid items per person (portrait + gallery, including a displaced seed tile) — one row. Hide the "Add photo" tile at the cap; reject over-cap uploads on the backend.

- **Constant:** `5`, defined once on each side (`MaxMediaPerPerson` in the handler; `MAX_PHOTOS` in `PersonPhotos.vue`), documented to stay in sync.
- **Frontend:** the Add tile renders only when `canEdit && items.length < 5` (`items` = portrait + gallery as already composed).
- **Backend:** in `AddPersonPhotoHandler`, after fetching the merged `existing` person (already done at the top) and **before** processing/storing the image, compute
  `count = (existing.Portrait is not null ? 1 : 0) + existing.Gallery.Count` and throw a new
  `MediaLimitExceededException` when `count >= MaxMediaPerPerson`. The merged `existing.Gallery`
  already includes the virtual seed tile (see §5), so the count matches what the grid shows.
- **Error mapping:** `PeopleController.AddPhoto` catches `MediaLimitExceededException` → `BadRequest(new { title })`, mirroring the existing `InvalidImageException` catch.
- **Validator:** unchanged (FluentValidation has no store access; the count check lives in the handler).
- **Tests:** handler unit test (at-limit → throws); integration (a 6th upload → 400); `PersonPhotos.spec` (Add tile hidden when items.length === 5, shown at 4).

## 2. Delete-confirm readability + clipping (CSS)

**Root cause:** the inline confirm "Remove" text pill (`--warn`, `width: auto`) is wider than the 76 px tile and gets clipped by the tile's `overflow: hidden`; `umber`/`on-accent` also reads low-contrast.

**Fix (in `PersonPhotos.vue`):** replace the text confirm pill with an **icon-only confirm** — a check (✓, confirm) button plus the existing ✕ (cancel), both the same 24 px round button as star/trash. The ✓ carries a danger/affirmative color, and the `photos.confirmRemove` i18n key is **repurposed** from a visible button label to the ✓ button's `aria-label` + `title` (reword it to "Confirm remove"); the ✕ keeps its cancel `aria-label`. No cramped text ⇒ no clipping and no low-contrast text. Drop the now-unused `--warn` style.
**Test:** `PersonPhotos.spec` — after clicking remove, a confirm **button** (`data-test="remove-confirm-${key}"`) and cancel exist; clicking confirm still calls the right delete. (Pixel contrast is verified live.)

## 3. Star/trash action icons off-center (CSS)

**Root cause:** the inline SVGs sit slightly right of center in the round buttons.

**Fix (in `PersonPhotos.vue`):** set `.person-photos__act svg { display: block }` and use icon paths centered within the `0 0 24 24` viewBox; verify each action icon (star, trash, check, cancel, plus) renders centered. No behavior change.
**Verification:** live (`preview_screenshot`) — icons visually centered in their buttons.

## 4. Portrait change reflects on the medallion immediately

**Root cause:** the tree medallion reads `PersonSummary.portrait`/`portraitThumb` from `familyStore.people`, but a photo edit only updates `selectionStore` (the popup `PersonDetail`). The two stores are decoupled, so the medallion is stale until a full `/api/family/graph` reload.

**Fix (surgical, not a refetch):**
- Add a `familyStore` action `applyPersonMedia(id, portrait, portraitThumb)` that updates the matching person in `people` in place (replace that element with `{ ...person, portrait, portraitThumb }` so Vue reactivity and the medallion's `computed` pick it up without re-fetching or moving the tree).
- In `PersonDossier.onDetailUpdated(updated)` (already the single point every photo mutation flows through), call `familyStore.applyPersonMedia(updated.id, updated.portrait, updated.portraitThumb)` alongside the existing `selection.applyDetail(updated)`. This covers upload-portrait, promote, delete-portrait, and re-promote-seed uniformly (each returns the updated `PersonDetail`).
- **Implementation note:** confirm during planning how `treeLayout` consumes `familyStore.people` (by reference vs. copy) so the medallion actually re-renders; if the layout is a `computed` over `people`, replacing the element triggers a recompute that must NOT cause a disruptive relayout (positions are structure-derived, so they stay put). Verified live.
- **Tests:** `familyStore` unit test (`applyPersonMedia` updates that person's portrait/thumb, leaves others untouched, no-op for an unknown id); wiring test that `onDetailUpdated` calls it; live medallion check.

## 5. Seed portrait stays in the gallery (re-selectable) after promoting a new portrait

**Root cause:** a seed portrait is a bare filename (`p-0001.jpg`), not a stored `Photo`. Promote only preserved a *previous override* portrait, so a displaced seed was dropped (the override portrait replaced it and it was never in the gallery).

**Fix — surface the seed at the merge, not in stored state.** In `FamilySnapshotProvider`'s media merge, after applying the override's `Portrait`/`PortraitThumb`/`Gallery`: when the person has a seed portrait **and** the override sets a portrait (i.e. the effective portrait is an uploaded photo, not the seed), append a **virtual seed tile** to the merged gallery:
```
Gallery = override.Gallery + [ new Photo(SeedPhotoId(seedFile), seedFile, seedThumb ?? seedFile) ]
```
where `seedFile = person.Portrait` (the original seed) and `seedThumb = person.PortraitThumb`. Because this is recomputed each merge, deleting the override portrait cleanly reverts the seed to portrait with **no duplicate** (the condition no longer holds, so the virtual tile isn't appended). `SeedPhotoId(file)` is a deterministic id (e.g. `"seed-" + sha256(file)[..16]`) — recognizable and collision-free with uploaded 20-hex ids; recognizing "this is the seed" elsewhere keys off `full` containing no `/`.

**Promote becomes seed-aware (and simpler).** Rewrite `PromotePersonPhotoHandler` to find the target in the **merged** gallery (`existing.Gallery`, which includes the virtual seed) by id, then:
- **Target is an uploaded gallery photo** (`full` contains `/`): `next = (target, current.Gallery without target, with current.Portrait prepended if non-null)`. The old "push the previous portrait" logic is dropped — if the previous effective portrait was the seed (`current.Portrait` null), the merge re-surfaces it virtually automatically.
- **Target is the virtual seed** (`full` has no `/`): `next = (null, current.Portrait prepended to current.Gallery if non-null)`. The override portrait clears → the merge falls back to the seed as portrait; the previously-uploaded portrait moves into the override gallery.
- Person missing → null; target not found → return current mapped person unchanged.

**Frontend.** Apply the existing "no `/` ⇒ not removable" rule to **gallery** tiles too: `removable = photo.full.includes('/')`, so the seed gallery tile shows a **star** (promotable) but **no trash** (it's never deleted from R2). The lightbox and grid already include it (it's in `gallery`).

**Delete-byte safety.** In `DeletePersonPhotoHandler`'s best-effort byte cleanup, only delete when `removed.Full` contains `/` (an uploaded key), so a seed-derived key is never deleted from R2. (The UI shows no trash on the seed tile; this is defense in depth.)

**Tests:**
- Merge (`FamilySnapshotProviderMediaTests`): seed + override portrait set ⇒ virtual seed appended to gallery (right id/full); seed as effective portrait (override portrait null) ⇒ NOT appended; no seed ⇒ nothing appended.
- Promote handler: promote an uploaded photo when the seed is the effective portrait ⇒ portrait becomes the photo and the seed surfaces in the gallery (via merge); promote the virtual seed ⇒ portrait reverts to the seed and the uploaded portrait moves into the gallery; no duplicate after delete-portrait.
- Frontend (`PersonPhotos.spec`): a gallery tile whose `full` has no `/` shows a star but no remove; its star calls `promoteGalleryPhoto(seedId)`.

---

## Scope, architecture & non-goals

- **Files touched:** Backend — `AddPersonPhotoHandler`, `PromotePersonPhotoHandler`, `DeletePersonPhotoHandler`, `FamilySnapshotProvider`, new `MediaLimitExceededException` + `SeedPhotoId` helper, `PeopleController`. Frontend — `PersonPhotos.vue`, `familyStore.ts`, `PersonDossier.vue`. Plus docs.
- **No data migration**; overrides are unchanged on disk (the virtual seed is merge-time only). The DTO shape is unchanged (gallery is already `PhotoDto[]`).
- **Non-goals:** captions, reordering, video upload, cropping; changing the 5 cap to be configurable; cross-store coupling beyond the one `applyPersonMedia` call.

## Risks & notes

- **Medallion reactivity (item 4)** is the main implementation risk — the layout's consumption of `familyStore.people` must be verified so the in-place media update re-renders without a disruptive relayout. Mitigated by replacing the array element (not deep-mutating) and a live check.
- **Seed id determinism (item 5):** the virtual seed id is derived from the filename and recomputed each merge; the frontend round-trips it on promote within the same snapshot, so only intra-snapshot determinism is required (satisfied).
- **Cap constant duplication (item 1):** two constants (front/back) at `5`, documented; acceptable vs. a config round-trip.
