# Google sign-in + editor-gated edits — design

**Date:** 2026-06-17
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem & goal

The app is a public, read-only family-tree viewer. The API (`FamilyController`,
`PeopleController`) serves graph data from a committed seed `family.json` with no
authentication or user concept anywhere.

We want **edit actions to be restricted to a small set of trusted people**, while
**viewing stays fully public**. This PR builds the authentication + authorization
layer (sign in with Google, backend verifies identity, an "editor-only" policy)
and proves it end-to-end with **one genuinely guarded demonstrator endpoint** — it
does *not* build a full editing product.

## Decisions (from brainstorming)

- **Purpose:** public read stays open; sign-in establishes identity so future
  edit actions can be gated. (Not a privacy wall, not full accounts.)
- **Who may edit:** a configured **allow-list of Google emails**. Anyone signed in
  but not on the list is read-only. No user-management/role system.
- **How the browser proves identity:** **stateless** — the browser holds Google's
  ID token (a ~1h JWT) and sends it as `Authorization: Bearer <token>`; the backend
  validates it per request. No server sessions, no cookies, no login endpoint.
- **Scope:** full sign-in loop + `GET /api/auth/me` + sign-in UI **plus one real
  guarded endpoint** (`PUT /api/people/{id}/biography`) to exercise the editor path
  for real.
- **Demonstrator persistence:** an **in-memory editable overlay** over the
  immutable seed. Real end-to-end, but **non-durable** (resets on restart, per-Cloud
  Run-instance). Documented as experimental; not a persistence feature.
- **GIS flavor:** the **ID-token credential flow** ("Sign in with Google" button /
  One-Tap), identity only — no OAuth scopes/popup.

## Architecture

### 1. Backend — token validation & authorization

- Add `Microsoft.AspNetCore.Authentication.JwtBearer`. Configure it to validate
  Google's ID token as a JWT:
  - `Authority = https://accounts.google.com` (auto-fetches Google's signing keys
    via OIDC discovery; no hand-rolled crypto),
  - `Audience = <our Google client ID>` (from `GoogleAuthOptions.ClientId`).
- **`CanEdit` authorization policy:** requires an authenticated token **and** the
  `email` claim present (case-insensitive) in the configured editor allow-list.
  Implemented as an `IAuthorizationRequirement` + handler that reads
  `IOptions<GoogleAuthOptions>.Editors`.
- **`GET /api/auth/me`** (`[Authorize]`): returns `{ email, name, canEdit }`;
  `401` when not signed in. The frontend calls it after sign-in to learn the
  *authoritative* editor status (never trusts a client-side guess).
- **Demonstrator — `PUT /api/people/{id}/biography`** (`[Authorize(Policy = "CanEdit")]`):
  flows through a new MediatR `UpdatePersonBiographyCommand` → handler →
  `IPersonRepository`, with a FluentValidation validator (person exists, text
  non-empty). Returns the updated `PersonDto`. Request body carries the localized
  biography (`{ ru, be, en }`).
- **`Program.cs` wiring:** `AddAuthentication().AddJwtBearer(...)`,
  `AddAuthorization(policy)`, and `app.UseAuthentication(); app.UseAuthorization();`
  placed before `MapControllers()`. Existing rate-limiting, CORS, security headers,
  and exception handler are unchanged.

### 2. Infrastructure — the editable overlay

- `FamilyStore` gains a `ConcurrentDictionary<string, LocalizedText>` biography
  overlay. The seed `People`/`Unions` lists stay immutable.
- `IPersonRepository` gains `UpdateBiographyAsync(id, biography, ct)`.
  `GetByIdAsync`/`GetAllAsync` layer the overlay over the seed so reads reflect
  edits (return the person with the overlaid `Biography` when an override exists).
- **Honest caveat (documented in code + reference docs):** non-durable — resets on
  restart and is per-instance on Cloud Run. It demonstrates the auth path, not
  persistence.

### 3. Frontend — sign-in UI

- New **`authStore`** (Pinia): state `{ idToken, email, name, canEdit, signedIn }`;
  actions `signIn` (handle the GIS credential), `signOut`, `fetchMe`. The token is
  kept in memory; on reload the GIS auto-select silently re-issues it.
- **`AppBar`** gains a Google **Sign in / Sign out** control, shows the signed-in
  identity, and renders an **editor badge** when `canEdit`.
- The API client attaches `Authorization: Bearer <idToken>` when a token is present
  (used by `/api/auth/me` and the biography `PUT`); public GETs are unaffected.
- New i18n strings (ru / be / en) for sign-in, sign-out, signed-in identity, and the
  editor badge.

### 4. Config — `AppSettings` binding shape → mapped `IOptions<>` per consumer

Two layers, kept deliberately minimal:

1. **`AppSettings`** — a single config-binding root mirroring `appsettings.json`,
   living entirely in `FamilyTree.Api`. Framework sections (`Logging`,
   `AllowedHosts`) are **excluded** — they stay with the host. Bound once via
   `AddOptions<AppSettings>().Bind(config).ValidateDataAnnotations().ValidateOnStart()`
   (fail-fast on bad config). Nothing outside the composition root depends on
   `AppSettings`.

   ```
   AppSettings
   ├─ FamilyData      { FilePath }
   ├─ MediatR         { LicenseKey }
   ├─ RateLimiting    { PermitLimit, WindowSeconds }
   └─ Authentication  { Google { ClientId, Editors[] } }
   ```

2. **Per-consumer `Options` classes** — created **only when a DI-resolved class
   needs the setting**. If a setting is consumed solely at the composition root
   (`Program.cs`), it is read straight off the bound `AppSettings` — no `Options`
   class, no `IOptions<>` wiring.

| AppSettings section | How it's consumed | Options class? |
|---|---|---|
| `FamilyData` | DI — `JsonFamilyDataLoader` | **Yes** — `IOptions<FamilyDataOptions>` *(existing, unchanged; lives in Infrastructure)* |
| `Authentication.Google` | DI — the `CanEdit` handler reads `Editors`; `ClientId` also used at root for JwtBearer | **Yes** — `IOptions<GoogleAuthOptions>` *(new; lives in Api)* |
| `RateLimiting` | root only — rate-limiter setup | **No** — read `appSettings.RateLimiting.*` inline |
| `MediatR.LicenseKey` | root only — passed to `AddApplication` | **No** — read `appSettings.MediatR.LicenseKey` inline |

- **Mapping** (composition root): `services.Configure<FamilyDataOptions>(o => /* copy from appSettings.FamilyData */)` and the same for `GoogleAuthOptions`. The
  layer extension methods receive their mapped section, so `AddInfrastructure` no
  longer takes a raw `IConfiguration`.
- **`appsettings.json`:** keeps `Logging`/`AllowedHosts` as-is.
  `Authentication.Google.ClientId` and `Editors` are **empty placeholders** with a
  comment (mirrors the MediatR-license-key pattern) — real values come from
  user-secrets locally and `Authentication__Google__ClientId` /
  `Authentication__Google__Editors__0…` env vars on Cloud Run. **Nothing secret or
  personal is committed** (public repo).
- **Frontend:** Google client ID via `VITE_GOOGLE_CLIENT_ID` build env on Cloudflare
  Pages.
- **Proxy:** `functions/api/[[path]].ts` already forwards `Authorization` verbatim;
  update its stale "revisit Authorization when auth is added" note.

### 5. Testing

- **Backend unit:**
  - `CanEdit` handler — email in/out of allow-list, case-insensitive, missing claim.
  - Overlay repository — `UpdateBiographyAsync` then `GetByIdAsync`/`GetAllAsync`
    reflect the override; unrelated people unchanged.
  - `UpdatePersonBiographyCommand` handler + validator (person exists, non-empty).
  - `/api/auth/me` mapping (claims → `{ email, name, canEdit }`).
  - `AppSettings` binds from a sample config incl. `Editors[]`; each mapping copies
    the right values into its `Options`.
- **Integration:** `/api/auth/me` and biography `PUT` → `401` anonymous; non-editor
  token → `403`; editor token → `200` and a follow-up `GET` reflects the edit. Use a
  test authentication handler to inject identities (no live Google calls).
- **Frontend (Vitest):** `authStore` actions (`signIn`/`signOut`/`fetchMe`),
  `AppBar` states (signed-out / signed-in / editor badge), API client attaches the
  `Bearer` header only when a token is present.

### 6. Docs (same PR)

- `docs/reference/` — document the auth model (public read, editor allow-list,
  stateless Google ID token), `GET /api/auth/me`, the guarded biography endpoint,
  and the non-durable-overlay caveat.
- Root `README.md` / `CLAUDE.md` overview — note that auth now exists.
- `docs/ci-cd/deploy.md` — new env vars (`Authentication__Google__ClientId`,
  `Authentication__Google__Editors__*`, `VITE_GOOGLE_CLIENT_ID`) and how to set them.
- Run the `update-docs-for-pr` skill at PR time.

## Out of scope

- Durable persistence of edits (writable seed / database).
- A full editing UI beyond what's needed to exercise the biography demonstrator.
- Server-side sessions, refresh tokens, cookies, sign-out revocation.
- Roles beyond the binary editor allow-list.

## Risks / notes

- **Non-durable overlay** is intentional but must be clearly labelled so it is never
  mistaken for real persistence (resets on restart; inconsistent across Cloud Run
  instances).
- **Google client ID** is public by nature (safe to expose in the SPA); the **editor
  email list** is configuration, kept out of the public repo via env/user-secrets.
- JwtBearer `Authority` requires outbound access to Google's OIDC metadata at
  startup/first request — fine on Cloud Run; integration tests bypass it with a test
  auth handler.
