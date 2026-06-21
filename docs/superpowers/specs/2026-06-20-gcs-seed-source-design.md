# De-bake the family seed to GCS — design

**Date:** 2026-06-20
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem & goal

The public family graph is loaded from a committed `family.json` that is **baked into
the Cloud Run container image**. Updating the baseline data therefore requires a
redeploy. We already layer durable biography overrides (Firestore) over this seed and
serve all reads from a cached merged snapshot with a 10-minute TTL, and the snapshot
refresh was deliberately built to **re-read its source** every cycle — but the source
is still a file inside the image.

**Goal (interim step):** move the seed `family.json` out of the build image into
**Google Cloud Storage**, so the baseline can be replaced without a redeploy and is
picked up within the snapshot TTL. This is explicitly **not** the structural-editing
redesign (add/remove people, re-parent, unions) — the graph stays an immutable seed
plus biography overlays; only the *location* of the seed changes. The structural model
is a separate, later effort.

## Decisions (from brainstorming)

- **Storage: Google Cloud Storage (native, GCP).** The API runs on Cloud Run and
  already authenticates to GCP **keylessly via Workload Identity Federation** (the same
  mechanism the new Firestore access uses — Application Default Credentials, no JSON
  keys). Reading a GCS object is a one-line IAM grant (`roles/storage.objectViewer`)
  with **no new secrets**. Rejected alternatives: **Cloudflare R2** (where media lives)
  would force the Cloud Run API to hold S3-compatible access-key/secret credentials —
  cross-cloud, more secret management, and Cloud Run has no R2 binding; a **single
  Firestore document** is capped at 1 MB (a growing graph could exceed it) and a
  people-collection is really the deferred structural redesign.
- **Source is config-selected.** One key, `FamilyData:Source` (default
  `Data/family.json`). If it starts with `gs://` the GCS loader is used; otherwise it is
  treated as a local file path. Local dev and tests keep reading the committed local
  file — **no GCS, no credentials, no install locally** — mirroring the in-memory vs
  Firestore store selection.
- **The committed `Data/family.json` stays in the repo** as the local dev seed and the
  artifact that is first uploaded to the bucket. (It is no longer the production *source
  of truth* — GCS is — but it remains in the image; "de-baking" here means the image
  copy is no longer *read* in deployment, not that the file is deleted.)
- **Failure posture: fail-fast at startup, serve-stale on refresh.** If the seed is
  missing/unreadable at **startup**, the app fails to start (a bad deploy is caught
  immediately — the existing warm-up already fail-fasts). If a later **TTL or
  save-triggered refresh** fails transiently, the provider keeps serving the last-good
  cached snapshot and logs a warning — a GCS blip never blanks the tree or 500s a read
  or a save. **No baked fallback** in production; GCS is the single source of truth.
- **No admin "force refresh" endpoint, no failure-backoff tuning** beyond a single
  one-TTL retry window. YAGNI for this interim step.

## Architecture

### 1. Loader abstraction — async + source-selected

`IFamilyDataLoader` becomes asynchronous to support network reads:

```csharp
public interface IFamilyDataLoader
{
    Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken);
}
```

Two implementations behind it, selected by config:

- **`JsonFamilyDataLoader`** (existing, kept) — reads a **local file** via
  `File.ReadAllTextAsync`. Used for local dev and unit tests. It already owns the shared
  `static FamilyGraph Deserialize(string json)` (unit-tested) — this stays the single
  parse path, reused by the GCS loader.
- **`GcsFamilyDataLoader`** (new) — reads a `gs://bucket/object` URI via
  `Google.Cloud.Storage.V1` (`StorageClient.Create()` → Application Default
  Credentials). It downloads the object's bytes, decodes UTF-8, and delegates parsing to
  `JsonFamilyDataLoader.Deserialize`. It is a thin SDK wrapper with no testable
  branching, so it is **`[ExcludeFromCodeCoverage]`** with **no unit tests** (verified
  manually against a real bucket) — the same precedent as `GoogleIdTokenValidator`,
  `FirestoreSessionStore`, and `FirestorePersonOverrideStore`.

**Selection** lives in `AddInfrastructure` (mirrors the Firestore `ProjectId` branch):

```
if FamilyData.Source starts with "gs://"  → GcsFamilyDataLoader
else                                       → JsonFamilyDataLoader
```

The `gs://` URI is parsed into `{ bucket, object }` (bucket = first path segment after
the scheme, object = the remainder). A malformed `gs://` value fails fast at
construction with a clear message.

### 2. Snapshot provider — async load + serve-stale on refresh failure

`FamilySnapshotProvider.RebuildAsync` awaits `LoadAsync` instead of calling the old
synchronous `Load()`. The resilience change wraps the rebuild's data fetch:

- On a **successful** rebuild: merge seed + latest overrides, atomically swap
  `_snapshot`, set `_builtAt = now` (unchanged behavior).
- On a **failed** load/override-pull (exception):
  - if a previous `_snapshot` **exists** → log a `Warning` (no PII — the message names
    the failure, not data), set `_builtAt = now` so the next refresh attempt waits one
    full TTL (bounded staleness = TTL, no per-request GCS hammering), and **return the
    existing stale snapshot** (do not swap, do not throw);
  - if **no** `_snapshot` exists yet (first load at startup) → **rethrow** (fail-fast).

This applies to **both** the TTL-triggered path (`GetAsync` after expiry) and the
forced path (`RefreshAsync` after a save). A save's override is already durably written
to Firestore before the refresh runs, so a refresh failure only means the merged view
is briefly stale — never a lost edit or a 500.

*Note on the tradeoff:* bumping `_builtAt` on failure means up to one TTL of staleness
after a blip even if GCS recovers within seconds. That is acceptable for this interim
step; a shorter dedicated failure-retry window can be added later if needed.

### 3. Startup warm-up

The existing warm-up (`await provider.RefreshAsync(...)` after `builder.Build()`,
before `app.Run()`) is unchanged in placement. Because no snapshot exists at startup, a
failed initial load rethrows out of the warm-up and aborts startup — preserving
fail-fast. (`RefreshAsync` is now genuinely async I/O when the source is GCS.)

### 4. Config

```
AppSettings
└─ FamilyData { Source, SnapshotTtlMinutes }
```

- `FamilyData:FilePath` is **renamed to `FamilyData:Source`** (holds a local path *or* a
  `gs://bucket/object` URI). Default stays `Data/family.json`. `SnapshotTtlMinutes`
  (default 10) is unchanged.
- `appsettings.json`: `FamilyData.Source = "Data/family.json"` with a comment that
  deployment overrides it with `FamilyData__Source=gs://<bucket>/family.json`.
- **No DB/storage secret:** GCS auth uses the existing Workload Identity service account
  (ADC) — there is no key or connection string to store.

### 5. Package

Add `Google.Cloud.Storage.V1` to `Directory.Packages.props` (Central Package
Management — version in the props file, no `Version` on the `PackageReference`) and
reference it from `FamilyTree.Infrastructure`.

### 6. Upload script

`scripts/upload-seed.mjs` — pushes the committed
`src/backend/FamilyTree.Api/Data/family.json` to the bucket via `gcloud storage cp`
(mirrors `scripts/upload-media.mjs` in style and auth posture). Usage:
`node scripts/upload-seed.mjs [--dry-run]`; bucket and object overridable via env
(`SEED_BUCKET`, `SEED_OBJECT`). Re-running publishes an edited baseline; the running API
picks it up within the snapshot TTL (no restart). Auth: `gcloud auth login` /
application-default credentials, same as other GCP tooling.

### 7. Deploy & docs (same PR)

- **Owner infra prerequisite (documented in `docs/ci-cd/deploy.md`):** create the GCS
  bucket (e.g. `family-tree-seed`), grant the Cloud Run **runtime** service account
  `roles/storage.objectViewer` on it, set the env var `FamilyData__Source=gs://family-tree-seed/family.json`,
  and do the initial upload via `scripts/upload-seed.mjs`. No new secrets, no Workload
  Identity changes (the existing federation already covers GCP API access).
- **`docs/reference/`:** document that in deployment the seed is sourced from GCS
  (swappable without redeploy, picked up within the TTL), that local/dev reads the
  committed file, and the serve-stale-on-refresh-failure behavior. Keep the
  live-vs-roadmap honesty (GCS is the source only when `FamilyData:Source` is a `gs://`
  URI).
- **Root `README.md` / `CLAUDE.md` overview:** note the seed is served from GCS in
  deployment.
- Run the `update-docs-for-pr` skill at PR time.

## Local dev & testing

- **Local dev:** `FamilyData:Source = Data/family.json` (the default) → `JsonFamilyDataLoader`,
  no GCS, no credentials. Unchanged developer experience.
- **Backend unit:**
  - `JsonFamilyDataLoaderTests` updated to the async `LoadAsync` API (missing-file →
    throws after logging; valid file → graph; invalid JSON → throws after logging).
  - **Loader selection** test (like `InfrastructureSelectionTests`): `Source` starting
    `gs://` registers `GcsFamilyDataLoader`; otherwise `JsonFamilyDataLoader` — asserted
    via the registered `ServiceDescriptor.ImplementationType`, **never resolving** the
    GCS loader (no network).
  - **Snapshot serve-stale** tests (the valuable new behavior, via a stub loader +
    `TestTimeProvider`): a loader that succeeds once then throws → after the TTL elapses,
    `GetAsync` returns the **last-good** snapshot and logs a warning (does not throw); a
    loader that throws on the **first** load (no prior snapshot) → `GetAsync`/warm-up
    **throws** (fail-fast). Plus: a forced `RefreshAsync` whose load throws keeps the
    existing snapshot and does not throw.
  - `GcsFamilyDataLoader` itself is `[ExcludeFromCodeCoverage]`, no unit tests (network/
    SDK; manual verification against a real bucket).
- **Integration:** the existing suite continues to pass unchanged (it uses the local
  file via `WebApplicationFactory<Program>`; the async loader and `Source` default are
  transparent). No live GCS calls in CI.

## Out of scope

- Structural editing of the graph (add/remove people, re-parent, unions) — a separate
  later redesign where Firestore becomes the graph's source of record.
- Moving **media** off R2 (unchanged) or moving the seed to R2.
- An admin force-refresh endpoint; configurable failure-retry backoff; live file-change
  notifications (the TTL + manual re-upload is the intended interim mechanism).
- Sourcing the seed from a mutable location for the *image build* (the committed file
  stays as the dev seed).

## Risks / notes

- **First-load latency:** at startup the warm-up now does a network read from GCS before
  the app is ready. This is a single small-object download; acceptable, and it preserves
  fail-fast.
- **Staleness window:** after a transient refresh failure the app serves stale for up to
  one TTL before retrying. Bounded and acceptable for an interim step.
- **`gs://` URI parsing** must be robust (missing object path, trailing slash); a
  malformed value fails fast at startup with a clear message rather than an opaque
  runtime error.
- **GCS read volume:** one object GET per snapshot refresh (~144/day at a 10-minute TTL)
  plus startup — negligible, well within free tier.
- **Coverage:** the GCS loader is `[ExcludeFromCodeCoverage]` (untestable external SDK
  wrapper); all selection, parsing, and serve-stale logic remains fully unit-tested, so
  the codecov patch gate stays green.
