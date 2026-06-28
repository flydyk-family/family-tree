# Editor photo upload — design

**Date:** 2026-06-28
**Status:** Design approved; ready for implementation plan.

## Summary

Let signed-in editors (`canEdit`) attach photos to a person from the app:
set/replace the **portrait** (the medallion + popup face) and add **multiple
gallery photos**. Image bytes are stored in **Cloudflare R2**, written by the
**.NET API** over R2's S3-compatible endpoint behind the existing
session-cookie auth. The API re-encodes each upload (auto-orient, strip EXIF,
cap dimensions, WebP) and generates a thumbnail. Photo references are persisted
in the existing **per-person override layer** (Firestore in deployment,
in-memory locally) — never written back to the `family.json` seed. Editors can
also **delete** a photo and **promote** a gallery photo to portrait. The
previously-unused `gallery` array becomes visible to all visitors via a simple
popup viewer.

## Goals

- An editor can upload an image and have it become the person's portrait.
- An editor can add several gallery photos to a person.
- An editor can delete a photo and promote a gallery photo to portrait.
- Uploaded images are clean and uniform: re-encoded WebP, EXIF stripped
  (removes GPS/camera/personal metadata), auto-oriented, dimension-capped, with
  a thumbnail for fast medallion/grid rendering.
- All writes are guarded by the existing `canEdit` policy and survive restarts
  (durable in deployment).
- Visitors (not just editors) can see a person's gallery in the popup.

## Non-goals (v1)

- Reordering gallery photos.
- Per-photo captions/labels.
- Video (`portraitVideo`) upload — still set via the seed/upload script.
- HEIC/HEIF input decoding (phones' default format) — documented limitation.
- Cropping/editing UI.
- Migrating existing seed portraits into the override layer.

## Decisions locked during brainstorming

| Question | Decision |
|---|---|
| What can editors do | Portrait **and** multiple gallery photos |
| How bytes reach R2 | **.NET API writes to R2** via S3 API (one origin, one auth path) |
| Server-side processing | Re-encode + strip EXIF + auto-orient + cap dimensions + **generate a thumbnail** |
| Management actions | **Delete a photo**, **promote gallery → portrait** (no reorder, no captions) |
| Image library | **SixLabors.ImageSharp** |

## Architecture

### 1. Media storage abstraction (`IMediaStore`)

New domain interface, mirroring the existing in-memory-vs-Firestore store-swap
pattern (auto-selected by config):

```csharp
public interface IMediaStore
{
    Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken ct);
    Task DeleteAsync(string key, CancellationToken ct);
}
```

- **`R2MediaStore`** (deployment) — `AWSSDK.S3` `AmazonS3Client` configured for
  R2: `ServiceURL = https://<accountId>.r2.cloudflarestorage.com`,
  `region = auto`, path-style addressing, creds from
  `R2:AccessKeyId` / `R2:SecretAccessKey`, bucket from `R2:Bucket`. Selected
  when the R2 config is present. Thin SDK wrapper → `[ExcludeFromCodeCoverage]`,
  emulator/manual-verified only (same rationale as `FirestorePersonOverrideStore`).
- **`LocalFileMediaStore`** (dev/tests) — writes under the repo's gitignored
  `media/` folder (which Vite already serves at `/media/*`), so uploads work
  end-to-end locally with no R2 credentials. Default when R2 config is absent.

The Cloudflare Pages serving function (`src/frontend/functions/media/[[path]].ts`)
already serves any nested key read-only; **no change required** there. New keys
live under their own prefix so they never collide with seed assets.

### 2. Object keys

Uploaded objects use **content-hashed, immutable** keys under a dedicated
prefix so the long-cache/immutable convention holds:

```
uploads/<personId>/<sha256-prefix>.webp          # full image (dimension-capped)
uploads/<personId>/<sha256-prefix>.thumb.webp    # thumbnail
```

Content hashing makes re-uploading identical bytes idempotent and avoids
guessable/overwriting names.

### 3. Metadata: extend the override layer

Photos are editor edits, so they belong in the **same override store** as
biographies, not the seed. Generalize `IPersonOverrideStore` to also carry a
per-person **media override**:

```
MediaOverride {
  portrait: PhotoRef?      // null = no editor portrait override
  gallery:  PhotoRef[]
}
PhotoRef {
  id:    string            // stable handle for delete/promote (e.g. the content hash)
  full:  string            // R2 key, e.g. "uploads/p-0001/ab12cd.webp"
  thumb: string            // R2 key, e.g. "uploads/p-0001/ab12cd.thumb.webp"
}
```

- **Firestore impl** keeps the existing shape: a parent doc holds the latest
  snapshot (now biography **and** media fields), with an append-only `versions`
  subcollection for the audit trail. Media writes use the same atomic-batch
  (set-parent + create-version) approach.
- **In-memory impl** extends its per-person revision list analogously.
- The interface gains media read/write methods alongside the biography ones
  (e.g. `AppendMediaAsync`, `GetLatestMediaAsync`, `GetLatestMediaMapAsync`),
  keeping biography and media as independent override facets of one person doc.

### 4. Snapshot merge

`FamilySnapshotProvider.RebuildAsync` gains a media-merge step beside the
existing biography merge: when a person has a media override, replace the
person's `Portrait` and `Gallery`. To carry thumbnails through to the client,
the `Person`/`PersonDto`/frontend types are extended so each photo can express
`{ full, thumb }` rather than a bare filename.

**Backward compatibility — seed vs uploaded paths.** Seed portraits are bare
filenames (`p-0001.jpg`) and the frontend prepends the `portraits/` prefix.
Uploaded refs are **full media keys** (`uploads/...`). Rule: a value containing
`/` is treated as a full `/media/<key>`; a value without `/` keeps the legacy
`portraits/<file>` behavior. Seed photos have no thumbnail (the medallion keeps
using the full image); uploaded photos carry an explicit `thumb` used by the
medallion and the gallery grid.

### 5. API endpoints

All under `[Authorize(Policy = "CanEdit")]`, thin controllers delegating to
MediatR commands, editor email taken from the session claim (as biography does).

| Method | Route | Body | Effect |
|---|---|---|---|
| `POST` | `/api/people/{id}/photos` | `multipart/form-data`: `file`, `role=portrait\|gallery` | Validate → process → store full+thumb → append media override → return updated `PersonDto` |
| `DELETE` | `/api/people/{id}/photos/{photoId}` | — | Remove the ref from metadata; best-effort delete both R2 objects |
| `POST` | `/api/people/{id}/photos/{photoId}/promote` | — | Make a gallery photo the portrait; the previous (uploaded) portrait drops back into the gallery so no photo is lost |

**Upload validation** (FluentValidation + processing guardrails):
- Person id matches `^p-\d+$`; `role` ∈ {portrait, gallery}.
- Size ≤ ~15 MB; declared/sniffed type ∈ {jpeg, png, webp}.
- Decodes as a real image of sane dimensions (reject zero/huge).
- Processing: auto-orient from EXIF, **strip all metadata**, cap longest side
  (e.g. 2000 px full / ~400 px thumb), encode WebP.

**Partial-failure rule:** write bytes to the media store **first**, then record
metadata. An orphaned object (no metadata points at it) is harmless; a dangling
metadata ref would render as a broken image. Metadata is the commit point, and
the snapshot is refreshed after it (as biography does).

### 6. Frontend

- **`PhotoManager.vue`** in the bigger-view popup, visible to editors only
  (gated on `canEdit`, beside `BiographyEditor`): shows the current portrait and
  gallery thumbnails; an upload control that **downscales client-side** before
  POST to keep payloads small; a "Make portrait" action per gallery photo; and a
  delete-with-confirmation. Resilient save with error + retry, matching the
  biography editor's UX.
- **Gallery viewer** (all visitors): since `gallery` was previously unused, add
  a minimal thumbnail grid + lightbox in the popup so uploaded gallery photos
  are actually visible.
- **`photosApi.ts`** — `POST`/`DELETE`/promote calls with
  `credentials: 'include'`; returns the updated `PersonDetail`.
- **Medallion/header** use the `thumb` key for uploaded portraits where present,
  full image otherwise.

### 7. Configuration & secrets

- New config section read by `Program.cs`: `R2:AccountId`, `R2:Bucket`,
  `R2:AccessKeyId`, `R2:SecretAccessKey`. Present → `R2MediaStore`; absent →
  `LocalFileMediaStore`.
- Deployment: an R2 **API token / access key** (scoped to the
  `family-tree-media` bucket, object read+write) added as Cloud Run secrets,
  wired one var per `--update-env-vars` call (the PowerShell comma gotcha).
- Local dev needs nothing — uploads land in `media/` and Vite serves them.

## Testing

- **Unit:** image processing (orient/strip/resize/thumbnail/WebP), content-hash
  key generation, override media-merge, upload/role/size validators,
  `LocalFileMediaStore` (write + delete round-trip).
- **Integration:** upload → serve round-trip; auth gates (anonymous → 401,
  non-editor → 403, editor → 200); delete clears metadata; promote swaps
  portrait/gallery; validation rejections (oversized, non-image, bad role).
- **`R2MediaStore`** excluded from coverage (thin SDK wrapper, emulator/manual).
- **Frontend (Vitest):** `PhotoManager` interactions and `photosApi`; gallery
  viewer rendering.

## Documentation (lands in the same PR)

- `docs/reference/` — media handling and editor capabilities (upload/delete/
  promote, processing guarantees, formats, size limit).
- `docs/ci-cd/` — R2 access-key creation and the Cloud Run secret wiring.
- `README.md` / `CLAUDE.md` overview — editors can now manage photos in-app;
  note the runtime upload path (API → R2) alongside the existing
  `scripts/upload-media.mjs` bulk path.

## Risks & notes

- **Orphaned R2 objects** accumulate when a portrait is replaced or an upload's
  metadata write fails. Acceptable for v1 (harmless, cheap storage); a later
  sweep/GC job can reconcile keys against override metadata.
- **HEIC** uploads are rejected with a clear message; revisit if family members
  hit it often (needs an ImageSharp HEIC plugin or client-side conversion).
- **ImageSharp licensing** — free for this personal/open project under its terms;
  noted so a future commercialization revisits it.
- Image processing runs in-process on Cloud Run; the ~15 MB cap + dimension cap
  bound CPU/memory per request.
