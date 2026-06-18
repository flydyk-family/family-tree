# Feature: Backend API

← back to [features index](README.md) · [reference index](../README.md)

The API is served under `/api/...` (plus `/health`). Read-only public endpoints are anonymous. A small set of **authentication** endpoints and one **editor-gated write** endpoint are also present (backend only — no frontend sign-in UI yet). All responses are JSON (`application/json`) with **camelCase** property names (`System.Text.Json` Web defaults). Enums serialize as lowercase strings.

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
Not under `/api`; **not** rate-limited.
```json
{ "status": "Healthy", "version": "0.5.0", "commit": "local" }
```
- `status` — always `"Healthy"` (no custom health contributors registered).
- `version` — assembly informational version (from [`VERSION`](../../../VERSION)); `"unknown"` if absent.
- `commit` — `APP_COMMIT` env var (set at deploy); `"local"` if unset.

### Development-only
- `GET /openapi/v1.json` — OpenAPI document, **Development environment only**.

## Authentication & editor endpoints

> ⚠️ **Backend only, no UI yet.** These endpoints are fully functional and integration-tested. There is no frontend sign-in page yet — testing must be done via HTTP clients. In local dev and CI, sessions and biography overrides are **in-memory**. In deployment (when `Firestore:ProjectId` is configured), they persist in **Google Firestore**.

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
Returns the signed-in identity.

| Status | When | Body |
|---|---|---|
| `200` | Valid session cookie present | `{ "email": string, "name": string, "canEdit": bool }` |
| `401` | No cookie or unrecognised/expired session | empty |

### `PUT /api/people/{id}/biography`
Editor-gated biography update. Requires a valid session cookie **and** `canEdit: true`.

**Request body (`application/json`):** `LocalizedTextDto` — `{ "ru": string|null, "be": string|null, "en": string|null }`.

| Status | When | Body |
|---|---|---|
| `200` | Success | Updated `PersonDto` (biography reflects the new value) |
| `401` | Not signed in | empty |
| `403` | Signed in but not an editor (`canEdit: false`) | empty |
| `404` | Person id not found | ProblemDetails |
| `400` | Malformed `id` param | Validation error (same shape as `GET /api/people/{id}`) |

**Biography replace semantics:** the entire biography value is replaced with the submitted body. All three locale fields are stored as-is. An edit that submits only one locale (e.g. `{ "en": "text" }`) will set `ru` and `be` to `null`; include all locales you want to keep.

**Persistence:** biography overrides are stored durably in Firestore (in deployment) or in-memory (local dev / CI). After an editor saves, the in-memory snapshot is refreshed immediately so the updated biography is visible on the next read — no TTL wait required.

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

**`canEdit` determination:** at sign-in, the Google-verified email is compared (case-insensitive) against `Authentication:Google:Editors[]`. The result is stored in the session and surfaced in `/api/auth/me` and `/api/auth/session` responses.

## Configuration: `FamilyData` section

```json
{
  "FamilyData": {
    "FilePath": "Data/family.json",
    "SnapshotTtlMinutes": 10
  }
}
```

All reads (public and editor) are served from a single **in-memory merged snapshot** = the seed data from `family.json` with the latest biography overrides applied. The snapshot is rebuilt on first request and then on whichever comes first: the TTL elapses (`SnapshotTtlMinutes`, default 10) or an editor saves a biography (immediate refresh). A rebuild re-reads `family.json` and re-pulls all stored overrides, so a manually replaced seed file is picked up within the TTL. The minimum TTL is 1 minute (enforced in code).

## Configuration: `Firestore` section

```json
{
  "Firestore": {
    "ProjectId": "",
    "SessionsCollection": "sessions",
    "OverridesCollection": "personOverrides"
  }
}
```

When `Firestore:ProjectId` is blank (the default — local dev, CI, tests), the API uses **in-memory stores** for sessions and biography overrides; they reset on restart. When `ProjectId` is set to a GCP project id (deployment only), the API uses **Google Firestore (native mode)** and sessions/overrides survive restarts. Auth uses Workload Identity / Application Default Credentials — no database password. Collection names default to `sessions` and `personOverrides`; override via `Firestore:SessionsCollection` / `Firestore:OverridesCollection`. **The actual Firestore enablement and deployment env vars are out of scope for this PR** (a later deploy PR).

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

**429 Too Many Requests** — rate limit exceeded (see below). **500** — unhandled error: `{ "title": "An unexpected error occurred." }`.

## DTO contracts

### `PersonSummaryDto` (list/graph view)
| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | no | |
| `givenName` | LocalizedTextDto | no | |
| `surname` | LocalizedTextDto | no | |
| `maidenName` | LocalizedTextDto | yes | |
| `sex` | string | no | `"unknown"` \| `"female"` \| `"male"` |
| `birthYear` | int | yes | flattened from `Birth.Year` |
| `deathYear` | int | yes | null if living/unknown |
| `vocation` | string | no | `"other"` \| `"teacher"` \| `"church"` \| `"writer"` \| `"office"` |
| `portrait` | string | yes | filename only |
| `portraitVideo` | string | yes | filename only |
| `parents` | ParentsDto | no | object always present; inner ids may be null |
| `marriedIntoFamily` | bool | no | |
| `isDefaultRoot` | bool | no | exactly one person is `true` (`p-0016`) |

> The summary intentionally **omits** `summary`, `biography`, `gallery`, `links`, `residences`, and detailed `birth`/`death` — those are only on `PersonDto`.

### `PersonDto` (single-person detail)
Adds to the identity fields above:
| Field | Type | Nullable | Notes |
|---|---|---|---|
| `birth` | LifeEventDto | no | always present |
| `death` | LifeEventDto | yes | null if not deceased/unknown |
| `summary` | LocalizedTextDto | yes | |
| `biography` | LocalizedTextDto | yes | |
| `gallery` | string[] | no | `[]` when none (no seed data populates it) |
| `links` | SocialLinkDto[] | no | `[]` when none |
| `residences` | ResidenceDto[] | no | `[]` when none |

### Nested DTOs
- **LocalizedTextDto:** `{ "ru": string|null, "be": string|null, "en": string|null }` — all three locales are always returned; the **client** picks one (the backend does not resolve a locale).
- **ParentsDto:** `{ "motherId": string|null, "fatherId": string|null }`.
- **UnionDto:** `{ "id": string, "partnerIds": string[], "marriageYear": int|null, "childIds": string[] }`.
- **LifeEventDto:** `{ "year": int|null, "month": int|null, "day": int|null, "approx": bool, "place": LocalizedTextDto|null }`.
- **SocialLinkDto:** `{ "type": string, "url": string }` — `type` is a **free string** (e.g. `"facebook"`, `"instagram"`, `"wikipedia"`), not an enum.
- **ResidenceDto:** `{ "place": LocalizedTextDto, "fromYear": int|null, "toYear": int|null, "mapUrl": string|null }`.

## Data model semantics
- **Person** identity always present: `id`, `givenName`, `surname`. `sex` defaults to `unknown`, `vocation` to `other`. Collections (`gallery`, `links`, `residences`) default to empty, never null. `parents` is never null (inner ids may be).
- **Negative years** (BCE) are returned as negative integers; no special formatting at the API.
- **`Resolve(locale)`** exists on `LocalizedText` with fallback order `requested → Ru → En → Be`, but **the API never calls it** — all locales are sent to the client.

## Non-functional behavior
- **Rate limiting:** fixed-window, partitioned by client IP. Default **100 requests / 60 s**; queue 0; over-limit → **429**. Applied to all controllers via `RequireRateLimiting("api")`. `/health` is exempt. Configurable: `RateLimiting:PermitLimit`, `RateLimiting:WindowSeconds`.
- **Security headers** (on every response): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- **CORS:** policy `frontend-dev` allows `http://localhost:5173` (any header/method) — **Development only**. Production has no CORS (browser hits the same origin via the Cloudflare proxy).
- **Static files:** `UseStaticFiles()` serves `wwwroot`.
- **Data load and snapshot cache:** [`FamilySnapshotProvider`](../../../src/backend/FamilyTree.Infrastructure/FamilySnapshotProvider.cs) is a singleton that warms at startup (preserving fail-fast on a bad seed file). It serves all reads from a merged in-memory snapshot (seed + overrides). Snapshot TTL is configurable via `FamilyData:SnapshotTtlMinutes` (default 10, minimum 1). Missing seed file → `FileNotFoundException` at startup; null deserialization → `InvalidOperationException`.

## QA notes / edge cases
- Asserting the **404 body** as empty is wrong — it is ProblemDetails JSON (`application/problem+json`).
- Validation error field casing is **camelCase** (`propertyName`/`errorMessage`), even though the C# anonymous type uses PascalCase.
- All `LocalizedTextDto` fields can be null individually; QA should not assume `ru` is always present.
- `gallery` is always `[]` in current seed data even though the field exists.
