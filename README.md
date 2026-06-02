# family-tree

View and manage a family tree nicely shown on a Web UI.

The family is drawn as a stylised tree: a year scale runs up the left side (oldest at the bottom,
~XVIII century; the present at the top), members are nodes, and childless members are leaves. You
can pan and zoom the tree and select a member to see their details in a styled popup.

## Tech stack

- **Backend:** .NET 10 minimal API. Data is loaded from a JSON file into memory behind interfaces,
  ready to be swapped for a database with no handler changes. MediatR + FluentValidation + Mapperly.
- **Frontend:** Vue 3 + TypeScript + Vite + Pinia + Vue Router, SCSS, SVG rendering with D3 for
  layout maths. Mobile-first and adaptive.

## Quick start

```bash
# Terminal 1 — API (http://localhost:5049)
dotnet run --project src/backend/Api

# Terminal 2 — web app (http://localhost:5173)
cd src/frontend && npm install && npm run dev
```

Then open http://localhost:5173.

## Repository layout

```
src/backend     .NET solution (Domain / Application / Infrastructure / Api)
src/frontend    Vue 3 single-page app
tests/unit      Backend unit tests
tests/integration  Backend API integration tests
docs            Developer guide
```

See [docs/README.md](docs/README.md) for the full developer guide: how to run, test, the
architecture, the data shape, and the iteration roadmap.
