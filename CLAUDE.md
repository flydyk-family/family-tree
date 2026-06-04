# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is in a pre-implementation state. As of the initial commit it contains only `README.md` and `.gitignore` — there is no source code, build configuration, package manifest, or tests yet.

Stated purpose (from `README.md`): "View and manage a family tree nicely shown on Web UI."

The `.gitignore` is the standard GitHub Dotnet template, signaling the intended stack is **.NET** with a web frontend. The conventions below assume a .NET project — apply them when adding C# / proto / test code. Once a project is scaffolded, replace the "Repository status" section with actual build/test/run commands and an architecture overview.

---

## Git & delivery workflow

- **`main` is the trunk.** Branch every feature/fix **off `main`** (or off whatever branch you are basing on — e.g. a release branch) and open a PR back **into that base**. `main` is the default base (`gh pr create --base main`).
- **Squash-merge** every PR (`gh pr merge <n> --squash`) and **delete the branch** afterward, so the base keeps a clean one-commit-per-PR history.
- **Releases:** when `main` has accumulated enough change (the owner's call), cut a release branch named **`release-X.Y.Z`** (e.g. `release-1.0.0`) from `main`.
- The former long-lived `integration` branch is **retired** — it was promoted into `main` and is no longer used; do not target it.
- Larger work follows the superpowers flow: spec in `docs/superpowers/specs/`, then a step-by-step plan in `docs/superpowers/plans/`.

---

## C# / .NET conventions

Apply when modifying or creating `*.cs` files.

### Namespaces
- Use **file-scoped namespaces** (`namespace FamilyTree.WebApp.Pages;`), not block form.
- Match the namespace to the assembly and folder path.

### Naming
- Types and public members: **PascalCase**. Private fields: **`_camelCase`** (e.g. `_mediator`, `_logger`).
- Interfaces: **`I`** prefix.
- Async methods: **`Async`** suffix.

### Dependencies and constructors
- Prefer **constructor injection**; store dependencies in **`readonly`** private fields.
- Order constructor parameters consistently (services first, then `ILogger` if present).

### Async and cancellation
- Async methods return `Task` / `Task<T>`. Pass **`CancellationToken`** through as the last parameter.

### Nullability
- Use nullable reference types (`string?`, `Foo?`). Prefer `is null` / `is not null`. Avoid the null-forgiving `!` operator unless necessary.

### Error handling
- Do not swallow exceptions. Log with `ILogger` (structured data) and rethrow, or return a result.

```csharp
// BAD
catch (Exception) { }

// GOOD
catch (Exception ex) { _logger.LogError(ex, "Operation failed"); throw; }
```

### Formatting and style
- Use `var` when the type is obvious. K&R braces.
- Add `using` directives rather than writing fully-qualified type names.
- **Always brace control statements**, even single-line bodies:

```csharp
// BAD
if (foo)
    return bar;

// GOOD
if (foo)
{
    return bar;
}
```

### Stack patterns
- Expected stack: **MediatR** (request/handler), **ASP.NET Core** (Razor Pages / controllers / `IOptions<T>`), nullable-enabled projects.

### HTTP clients
- Do **not** register named `HttpClient`s. Use a strongly-typed wrapper class:

```csharp
// BAD
builder.Services.AddHttpClient("some-api", c => c.BaseAddress = new Uri("..."));

// GOOD
builder.Services.AddHttpClient<ISomeApiClient, SomeApiClient>(c => c.BaseAddress = new Uri("..."));
```

### JSON serialization
- Use `System.Text.Json`.
- Deserialize into **strongly-typed classes**; avoid `JsonDocument` / `JsonNode` for normal data shapes.

---

## Proto / gRPC naming

Apply when adding or editing `*.proto` files.

### `package`
- Lowercase, dot-separated, aligned to the owning .NET project (e.g. project `FamilyTree.Grpc` → package starts with `familytree.grpc`).
- Do **not** include the word `generated`.

### `option csharp_namespace`
- Derive from the package name by PascalCasing each segment (`familytree.grpc.persons` → `FamilyTree.Grpc.Persons`), or build from the .NET project root namespace + the relative path under `Protos/`.
- Start with the owning project's root namespace so generated types live under the same logical root.
- Do **not** include `Generated`, `Proto`, or `Contract` as a separate root unless it is part of the project name.
- Keep one scheme per project (package-based **or** folder-based), consistently.

### Folder layout
- Place `.proto` files under `Protos/` in folders mirroring the package / namespace hierarchy.

Example:

```protobuf
package familytree.grpc.persons;
option csharp_namespace = "FamilyTree.Grpc.Persons";
```

---

## Unit test naming

Apply to `tests/**/*.cs` and `**/*Tests*.cs`.

Pattern: **`<MethodName>_When<Conditions>_Should<ExpectedResult>`**

- **MethodName** — the operation under test.
- **When…** — preconditions / inputs / scenario.
- **Should…** — expected outcome.

Example: `FindByFilter_WhenTagsProvided_ShouldReturnFilesWithTags`

- PascalCase each segment; no spaces.
- Soft limit 80 chars, hard limit 100.
- Prefer specific phrases (`WhenPageInfoSet_ShouldMapHasNextPage`) over generic ones (`WhenDataExists_ShouldSucceed`).
