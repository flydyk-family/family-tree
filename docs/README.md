# Family Tree — Developer Guide

A web application to view (and, in a future iteration, manage) a family tree drawn as a stylised
tree. This document covers how to run, test, and reason about the codebase as of **iteration 1**
(a deliberately plain end-to-end "walking skeleton").

## What iteration 1 delivers

- A .NET 10 API that loads a family dataset from JSON into memory and exposes it behind interfaces.
- A Vue 3 single-page app that renders the family as an SVG tree: a left-hand year axis, members
  laid out by generation (oldest at the bottom, youngest at the top), whole-tree pan/zoom, and a
  member popup with a **normal** and an **expanded** layout.
- Unit and integration tests on the backend, unit tests on the frontend.

Deliberately **not** in iteration 1 (see the roadmap at the bottom): the artistic oak styling,
zoom-into-a-family-cluster, and edit mode.

## Prerequisites

- [.NET SDK 10](https://dotnet.microsoft.com/) (`dotnet --version` → 10.x)
- [Node.js 18+](https://nodejs.org/) and npm

## Running the app (development)

Run the two processes in separate terminals.

**1. Backend API**

```bash
dotnet run --project src/backend/Api
```

The API listens on `http://localhost:5049`. In Development it also serves an OpenAPI document at
`/openapi/v1.json` and a health check at `/health`.

**2. Frontend**

```bash
cd src/frontend
npm install   # first time only
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend, so no CORS
configuration is needed during development.

### Try it

- The tree renders the sample "Bauer" family: generation 0 (~1740) at the bottom, the youngest at
  the top, with the year axis on the left.
- Childless members (leaves) carry a small green leaf marker.
- Drag to pan; use the mouse wheel (or pinch on touch devices) to zoom.
- Click a member to open the popup; the URL becomes `/member/{id}` (deep-linkable). Press **More**
  to expand the biography and social links. Press **Esc** or click the backdrop to close.

## Testing

**Backend** (unit + integration):

```bash
dotnet test src/backend/FamilyTree.slnx
```

**Frontend** (unit):

```bash
cd src/frontend
npm run test            # one-off run
npm run test:coverage   # with coverage
npm run type-check      # vue-tsc type checking
```

## Architecture

### Backend (`src/backend`)

A pragmatic clean architecture split. The repository interface lives in the application layer and
its JSON implementation in infrastructure, so the in-memory store can be replaced by a database
later **without changing any handler**.

| Project | Responsibility |
| --- | --- |
| `FamilyTree.Domain` | Entities only (`Person`, `PartialDate`, `Sex`, `SocialLink`). No dependencies. |
| `FamilyTree.Application` | MediatR queries/handlers, DTOs, FluentValidation validators, services (`GenerationCalculator`, `TreeProjectionService`), Mapperly mapping, `IFamilyRepository`. |
| `FamilyTree.Infrastructure` | JSON data store + `JsonFamilyRepository` + the sample `Data/family-data.json`. |
| `FamilyTree.Api` | Minimal API endpoints, DI wiring, dev CORS, global exception handler. |

Handlers stay thin and delegate non-trivial logic to dedicated, independently-testable services.

**Endpoints**

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/family-tree` | The whole tree: nodes, edges, generation range. |
| GET | `/api/members/{id:guid}` | Member detail, or `404`. |
| GET | `/health` | Liveness. |

**Generation level** is derived (not stored): a member with no known parents in the dataset is
generation 0; otherwise it is one more than its deepest parent. Cycles are rejected; missing parent
references are treated as roots.

### Frontend (`src/frontend`)

Vue 3 + TypeScript + Vite + Pinia + Vue Router, styled with SCSS.

- **D3 is used for layout maths only** (`d3-scale`); Vue retains sole ownership of the SVG DOM.
- `src/layout/treeLayout.ts` is a pure function turning nodes + edges into positioned nodes/edges —
  the most heavily unit-tested unit.
- `src/composables/usePanZoom.ts` drives whole-tree pan/zoom through the SVG `viewBox` via Pointer
  Events (works on desktop Chrome, iOS Safari, Android Chrome).
- `src/stores/familyTree.ts` (Pinia) holds the tree data and the selected member.
- Components: `TreeCanvas`, `YearAxis`, `MemberNode`, `TreeEdge`, `MemberPopup`.

## Data

The dataset is `src/backend/Infrastructure/Data/family-data.json` (`schemaVersion` + `people`).
Relationships are stored as IDs (`fatherId`, `motherId`, `spouseIds`) so the shape maps cleanly onto
a future relational schema.

## Free / open-source library choices

Several common .NET libraries moved to commercial licensing; iteration 1 pins genuinely free ones
centrally in `Directory.Packages.props`:

- **MediatR `12.4.1`** — last Apache-2.0 release (do not bump to 13+).
- **Riok.Mapperly** — Apache-2.0 source generator, replacing AutoMapper.
- **FluentValidation** — still Apache-2.0.
- **AwesomeAssertions** — Apache-2.0 fork of FluentAssertions v7 (test assertions).
- **Moq** — mocking in unit tests.

## Roadmap (future iterations)

1. *(done)* Walking skeleton.
2. Artistic oak styling + glass popups (faded XIX-century palette, decorative trunk/branches).
3. Zoom into a family cluster (parents + self + children) as a focused subtree.
4. Edit mode + JSON write-back — the natural point to swap the JSON store for a database behind
   `IFamilyRepository`.
5. Accessibility, performance, and expanded documentation.
