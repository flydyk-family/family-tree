# Testing

← back to [reference index](README.md)

Automated coverage inventory, how to run it, and **gaps** QA should cover manually.

## How to run

**Backend** (from repo root — `.slnx` auto-discovered):
```bash
dotnet test                                   # all unit + integration
dotnet test --collect "XPlat Code Coverage"   # with coverage
```
Requires a **MediatR license key** (`MediatR:LicenseKey` via env var or user secrets) — the DI-bootstrapping tests instantiate the full container. Target framework `net10.0`.

**Frontend** (from [`src/frontend`](../../src/frontend), Node ≥ 20.19):
```bash
npm test               # vitest run
npm run test:coverage  # vitest run --coverage
npm run test:watch
```

**Media-script libs:** `node --test scripts/lib/*.test.mjs` (Node built-in runner; no install needed; test files live in [`scripts/lib/`](../../scripts/lib/)).

## Coverage configuration
- **Frontend ([`vite.config.ts`](../../src/frontend/vite.config.ts)):** provider `v8`; reporters `text-summary` + `lcov`; output `src/frontend/coverage/`; includes `src/**/*.{ts,vue}`; excludes specs, `main.ts`, `*.d.ts`. Pool forced to `threads`. **No thresholds.**
- **Backend:** `coverlet.collector` available; coverage opt-in via `--collect`. **No thresholds.**
- **CI** uploads both to Codecov (flags `backend` / `frontend`), `fail_ci_if_error: false`.

## Inventory (≈ 120 files, ≈ 880 cases)

### Backend unit tests ([`tests/unit/FamilyTree.UnitTests`](../../tests/unit/FamilyTree.UnitTests), 93 cases)
Naming convention: `Method_WhenCondition_ShouldOutcome`.
- **Handlers** — all three MediatR handlers map correctly (enum lowercasing, year flattening, graph mapping); missing person → null. `UpdatePersonBiographyHandler`: found → stores override + returns updated PersonDto; not found → null.
- **Validators / pipeline** — `GetPersonByIdQueryValidator` accepts `p-0001`, rejects `""`/`invalid`/`x-0001`; `ValidationBehavior` throws on invalid and calls next on valid. `UpdatePersonBiographyValidator` validates id format **and the 20,000-char-per-locale length cap** (at-limit passes, over-limit fails — primary and secondary locales).
- **Mapster config** — `Person→PersonSummaryDto`/`PersonDto`, optional localized fields → null, portrait/video propagate, `FamilyGraph→Dto`.
- **`FamilyQueryService`** — `GetGraphAsync` merges people+unions; `GetPersonAsync` delegates to the repo.
- **DI registration** — `AddApplication` wires MediatR + Mapster; dispatch works.
- **Domain** — `LocalizedText.Resolve` fallback order (ru→en→be, unknown locale); `Person` collection/enum defaults.
- **Infrastructure** — in-memory repos (get all / by id / missing → null); JSON loader parses all fields + lowercase enums. `InMemorySessionStoreTests`: create/get/delete/expire/rotate (token rotation issues a new token, invalidates the old); **expired sessions are evicted lazily on read and in bulk via `EvictExpired`**. `InMemoryPersonOverrideStoreTests`: no-override returns null; latest after single and double write; bulk latest across people. `FamilySnapshotProviderTests`: snapshot served from cache within TTL; rebuilt after TTL; immediate rebuild on `RefreshAsync`; override merged onto seed; startup warms snapshot; **consecutive refresh failures are counted and flip the source to `Degraded` after 3, resetting on the next success**. `InfrastructureSelectionTests`: blank `ProjectId` → in-memory stores registered; non-blank → Firestore stores registered. **`FirestoreSessionStore`, `FirestorePersonOverrideStore`, `GcsFamilyDataLoader`, the `ExpiredSessionSweeper`, and `OperationDeadline` carry `[ExcludeFromCodeCoverage]`** — thin SDK/timing glue, emulator/real-service-verified only, not in CI.
- **Auth** — `SessionManagerTests` (5 cases): editor email sets `canEdit=true`; non-editor sets `canEdit=false`; case-insensitive email match; invalid token returns null without creating session; sign-out deletes session.
- **Health** — `FamilyDataHealthCheckTests`: reports `Healthy` normally and `Degraded` when the family-data source is degraded.
- **Security** — `OriginVerifierTests` (9 cases): dormant when no/blank secrets are configured; `IsTrusted` accepts a configured secret and any of a configured set, and a configured secret with surrounding whitespace still matches a clean header (trimmed); rejects a wrong value, an empty string, and `null` (constant-time comparison).

### Backend integration tests ([`tests/integration/FamilyTree.IntegrationTests`](../../tests/integration/FamilyTree.IntegrationTests), 36 cases)
`WebApplicationFactory<Program>` over a **2-person fixture** ([`Fixtures/family.test.json`](../../tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json)). Auth tests use `AuthApiFactory` which substitutes a `FakeGoogleIdTokenValidator` and an in-memory editor allow-list.
- **Graph:** `/api/family/graph` returns 2 people + union with `partnerIds`; portrait/video filenames in summary.
- **People:** `/api/people` count + exactly one default-root; `/api/people/p-0001` 200 with trilingual surname; portrait/video in detail; **`p-9999` → 404**; **`not-an-id` → 400**.
- **Hardening:** `/health` 200 with status/version/commit; security headers exact values; rate-limit returns **429** after the configured limit (on `/api/*` **and** on `/health`); an oversized request body returns **413** (still carrying the security headers); an oversized-body flood on a rate-limited endpoint is **throttled (429)** — the 413 guard runs after the limiter, so it consumes permits rather than bypassing them.
- **Editor allow-list re-evaluation** (`AllowListReevaluationTests`, 2 cases): a session with a stored `canEdit=true` but an email no longer in the allow-list → **403**; a session stored with `canEdit=false` but an email now in the allow-list → **200** (the gate is re-derived per request, not read from the stored flag).
- **Auth endpoints** (`AuthEndpointsTests`, 5 cases): sign-in with editor token → 200 + `ft_session` cookie + `canEdit: true`; invalid token → 401; `GET /api/auth/me` without cookie → 401; after sign-in → 200 with identity; logout → 204, subsequent `/me` → 401.
- **Biography edit endpoints** (`BiographyEditEndpointsTests`, 5 cases): no cookie → 401; non-editor session → 403; editor session → 200, follow-up GET reflects the new biography; second edit replaces first; unknown person id → 404.
- **Forwarded-headers rate limit** (`ForwardedHeadersRateLimitTests`, 2 cases): `X-Forwarded-For` from a different IP is a distinct rate-limit partition (different IPs allowed, same IP hits 429); no `X-Forwarded-For` header → endpoint still responds 200 (middleware is a no-op without the header).
- **Origin verification gate** (`OriginVerificationTests`, 5 cases): with a secret configured, a request **without** the `X-Origin-Verify` header → **403** (still carrying the security headers), a **wrong** header → **403**, the **valid** header → **200**, and `/health` is reachable **without** the header; with the gate **unconfigured** (default) an un-headered `/api/family/graph` is **200** (dormant).

### Frontend tests (88 spec files, 748 cases)
- **Layout/math:** `treeLayout` (roles, generations, links, siblings, error on bad focus), `projection` (transpose), `focusBounds`, `timeScale` (tick density, no-overlap sweep), `layoutFlip` + `useLayoutMorph` (vertical↔horizontal glide interpolation).
- **Text / scroll math:** `paginateText` (greedy fit, ≥1-token advance, empty input), `scrollThumb` (thumb metrics + scrollTop-from-thumb mapping).
- **Format:** `lifespan` / year span (en-dash, `~`, open-ended).
- **i18n:** `localize` fallback, `localeDetection`, catalog parity (en/ru/be).
- **Stores:** `familyStore`, `selectionStore`, `panelStore` (21 cases: single-expanded invariant, chips/rectangles, bigger-view, undock), `localeStore`, `uiStore`.
- **API client:** `familyApi`, `apiProxy` (URL building, empty-origin error, **upstream header filtering** — strips hop-by-hop/`Host`/`X-Forwarded-*`/`Forwarded`, preserves `Cookie`/`Authorization`; **origin-verify injection** — `applyOriginVerification` sets `X-Origin-Verify` when the secret is configured, overwrites a client-supplied value, no-ops when unset or whitespace-only, trims surrounding whitespace, and the strip list removes a client-supplied one).
- **Composables:** `useSearchMatches` (substring, name order, no maiden match, cursor wrap), `useFamilyStats`, `useMediaQuery`.
- **Media:** `mediaUrl` encoding; `mediaServing` (`resolveMediaKey` traversal rejection, `parseRange` 206 cases).
- **Router:** `firstVisit` (redirect, mark-explored, deep-link bypass, storage failure).
- **Motion:** `camera`/`glideTo`, `tokens`, `reducedMotion`, `fade`.
- **Interactions:** `panZoom` math (clamp/zoomAt/pinch/fit/centerOn), `usePanZoom` (drag threshold, pointer capture, touch, reduced-motion snap, glide cancel).
- **Components:** `AppVersion`, `AppBar` (desktop/mobile), `AppFrame`, `LanguagePicker`, `OrientationToggle`, `TabNav` (disabled tabs), `TimeRail`, `VocationIcon`, `DockPanel`, `PanelRail` (desktop+mobile), `StatsPanel`, `SearchField`, `PersonDetail` (loading/error/detail dispatch to header + dossier), `PersonHeader` (media fallback chain, lightbox), `PersonDossier` (summary/bio/residences/links), `ChroniclePager` (pagination + page controls + **biography renders as escaped text, never HTML — XSS guard**), `ChronicleScroll` (gutter always shown, thumb on overflow, drag), `PersonPopup` (dock vs close), `MediaLightbox`, `OakTree` (11: nodes/branches, select, highlight, center request), `PersonMedallion` (14: portrait/initials, overlay states), `medallion/{nameFit,geometry,frameAssets}`.
- **Views:** `TreeView` (13: deep link, popup desktop-only, search re-root/debounce), `ChronicleView`.

## Gaps — likely manual-QA candidates
These behaviors appear **not** covered automatically:

**Backend:** CORS preflight; OpenAPI endpoint; startup with missing/malformed data file; rate-limit window/queue (only permit count tested); populated `childIds` round-trip. Auth: sliding-renewal token rotation in a live integration test (handler unit path is tested; the full HTTP round-trip is not); real Google `InvalidJwtException` path (only the `FakeGoogleIdTokenValidator` path is covered); `Authentication__Google__*` env-var binding. **Firestore stores:** `FirestoreSessionStore` and `FirestorePersonOverrideStore` are emulator-tested only — not part of CI; covered by `[ExcludeFromCodeCoverage]`.

**Frontend / UI:**
- **Broken portrait URL in a tree node** (no initials fallback there — see [person-details.md](features/person-details.md#media--living-portraits)).
- **Muted-video autoplay** suppression on iOS Safari / Firefox.
- Populated **`gallery[]`** in the detail/lightbox.
- **Residence date ranges** and **map-link hrefs**, **maiden-name** display.
- **ChronicleView in ru/be** (tests only use `en`).
- Tree node **Tab order / Space** activation (only Enter tested).
- `usePanZoom` **ResizeObserver** auto-refit.
- **TreeView error state** when the graph fetch fails.
- Real **breakpoint boundary** behavior (tests stub `matchMedia` to fixed values); **tablet portrait** (768–1199 px).
- Cloudflare **Pages-Function** runtime (proxy header forwarding, R2 206 responses) beyond the pure helper unit tests.
