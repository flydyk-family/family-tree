# Google sign-in + editor-gated edits — design

**Date:** 2026-06-17
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem & goal

The app is a public, read-only family-tree viewer. The API (`FamilyController`,
`PeopleController`) serves graph data from a committed seed `family.json` with no
authentication or user concept anywhere.

We want **edit actions restricted to a small set of trusted people**, while
**viewing stays fully public** — and we want those edits to **persist** without
losing the user's work to an expired login. This PR delivers, end to end:

1. **Sign in with Google** (identity only).
2. **A real server session** (Firestore-backed, revocable) so a long edit never
   fails mid-save.
3. **An editor allow-list** that gates edit actions.
4. **One durable, versioned demonstrator edit** — a person's biography — proving the
   whole loop with real persistence.

## Decisions (from brainstorming)

- **Purpose:** public read stays open; sign-in gates edit actions. Not a privacy
  wall, not full accounts/roles.
- **Who may edit:** a configured **allow-list of Google emails** → a `canEdit`
  claim. No user-management/role system.
- **Session, not per-request Google token.** The browser logs in with Google once;
  the backend issues **its own server session**. This removes the failure mode where
  a ~1h Google token expires mid-edit and the save is rejected.
- **Session is a revocable, Firestore-backed opaque token** (not a signed JWT): a
  random token in an `HttpOnly` cookie; Firestore holds the session record;
  **revocation = delete the record**. No signing key anywhere.
- **Session lifetime:** **7 days, sliding renewal** (extends on activity). An active
  editor effectively never gets logged out; an abandoned session lapses in a week.
- **Edits persist as JSON-baseline + Firestore overrides.** `family.json` stays the
  committed read-only baseline; edits are stored in Firestore and **layered over the
  seed on read**. Overrides are **append-only / versioned** (history retained).
- **Storage tech: Firestore (native, GCP)** — serverless, scales to zero, no DB
  password (auth via the existing Workload Identity setup).
- **No JSON→DB "big migration" PR.** The JSON-baseline + override approach is the
  intended permanent shape, so there is no committed follow-up migration.
- **GIS flavor:** the **ID-token credential flow** ("Sign in with Google" / One-Tap),
  identity only — no OAuth scopes/popup.
- **Local dev needs nothing installed:** every store is behind an interface with an
  **in-memory implementation** for local dev and unit tests; Firestore is used only
  in deployed environments. The Firestore emulator (which needs Java) is optional and
  not required.

## Architecture

### 1. Backend — login, session, authorization

- **Login — `POST /api/auth/session`** (anonymous): body `{ idToken }`. Verify the
  Google ID token **once** with `Google.Apis.Auth`
  (`GoogleJsonWebSignature.ValidateAsync`, audience = `GoogleAuthOptions.ClientId`,
  require `email_verified`). On success, create a session and set the cookie. Returns
  `{ email, name, canEdit }`. `canEdit` = email ∈ allow-list (case-insensitive).
  This is the **only** place a Google token is touched — there is no `JwtBearer` /
  per-request Google validation.
- **Session cookie:** a high-entropy random **opaque token** in an `HttpOnly`,
  `Secure`, `SameSite=Lax`, host-only (no `Domain`) cookie. `SameSite=Lax` blocks the
  cross-site `POST`/`PUT` CSRF vector while allowing normal navigation.
- **Per-request auth — a custom cookie-session `AuthenticationHandler`:** reads the
  cookie, looks up the session via `ISessionStore`, builds the `ClaimsPrincipal`
  (`email`, `name`, `canEdit`). **Sliding renewal:** past the half-life it extends
  the session's `expiresAt` and re-sets the cookie; **7-day** absolute lifetime.
- **`CanEdit` authorization policy:** requires an authenticated session **and** the
  `canEdit` claim.
- **`GET /api/auth/me`** (`[Authorize]`): returns `{ email, name, canEdit }`; `401`
  when not signed in. The frontend calls it on load to learn authoritative state.
- **`POST /api/auth/logout`:** deletes the session record (revocation) and clears the
  cookie.
- **Demonstrator — `PUT /api/people/{id}/biography`** (`[Authorize(Policy="CanEdit")]`):
  flows through a new MediatR `UpdatePersonBiographyCommand` → handler →
  `IPersonOverrideStore`, with a FluentValidation validator (person exists, text
  non-empty). Body carries the localized biography `{ ru, be, en }`. Returns the
  updated `PersonDto`.
- **`Program.cs` wiring:** add the custom authentication scheme +
  `AddAuthorization(CanEdit policy)`; `app.UseAuthentication(); app.UseAuthorization();`
  before `MapControllers()`. Existing rate-limiting, CORS, security headers, exception
  handler unchanged.

### 2. Storage — interfaces + two implementations each

Both stores are defined as interfaces and have an **in-memory** implementation (local
dev + unit tests) and a **Firestore** implementation (deployed). Selection is by
environment/config, so `dotnet run` locally needs no Firestore and no credentials.

- **`ISessionStore`** — `CreateAsync(claims) → token`, `GetAsync(token) → Session?`,
  `RenewAsync(token, newExpiry)`, `DeleteAsync(token)`. Firestore: a `sessions`
  collection, doc keyed by **`SHA-256(token)`** (a store leak exposes no usable
  token), holding `{ email, name, canEdit, createdAt, expiresAt, lastSeenAt }`.
- **`IPersonOverrideStore`** — `AppendBiographyAsync(personId, biography, editorEmail)`
  and `GetLatestAsync(personId) / GetAllLatestAsync()`. Firestore: a `personOverrides`
  collection, doc per person holding an **append-only list of versions**, each
  `{ biography, editorEmail, editedAt }`; reads take the latest.
- **Read path:** `InMemoryPersonRepository` consults `IPersonOverrideStore` and
  **layers the latest override over the JSON seed** in `GetByIdAsync` / `GetAllAsync`
  (returns the person with the overlaid `Biography` when an override exists). The seed
  list stays immutable.

### 3. Frontend — sign-in UI

- New **`authStore`** (Pinia): state `{ signedIn, email, name, canEdit }` (the Google
  ID token is used transiently at login only and not retained). Actions: `signIn`
  (handle the GIS credential → `POST /api/auth/session`), `signOut`
  (`POST /api/auth/logout`), `fetchMe` (`GET /api/auth/me` on load).
- **`AppBar`** gains a Google **Sign in / Sign out** control, shows the signed-in
  identity, and renders an **editor badge** when `canEdit`.
- **Cookie-based auth:** authenticated calls (`/auth/*`, the biography `PUT`) use
  `fetch(..., { credentials: 'include' })` so the session cookie is sent. Public GETs
  are unchanged. No `Authorization` header.
- **Resilient save (cheap insurance):** the edit buffer is **not cleared until a
  confirmed `200`**, so even an unexpected failure never loses typed work. With the
  7-day sliding session this should effectively never trigger.
- New i18n strings (ru / be / en) for sign-in, sign-out, identity, editor badge.

### 4. Config — `AppSettings` binding shape → mapped `IOptions<>` per consumer

Two layers, deliberately minimal.

1. **`AppSettings`** — a single config-binding root mirroring `appsettings.json`,
   living entirely in `FamilyTree.Api`. Framework sections (`Logging`, `AllowedHosts`)
   are **excluded** — they stay with the host. Bound once via
   `AddOptions<AppSettings>().Bind(config).ValidateDataAnnotations().ValidateOnStart()`
   (fail-fast). Nothing outside the composition root depends on it.

   ```
   AppSettings
   ├─ FamilyData     { FilePath }
   ├─ MediatR        { LicenseKey }
   ├─ RateLimiting   { PermitLimit, WindowSeconds }
   ├─ Firestore      { ProjectId, SessionsCollection, OverridesCollection }
   └─ Authentication { Google { ClientId, Editors[] },
                       Session { Lifetime, SlidingRenewal, CookieName } }
   ```

2. **Per-consumer `Options` classes** — created **only when a DI-resolved class needs
   the setting**. Settings consumed solely at the composition root are read straight
   off `AppSettings` — no `Options` class.

| AppSettings section | How it's consumed | Options class? |
|---|---|---|
| `FamilyData` | DI — `JsonFamilyDataLoader` | **Yes** — `IOptions<FamilyDataOptions>` *(existing; Infrastructure)* |
| `Authentication.Google` | DI — login handler (verify + allow-list) | **Yes** — `IOptions<GoogleAuthOptions>` *(new; Api)* |
| `Authentication.Session` | DI — cookie-session handler + session store | **Yes** — `IOptions<SessionOptions>` *(new; Api)* |
| `Firestore` | DI — `FirestoreSessionStore` / `FirestorePersonOverrideStore` | **Yes** — `IOptions<FirestoreOptions>` *(new; Infrastructure)* |
| `RateLimiting` | root only — rate-limiter setup | **No** — read `appSettings.RateLimiting.*` inline |
| `MediatR.LicenseKey` | root only — passed to `AddApplication` | **No** — read inline |

- **Mapping** at the composition root: `services.Configure<TOptions>(o => /* copy from
  appSettings.Section */)`. Layer extension methods receive their mapped section, so
  `AddInfrastructure` no longer takes raw `IConfiguration`.
- **`appsettings.json`:** keeps `Logging`/`AllowedHosts` as-is.
  `Authentication.Google.ClientId` + `Editors` are **empty placeholders** with a
  comment (mirrors the MediatR-key pattern); real values come from user-secrets
  locally and `Authentication__Google__ClientId` / `Authentication__Google__Editors__0…`
  env vars in deployment. **Nothing secret or personal is committed** (public repo).
- **No DB secret:** Firestore auth uses the existing **Workload Identity** service
  account on Cloud Run (Application Default Credentials) — there is no connection
  string or password to store.
- **Frontend:** Google client ID via `VITE_GOOGLE_CLIENT_ID` build env on Cloudflare
  Pages.
- **Proxy:** `functions/api/[[path]].ts` already forwards `Cookie` and passes
  `Set-Cookie` through verbatim (first-party to the Pages origin); update its stale
  "revisit Authorization when auth is added" note.

### 5. Local dev & testing

- **Local dev:** in-memory `ISessionStore` + `IPersonOverrideStore`. No Firestore, no
  Java, no credentials, no install. The Vite dev server already proxies `/api`
  same-origin, so the session cookie works locally (localhost is a secure context, so
  the `Secure` cookie is accepted).
- **Backend unit:** `CanEdit`/allow-list logic (in/out, case-insensitive, missing
  claim); login handler (valid/invalid/ unverified Google token → mocked validator);
  session store create/get/renew/delete + expiry; cookie-session auth handler;
  override store append + latest-wins + read-layering in the repository;
  `UpdatePersonBiographyCommand` handler + validator; `/auth/me` mapping; `AppSettings`
  binds from a sample config (incl. `Editors[]`) and each mapping copies the right
  values into its `Options`.
- **Integration:** `/auth/me`, logout, and the biography `PUT` exercised with a test
  authentication handler / seeded in-memory sessions — `401` anonymous, `403`
  non-editor, `200` editor; a follow-up `GET` reflects the edit; a second edit appends
  a new version; logout then `/auth/me` → `401`. No live Google or Firestore calls.
- **Frontend (Vitest):** `authStore` (`signIn`/`signOut`/`fetchMe`), `AppBar` states
  (signed-out / signed-in / editor badge), API client sends `credentials: 'include'`
  on authenticated calls, edit buffer retained on failed save.
- The **Firestore implementations** are covered against the Firestore emulator if
  available, but the suite does not require it (gated/optional).

### 6. Deploy & docs (same PR)

- **Owner infra prerequisite (documented in `docs/ci-cd/deploy.md`):** enable
  Firestore (native mode) in the GCP project and grant the Cloud Run service account
  Datastore/Firestore access. New env vars: `Authentication__Google__ClientId`,
  `Authentication__Google__Editors__*`, `Firestore__ProjectId`, and
  `VITE_GOOGLE_CLIENT_ID` (Pages build). No DB password.
- **`docs/reference/`:** document the auth model (public read, editor allow-list,
  Google sign-in → server session), the session cookie + 7-day sliding renewal +
  logout/revocation, the auth endpoints, and the durable versioned biography edit
  (JSON baseline + Firestore overrides).
- **Root `README.md` / `CLAUDE.md` overview:** note that auth + Firestore-backed
  edits now exist.
- Run the `update-docs-for-pr` skill at PR time.

## Out of scope

- Moving the *full* person/union graph out of `family.json` (the JSON baseline +
  Firestore overrides is the intended shape; no migration PR).
- Editing fields other than biography; a full editing UI beyond the demonstrator.
- Roles beyond the binary editor allow-list; OAuth scopes; refresh tokens.

## Risks / notes

- **Cookie auth across the proxy:** the cookie must stay first-party to the Pages
  origin (no `Domain`), and the proxy must forward `Cookie`/`Set-Cookie` (it already
  does). Verify in deployed smoke test.
- **CSRF:** mitigated by `SameSite=Lax` (blocks cross-site `POST`/`PUT`) + same
  origin; login additionally requires a valid Google ID token in the body.
- **Firestore reads per request:** one session lookup per authenticated request —
  negligible at family-tree scale, and only on authenticated calls (public GETs skip
  it).
- **Editor email list** is configuration kept out of the public repo via env. The
  **Google client ID** is public by nature (safe in the SPA).
- **Append-only overrides** grow unbounded in theory; at family-tree edit volume this
  is a non-issue, and history is a feature (audit / future undo).
