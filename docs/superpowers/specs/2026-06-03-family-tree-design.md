# Family Tree — Design Spec

- **Date:** 2026-06-03
- **Status:** Approved for planning
- **Branch:** `iteration-one-with-superpowers`

## 1. Purpose

A web application to **view and manage a family tree**, rendered as a large, natural oak. The tree is shown against a vertical year-scale (oldest at the bottom, ~XVIII century, up to the present and beyond). Members are nodes/branches; members with no or unknown children are leaves. Users can pan/zoom the tree and select a member to read a styled, glass-like popup of their details. Editing members is an explicit future goal that the architecture must accommodate.

## 2. Goals & non-goals

**Goals**
- A coherent, beautiful oak visual in a faded XIX-century natural palette.
- A time-based vertical layout (the year axis *is* the Y axis).
- Clean separation of storage (JSON now, DB later) behind interfaces.
- Mobile-first, adaptive UI for latest desktop Chrome, latest iPhone Safari, latest Android Chrome.
- Covered by unit and integration tests.

**Non-goals (now)**
- No database; JSON file only (behind repository interfaces so a DB can replace it with no changes above the repository layer).
- No edit/write UI in iteration one (architecture must keep it cheap to add).
- No authentication/multi-user concerns yet.

## 3. Tech stack

**Frontend** (`src/frontend`)
- Vite + Vue 3 (Composition API, `<script setup>`) + **TypeScript**.
- **Pinia** for state (modern successor to Vuex; state + actions, no mutation boilerplate).
- **Vue Router** for routing.
- **SCSS** (Dart Sass, `@use`/`@forward`) with design tokens for the palette, layered over CSS custom properties for theming.
- **SVG** rendered by Vue components; **d3-hierarchy** (MIT) used only for layout *math*, not rendering. Custom pan/zoom.
- **Vitest** + Vue Test Utils for unit tests.

**Backend** (`src/backend`)
- **.NET 10**, ASP.NET Core Web API.
- **Thin controllers** → **MediatR** handlers (thin, delegate to services) → **services** (domain logic) → **repository interfaces** → in-memory store hydrated from JSON.
- **FluentValidation** (free, Apache-2.0) via a MediatR pipeline behaviour for request validation.
- **Mapster** (MIT) for domain → DTO mapping.
- **System.Text.Json** into strongly-typed models.
- **xUnit + Moq + AwesomeAssertions** for unit tests (AwesomeAssertions is the free, MIT-licensed, drop-in fork of FluentAssertions, which moved to commercial licensing in v8; same `Should()` fluent API).

**Licensing note**
- MediatR and AutoMapper moved to paid licensing in their latest versions. MediatR now runs on **14.x under a Lucky Penny Software community license** (key supplied via the `MediatR:LicenseKey` config slot, never committed); we use **Mapster instead of AutoMapper**. FluentValidation remains free. _(Originally this project pinned MediatR to the last OSS version, 12.x; superseded once a community license was obtained.)_

## 4. Architecture

```
Browser (Vue 3 SPA)  ──HTTP/JSON──►  ASP.NET Core API (.NET 10)
  Vue components / SVG oak                Thin controllers
  Pinia stores                           → MediatR handlers (thin)
  d3-hierarchy (layout math)             → Services (domain logic)
  SCSS design tokens                     → Repository interfaces
                                         → In-memory store ◄── family.json (startup)
                                                                static assets (portraits/images)
```

- **Backend owns data + domain**; **frontend owns layout + presentation**.
- Layout (where each node sits) lives entirely in the frontend. This is what makes future "flip the tree" cheap — it is just a re-layout around a different focus person.
- Storage is hidden behind `IPersonRepository` / `IFamilyRepository`. Swapping JSON → a real DB later touches nothing above the repository layer.

### Backend layering (per handler-style preference)

`Controller` (thin, no logic) → `MediatR` request + handler (thin, orchestration only) → `Service` (domain logic, unit-tested with Moq) → `Repository` (storage abstraction) → in-memory store.

## 5. Data model

`family.json` holds two arrays: `people[]` and `unions[]`.

### Person

```jsonc
{
  "id": "p-0001",
  "givenName": "Maria",
  "surname": "Kowalska",
  "maidenName": "Nowak",            // null if not applicable
  "sex": "female",                  // for layout/labels
  "birth": { "year": 1842, "month": 5, "day": null, "approx": false, "place": "Kraków" },
  "death": { "year": 1910, "month": null, "day": null, "approx": true, "place": null }, // null if living
  "vocation": "teacher",            // teacher | church | writer | office | other — drives a subtle motif/icon
  "summary": "Village schoolteacher; loved folk tales.",   // NORMAL popup
  "biography": "Longer multi-paragraph text…",             // EXPANDED popup
  "portrait": "p-0001.jpg",         // file in assets folder, null if none
  "gallery": ["p-0001-a.jpg", "p-0001-b.jpg"],             // EXPANDED popup (deferred to a later iteration)
  "links": [
    { "type": "instagram", "url": "https://instagram.com/…" },
    { "type": "facebook",  "url": "https://facebook.com/…" }
  ],
  "residences": [
    { "place": "Vilnius", "fromYear": 1870, "toYear": 1885, "mapUrl": "https://maps.google.com/…" }
  ],
  "parents": { "motherId": "p-0003", "fatherId": "p-0004" }, // either may be null/unknown
  "marriedIntoFamily": true,        // true = joined from outside; a future "flip" candidate
  "isDefaultRoot": false            // exactly one Person is true — ADVISORY anchor; renderer derives the trunk spine around it (see §6)
}
```

### Union (marriage)

```jsonc
{
  "id": "u-0001",
  "partnerIds": ["p-0001", "p-0002"],
  "marriageYear": 1865,             // optional
  "childIds": ["p-0010", "p-0011"]
}
```

**Design choices**
- **Dates are partial/approximate-friendly** (year-only, `approx` flag, unknown) to support deep history.
- **Unions are separate objects** so a person can have multiple marriages and children attach to a couple.
- **Exactly one** Person has `isDefaultRoot: true` — it is an *advisory anchor*, not the literal trunk; the renderer derives the trunk spine from it (see §6).
- **`vocation`** is an enum that drives subtle visual motifs (teachers, church workers, writers, office workers, other).

## 6. Layout concept (the hourglass oak)

The **vertical axis is time**. A year-scale runs up the left edge: oldest at the bottom (~XVIII c.), present/future at the top. **A node's vertical position is its birth year**, mapped onto that axis. Unknown/approximate dates fall back to an estimate derived from generation depth and neighbouring known dates.

The tree is an **hourglass oak** relative to the focus person:
- **Bottom** — many ancestral lines begin as separate **roots** (every married-in spouse starts their own line).
- **Upward** — as lines marry together they **merge**, converging toward the present-day focus couple, which forms the thick central **trunk** (visually emphasized).
- **Top** — above the focus couple, their **children and grandchildren** fan back out as upper branches; the youngest generation sits at the very top.
- **Leaves** — appear wherever any line terminates (a person with no/unknown children): in the top canopy *or* partway up a side branch that died out.

Horizontal position is computed to prevent overlap while keeping the focus spine centred. The focus is the `isDefaultRoot` person by default and is a parameter to the layout (so re-rooting later is purely a re-layout).

### How `isDefaultRoot` drives the trunk

`isDefaultRoot` is **advisory**: it names a single **anchor person** (the present-day focus the oak opens on), *not* the entire trunk. A lone node would make a stunted trunk, so the renderer instead derives a **trunk spine** from the anchor:

- **Downward (configurable):** follow the anchor's **primary ancestral line** down a configurable number of generations (`ancestorTrunkDepth`, default **2** — parents and grandparents). Ancestors **beyond that depth do not extend the vertical trunk**; they render as the oak's **root system** spreading at the base (still placed low on the year-axis by birth year). This keeps the trunk a substantial but bounded central segment rather than a single thin line stretching back to the XVIII century. The primary line is chosen deterministically — the **deeper of the two parental lines**, ties broken toward the father's line; non-primary parents at each level attach as root-branches. (An explicit per-person override can be added later if the automatic choice is ever wrong.)
- **Upward (the canopy base):** extend through the anchor's **direct descendants — children and grandchildren by default** (`descendantTrunkDepth`, default **2**), forming the upper trunk and lower canopy.

Everything else — ancestors beyond `ancestorTrunkDepth`, other ancestral lines, siblings, cousins, more distant descendants — renders as **roots** at the base (older ancestry) or **side branches** fanning out above. So the trunk is always a bounded central segment (the anchor plus ~2 generations each way), with the deep history splaying into roots — never a single short segment, and never an endlessly tall thin line.

**Layout parameters** (defaults, all overridable): `focusPersonId` (defaults to the `isDefaultRoot` person), `primaryLineRule = "deepest, tie→father"`, `ancestorTrunkDepth = 2` (parents + grandparents; deeper ancestors become roots), `descendantTrunkDepth = 2` (children + grandchildren).

## 7. Visual design

- **Palette**: faded, slightly desaturated XIX-century natural tones — muted browns/bark (`#6b5844`, `#7a6450`), sage/olive greens (`#7d8a5f`, `#9ca57a`), parchment backgrounds (`#efe7d4`, `#f0e9d6`), faded ink (`#4a3f33`). Defined as SCSS tokens / CSS custom properties.
- **Rendering**: A+B hybrid — branch geometry is **generated** from the layout, then **drawn with organic, textured strokes, bark, and leaf clusters** so it reads as a real oak, not a diagram. Refined iteratively with screenshots.
- **Vocation motifs**: a subtle icon/motif per vocation (teacher, church, writer, office, other), shown at least in the popup; optionally a small mark on the node.
- **Glass popup**: thin border, translucent/glass background (`backdrop-filter` blur), water-like. Two layouts:
  - **Normal**: small portrait, birth–death, vocation, one or two key facts, an "expand" control.
  - **Expanded**: adds full biography, residences (each linking to Google Maps), and social links. *(Image gallery deferred.)*
  - **Responsive**: centred modal on desktop, bottom sheet on mobile.

## 8. API (iteration 1)

- `GET /api/people` → `PersonSummaryDto[]`
- `GET /api/people/{id}` → full `PersonDto` (expanded popup)
- `GET /api/family/graph` → `FamilyGraphDto` (people summaries + unions). The whole graph in one call (≤300 people is trivially small); the frontend computes the focused oak layout from it.

Thin controllers → MediatR queries (`GetAllPeople`, `GetPersonById`, `GetFamilyGraph`) → services → repositories. FluentValidation validates inputs; Mapster maps domain → DTOs. OpenAPI/Swagger exposed in development.

## 9. Frontend behaviour (iteration 1)

- **Routes**: `/` (oak; default focus = `isDefaultRoot` person), `/person/:id` (deep-link that opens that person's popup over the oak).
- **State** (Pinia): family graph cache, current focus person, selected person, popup mode (normal/expanded), zoom/pan viewport.
- **Pan/zoom**: drag + wheel on desktop; one-finger pan + pinch-zoom on touch.
- **Select member → glass popup** (normal + expanded as in §7).
- **Mobile-first**: layout and year axis adapt to phone widths; on small screens the oak opens zoomed toward the focus cluster.

## 10. Testing strategy

- `tests/unit`:
  - Backend handlers/services/repositories — xUnit + Moq + AwesomeAssertions; naming `<Method>_When<Conditions>_Should<ExpectedResult>`.
  - Frontend layout utilities (time→Y mapping, branch generation, overlap resolution) and Pinia stores — Vitest.
- `tests/integration`:
  - API endpoint tests via `WebApplicationFactory` against the JSON-backed in-memory store.

## 11. Repository structure

```
.\src\backend          ASP.NET Core API + domain + storage
.\src\frontend         Vue 3 SPA
.\tests\unit           backend + frontend unit tests
.\tests\integration    API integration tests
.\docs                 specs, architecture overview, data-format doc
```

## 12. Iteration roadmap

**Iteration 1 (this branch)** — Foundation + interactive oak
- Backend: solution, models, JSON store + repositories, MediatR queries, services, FluentValidation pipeline, Mapster, the three GET endpoints, unit + integration tests.
- Frontend: Vue/Vite/TS/Pinia/Router scaffold, family-graph fetch, hourglass time-axis layout, painterly SVG oak + year-scale axis, pan/zoom, select member → glass popup (normal + expanded with residences/map links and social links), mobile-first responsive.
- **Excluded from iteration 1**: image gallery, zoom-to-cluster, flip, edit mode.

**Later iterations (future)**

_Product / UX_
- **Multiple real families** — replace the sample data with real family trees and add a **family selector** to switch between different families.
- **Edit mode** — add/edit family members (write path through the repository interfaces).
- **Portraits & image gallery** — real portrait image assets (seed data currently has none, so cards show initials) plus a gallery in the expanded popup. The medallion `<image>` path is already wired to `/assets/portraits/<file>`.
- **Background oak artwork** — a real tree illustration/photo behind the SVG, with the generated branch skeleton aligned to (accommodating) the artwork.
- **Flip the tree** — when a married-in spouse is selected, re-render the oak centred on *their* bloodline (their ancestors become the roots/trunk), with a "switch back" control. Cheap because layout is frontend-side and focus is already a layout parameter.
- **Zoom-to-cluster** — focus a family cluster (parents + children) rendered as a sub-tree from a trunk/branch/leaf segment.
- **Search person by name** on the tree (jump-to / highlight).
- **Directory / table view** — all persons in a filterable table: by name, by century, by direct ancestors of a selected person, by date, by place of birth/residence (country, city), and other facets as useful.

_Platform / CI-CD_
- **PR quality gates** — ✅ **Done** (PR #15). On every PR into `main`/`release-*`, GitHub Actions runs build + unit/integration tests + dependency vuln-audit (`ci.yml`), CodeQL SAST (`codeql.yml`), with Dependabot for updates and an on-demand `@claude` responder (`claude.yml`) — all wired as required status checks via a branch-protection ruleset. See [`docs/ci-cd/pr-quality-gates.md`](../../ci-cd/pr-quality-gates.md) and the design spec [`2026-06-04-pr-quality-gates-design.md`](2026-06-04-pr-quality-gates-design.md).
- **Continuous delivery to a dev host** — auto-deploy when `main` is updated.
- **Release delivery to a public web host** — _implemented (pending owner infra)._ Free hybrid: Cloudflare Pages SPA reverse-proxies `/api` to an Azure Container Apps .NET API, deployed on a `release-X.Y.Z` tag; versioned via a root `VERSION` file. Design [`2026-06-06-public-deploy-design.md`](2026-06-06-public-deploy-design.md); plan [`../plans/2026-06-06-public-deploy.md`](../plans/2026-06-06-public-deploy.md); runbook [`../../ci-cd/deploy.md`](../../ci-cd/deploy.md).

_Engineering follow-ups_
- **Collision-aware tidy layout** — replace the pragmatic per-generation `separateOverlaps` nudge with a proper contour-based layout so large cards never overlap by construction.

## 13. Decisions log

- Genealogy is a shared graph (people + unions); the renderer projects an oak for a chosen focus person.
- Multiple roots merge into a focus-oriented trunk; vertical position = birth year.
- `isDefaultRoot` is an advisory anchor; the renderer derives a bounded trunk spine around it (default ±2 generations: parents+grandparents down, children+grandchildren up). Ancestors deeper than `ancestorTrunkDepth` become the oak's roots, not trunk. All depths configurable.
- Backend assertions use AwesomeAssertions (free FluentAssertions fork) to stay license-free.
- Rendering tech: SVG (DOM nodes) with viewport culling, sized for ~80–300 people.
- Visual: A+B hybrid (generated geometry, painterly rendering).
- Libraries: MediatR 12.x (free) + Mapster + FluentValidation; Vue 3 + Pinia + Vite + TS + SCSS + d3-hierarchy.
- Layout lives in the frontend to keep flip/cluster cheap.
```
