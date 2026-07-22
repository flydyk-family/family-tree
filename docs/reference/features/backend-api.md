# Feature: Backend API

← back to [features index](README.md) · [reference index](../README.md)

The API is served under `/api/...` (plus `/health`). Read-only public endpoints are anonymous. A small set of **authentication** endpoints and one **editor-gated write** endpoint are also present. All responses are JSON (`application/json`) with **camelCase** property names (`System.Text.Json` Web defaults). Enums serialize as lowercase strings.

## Endpoints

### `GET /api/family/graph`
The whole graph. Used by the SPA on load.

**Response `200` — `FamilyGraphDto`:**
```json
{ "people": PersonSummaryDto[], "unions": UnionDto[] }
```
No params, no validation. Order matches [`family.json`](../../../src/backend/FamilyTree.Api/Data/family.json) (no sorting applied).

### `GET /api/people`
**Response `200`** — `PersonSummaryDto[]` (JSON array). No params, no validation.

### `GET /api/people/{id}`
**Path param:** `id` (string). Validated against `^p-\d+$`.

| Status | When | Body |
|---|---|---|
| `200` | Found | `PersonDto` |
| `400` | `id` fails the pattern (e.g. `not-an-id`) | Validation error (below) |
| `404` | Well-formed id but no such person (e.g. `p-9999`) | ProblemDetails (below) |

> A well-formed-but-missing id → **404**; a malformed id → **400**. These are distinct paths.

### `GET /health`
Not under `/api`; **rate-limited** via the same `api` policy (the deploy health check and Cloud Run probes stay well under the limit). `version`/`commit` remain **unauthenticated** because the deploy health check reads them.
```json
{ "status": "Healthy", "version": "0.5.0", "commit": "local" }
```
- `status` — `"Healthy"` normally, or **`"Degraded"`** (still HTTP `200`) when the family-data source has failed to refresh **3+ times in a row** and the API is serving stale-but-valid cached data. The probe stays `200` on Degraded so Cloud Run does not restart a still-serving instance; the degraded state is for monitoring. Provided by the `family-data` health contributor.
- `version` — assembly informational version (from [`VERSION`](../../../VERSION)); `"unknown"` if absent.
- `commit` — `APP_COMMIT` env var (set at deploy); `"local"` if unset.

### Development-only
- `GET /openapi/v1.json` — OpenAPI document, **Development environment only**.

## Authentication & editor endpoints

> These endpoints are fully functional and integration-tested. The **frontend sign-in UI** is shipped — see [features/app-shell-and-localization.md](app-shell-and-localization.md#sign-in--sign-out). The **in-app biography editor UI** is also shipped — signed-in editors edit the localized biography inline in the bigger-view popup; see [features/person-details.md](person-details.md#editing-a-biography-signed-in-editors). In local dev and CI, sessions and biography overrides are **in-memory**. In deployment (when `Firestore:ProjectId` is configured), they persist in **Google Firestore**.

### `POST /api/auth/session`
Exchanges a Google ID token for a server session.

**Request body (`application/json`):**
```json
{ "idToken": "<Google ID token string>" }
```

| Status | When | Body |
|---|---|---|
| `200` | Token valid | `{ "email": string, "name": string, "canEdit": bool }` + sets `ft_session` HttpOnly cookie |
| `401` | Token invalid or unverified email | empty |

On success the response sets a `ft_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, no `Domain`, 7-day `MaxAge`). The server stores the session keyed by a SHA-256 hash of a random opaque token. Google validation happens **only here** — no per-request Google call. Sessions persist in Firestore in deployment; in-memory otherwise.

### `POST /api/auth/logout`
Revokes the current session.

| Status | Body |
|---|---|
| `204` | empty |

Deletes the server-side session record and clears the `ft_session` cookie. Safe to call when not signed in (cookie is simply deleted; no error).

### `GET /api/auth/me`
Returns the current session state. Anonymous-friendly: it **always returns `200`** (never `401`), so a not-signed-in page load is not a console/network error. The `signedIn` flag distinguishes the two cases; when `false`, the other fields are empty. A valid cookie past its half-life is still slid-renewed here (a new cookie is re-set).

| Status | When | Body |
|---|---|---|
| `200` | Valid session cookie present | `{ "signedIn": true, "email": string, "name": string, "canEdit": bool }` |
| `200` | No cookie or unrecognised/expired session | `{ "signedIn": false, "email": "", "name": "", "canEdit": false }` |

`POST /api/auth/session` returns the same shape with `"signedIn": true` on success.

### `POST /api/people/{id}/photos`
Editor-gated photo upload. Requires a valid session cookie **and** `canEdit: true`.

**Request:** `multipart/form-data` with two fields:
- `file` — the image file (JPEG, PNG, or WebP; HEIC is **rejected** with `400`).
- `role` — `"portrait"` or `"gallery"` (case-insensitive).

| Status | When | Body |
|---|---|---|
| `200` | Success | Updated `PersonDto` (portrait / gallery reflects the new photo) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |
| `404` | Person id not found | ProblemDetails |
| `400` | Missing/empty file, unrecognised `role`, non-image/undecodable content, **or the person is already at the media cap** | `{ "title": "..." }` |

**Media cap:** a person may hold at most **5** media items — counted as `portrait + gallery + the living-portrait video` on the merged (post-suppression) person, the same set the photo grid shows (a displaced seed portrait counts as its virtual gallery tile). An upload that would exceed the cap is rejected with `400` (`{ "title": "A person can have at most 5 photos." }`) **before** the image is processed or stored. The frontend hides its Add tile at the cap to match.

**Upload size limit:** up to **15 MiB** (path-aware: only this route gets the larger cap; all other routes stay at 256 KiB). Configured via `RequestLimits:MaxPhotoUploadBytes`.

**Processing:** the uploaded bytes are re-encoded to **WebP** with **EXIF/IPTC/XMP stripped** (removes GPS, camera, and other metadata), **auto-oriented** (EXIF rotation applied), and the longest side capped at **≤ 2000 px** (full) and **≤ 400 px** (thumbnail). Both variants are stored.

**Object keys:** immutable, content-addressed, under the `uploads/` prefix — e.g. `uploads/p-0001/<hash>.webp` (full) and `uploads/p-0001/<hash>.thumb.webp` (thumbnail). The id field on `PhotoDto` is the first 20 hex characters of the SHA-256 of the full-size WebP.

**Persistence:** the uploaded photo reference is stored in the per-person **override layer** (Firestore `mediaOverrides` collection in deployment; in-memory locally) and merged into the read snapshot on the next request. It is **never written back to `family.json`**.

### `DELETE /api/people/{id}/photos/portrait`
Editor-gated portrait removal. Clears the portrait override for the person (reverts the portrait to the seed value if one exists, or removes it entirely). All other overrides are unaffected.

| Status | When | Body |
|---|---|---|
| `200` | Success | Updated `PersonDto` |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |
| `404` | Person id not found | ProblemDetails |

### `DELETE /api/people/{id}/photos/gallery/{photoId}`
Editor-gated gallery photo removal. Removes the specified photo from the gallery. `photoId` is the 20-char hex id on `PhotoDto.id`.

| Status | When | Body |
|---|---|---|
| `200` | Success | Updated `PersonDto` (gallery no longer contains the photo) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |
| `404` | Person id not found | ProblemDetails |

> A `photoId` that does not exist in the gallery is a silent no-op (the person is returned unchanged; no `404` for the photo).

### `POST /api/people/{id}/photos/gallery/{photoId}/promote`
Editor-gated gallery-to-portrait promotion. Makes the specified gallery photo the portrait; the previous portrait (if any) is moved to the gallery. `photoId` must be an existing gallery photo id.

| Status | When | Body |
|---|---|---|
| `200` | Success | Updated `PersonDto` (new portrait, gallery updated) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |
| `404` | Person id not found | ProblemDetails |

> A displaced seed portrait is not lost — it surfaces as a re-selectable **virtual gallery tile** (computed at snapshot-merge time, not stored); promoting it back clears the override and returns the seed to portrait with no duplicate.

### `DELETE /api/people/{id}/photos/seed/{role}`
Editor-gated removal of **seed** media (a seed portrait or the living-portrait video). Seed assets live in `family.json` and are never deleted; instead the key is recorded as a per-person **hide** (`HiddenSeeds` on the media override), and the snapshot merge omits it. `role` is `portrait` or `video`. A hidden seed portrait falls back to an uploaded portrait or initials; a hidden seed video disappears from the header, medallion, grid, and lightbox. Hiding is idempotent (re-hiding an already-hidden seed is a no-op).

| Status | When | Body |
|---|---|---|
| `200` | Success (or nothing to hide) | Updated `PersonDto` |
| `400` | `role` is not `portrait` or `video` | `{ "title": "role must be 'portrait' or 'video'." }` |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |
| `404` | Person id not found | ProblemDetails |

### `GET /api/people/{id}/profile`
Returns the raw latest **profile override** for a person — the scalar-field edit layer, not the merged person. **Unauthenticated** (public read).

| Status | When | Body |
|---|---|---|
| `200` | Person exists, has a saved override | `PersonProfileDto` with the overridden fields set, others `null` |
| `200` | Person exists, no override yet | All-`null` `PersonProfileDto` |
| `404` | No such person | ProblemDetails |

### `PUT /api/people/{id}/profile`
Editor-gated scalar-field update (given/surname/maiden name per locale, sex, birth/death **year + month + day**, vocation) **plus** a whole-list residences override. Requires a valid session cookie **and** `canEdit: true`. Called by the Members dossier's **Edit details** editor ([`MemberFieldsEditor.vue`](../../../src/frontend/src/components/MemberFieldsEditor.vue)) for the scalar fields and by the **Residences** editor ([`ResidencesEditor.vue`](../../../src/frontend/src/components/ResidencesEditor.vue)) for `residences`; see [features/search-and-navigation.md](search-and-navigation.md#members-page-readonly-membersslug). The scalar editor sends `override ∪ edits` — a `null` scalar field means "inherit the seed" — so only changed fields are persisted as overrides; the merge applies each non-null field over the seed `LifeEvent` (`approx`/`place` always inherit the seed — birth/death **place** editing is not implemented). `residences` follows a **different, whole-list semantic** (below), not the per-field coalesce the scalar fields use. A validation failure returns **400** with `{ title, errors: [{ propertyName, errorMessage }] }`, which the editor surfaces inline. Validation covers: out-of-range year, birth > death, all-blank name, unparseable `sex`/`vocation`, a cross-entity birth-order conflict (`Profile.BirthYear`), month/day out of range (`Profile.BirthMonth`/`BirthDay`/`DeathMonth`/`DeathDay` ∈ [1,12] / [1,31]), an **incoherent effective date** (`Profile.BirthDate`/`Profile.DeathDate`) — a day requires a month, a month requires a year, and the day must be valid for the effective month and year (checked in the handler against the **effective date** — the override applied over the seed — so 29 Feb is accepted only in a leap year) — and **per-row residence validation** (below).

**Request body (`application/json`):** `PersonProfileDto`:
```json
{
  "givenName": LocalizedTextDto | null,
  "surname": LocalizedTextDto | null,
  "maidenName": LocalizedTextDto | null,
  "middleName": LocalizedTextDto | null,
  "sex": "male" | "female" | "unknown" | null,
  "birthYear": int | null,
  "deathYear": int | null,
  "vocation": "teacher" | "church" | "writer" | "office" | "other" | null,
  "residences": [
    { "place": LocalizedTextDto, "fromYear": int | null, "toYear": int | null, "lat": double | null, "lng": double | null, "mapUrl": string | null }
  ] | null
}
```
Every field is independently nullable; a `null` field means **"inherit the seed value"** — the editor is expected to submit the merged set it wants to keep, not a sparse patch (a per-field submit that unintentionally nulls a field reverts it to seed, it is not dropped from history).

**`residences` semantics (whole-list, not per-field):** `null` **inherits the whole `family.json` seed residences list**; a non-null array (including `[]`) **replaces the seed list wholesale** — there is no per-row merge against the seed or a prior override. The **Reset to seed** control in `ResidencesEditor` sends `residences: null`. Because a `PUT` is a whole-record replace and residences sit in the same document as the scalar fields, each editor must carry the other's current value through unchanged in its payload (`MemberFieldsEditor`'s save includes the current `residences`; `ResidencesEditor`'s save includes the current scalar override fields) or it would silently clobber the other editor's last save.

| Status | When | Body |
|---|---|---|
| `200` | Success | Merged `PersonDto` (id fields reflect the new profile) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |
| `404` | Person id not found | ProblemDetails |
| `400` | Validation failure (below) | Validation error (same shape as other `400`s) |

**Validation — single-record** ([`UpdatePersonProfileValidator`](../../../src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs)):
- `id` must match `^p-\d+$`.
- `birthYear` / `deathYear`, when provided, must be in **[1000, 2100]**.
- If both are provided, `birthYear` must be **≤** `deathYear`.
- A provided `givenName` / `surname` / `maidenName` / `middleName` object must carry **at least one non-blank locale** (`ru`, `be`, or `en`) — an all-blank name object fails validation; omit the field entirely (`null`) to inherit the seed name instead.
- `residences`, when non-null, must hold **at most 10** rows.

**Validation — per-row residence** ([`ResidenceDtoValidator`](../../../src/backend/FamilyTree.Application/People/UpdatePersonProfileValidator.cs), run via `RuleForEach` on every row of a non-null `residences`):
- `place` must carry **at least one non-blank locale** (`ru`, `be`, or `en`).
- `fromYear` / `toYear`, when provided, must be in **[1000, 2100]**; if both are provided, `fromYear` must be **≤** `toYear`.
- `lat`, when provided, must be in **[-90, 90]**.
- `lng`, when provided, must be in **[-180, 180]**.
- `mapUrl`, when non-empty, must be an **absolute `http`/`https` URL of at most 500 characters**.

**Validation — cross-entity** ([`FamilyGraphValidator`](../../../src/backend/FamilyTree.Infrastructure/FamilyGraphValidator.cs), run by the handler against the full graph, not the single-record validator): rejects a `birthYear` that is not strictly **after** a known parent's birth year, or not strictly **before** a known child's birth year (`parent.birth < person.birth < child.birth`). Unknown (null) years on the other party are skipped — only a *known* violation is rejected. A rejection surfaces as `400` with the property name `Profile.BirthYear`.

**Persistence:** profile overrides are stored in a new, independent **profile override** layer — a `PersonProfileOverride` (`givenName`/`surname`/`maidenName`/`middleName`/`sex`/`birthYear`/`deathYear`/`vocation`, each nullable, **plus** a nullable `Residences` whole-list field) appended per person, distinct from the biography and media override layers (the three never clobber one another). In-memory locally (`InMemoryPersonOverrideStore`); Firestore collection `profile-overrides` (config key `Firestore:ProfileOverridesCollection`) in deployment, same append-only parent-doc + `versions` subcollection shape as biography/media overrides — each residence row is stored as a map (`placeRu`/`placeBe`/`placeEn`/`fromYear`/`toYear`/`lat`/`lng`/`mapUrl`) inside a `residences` array field on the version document. A **residences-only** override (no scalar field changed) still persists — the store's "is this override empty?" check considers `residences` alongside the scalar fields, so a residences-only save is not silently dropped. **Never writes `family.json`.**

**Snapshot-layer merge:** unlike the biography/media overrides (applied to the DTO), a profile override is merged into the `Person` domain object itself inside [`FamilySnapshotProvider`](../../../src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs) *before* the snapshot's `FamilyGraph` is built. A saved edit therefore doesn't just change what `GET /api/people/{id}` returns — a corrected birth year moves the person in the oak's time-axis layout and era-based Film-theme card styling, and in `GET /api/family/graph`, on the very same merged snapshot every other read uses. Names merge **per locale** (a `null` locale in the override inherits that locale from the seed, not the whole name); `sex`/`vocation`/`birthYear`/`deathYear` are whole-field coalesce (override value if present, else seed). **`residences` is a whole-list coalesce, not a per-row merge** — `profile.Residences ?? seed.Residences` — so a saved override entirely replaces the seed list (never merges row-by-row against it), and a `null` override falls back to the full seed list. The save handler forces an immediate snapshot refresh (`RefreshAsync`), same as a biography save — no TTL wait.

### `PUT /api/people/{id}/biography`
Editor-gated biography update. Requires a valid session cookie **and** `canEdit: true`.

**Request body (`application/json`):** `LocalizedTextDto` — `{ "ru": string|null, "be": string|null, "en": string|null }`.

| Status | When | Body |
|---|---|---|
| `200` | Success | Updated `PersonDto` (biography reflects the new value) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor (`canEdit: false`) | empty |
| `404` | Person id not found | ProblemDetails |
| `400` | Malformed `id` param, empty biography (all locales null/blank), or **any locale longer than 20,000 characters** | Validation error (same shape as `GET /api/people/{id}`) |

**Biography replace semantics:** the entire biography value is replaced with the submitted body. All three locale fields are stored as-is. An edit that submits only one locale (e.g. `{ "en": "text" }`) will set `ru` and `be` to `null`; include all locales you want to keep.

**Length cap:** each locale (`ru`/`be`/`en`) is capped at **20,000 characters**; exceeding it returns `400`. This bounds a persisted, publicly-served field (well under Firestore's 1 MiB/document limit even across all three locales).

**Persistence:** biography overrides are stored durably in Firestore (in deployment) or in-memory (local dev / CI). After an editor saves, the in-memory snapshot is refreshed immediately so the updated biography is visible on the next read — no TTL wait required.

### `GET /api/geocode/search`, `GET /api/geocode/reverse`, `GET /api/geocode/names`
A server-side proxy in front of the Google Geocoding web service, backing the residence [map picker](search-and-navigation.md#editing-residences-signed-in-editors-cut-1c) (`MapPicker.vue`). All three actions are editor-gated — an anonymous endpoint would turn the API into a free public geocoding proxy billed to the owner's Google Cloud account. Each calls Google with a **server-side** API key from configuration key `GoogleMaps:GeocodingApiKey` (bound as `GoogleMapsOptions`); when that key is unset (`GoogleMapsOptions.IsConfigured` is `false`), the client makes no HTTP call and degrades quietly per action (below) rather than failing.

**`GET /api/geocode/search?q=<text>`** — free-text place search (the picker's debounced search box).

| Status | When | Body |
|---|---|---|
| `200` | Success (incl. unconfigured key) | `GeocodePlaceDto[]` — `[]` when the key is unconfigured or Google returns no match |
| `400` | `q` empty or missing, or longer than **200 characters** | Validation error (same shape as other `400`s) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |

**`GET /api/geocode/reverse?lat=<double>&lng=<double>`** — resolves the place id under a dropped/dragged pin.

| Status | When | Body |
|---|---|---|
| `200` | Success (incl. unconfigured key) | `{ "placeId": string \| null }` — `placeId` is `null` when the key is unconfigured or nothing is found at the coordinate |
| `400` | `lat` outside **[-90, 90]** or `lng` outside **[-180, 180]** | Validation error |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |

**`GET /api/geocode/names?placeId=<id>`** — the place's locality name in each app locale (ru/be/en), looked up as three separate Google calls.

| Status | When | Body |
|---|---|---|
| `200` | Key configured (whether or not the place id resolves) | `LocalizedNamesDto` — `{ "ru": string, "be": string, "en": string }`; each locale is `""` when that locale's lookup doesn't resolve |
| `404` | Geocoding key unconfigured | ProblemDetails |
| `400` | `placeId` empty or missing, or longer than **200 characters** | Validation error |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor | empty |

> `names` differs from `search`/`reverse` in its unconfigured-key behavior: it returns **404**, not a `200` with empty/null fields, because `LocalizedNamesHandler` returns `null` straight through to `NotFound()` (verified in [`GeocodeEndpointsTests`](../../../tests/integration/FamilyTree.IntegrationTests/GeocodeEndpointsTests.cs)). With a configured key, an unresolvable `placeId` still returns **200** — each locale's lookup independently falls back to `""` rather than failing the whole request.

## Configuration: `Authentication` section

```json
{
  "Authentication": {
    "Google": {
      "ClientId": "",
      "Editors": []
    },
    "Session": {
      "CookieName": "ft_session",
      "LifetimeDays": 7,
      "SlidingRenewal": true
    }
  }
}
```

`Google.ClientId` and `Google.Editors[]` are sensitive — supply them via user secrets or `Authentication__Google__ClientId` / `Authentication__Google__Editors__0` environment variables (never committed). `Session` defaults are safe to use as-is. **Sliding renewal with token rotation:** past the halfway point of a session's lifetime, each authenticated request issues a **fresh opaque token** and invalidates the old one — the cookie value changes. The 7-day lifetime resets from the renewal point. A token that was rotated away stops working immediately.

**`canEdit` determination:** the session email is compared (case-insensitive) against the **current** `Authentication:Google:Editors[]` on **every authenticated request**, not just at sign-in. The value stored in the session at sign-in is not trusted as the gate, so removing an editor from the allow-list revokes edit access immediately (even for a still-valid Firestore session that outlived the redeploy that removed them), and adding one is honoured without a re-login. The flag is surfaced in `/api/auth/me` and `/api/auth/session` responses.

## Configuration: `FamilyData` section

```json
{
  "FamilyData": {
    "Source": "Data/family.json",
    "SnapshotTtlMinutes": 10
  }
}
```

`FamilyData:Source` selects the seed loader:
- **Local file path** (default `Data/family.json`) — used in local dev, CI, and tests; reads the committed file. (The old key name `FilePath` is **gone**; use `Source`.)
- **`gs://bucket/object` URI** — used in deployment (`FamilyData__Source=gs://family-tree-seed/family.json`); reads from Google Cloud Storage via Application Default Credentials / Workload Identity — **no key or new secret required**. Edits to the GCS object are picked up within the TTL without a redeploy.

All reads (public and editor) are served from a single **in-memory merged snapshot** = the seed data with the latest biography overrides applied. The snapshot is rebuilt on first request and then on whichever comes first: the TTL elapses (`SnapshotTtlMinutes`, default 10) or an editor saves a biography (immediate refresh). A rebuild re-reads the seed (from the file or GCS) and re-pulls all stored overrides. The minimum TTL is 1 minute (enforced in code).

**Resilience:** if the seed cannot be read at **startup**, the API exits immediately (fail-fast — a bad deploy is caught right away). If a later periodic refresh fails transiently (e.g. a brief GCS connectivity blip), the API continues serving the last-good cached snapshot, logs a warning, and backs off one TTL before retrying — it never blanks the tree or returns 500 to a pending request. If refreshes keep failing — **3 consecutive failures** — the log escalates from warning to **error** and `/health` reports **`"Degraded"`** (still HTTP `200`), so a persistently-down source surfaces to monitoring instead of hiding in a stream of warnings; the counter resets on the next successful refresh. The GCS download and Firestore reads/writes also carry an app-imposed deadline (30 s for the seed download, 15 s for Firestore ops) so a hung connection fails fast rather than holding the refresh lock or tying up a request. Note that if the GCS seed read happens to be failing at the exact moment an editor saves a biography, the save still succeeds (the biography is durably stored in Firestore) and returns `200`, but the edit won't appear in reads until the next successful snapshot refresh — the data is never lost, only its visibility is briefly delayed.

## Configuration: `Firestore` section

```json
{
  "Firestore": {
    "ProjectId": "",
    "SessionsCollection": "sessions",
    "OverridesCollection": "personOverrides",
    "MediaOverridesCollection": "mediaOverrides",
    "ProfileOverridesCollection": "profile-overrides"
  }
}
```

When `Firestore:ProjectId` is blank (the default — local dev, CI, tests), the API uses **in-memory stores** for sessions, biography overrides, media overrides, and profile overrides; they reset on restart. When `ProjectId` is set to a GCP project id (deployment only), the API uses **Google Firestore (native mode)** and all overrides survive restarts. Auth uses Workload Identity / Application Default Credentials — no database password. Collection names default to `sessions`, `personOverrides`, `mediaOverrides`, and `profile-overrides`; override via the corresponding `Firestore:*Collection` keys. **The actual Firestore enablement and deployment env vars are out of scope for this PR** (a later deploy PR).

## Configuration: `R2` section

```json
{
  "R2": {
    "AccountId": "",
    "Bucket": "",
    "AccessKeyId": "",
    "SecretAccessKey": "",
    "LocalMediaDirectory": ""
  }
}
```

Controls the runtime media store. When all four of `AccountId`, `Bucket`, `AccessKeyId`, and `SecretAccessKey` are non-blank, the API uses `R2MediaStore` (Cloudflare R2 via its S3-compatible API). When any credential is missing, the API falls back to `LocalFileMediaStore`, which writes into `LocalMediaDirectory` when set. When that is blank **in Development**, the API resolves the directory to the **repo-root `media/` folder** (the one the Vite dev server serves at `/media/*`), so editor-uploaded photos render end-to-end under both `dotnet run` and `scripts/dev.mjs`; the path is resolved from the content root (independent of the working directory) and anchored on `FamilyTree.slnx`, falling back to `<app-base>/media` outside a source checkout. Integration tests set `LocalMediaDirectory` to an isolated temp directory.

`R2:LocalMediaDirectory` is **dev-only** — it has no effect when R2 credentials are configured. Supply credentials via environment variables (never committed): `R2__AccountId`, `R2__Bucket`, `R2__AccessKeyId`, `R2__SecretAccessKey`. See [`docs/ci-cd/deploy.md`](../../../docs/ci-cd/deploy.md#r2-api-token-and-cloud-run-secrets) for the Cloud Run wiring.

## Configuration: `Security:OriginVerify` section

```json
{
  "Security": {
    "OriginVerify": {
      "Secrets": []
    }
  }
}
```

`Secrets` is a list of accepted shared-secret values. When empty (the default), the origin gate is dormant and all requests pass through. In production, one or more values are bound from GCP Secret Manager (`origin-verify-0`, `origin-verify-1`, …) as `Security__OriginVerify__Secrets__0`, `__1`, etc. The Cloudflare Pages proxy injects the active secret into `X-Origin-Verify` on every upstream request; the API does a constant-time comparison. Supporting multiple entries at once enables zero-downtime rotation (see [`docs/ci-cd/deploy.md`](../../../docs/ci-cd/deploy.md) for the rotation procedure).

## Error response shapes (verified against the live API)

**400 validation** (`application/json`):
```json
{
  "title": "Validation failed",
  "errors": [
    { "propertyName": "Id", "errorMessage": "Person id must match the pattern 'p-<number>'." }
  ]
}
```
- Property names are **camelCase** (`propertyName`, `errorMessage`).
- An **empty** `id` produces the default message `"'Id' must not be empty."`; a non-empty mismatch produces the pattern message above.

**404** (`application/problem+json`) — standard ASP.NET ProblemDetails:
```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "traceId": "00-...-00"
}
```

**403 Forbidden** — origin gate rejection (missing or invalid `X-Origin-Verify` header when the gate is enabled): `{ "title": "Forbidden." }`. Also returned by `PUT /api/people/{id}/biography` when the session is valid but `canEdit` is `false` — that authz 403 has no body.

**413 Payload Too Large** — request body exceeds the configured limit: `{ "title": "Request body too large." }`. **429 Too Many Requests** — rate limit exceeded (see below). **500** — unhandled error: `{ "title": "An unexpected error occurred." }`.

## DTO contracts

### `PersonSummaryDto` (list/graph view)
| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | no | |
| `givenName` | LocalizedTextDto | no | |
| `surname` | LocalizedTextDto | no | |
| `maidenName` | LocalizedTextDto | yes | |
| `middleName` | LocalizedTextDto | yes | patronymic (RU "Отчество"); rendered inside the full name as `Given Middle Surname` |
| `sex` | string | no | `"unknown"` \| `"female"` \| `"male"` |
| `birthYear` | int | yes | flattened from `Birth.Year` |
| `deathYear` | int | yes | null if living/unknown |
| `vocation` | string | no | `"other"` \| `"teacher"` \| `"church"` \| `"writer"` \| `"office"` |
| `portrait` | string | yes | filename for seed portrait; `uploads/{id}/{hash}.webp` for uploaded |
| `portraitThumb` | string | yes | thumbnail key (`uploads/{id}/{hash}.thumb.webp`) for uploaded portrait; null for seed-only portraits |
| `portraitVideo` | string | yes | filename only |
| `parents` | ParentsDto | no | object always present; inner ids may be null |
| `marriedIntoFamily` | bool | no | |
| `isDefaultRoot` | bool | no | exactly one person is `true` (`p-0016`) |

> The summary intentionally **omits** `summary`, `biography`, `links`, `residences`, and detailed `birth`/`death` — those are only on `PersonDto`. `gallery` is also omitted from the summary (only on `PersonDto`).

### `PersonDto` (single-person detail)
Adds to the identity fields above:
| Field | Type | Nullable | Notes |
|---|---|---|---|
| `birth` | LifeEventDto | no | always present |
| `death` | LifeEventDto | yes | null if not deceased/unknown |
| `summary` | LocalizedTextDto | yes | |
| `biography` | LocalizedTextDto | yes | |
| `portrait` | string | yes | same as in `PersonSummaryDto` |
| `portraitThumb` | string | yes | same as in `PersonSummaryDto` |
| `gallery` | PhotoDto[] | no | `[]` when none; uploaded gallery photos |
| `links` | SocialLinkDto[] | no | `[]` when none |
| `residences` | ResidenceDto[] | no | `[]` when none |

### `PersonProfileDto` (raw profile override)
| Field | Type | Nullable | Notes |
|---|---|---|---|
| `givenName` | LocalizedTextDto | yes | |
| `surname` | LocalizedTextDto | yes | |
| `maidenName` | LocalizedTextDto | yes | |
| `middleName` | LocalizedTextDto | yes | patronymic (Отчество) |
| `sex` | string | yes | `"unknown"` \| `"female"` \| `"male"` |
| `birthYear` | int | yes | |
| `deathYear` | int | yes | |
| `vocation` | string | yes | `"other"` \| `"teacher"` \| `"church"` \| `"writer"` \| `"office"` |
| `residences` | ResidenceDto[] | yes | `null` inherits the seed residences list; a non-null (possibly empty) array **replaces it wholesale** — not a per-field coalesce like the other fields above |

> Every field is nullable here (unlike `PersonSummaryDto`/`PersonDto`, which always resolve to a concrete value) — this DTO is the raw override layer, not the merged person. `null` means "no override; inherit the seed." `GET` returns this shape; `PUT` accepts it.

### `PhotoDto` (gallery photo)
| Field | Type | Notes |
|---|---|---|
| `id` | string | first 20 hex chars of the SHA-256 of the full-size WebP |
| `full` | string | R2 key (`uploads/{personId}/{hash}.webp`) served at `/media/{key}` |
| `thumb` | string | R2 key (`uploads/{personId}/{hash}.thumb.webp`) served at `/media/{key}` |

### Geocoding DTOs
- **`GeocodePlaceDto`:** `{ "lat": double, "lng": double, "description": string, "placeId": string }` — one search candidate; `description` is Google's formatted address, `placeId` its stable identifier.
- **`ReverseGeocodeResultDto`:** `{ "placeId": string|null }`.
- **`LocalizedNamesDto`:** `{ "ru": string, "be": string, "en": string }`.

### Nested DTOs
- **LocalizedTextDto:** `{ "ru": string|null, "be": string|null, "en": string|null }` — all three locales are always returned; the **client** picks one (the backend does not resolve a locale).
- **ParentsDto:** `{ "motherId": string|null, "fatherId": string|null }`.
- **UnionDto:** `{ "id": string, "partnerIds": string[], "marriageYear": int|null, "childIds": string[] }`.
- **LifeEventDto:** `{ "year": int|null, "month": int|null, "day": int|null, "approx": bool, "place": LocalizedTextDto|null }`.
- **SocialLinkDto:** `{ "type": string, "url": string }` — `type` is a **free string** (e.g. `"facebook"`, `"instagram"`, `"wikipedia"`), not an enum.
- **ResidenceDto:** `{ "place": LocalizedTextDto, "fromYear": int|null, "toYear": int|null, "lat": double|null, "lng": double|null, "mapUrl": string|null }`. `lat`/`lng` are null on seed rows that were never picked on the map; `mapUrl` is a plain Google Maps website link, not an embed.

## Data model semantics
- **Person** identity always present: `id`, `givenName`, `surname`. `sex` defaults to `unknown`, `vocation` to `other`. Collections (`gallery`, `links`, `residences`) default to empty, never null. `parents` is never null (inner ids may be).
- **Negative years** (BCE) are returned as negative integers; no special formatting at the API.
- **`Resolve(locale)`** exists on `LocalizedText` with fallback order `requested → Ru → En → Be`, but **the API never calls it** — all locales are sent to the client.

## Non-functional behavior
- **Origin verification gate:** when `Security:OriginVerify:Secrets` is configured (production), every request except `/health` must carry a valid `X-Origin-Verify` header (injected by the Cloudflare Pages proxy) — else **403** (`{ "title": "Forbidden." }`). The gate is dormant when unconfigured (local dev / CI): the middleware passes all traffic through. It runs **before** the rate limiter, so all rate-limiter-reaching traffic has come through Cloudflare. See [configuration](#configuration-securityoriginverify-section) above and [`docs/ci-cd/deploy.md`](../../../docs/ci-cd/deploy.md) for the provisioning runbook and rotation procedure.
- **Rate limiting:** fixed-window, partitioned by client IP. Default **100 requests / 60 s**; queue 0; over-limit → **429**. Applied to all controllers via `RequireRateLimiting("api")` **and to `/health`** (the deploy health check and Cloud Run probes stay well under 100/60 s). Configurable: `RateLimiting:PermitLimit`, `RateLimiting:WindowSeconds`.
- **Request body size limit:** capped at **256 KiB** (`RequestLimits:MaxRequestBodyBytes`). A request that declares an oversized `Content-Length` is short-circuited before the endpoint reads the body with a clean **413 Payload Too Large** (`{ "title": "Request body too large." }`). The guard runs **after** the rate limiter, so on a rate-limited endpoint an oversized-body flood still consumes permits and is throttled (429) rather than yielding unlimited 413s. A chunked/streaming body without a `Content-Length` is enforced at the **Kestrel connection level** instead (a connection-level rejection, not the JSON body). Comfortably covers a full three-locale biography edit; rejects abusive payloads. In deployment the API sits behind the Cloudflare → Cloud Run proxy chain; `UseForwardedHeaders` is registered (`KnownProxies`/`KnownIPNetworks` cleared, `ForwardLimit = 2`) so the rate limiter partitions by the **real client IP** from `X-Forwarded-For` rather than the proxy address. When the [origin gate](#non-functional-behavior) is enabled, off-Cloudflare callers are 403'd before they reach the limiter, so the `X-Forwarded-For` spoofing path is closed.
- **Security headers** (on every response): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- **CORS:** policy `frontend-dev` allows `http://localhost:5173` (any header/method) — **Development only**. Production has no CORS (browser hits the same origin via the Cloudflare proxy).
- **Static files:** `UseStaticFiles()` serves `wwwroot`.
- **Data load and snapshot cache:** [`FamilySnapshotProvider`](../../../src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs) is a singleton that warms at startup (fail-fast on any seed load error). It serves all reads from a merged in-memory snapshot (seed + biography overrides + media overrides + **profile overrides**). Profile overrides are applied to each `Person` first (scalar fields), then biography and media overrides layer on top — so a corrected name/year and an edited biography on the same person compose correctly. Snapshot TTL is configurable via `FamilyData:SnapshotTtlMinutes` (default 10, minimum 1). The seed loader is selected by `FamilyData:Source`: a `gs://` URI picks `GcsFamilyDataLoader`; any other value picks `JsonFamilyDataLoader`. Missing local file → `FileNotFoundException`; missing/unreachable GCS object → exception; null deserialization → `InvalidOperationException`. Transient refresh failures serve stale (see `FamilyData` section above).

## QA notes / edge cases
- Asserting the **404 body** as empty is wrong — it is ProblemDetails JSON (`application/problem+json`).
- Validation error field casing is **camelCase** (`propertyName`/`errorMessage`), even though the C# anonymous type uses PascalCase.
- All `LocalizedTextDto` fields can be null individually; QA should not assume `ru` is always present.
- `gallery` in seed data is always `[]`; uploaded gallery photos do appear here in the live app.
- `portrait` on `PersonSummaryDto`/`PersonDto` is a bare filename for seed photos (e.g. `p-0001.jpg`) but a full R2 key for uploaded portraits (e.g. `uploads/p-0001/<hash>.webp`). The frontend's `resolveMediaUrl` handles both.
- `portraitThumb` is only present for uploaded portraits; it is `null` for seed-only portraits.
- `POST /api/people/{id}/photos` uses `[RequestSizeLimit(15_728_640)]` on the action **plus** a path-aware middleware cap, so both Kestrel and `Content-Length` are enforced.
- HEIC uploads are rejected with `400` — ImageSharp does not support HEIC decoding.
- A `DELETE /api/people/{id}/photos/gallery/{photoId}` with a non-existent `photoId` is a silent no-op (200, unchanged person), not a 404.
- The `promote` endpoint requires the `photoId` to be a current gallery entry; a non-existent id also returns 200 unchanged (no gallery entry moved).
- `GET /api/people/{id}/profile` on a person with no saved override still returns `200` with an **all-null** `PersonProfileDto`, not `404` — `404` is reserved for a nonexistent person id.
- `PUT /api/people/{id}/profile` is a **whole-document replace**: the latest override wins, and a `null` field inherits the **seed** — it is not merged with any prior override. Effective-date coherence is therefore validated against the seed baseline, so a replace that drops a coarser unit under a finer one (e.g. omits the month while sending a day, when the seed has no month) is rejected `400` rather than silently rendering a day-without-month. The Members dossier's **Edit details** editor always carries the current override forward, so it never hits this.
- A `PUT /api/people/{id}/profile` birth-year edit that violates the cross-entity check returns `400` with `propertyName: "Profile.BirthYear"` — the message names which relative (parent/child) and year it conflicts with.
- `residences` on `PUT /api/people/{id}/profile` is **whole-list, not per-row**: submitting one changed row alongside 9 unchanged ones requires sending all 10 back — there is no per-row patch, and an omitted row is simply gone from the saved list (not preserved). `null` (not an empty array) is what reverts to the seed list; `[]` is a valid, explicit "no residences" override, distinct from "inherit the seed."
- A residence row failing validation (e.g. an out-of-range `lat`) fails the **whole `PUT`** — no row is partially saved; the `400` body's `errors[]` entry names the failing row and field, e.g. `"propertyName": "Profile.Residences[0].Lat"` (verified: FluentValidation's `RuleForEach` index-per-item naming, zero-based).
- `/api/geocode/*` is editor-gated like the media/profile/biography write endpoints, even though all three actions are `GET`s — geocoding is a billed Google API call, so the `CanEdit` gate exists to protect cost, not data integrity.
- An unconfigured `GoogleMaps:GeocodingApiKey` behaves differently per `/api/geocode/*` action: `search` returns `200` with `[]`, `reverse` returns `200` with `{ "placeId": null }`, but `names` returns **`404`** — do not assume all three degrade the same way.
