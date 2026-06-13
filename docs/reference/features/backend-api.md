# Feature: Backend API

← back to [features index](README.md) · [reference index](../README.md)

The API is read-only, served under `/api/...` (plus `/health`). All responses are JSON (`application/json`) with **camelCase** property names (`System.Text.Json` Web defaults). Enums serialize as lowercase strings.

## Endpoints

### `GET /api/family/graph`
The whole graph. Used by the SPA on load.

**Response `200` — `FamilyGraphDto`:**
```json
{ "people": PersonSummaryDto[], "unions": UnionDto[] }
```
No params, no validation. Order matches `family.json` (no sorting applied).

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
- `version` — assembly informational version (from `VERSION`); `"unknown"` if absent.
- `commit` — `APP_COMMIT` env var (set at deploy); `"local"` if unset.

### Development-only
- `GET /openapi/v1.json` — OpenAPI document, **Development environment only**.

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
- **Data load:** `FamilyStore` singleton loads `Data/family.json` once at startup (path configurable via `FamilyData:FilePath`). Missing file → `FileNotFoundException` at startup; null deserialization → `InvalidOperationException`.

## QA notes / edge cases
- Asserting the **404 body** as empty is wrong — it is ProblemDetails JSON (`application/problem+json`).
- Validation error field casing is **camelCase** (`propertyName`/`errorMessage`), even though the C# anonymous type uses PascalCase.
- All `LocalizedTextDto` fields can be null individually; QA should not assume `ru` is always present.
- `gallery` is always `[]` in current seed data even though the field exists.
