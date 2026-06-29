# Photo grid refinements — design

**Date:** 2026-06-29
**Status:** Design approved; ready for implementation plan.
**Builds on:** [2026-06-29-photo-improvements-design.md](2026-06-29-photo-improvements-design.md) and [2026-06-28-unified-photo-manager-design.md](2026-06-28-unified-photo-manager-design.md).

## Summary

Five refinements to the unified person-photo grid: make **seed media removable** (per-person suppression, since seed files can't be deleted), surface the **living-portrait video as a grid tile**, **hide the read-only grid when it would show only the single portrait** tile, and two CSS fixes (action-icon centering, "Portrait" badge contrast on the Film theme). The seed-removal and video-tile work touch the backend; the rail-hide and CSS work are frontend.

The load-bearing rule from the prior feature is unchanged and extended: **seed media = a bare filename (no `/`); uploaded media = a key containing `/`.** Seeds (portrait + video) can't be physically deleted, so removing one records a per-person *suppression* in the media override; the merge then omits it.

---

## 1. Seed media is removable (backend + frontend)

**Goal:** an editor can remove a seed portrait or the seed living-portrait video. Because the seed lives in `family.json` (and R2) as the read-only source, removal is a per-person **hide**, not a delete.

**Domain.** `PersonMediaOverride` gains a third member:
```csharp
public sealed record PersonMediaOverride(Photo? Portrait, IReadOnlyList<Photo> Gallery)
{
    public IReadOnlyList<string> HiddenSeeds { get; init; } = [];
}
```
Adding it as an `init` property (not a positional parameter) keeps every existing 2-arg `new PersonMediaOverride(portrait, gallery)` call site compiling, and supports `with { HiddenSeeds = … }`. `HiddenSeeds` holds the bare seed keys (filenames) the editor has hidden for that person.

**Stores.** Both `InMemoryPersonOverrideStore` and `FirestorePersonOverrideStore` persist `HiddenSeeds` alongside `Portrait`/`Gallery` (Firestore document mapping gains the field; an absent field reads back as `[]` for older revisions).

**New endpoint.** `DELETE /api/people/{id}/photos/seed/{role}` where `role ∈ { portrait, video }`, CanEdit-gated (mirrors the other photo endpoints' auth), → `SuppressSeedMediaCommand(Id, Role, EditorEmail)` → `SuppressSeedMediaHandler`. The handler:
1. Loads the merged person (`GetPersonAsync`); null → returns null (404 path).
2. Validates `role`; an unknown role → no-op / 400.
3. Resolves the seed key:
   - `role=portrait`: if the merged `Portrait` is a bare filename (no `/`) → that key; else the virtual seed gallery tile (the merged gallery item whose `Full` has no `/`) → its `Full`; if neither exists → nothing to suppress (return merged unchanged).
   - `role=video`: the merged `PortraitVideo` (always a seed bare filename — there is no video upload) → that key; null → return merged unchanged.
4. `current = GetLatestMediaAsync ?? new PersonMediaOverride(null, [])`; `next = current with { HiddenSeeds = [..current.HiddenSeeds, key] }` (deduped — adding an already-hidden key is idempotent).
5. `AppendMediaAsync`, `RefreshAsync`, return the updated `PersonDto`.

**Merge (`FamilySnapshotProvider`).** Honor `HiddenSeeds` (a hidden seed key matches the person's seed `Portrait`/`PortraitVideo` by bare filename):
- A hidden seed **portrait**: it is not used as the effective portrait and is not appended as a virtual gallery tile. The effective portrait becomes the uploaded override portrait if one exists, otherwise **null** (the UI degrades to initials).
- A hidden seed **video**: the merged person's `PortraitVideo` is set to null — so it disappears from the header living-portrait, the medallion video tier, the grid, and the lightbox.
- The existing virtual-seed-tile rule (append the seed to the merged gallery when an uploaded override portrait displaces a *non-hidden* seed portrait) is preserved, now additionally gated on "seed not hidden".

**No data loss / no undo.** Suppression is an override layer; the `family.json` seed is untouched and a redeploy/data edit still carries it. There is no in-app "un-hide" — consistent with deleting an uploaded photo being permanent. Clearing the person's override (out of band) restores the seed.

**Frontend wiring** (`PersonPhotos.vue` + `photosApi`):
- The portrait tile and the displaced-seed gallery tile (bare filename, no `/`) are **removable again**; their remove calls `suppressSeed(id, 'portrait')`.
- `photosApi` gains `suppressSeed(personId, role)` → `DELETE /api/people/{id}/photos/seed/{role}`, returning the updated `PersonDetail` (same shape as the other photo mutations, so it flows through `onDetailUpdated` → updates popup, rail, **and** the medallion via `applyPersonMedia`).
- `onRemove` routes by tile kind: video → `suppressSeed('video')`; seed (no `/`) portrait/gallery → `suppressSeed('portrait')`; uploaded portrait → `deletePortrait`; uploaded gallery → `deleteGalleryPhoto(id)`.

**Tests:** handler — suppress seed portrait while it is the active portrait ⇒ merged portrait null (initials); suppress seed portrait while displaced ⇒ virtual tile gone; suppress seed video ⇒ `PortraitVideo` null; unknown role ⇒ no-op/400; idempotent re-suppress. Integration — `DELETE …/photos/seed/portrait` and `…/seed/video` CanEdit-gated (403 for guest), 404 for unknown person. Frontend — a seed tile shows a trash and its remove calls `suppressSeed`.

## 2. Cap counts videos (backend)

Per "5 photos **or** videos", the cap in `AddPersonPhotoHandler` counts the video too:
```csharp
var mediaCount = (existing.Portrait is not null ? 1 : 0) + existing.Gallery.Count
               + (existing.PortraitVideo is not null ? 1 : 0);
```
Computed on the merged (post-suppression) person, so it equals the number of tiles the grid shows. Frontend `items` (below) includes the video tile, so `MAX_PHOTOS = 5` stays aligned with the backend.

**Tests:** handler — a person at 5 (portrait + 3 gallery + video) ⇒ a 6th upload throws `MediaLimitExceededException`.

## 3. Living-portrait video as a grid tile (frontend)

`PersonPhotos.vue` composes its tiles as **[portrait] + [video, if `portraitVideo`] + [gallery]** (video placed right after the portrait):
- The video tile shows a poster (the portrait still / thumb) with a small ▶ play glyph; clicking opens the **lightbox as a video** (`MediaLightbox` already supports a `video` item with a poster — the existing `lightboxItems` mapping is extended so the video tile yields `{ kind: 'video', src, poster }` instead of `{ kind: 'image' }`).
- **No** "set as portrait" star (a clip is not a still; it is already the living portrait).
- A trash action → `suppressSeed('video')` (item 1).
- Edge: video present but the portrait suppressed ⇒ the tile shows the ▶ glyph on a neutral background (no poster).

**Tests:** the video tile renders when `portraitVideo` is set (and not when null); its lightbox item is a video; it has no set-portrait star; its remove calls `suppressSeed('video')`.

## 4. Hide the lone-portrait grid in read-only contexts (frontend)

The grid root condition changes from `v-if="canEdit || items.length"` to:
```vue
v-if="canEdit || items.length > 1"
```
So any **read-only** context (the rail panel and a not-signed-in visitor's popup alike) hides a grid that would show only the single portrait tile — it is already shown in the header above. Editors always see the grid (so the Add tile and management remain available even at 0–1 items). `items` includes the video tile, so a portrait-only person (1 tile) is hidden read-only while a portrait + video or portrait + gallery person (≥2 tiles) is shown.

**Tests:** read-only mount with 1 item ⇒ grid absent; read-only with 2 items ⇒ grid present; editor mount with 1 item ⇒ grid present.

## 5. CSS fixes (verified live)

- **Action-icon centering.** The prior `svg { display: block }` helped but did not fully center the glyphs. Diagnose the real computed box in a browser — the action buttons are editor-gated, so mount `PersonPhotos` in a throwaway dev harness with `canEdit` forced true, screenshot, fix the actual cause (round-button centering + border/sub-pixel interaction, and/or non-symmetric SVG paths centered on the `0 0 24 24` viewBox), then remove the harness. Verify each action icon (star, trash, check, cancel, plus, ▶) is visually centered.
- **"Portrait" badge on the Film theme.** The badge uses `--gilt` / `--gilt-deep`, which read low-contrast on the dark film canvas. Add a Film-scoped badge variant with a higher-contrast pair, consistent with the Film chrome. The badge renders for all visitors, so verify live without auth.

**Verification:** live (`preview_*`) — icons centered; badge legible on the Film theme.

---

## Scope, architecture & non-goals

- **Files touched:** Backend — `PersonMediaOverride` (Domain), `InMemoryPersonOverrideStore` + `FirestorePersonOverrideStore` (Infrastructure), `FamilySnapshotProvider` (merge), `AddPersonPhotoHandler` (cap), new `SuppressSeedMediaCommand` + `SuppressSeedMediaHandler` (Application), `PeopleController` (new endpoint). Frontend — `PersonPhotos.vue`, `photosApi.ts`, `MediaLightbox` item mapping (if needed), CSS in `PersonPhotos.vue`. Plus docs.
- **DTO shape unchanged.** `PersonDto`/`PersonDetail` keep `portrait`/`portraitThumb`/`portraitVideo`/`gallery`; `HiddenSeeds` is internal to the override layer and never serialized to the client. The grid derives the video tile from `portraitVideo`, which it already receives.
- **No data migration.** Older override revisions without `HiddenSeeds` read back as `[]`.
- **Non-goals:** video upload (videos remain seed-only); captions, reordering, cropping; an in-app "un-hide" for suppressed seeds; making the 5 cap configurable; promoting a video to portrait.

## Risks & notes

- **Seed-portrait → initials.** Removing the active seed portrait intentionally leaves the person with initials (no portrait). This is the approved behavior, not a bug; the medallion/header initials fallback already exists.
- **Cap interplay with the video.** A person with a seed portrait + seed video starts at 2 of 5, so they can add 3 uploads. Suppressing a seed frees a slot. The frontend `items.length` and the backend count both include the video, so the Add tile and the 400 stay in lockstep.
- **Suppress-key resolution.** The handler recovers the seed key from the *merged* person (active bare-filename portrait, or the virtual seed gallery tile, or `portraitVideo`), so it never needs a separate read of the raw seed layer.
- **CSS centering is the main live-verification risk** — it recurred after a guessed fix, so it must be diagnosed in a real browser (harness) rather than reasoned about, and confirmed by screenshot before the task is considered done.
