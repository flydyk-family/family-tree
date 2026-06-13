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

## Inventory (≈ 60 files, ≈ 320 cases)

### Backend unit tests ([`tests/unit/FamilyTree.UnitTests`](../../tests/unit/FamilyTree.UnitTests), ~36 cases)
Naming convention: `Method_WhenCondition_ShouldOutcome`.
- **Handlers** — all three MediatR handlers map correctly (enum lowercasing, year flattening, graph mapping); missing person → null.
- **Validators / pipeline** — `GetPersonByIdQueryValidator` accepts `p-0001`, rejects `""`/`invalid`/`x-0001`; `ValidationBehavior` throws on invalid and calls next on valid.
- **Mapster config** — `Person→PersonSummaryDto`/`PersonDto`, optional localized fields → null, portrait/video propagate, `FamilyGraph→Dto`.
- **`FamilyQueryService`** — `GetGraphAsync` merges people+unions; `GetPersonAsync` delegates to the repo.
- **DI registration** — `AddApplication` wires MediatR + Mapster; dispatch works.
- **Domain** — `LocalizedText.Resolve` fallback order (ru→en→be, unknown locale); `Person` collection/enum defaults.
- **Infrastructure** — in-memory repos (get all / by id / missing → null); JSON loader parses all fields + lowercase enums.

### Backend integration tests ([`tests/integration/FamilyTree.IntegrationTests`](../../tests/integration/FamilyTree.IntegrationTests), 10 cases)
`WebApplicationFactory<Program>` over a **2-person fixture** ([`Fixtures/family.test.json`](../../tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json)).
- **Graph:** `/api/family/graph` returns 2 people + union with `partnerIds`; portrait/video filenames in summary.
- **People:** `/api/people` count + exactly one default-root; `/api/people/p-0001` 200 with trilingual surname; portrait/video in detail; **`p-9999` → 404**; **`not-an-id` → 400**.
- **Hardening:** `/health` 200 with status/version/commit; security headers exact values; rate-limit returns **429** after the configured limit.

### Frontend tests (49 spec files, ~275 cases)
- **Layout/math:** `treeLayout` (roles, generations, links, siblings, error on bad focus), `projection` (transpose), `focusBounds`, `timeScale` (tick density, no-overlap sweep).
- **Format:** `lifespan` / year span (en-dash, `~`, open-ended).
- **i18n:** `localize` fallback, `localeDetection`, catalog parity (en/ru/be).
- **Stores:** `familyStore`, `selectionStore`, `panelStore` (21 cases: single-expanded invariant, chips/rectangles, bigger-view, undock), `localeStore`, `uiStore`.
- **API client:** `familyApi`, `apiProxy` (URL building, empty-origin error).
- **Composables:** `useSearchMatches` (substring, name order, no maiden match, cursor wrap), `useFamilyStats`, `useMediaQuery`.
- **Media:** `mediaUrl` encoding; `mediaServing` (`resolveMediaKey` traversal rejection, `parseRange` 206 cases).
- **Router:** `firstVisit` (redirect, mark-explored, deep-link bypass, storage failure).
- **Motion:** `camera`/`glideTo`, `tokens`, `reducedMotion`, `fade`.
- **Interactions:** `panZoom` math (clamp/zoomAt/pinch/fit/centerOn), `usePanZoom` (drag threshold, pointer capture, touch, reduced-motion snap, glide cancel).
- **Components:** `AppVersion`, `AppBar` (desktop/mobile), `AppFrame`, `LanguagePicker`, `OrientationToggle`, `TabNav` (disabled tabs), `TimeRail`, `VocationIcon`, `DockPanel`, `PanelRail` (desktop+mobile), `StatsPanel`, `SearchField`, `PersonDetail` (18: media fallback chain, lightbox, expand/collapse), `PersonPopup` (dock vs close), `MediaLightbox`, `OakTree` (11: nodes/branches, select, highlight, center request), `PersonMedallion` (14: portrait/initials, overlay states), `medallion/{nameFit,geometry,frameAssets}`.
- **Views:** `TreeView` (13: deep link, popup desktop-only, search re-root/debounce), `ChronicleView`.

## Gaps — likely manual-QA candidates
These behaviors appear **not** covered automatically:

**Backend:** CORS preflight; OpenAPI endpoint; startup with missing/malformed data file; rate-limit window/queue (only permit count tested); populated `childIds` round-trip.

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
