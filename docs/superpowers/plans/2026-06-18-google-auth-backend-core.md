# Google Auth Backend Core Implementation Plan (PR-a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is independently green and commits separately — never start a task before the previous one is committed and the suite is green.

**Goal:** Deliver the backend auth core for editor-gated family-tree edits, fully in-memory and testable with **no Firestore and no Google network**: Google ID-token sign-in (behind a fake-able validator) → a revocable, opaque-token server session in an `HttpOnly` cookie → an editor allow-list → an append-only, in-memory biography override layered over the JSON seed, exposed through an editor-gated `PUT /api/people/{id}/biography`. Firestore implementations, the read-snapshot TTL cache, and the frontend are **separate later PRs**.

**Architecture:** This is **PR 2, phases 1–2** of the design spec (`docs/superpowers/specs/2026-06-17-google-auth-editor-gate-design.md`), built on the already-merged PR 1 `AppSettings` refactor. The flow:

1. `POST /api/auth/session` (anonymous) takes `{ idToken }`, validates it via `IGoogleIdTokenValidator` (real impl uses `Google.Apis.Auth`; tests swap a fake), computes `canEdit` from the configured editor allow-list (case-insensitive), creates a `Session` in `ISessionStore`, and sets an opaque-token cookie. Returns `{ email, name, canEdit }`.
2. A custom `SessionAuthenticationHandler` reads the cookie on each request, looks up the session, builds a `ClaimsPrincipal` (`email`, `name`, `canEdit`), and applies **7-day sliding renewal** past the session half-life.
3. A `CanEdit` authorization policy gates the demonstrator edit `PUT /api/people/{id}/biography`, which flows through a MediatR `UpdatePersonBiographyCommand` → `IPersonOverrideStore` (append-only), and the `InMemoryPersonRepository` overlays the latest override biography onto the seed `Person` on read.
4. `GET /api/auth/me` (`[Authorize]`) reflects the authoritative signed-in state; `POST /api/auth/logout` revokes (deletes) the session and clears the cookie.

**Tech Stack:** .NET 10, ASP.NET Core (`AuthenticationHandler<AuthenticationSchemeOptions>`, `IOptions<T>`, controllers), MediatR 14 (request/handler + `ValidationBehavior` pipeline), FluentValidation, Mapster, `Google.Apis.Auth` (new), `System.Security.Cryptography` (token + SHA-256). Tests: xUnit + Moq + AwesomeAssertions (unit) and `WebApplicationFactory<Program>` (integration).

**Scope notes for the worker:**

- **No Firestore, no `FirestoreOptions`, no live Google network in this PR.** Every store has an **in-memory** implementation only; `IGoogleIdTokenValidator` is the seam that keeps Google off the test path. The Firestore impls and environment-based selection are PR 2 phase 3.
- **No TTL / cached-snapshot read path in this PR.** The spec's 10-minute merged-snapshot cache (section 2) is deliberately **not** built here — it only matters once Firestore is the override source. This PR overlays overrides **directly** in `InMemoryPersonRepository.GetByIdAsync` / `GetAllAsync` (an in-process dictionary lookup, no I/O). State this in the PR description so a reviewer doesn't expect the cache yet.
- **One design clarification vs. the spec:** the spec's `ISessionStore.CreateAsync(claims)` is realized here as `CreateAsync(Session session, …)` (the caller builds the full `Session` record incl. `Email`/`Name`/`CanEdit`/`CreatedAt`/`ExpiresAt`), and `GetLatestAsync`/`GetAllLatestAsync` on the override store are named `GetLatestBiographyAsync`/`GetLatestBiographiesAsync`. These are naming refinements within the spec's intent, not behavior changes.
- **Docs:** this PR adds observable API behavior (new `/api/auth/*` endpoints + the guarded biography `PUT`), so `docs/reference/` will need updating — but per the repo policy that lands via the `update-docs-for-pr` skill **at PR time**, not in this plan's tasks. Flag it in the final task.

---

## Files

### Configuration — `FamilyTree.Api/Configuration/` (binding classes, one file each)

- **Create** `AuthenticationSettings.cs` — `Authentication` binding section: `{ GoogleSettings Google; SessionSettings Session; }`.
- **Create** `GoogleSettings.cs` — `{ string ClientId = ""; IReadOnlyList<string> Editors = []; }`.
- **Create** `SessionSettings.cs` — `{ string CookieName = "ft_session"; int LifetimeDays = 7; bool SlidingRenewal = true; }`.
- **Modify** `AppSettings.cs` — add `public AuthenticationSettings Authentication { get; init; } = new();`.

### Options consumed by DI — `FamilyTree.Api/Auth/`

- **Create** `GoogleAuthOptions.cs` — `{ string ClientId; IReadOnlyList<string> Editors; }` (consumed by `GoogleIdTokenValidator` + `SessionManager`).
- **Create** `SessionOptions.cs` — `{ string CookieName; int LifetimeDays; bool SlidingRenewal; }` (consumed by `SessionManager`, the auth handler, and the controller).

### Sessions — `FamilyTree.Infrastructure/`

- **Create** `Session.cs` — `record Session { string Email; string Name; bool CanEdit; DateTimeOffset CreatedAt; DateTimeOffset ExpiresAt; }`.
- **Create** `ISessionStore.cs` — `CreateAsync` / `GetAsync` / `RenewAsync` / `DeleteAsync`.
- **Create** `InMemorySessionStore.cs` — singleton; opaque random token, keyed by SHA-256(token) hex in a `ConcurrentDictionary`; null on missing/expired.

### Overrides — `FamilyTree.Domain/` + `FamilyTree.Infrastructure/`

- **Create** `FamilyTree.Domain/IPersonOverrideStore.cs` — `AppendBiographyAsync` / `GetLatestBiographyAsync` / `GetLatestBiographiesAsync`.
- **Create** `FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs` — singleton; `ConcurrentDictionary<string, list-of-revisions>`, append adds, latest = last.
- **Modify** `FamilyTree.Infrastructure/InMemoryPersonRepository.cs` — inject `IPersonOverrideStore`; overlay latest biography on `GetByIdAsync` / `GetAllAsync`.
- **Modify** `FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` — register the two in-memory stores as singletons.

### Google validation + session orchestration — `FamilyTree.Api/Auth/`

- **Create** `GoogleIdentity.cs` — `record GoogleIdentity(string Email, string Name)`.
- **Create** `IGoogleIdTokenValidator.cs` — `Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken ct)`.
- **Create** `GoogleIdTokenValidator.cs` — real impl over `GoogleJsonWebSignature.ValidateAsync`.
- **Create** `SessionIdentity.cs` — `record SessionIdentity(string Email, string Name, bool CanEdit)`.
- **Create** `SignInResult.cs` — `record SignInResult(string Token, SessionIdentity Identity)`.
- **Create** `ISessionManager.cs` — `SignInAsync` / `SignOutAsync`.
- **Create** `SessionManager.cs` — validates, computes `CanEdit`, creates the session.
- **Create** `SessionCookie.cs` — static `Build(SessionOptions)` → `CookieOptions`.
- **Create** `SessionAuthenticationHandler.cs` — `AuthenticationHandler<AuthenticationSchemeOptions>`, `SchemeName = "Session"`, sliding renewal.

### Controller + DTOs — `FamilyTree.Api/`

- **Create** `Controllers/AuthController.cs` — `POST session`, `POST logout`, `GET me` under `api/auth`.
- **Create** `Auth/LoginRequest.cs` — `record LoginRequest(string IdToken)`.
- **Create** `Auth/MeResponse.cs` — `record MeResponse(string Email, string Name, bool CanEdit)`.
- **Modify** `Controllers/PeopleController.cs` — add guarded `PUT {id}/biography`.

### Editor-gated edit — `FamilyTree.Application/People/`

- **Create** `UpdatePersonBiographyCommand.cs` — `record …(string Id, LocalizedTextDto Biography, string EditorEmail) : IRequest<PersonDto?>`.
- **Create** `UpdatePersonBiographyHandler.cs` — appends + re-fetches merged.
- **Create** `UpdatePersonBiographyValidator.cs` — id / biography / editor-email rules.
- **Modify** `FamilyTree.Application/Mapping/MappingConfig.cs` — add `LocalizedTextDto → LocalizedText`.

### Wiring + config file

- **Modify** `FamilyTree.Api/Program.cs` — map the two new Options; register validator + manager (scoped); add the auth scheme + `CanEdit` policy; `UseAuthentication`/`UseAuthorization`.
- **Modify** `FamilyTree.Api/appsettings.json` — add an empty `Authentication` section with a `_comment`.
- **Modify** `Directory.Packages.props` — add `Google.Apis.Auth`.
- **Modify** `FamilyTree.Api/FamilyTree.Api.csproj` — reference `Google.Apis.Auth`.

### Tests

- **Create** `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs`.
- **Create** `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs`.
- **Create** `tests/unit/FamilyTree.UnitTests/Infrastructure/PersonRepositoryOverlayTests.cs`.
- **Create** `tests/unit/FamilyTree.UnitTests/Auth/SessionManagerTests.cs`.
- **Create** `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs`.
- **Create** `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyValidatorTests.cs`.
- **Modify** `tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj` — add a project reference to `FamilyTree.Api` (so `SessionManager`/`GoogleAuthOptions` are reachable). *(Today it references Domain/Application/Infrastructure only.)*
- **Create** `tests/integration/FamilyTree.IntegrationTests/Auth/FakeGoogleIdTokenValidator.cs`.
- **Create** `tests/integration/FamilyTree.IntegrationTests/Auth/AuthApiFactory.cs`.
- **Create** `tests/integration/FamilyTree.IntegrationTests/Auth/AuthEndpointsTests.cs`.
- **Create** `tests/integration/FamilyTree.IntegrationTests/Auth/BiographyEditEndpointsTests.cs`.
- **Modify** `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs` — assert the new `Authentication` section binds.

**Unchanged on purpose:** `FamilyDataOptions`, `FamilyStore`, `JsonFamilyDataLoader`, `IPersonRepository` (interface unchanged — only the in-memory impl gains a dependency), `IFamilyQueryService` (already exposes `GetPersonAsync`).

---

## Task 1: Add the `Google.Apis.Auth` package

**Files:**
- Modify: `Directory.Packages.props`
- Modify: `src/backend/FamilyTree.Api/FamilyTree.Api.csproj`

- [ ] **Step 1: Pin the package version centrally**

In `Directory.Packages.props`, inside the `<!-- Api -->` group, after the OpenApi line, add:

```xml
    <PackageVersion Include="Microsoft.AspNetCore.OpenApi" Version="10.0.8" />
    <!-- Google ID-token verification for sign-in (GoogleJsonWebSignature). -->
    <PackageVersion Include="Google.Apis.Auth" Version="1.69.0" />
```

(If `dotnet restore` reports `1.69.0` is unavailable, pick the closest current stable `1.69.x`/`1.70.x` and keep the version here — central management means it is declared in exactly this one place.)

- [ ] **Step 2: Reference it from the Api project**

In `src/backend/FamilyTree.Api/FamilyTree.Api.csproj`, change the package `ItemGroup` from:

```xml
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" />
  </ItemGroup>
```

to:

```xml
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" />
    <PackageReference Include="Google.Apis.Auth" />
  </ItemGroup>
```

- [ ] **Step 3: Restore to confirm the version resolves**

Run: `dotnet restore`
Expected: **restore succeeds** with no NU1102 (version not found). If it fails, adjust the version in `Directory.Packages.props` per Step 1's note and re-run.

- [ ] **Step 4: Build to confirm nothing broke**

Run: `dotnet build`
Expected: **build succeeds** (the package is referenced but not yet used).

- [ ] **Step 5: Commit**

```bash
git add Directory.Packages.props src/backend/FamilyTree.Api/FamilyTree.Api.csproj
git commit -m "Add Google.Apis.Auth package for ID-token verification"
```

---

## Task 2: `Session` record + `ISessionStore` + `InMemorySessionStore`

**Files:**
- Create: `src/backend/FamilyTree.Infrastructure/Session.cs`
- Create: `src/backend/FamilyTree.Infrastructure/ISessionStore.cs`
- Create: `src/backend/FamilyTree.Infrastructure/InMemorySessionStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs`:

```csharp
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemorySessionStoreTests
{
    private static Session NewSession(DateTimeOffset? expiresAt = null)
    {
        var now = DateTimeOffset.UtcNow;
        return new Session
        {
            Email = "editor@example.com",
            Name = "Editor One",
            CanEdit = true,
            CreatedAt = now,
            ExpiresAt = expiresAt ?? now.AddDays(7)
        };
    }

    [Fact]
    public async Task CreateAsync_WhenCalled_ShouldReturnTokenThatRoundTripsViaGet()
    {
        var store = new InMemorySessionStore();
        var session = NewSession();

        var token = await store.CreateAsync(session, CancellationToken.None);
        var fetched = await store.GetAsync(token, CancellationToken.None);

        token.Should().NotBeNullOrWhiteSpace();
        fetched.Should().NotBeNull();
        fetched!.Email.Should().Be("editor@example.com");
        fetched.Name.Should().Be("Editor One");
        fetched.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task GetAsync_WhenTokenUnknown_ShouldReturnNull()
    {
        var store = new InMemorySessionStore();

        var fetched = await store.GetAsync("not-a-real-token", CancellationToken.None);

        fetched.Should().BeNull();
    }

    [Fact]
    public async Task GetAsync_WhenSessionExpired_ShouldReturnNull()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(
            NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)),
            CancellationToken.None);

        var fetched = await store.GetAsync(token, CancellationToken.None);

        fetched.Should().BeNull();
    }

    [Fact]
    public async Task RenewAsync_WhenCalled_ShouldExtendExpiry()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(
            NewSession(expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)),
            CancellationToken.None);

        await store.RenewAsync(token, DateTimeOffset.UtcNow.AddDays(7), CancellationToken.None);
        var fetched = await store.GetAsync(token, CancellationToken.None);

        fetched.Should().NotBeNull();
        fetched!.ExpiresAt.Should().BeAfter(DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task DeleteAsync_WhenCalled_ShouldRemoveSession()
    {
        var store = new InMemorySessionStore();
        var token = await store.CreateAsync(NewSession(), CancellationToken.None);

        await store.DeleteAsync(token, CancellationToken.None);
        var fetched = await store.GetAsync(token, CancellationToken.None);

        fetched.Should().BeNull();
    }

    [Fact]
    public async Task CreateAsync_WhenCalledTwice_ShouldReturnDistinctTokens()
    {
        var store = new InMemorySessionStore();

        var first = await store.CreateAsync(NewSession(), CancellationToken.None);
        var second = await store.CreateAsync(NewSession(), CancellationToken.None);

        first.Should().NotBe(second);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InMemorySessionStoreTests`
Expected: **build failure** — `Session` / `InMemorySessionStore` do not exist yet.

- [ ] **Step 3: Create the `Session` record**

Create `src/backend/FamilyTree.Infrastructure/Session.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public sealed record Session
{
    public required string Email { get; init; }
    public required string Name { get; init; }
    public bool CanEdit { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset ExpiresAt { get; init; }
}
```

- [ ] **Step 4: Create the `ISessionStore` interface**

Create `src/backend/FamilyTree.Infrastructure/ISessionStore.cs`:

```csharp
namespace FamilyTree.Infrastructure;

public interface ISessionStore
{
    Task<string> CreateAsync(Session session, CancellationToken cancellationToken);
    Task<Session?> GetAsync(string token, CancellationToken cancellationToken);
    Task RenewAsync(string token, DateTimeOffset newExpiresAt, CancellationToken cancellationToken);
    Task DeleteAsync(string token, CancellationToken cancellationToken);
}
```

- [ ] **Step 5: Create the `InMemorySessionStore`**

Create `src/backend/FamilyTree.Infrastructure/InMemorySessionStore.cs`:

```csharp
using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace FamilyTree.Infrastructure;

/// <summary>
/// In-memory, revocable session store for local dev and tests. The opaque token is
/// 32 cryptographically-random bytes (Base64Url); the dictionary is keyed by the
/// SHA-256 hex of the token, so a store leak never exposes a usable token.
/// </summary>
public sealed class InMemorySessionStore : ISessionStore
{
    private readonly ConcurrentDictionary<string, Session> _sessions = new(StringComparer.Ordinal);

    public Task<string> CreateAsync(Session session, CancellationToken cancellationToken)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        _sessions[Hash(token)] = session;
        return Task.FromResult(token);
    }

    public Task<Session?> GetAsync(string token, CancellationToken cancellationToken)
    {
        if (!_sessions.TryGetValue(Hash(token), out var session))
        {
            return Task.FromResult<Session?>(null);
        }

        if (session.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Task.FromResult<Session?>(null);
        }

        return Task.FromResult<Session?>(session);
    }

    public Task RenewAsync(string token, DateTimeOffset newExpiresAt, CancellationToken cancellationToken)
    {
        var key = Hash(token);
        if (_sessions.TryGetValue(key, out var session))
        {
            _sessions[key] = session with { ExpiresAt = newExpiresAt };
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(string token, CancellationToken cancellationToken)
    {
        _sessions.TryRemove(Hash(token), out _);
        return Task.CompletedTask;
    }

    private static string Hash(string token)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InMemorySessionStoreTests`
Expected: **PASS** (all six tests).

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/Session.cs src/backend/FamilyTree.Infrastructure/ISessionStore.cs src/backend/FamilyTree.Infrastructure/InMemorySessionStore.cs tests/unit/FamilyTree.UnitTests/Infrastructure/InMemorySessionStoreTests.cs
git commit -m "Add in-memory revocable session store keyed by SHA-256 of opaque token"
```

---

## Task 3: `IPersonOverrideStore` (Domain) + `InMemoryPersonOverrideStore` (Infrastructure)

**Files:**
- Create: `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`
- Create: `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class InMemoryPersonOverrideStoreTests
{
    private static LocalizedText Bio(string en) => new() { En = en };

    [Fact]
    public async Task GetLatestBiographyAsync_WhenNoOverride_ShouldReturnNull()
    {
        var store = new InMemoryPersonOverrideStore();

        var latest = await store.GetLatestBiographyAsync("p-0001", CancellationToken.None);

        latest.Should().BeNull();
    }

    [Fact]
    public async Task AppendBiographyAsync_WhenCalledOnce_ShouldExposeItAsLatest()
    {
        var store = new InMemoryPersonOverrideStore();

        await store.AppendBiographyAsync("p-0001", Bio("first"), "editor@example.com", CancellationToken.None);
        var latest = await store.GetLatestBiographyAsync("p-0001", CancellationToken.None);

        latest.Should().NotBeNull();
        latest!.En.Should().Be("first");
    }

    [Fact]
    public async Task AppendBiographyAsync_WhenCalledTwice_ShouldExposeTheLastAsLatest()
    {
        var store = new InMemoryPersonOverrideStore();

        await store.AppendBiographyAsync("p-0001", Bio("first"), "editor@example.com", CancellationToken.None);
        await store.AppendBiographyAsync("p-0001", Bio("second"), "editor@example.com", CancellationToken.None);
        var latest = await store.GetLatestBiographyAsync("p-0001", CancellationToken.None);

        latest!.En.Should().Be("second");
    }

    [Fact]
    public async Task GetLatestBiographiesAsync_WhenMultiplePeopleOverridden_ShouldReturnLatestForEach()
    {
        var store = new InMemoryPersonOverrideStore();
        await store.AppendBiographyAsync("p-0001", Bio("a1"), "editor@example.com", CancellationToken.None);
        await store.AppendBiographyAsync("p-0001", Bio("a2"), "editor@example.com", CancellationToken.None);
        await store.AppendBiographyAsync("p-0002", Bio("b1"), "editor@example.com", CancellationToken.None);

        var all = await store.GetLatestBiographiesAsync(CancellationToken.None);

        all.Should().HaveCount(2);
        all["p-0001"].En.Should().Be("a2");
        all["p-0002"].En.Should().Be("b1");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InMemoryPersonOverrideStoreTests`
Expected: **build failure** — the store and interface do not exist yet.

- [ ] **Step 3: Create the `IPersonOverrideStore` interface**

Create `src/backend/FamilyTree.Domain/IPersonOverrideStore.cs`:

```csharp
namespace FamilyTree.Domain;

/// <summary>
/// Append-only store of per-person biography overrides layered over the JSON seed.
/// The interface exposes only the latest revision; revision history lives in the
/// implementation.
/// </summary>
public interface IPersonOverrideStore
{
    Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken);
    Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken);
}
```

- [ ] **Step 4: Create the `InMemoryPersonOverrideStore`**

Create `src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs`:

```csharp
using System.Collections.Concurrent;

namespace FamilyTree.Infrastructure;

/// <summary>
/// In-memory, append-only person-override store for local dev and tests. Each person
/// has a list of revisions (newest last); the latest revision wins on read. Appends
/// are thread-safe; history is retained for a future audit/undo feature.
/// </summary>
public sealed class InMemoryPersonOverrideStore : IPersonOverrideStore
{
    private sealed record Revision(LocalizedText Biography, string EditorEmail, DateTimeOffset EditedAt);

    private readonly ConcurrentDictionary<string, List<Revision>> _overrides = new(StringComparer.Ordinal);

    public Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken)
    {
        var revision = new Revision(biography, editorEmail, DateTimeOffset.UtcNow);
        var revisions = _overrides.GetOrAdd(personId, _ => new List<Revision>());
        lock (revisions)
        {
            revisions.Add(revision);
        }

        return Task.CompletedTask;
    }

    public Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken)
    {
        if (!_overrides.TryGetValue(personId, out var revisions))
        {
            return Task.FromResult<LocalizedText?>(null);
        }

        lock (revisions)
        {
            return Task.FromResult<LocalizedText?>(revisions.Count > 0 ? revisions[^1].Biography : null);
        }
    }

    public Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken)
    {
        var latest = new Dictionary<string, LocalizedText>(StringComparer.Ordinal);
        foreach (var entry in _overrides)
        {
            lock (entry.Value)
            {
                if (entry.Value.Count > 0)
                {
                    latest[entry.Key] = entry.Value[^1].Biography;
                }
            }
        }

        return Task.FromResult<IReadOnlyDictionary<string, LocalizedText>>(latest);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~InMemoryPersonOverrideStoreTests`
Expected: **PASS** (all four tests).

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Domain/IPersonOverrideStore.cs src/backend/FamilyTree.Infrastructure/InMemoryPersonOverrideStore.cs tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryPersonOverrideStoreTests.cs
git commit -m "Add append-only in-memory person biography override store"
```

---

## Task 4: Overlay overrides in `InMemoryPersonRepository`

The repository now overlays the latest override biography onto the seed `Person` on read. People with no override are returned unchanged. This is a direct in-process merge — **no TTL cache** (that arrives in the Firestore PR; see scope notes).

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/PersonRepositoryOverlayTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Infrastructure/PersonRepositoryOverlayTests.cs`:

```csharp
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class PersonRepositoryOverlayTests
{
    private static FamilyStore BuildStore()
    {
        var people = new List<Person>
        {
            new() { Id = "p-0001", GivenName = new LocalizedText { En = "Jan" }, Surname = new LocalizedText { En = "Kowalski" }, Birth = new LifeEvent { Year = 1750 }, Biography = new LocalizedText { En = "seed bio" } },
            new() { Id = "p-0002", GivenName = new LocalizedText { En = "Anna" }, Surname = new LocalizedText { En = "Kowalska" }, Birth = new LifeEvent { Year = 1755 } }
        };
        var loader = new Mock<IFamilyDataLoader>();
        loader.Setup(l => l.Load()).Returns(new FamilyGraph(people, new List<Union>()));
        return new FamilyStore(loader.Object);
    }

    [Fact]
    public async Task GetByIdAsync_WhenOverrideExists_ShouldReturnOverriddenBiography()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographyAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new LocalizedText { En = "edited bio" });
        var repository = new InMemoryPersonRepository(BuildStore(), overrides.Object);

        var person = await repository.GetByIdAsync("p-0001", CancellationToken.None);

        person.Should().NotBeNull();
        person!.Biography!.En.Should().Be("edited bio");
    }

    [Fact]
    public async Task GetByIdAsync_WhenNoOverride_ShouldReturnSeedPersonUnchanged()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((LocalizedText?)null);
        var repository = new InMemoryPersonRepository(BuildStore(), overrides.Object);

        var person = await repository.GetByIdAsync("p-0001", CancellationToken.None);

        person!.Biography!.En.Should().Be("seed bio");
    }

    [Fact]
    public async Task GetAllAsync_WhenOverrideExists_ShouldOverlayOnlyTheMatchingPerson()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText> { ["p-0002"] = new LocalizedText { En = "anna edited" } });
        var repository = new InMemoryPersonRepository(BuildStore(), overrides.Object);

        var people = await repository.GetAllAsync(CancellationToken.None);

        people.Single(p => p.Id == "p-0002").Biography!.En.Should().Be("anna edited");
        people.Single(p => p.Id == "p-0001").Biography!.En.Should().Be("seed bio");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~PersonRepositoryOverlayTests`
Expected: **build failure** — `InMemoryPersonRepository`'s constructor takes one argument today.

> Note: the existing `InMemoryRepositoryTests` construct `new InMemoryPersonRepository(BuildStore())` with one arg — those will stop compiling once the constructor changes. Fix them in Step 4.

- [ ] **Step 3: Rewrite `InMemoryPersonRepository` to overlay overrides**

Replace the entire contents of `src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs` with:

```csharp
namespace FamilyTree.Infrastructure;

public sealed class InMemoryPersonRepository : IPersonRepository
{
    private readonly FamilyStore _store;
    private readonly IPersonOverrideStore _overrides;

    public InMemoryPersonRepository(FamilyStore store, IPersonOverrideStore overrides)
    {
        _store = store;
        _overrides = overrides;
    }

    public async Task<IReadOnlyList<Person>> GetAllAsync(CancellationToken cancellationToken)
    {
        var latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);
        if (latest.Count == 0)
        {
            return _store.People;
        }

        return _store.People
            .Select(person => latest.TryGetValue(person.Id, out var biography)
                ? person with { Biography = biography }
                : person)
            .ToList();
    }

    public async Task<Person?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var person = _store.People.FirstOrDefault(candidate => candidate.Id == id);
        if (person is null)
        {
            return null;
        }

        var biography = await _overrides.GetLatestBiographyAsync(id, cancellationToken);
        return biography is null ? person : person with { Biography = biography };
    }
}
```

- [ ] **Step 4: Fix the existing `InMemoryRepositoryTests` constructor calls**

In `tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs`, the three `new InMemoryPersonRepository(BuildStore())` calls now need an override store. Add a no-op override mock helper and pass it. Change the top of the file's `using` block to include `using FamilyTree.Domain;` (already present) and add, just under `BuildStore()`, a helper:

```csharp
    private static IPersonOverrideStore EmptyOverrides()
    {
        var overrides = new Mock<IPersonOverrideStore>();
        overrides.Setup(o => o.GetLatestBiographyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((LocalizedText?)null);
        overrides.Setup(o => o.GetLatestBiographiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, LocalizedText>());
        return overrides.Object;
    }
```

Then change each `new InMemoryPersonRepository(BuildStore())` to `new InMemoryPersonRepository(BuildStore(), EmptyOverrides())`. (The two `InMemoryUnionRepository(BuildStore())` call is unchanged — only the person repository's constructor grew.)

- [ ] **Step 5: Run the affected tests**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~PersonRepositoryOverlayTests|FullyQualifiedName~InMemoryRepositoryTests"`
Expected: **PASS** — overlay tests green, and the pre-existing repository tests still green against the new constructor.

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/InMemoryPersonRepository.cs tests/unit/FamilyTree.UnitTests/Infrastructure/InMemoryRepositoryTests.cs tests/unit/FamilyTree.UnitTests/Infrastructure/PersonRepositoryOverlayTests.cs
git commit -m "Overlay latest biography override onto seed people on read"
```

---

## Task 5: Register the two in-memory stores as singletons

The stores hold edit/session state for the process lifetime, so they must be singletons (a scoped store would lose every edit between requests). `AddInfrastructure` is where the other stores live, so register them there.

**Files:**
- Modify: `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs`

- [ ] **Step 1: Register the stores**

Replace the body of `AddInfrastructure` in `src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs` so it reads:

```csharp
using FamilyTree.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, FamilyDataOptions familyData)
    {
        services.Configure<FamilyDataOptions>(options => options.FilePath = familyData.FilePath);
        services.AddSingleton<IFamilyDataLoader, JsonFamilyDataLoader>();
        services.AddSingleton<FamilyStore>();
        services.AddSingleton<ISessionStore, InMemorySessionStore>();
        services.AddSingleton<IPersonOverrideStore, InMemoryPersonOverrideStore>();
        services.AddScoped<IPersonRepository, InMemoryPersonRepository>();
        services.AddScoped<IUnionRepository, InMemoryUnionRepository>();
        return services;
    }
}
```

(The `using FamilyTree.Domain;` is added because `IPersonOverrideStore` is a Domain type; `ISessionStore` is in the `FamilyTree.Infrastructure` namespace already covered by the file's own namespace.)

- [ ] **Step 2: Build to confirm DI compiles**

Run: `dotnet build`
Expected: **build succeeds** — `InMemoryPersonRepository` can now resolve its `IPersonOverrideStore` dependency from DI.

- [ ] **Step 3: Run the full backend suite**

Run: `dotnet test`
Expected: **PASS** — unit + integration. The integration suite boots `Program`, which calls `AddInfrastructure`; the new singletons resolve, and the existing endpoints (no overrides present) behave identically.

- [ ] **Step 4: Commit**

```bash
git add src/backend/FamilyTree.Infrastructure/InfrastructureServiceCollectionExtensions.cs
git commit -m "Register in-memory session and override stores as singletons"
```

---

## Task 6: Application command — `UpdatePersonBiographyCommand` + validator + mapping

**Files:**
- Create: `src/backend/FamilyTree.Application/People/UpdatePersonBiographyCommand.cs`
- Create: `src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs`
- Create: `src/backend/FamilyTree.Application/People/UpdatePersonBiographyValidator.cs`
- Modify: `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyValidatorTests.cs`

- [ ] **Step 1: Add the reverse mapping `LocalizedTextDto → LocalizedText`**

In `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`, add a line directly after the existing `config.NewConfig<LocalizedText, LocalizedTextDto>();`:

```csharp
        config.NewConfig<LocalizedText, LocalizedTextDto>();
        config.NewConfig<LocalizedTextDto, LocalizedText>();
```

- [ ] **Step 2: Write the failing handler tests**

Create `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs`:

```csharp
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Mapster;
using MapsterMapper;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class UpdatePersonBiographyHandlerTests
{
    private static IMapper BuildMapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    private static Person NewPerson(string id, LocalizedText? biography = null) => new()
    {
        Id = id,
        GivenName = new LocalizedText { En = "Anna" },
        Surname = new LocalizedText { En = "Kowalska" },
        Sex = Sex.Female,
        Vocation = Vocation.Teacher,
        Birth = new LifeEvent { Year = 1842 },
        Biography = biography
    };

    [Fact]
    public async Task Handle_WhenPersonExists_ShouldAppendAndReturnMergedDto()
    {
        var service = new Mock<IFamilyQueryService>();
        var overrides = new Mock<IPersonOverrideStore>();
        // First GetPersonAsync confirms existence; the post-append fetch returns the merged person.
        service.SetupSequence(s => s.GetPersonAsync("p-0001", It.IsAny<CancellationToken>()))
            .ReturnsAsync(NewPerson("p-0001"))
            .ReturnsAsync(NewPerson("p-0001", new LocalizedText { En = "new bio" }));
        var handler = new UpdatePersonBiographyHandler(service.Object, overrides.Object, BuildMapper());

        var result = await handler.Handle(
            new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto(null, null, "new bio"), "editor@example.com"),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.Biography!.En.Should().Be("new bio");
        overrides.Verify(o => o.AppendBiographyAsync(
            "p-0001",
            It.Is<LocalizedText>(b => b.En == "new bio"),
            "editor@example.com",
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNullAndNotAppend()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9999", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Person?)null);
        var overrides = new Mock<IPersonOverrideStore>();
        var handler = new UpdatePersonBiographyHandler(service.Object, overrides.Object, BuildMapper());

        var result = await handler.Handle(
            new UpdatePersonBiographyCommand("p-9999", new LocalizedTextDto(null, null, "x"), "editor@example.com"),
            CancellationToken.None);

        result.Should().BeNull();
        overrides.Verify(o => o.AppendBiographyAsync(
            It.IsAny<string>(), It.IsAny<LocalizedText>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
```

- [ ] **Step 3: Write the failing validator tests**

Create `tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyValidatorTests.cs`:

```csharp
using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;

namespace FamilyTree.UnitTests.Application;

public sealed class UpdatePersonBiographyValidatorTests
{
    private readonly UpdatePersonBiographyValidator _validator = new();

    [Fact]
    public async Task Validate_WhenAllFieldsValid_ShouldPass()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto("био", null, null), "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_WhenIdMalformed_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("not-an-id", new LocalizedTextDto("био", null, null), "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_WhenBiographyAllEmpty_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto(null, null, null), "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_WhenEditorEmailEmpty_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto("био", null, null), "");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }
}
```

- [ ] **Step 4: Run both test classes to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~UpdatePersonBiographyHandlerTests|FullyQualifiedName~UpdatePersonBiographyValidatorTests"`
Expected: **build failure** — the command/handler/validator do not exist.

- [ ] **Step 5: Create the command**

Create `src/backend/FamilyTree.Application/People/UpdatePersonBiographyCommand.cs`:

```csharp
namespace FamilyTree.Application.People;

public sealed record UpdatePersonBiographyCommand(
    string Id,
    LocalizedTextDto Biography,
    string EditorEmail) : IRequest<PersonDto?>;
```

(`LocalizedTextDto` and `PersonDto` resolve via the Application `GlobalUsings` `global using FamilyTree.Application.Dtos;`; `IRequest` via `global using MediatR;`.)

- [ ] **Step 6: Create the handler**

Create `src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs`:

```csharp
using FamilyTree.Application.Abstractions;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyHandler : IRequestHandler<UpdatePersonBiographyCommand, PersonDto?>
{
    private readonly IFamilyQueryService _service;
    private readonly IPersonOverrideStore _overrides;
    private readonly IMapper _mapper;

    public UpdatePersonBiographyHandler(
        IFamilyQueryService service,
        IPersonOverrideStore overrides,
        IMapper mapper)
    {
        _service = service;
        _overrides = overrides;
        _mapper = mapper;
    }

    public async Task<PersonDto?> Handle(UpdatePersonBiographyCommand request, CancellationToken cancellationToken)
    {
        var existing = await _service.GetPersonAsync(request.Id, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        var biography = _mapper.Map<LocalizedText>(request.Biography);
        await _overrides.AppendBiographyAsync(request.Id, biography, request.EditorEmail, cancellationToken);

        var merged = await _service.GetPersonAsync(request.Id, cancellationToken);
        return merged is null ? null : _mapper.Map<PersonDto>(merged);
    }
}
```

(`IPersonOverrideStore` is a `FamilyTree.Domain` type, available via the Application `GlobalUsings` `global using FamilyTree.Domain;`.)

- [ ] **Step 7: Create the validator**

Create `src/backend/FamilyTree.Application/People/UpdatePersonBiographyValidator.cs`:

```csharp
using FluentValidation;

namespace FamilyTree.Application.People;

public sealed class UpdatePersonBiographyValidator : AbstractValidator<UpdatePersonBiographyCommand>
{
    public UpdatePersonBiographyValidator()
    {
        RuleFor(command => command.Id)
            .NotEmpty()
            .Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");

        RuleFor(command => command.Biography)
            .NotNull()
            .Must(HaveAtLeastOneLocale)
            .WithMessage("Biography must have at least one of Ru, Be, or En set.");

        RuleFor(command => command.EditorEmail)
            .NotEmpty();
    }

    private static bool HaveAtLeastOneLocale(LocalizedTextDto? biography)
    {
        if (biography is null)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(biography.Ru)
            || !string.IsNullOrWhiteSpace(biography.Be)
            || !string.IsNullOrWhiteSpace(biography.En);
    }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter "FullyQualifiedName~UpdatePersonBiographyHandlerTests|FullyQualifiedName~UpdatePersonBiographyValidatorTests"`
Expected: **PASS** (two + four tests).

- [ ] **Step 9: Commit**

```bash
git add src/backend/FamilyTree.Application/People/UpdatePersonBiographyCommand.cs src/backend/FamilyTree.Application/People/UpdatePersonBiographyHandler.cs src/backend/FamilyTree.Application/People/UpdatePersonBiographyValidator.cs src/backend/FamilyTree.Application/Mapping/MappingConfig.cs tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyHandlerTests.cs tests/unit/FamilyTree.UnitTests/Application/UpdatePersonBiographyValidatorTests.cs
git commit -m "Add editor-gated UpdatePersonBiography command, handler, and validator"
```

---

## Task 7: Config binding classes for `Authentication` + the two DI Options

**Files:**
- Create: `src/backend/FamilyTree.Api/Configuration/AuthenticationSettings.cs`
- Create: `src/backend/FamilyTree.Api/Configuration/GoogleSettings.cs`
- Create: `src/backend/FamilyTree.Api/Configuration/SessionSettings.cs`
- Modify: `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`
- Create: `src/backend/FamilyTree.Api/Auth/GoogleAuthOptions.cs`
- Create: `src/backend/FamilyTree.Api/Auth/SessionOptions.cs`
- Modify: `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`

- [ ] **Step 1: Extend the binding test to assert the new section binds**

In `tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs`, add the four `Authentication` keys to the `Bind_WhenAllSectionsPresent…` dictionary and three assertions, and add the `Authentication` defaults to the `Bind_WhenSectionsMissing…` test.

In `Bind_WhenAllSectionsPresent_ShouldPopulateEveryNestedValue`, change the `AddInMemoryCollection` dictionary to:

```csharp
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FamilyData:FilePath"] = "Data/custom.json",
                ["MediatR:LicenseKey"] = "abc-123",
                ["RateLimiting:PermitLimit"] = "250",
                ["RateLimiting:WindowSeconds"] = "30",
                ["Authentication:Google:ClientId"] = "client-xyz.apps.googleusercontent.com",
                ["Authentication:Google:Editors:0"] = "editor@example.com",
                ["Authentication:Session:CookieName"] = "ft_custom",
                ["Authentication:Session:LifetimeDays"] = "3",
                ["Authentication:Session:SlidingRenewal"] = "false"
            })
```

and add after the existing assertions:

```csharp
        settings.Authentication.Google.ClientId.Should().Be("client-xyz.apps.googleusercontent.com");
        settings.Authentication.Google.Editors.Should().ContainSingle().Which.Should().Be("editor@example.com");
        settings.Authentication.Session.CookieName.Should().Be("ft_custom");
        settings.Authentication.Session.LifetimeDays.Should().Be(3);
        settings.Authentication.Session.SlidingRenewal.Should().BeFalse();
```

In `Bind_WhenSectionsMissing_ShouldFallBackToBehaviorPreservingDefaults`, add:

```csharp
        settings.Authentication.Google.ClientId.Should().Be("");
        settings.Authentication.Google.Editors.Should().BeEmpty();
        settings.Authentication.Session.CookieName.Should().Be("ft_session");
        settings.Authentication.Session.LifetimeDays.Should().Be(7);
        settings.Authentication.Session.SlidingRenewal.Should().BeTrue();
```

- [ ] **Step 2: Run the binding test to verify it fails**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~AppSettingsBindingTests`
Expected: **build failure** — `AppSettings.Authentication` does not exist yet.

- [ ] **Step 3: Create the binding classes**

Create `src/backend/FamilyTree.Api/Configuration/GoogleSettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class GoogleSettings
{
    public string ClientId { get; init; } = "";

    public IReadOnlyList<string> Editors { get; init; } = [];
}
```

Create `src/backend/FamilyTree.Api/Configuration/SessionSettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class SessionSettings
{
    public string CookieName { get; init; } = "ft_session";

    public int LifetimeDays { get; init; } = 7;

    public bool SlidingRenewal { get; init; } = true;
}
```

Create `src/backend/FamilyTree.Api/Configuration/AuthenticationSettings.cs`:

```csharp
namespace FamilyTree.Api.Configuration;

public sealed class AuthenticationSettings
{
    public GoogleSettings Google { get; init; } = new();

    public SessionSettings Session { get; init; } = new();
}
```

- [ ] **Step 4: Add `Authentication` to `AppSettings`**

In `src/backend/FamilyTree.Api/Configuration/AppSettings.cs`, add the property after `RateLimiting`:

```csharp
    public RateLimitingSettings RateLimiting { get; init; } = new();

    public AuthenticationSettings Authentication { get; init; } = new();
```

- [ ] **Step 5: Create the two DI Options classes**

Create `src/backend/FamilyTree.Api/Auth/GoogleAuthOptions.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed class GoogleAuthOptions
{
    public string ClientId { get; set; } = "";

    public IReadOnlyList<string> Editors { get; set; } = [];
}
```

Create `src/backend/FamilyTree.Api/Auth/SessionOptions.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed class SessionOptions
{
    public string CookieName { get; set; } = "ft_session";

    public int LifetimeDays { get; set; } = 7;

    public bool SlidingRenewal { get; set; } = true;
}
```

(These use `set` accessors because `services.Configure<T>(o => …)` assigns them at the composition root, mirroring `FamilyDataOptions`.)

- [ ] **Step 6: Run the binding test to verify it passes**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~AppSettingsBindingTests`
Expected: **PASS** (both binding tests).

- [ ] **Step 7: Commit**

```bash
git add src/backend/FamilyTree.Api/Configuration/GoogleSettings.cs src/backend/FamilyTree.Api/Configuration/SessionSettings.cs src/backend/FamilyTree.Api/Configuration/AuthenticationSettings.cs src/backend/FamilyTree.Api/Configuration/AppSettings.cs src/backend/FamilyTree.Api/Auth/GoogleAuthOptions.cs src/backend/FamilyTree.Api/Auth/SessionOptions.cs tests/integration/FamilyTree.IntegrationTests/AppSettingsBindingTests.cs
git commit -m "Add Authentication config section and Google/Session DI options"
```

---

## Task 8: Google token validation seam — `GoogleIdentity`, `IGoogleIdTokenValidator`, `GoogleIdTokenValidator`

The real validator depends on `Google.Apis.Auth`; it is **never** exercised by tests (the integration suite swaps a fake), so this task has no unit test of its own — its correctness is verified by review and by `dotnet build`. The interface is the seam that keeps Google off the test path.

**Files:**
- Create: `src/backend/FamilyTree.Api/Auth/GoogleIdentity.cs`
- Create: `src/backend/FamilyTree.Api/Auth/IGoogleIdTokenValidator.cs`
- Create: `src/backend/FamilyTree.Api/Auth/GoogleIdTokenValidator.cs`

- [ ] **Step 1: Create the identity record**

Create `src/backend/FamilyTree.Api/Auth/GoogleIdentity.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed record GoogleIdentity(string Email, string Name);
```

- [ ] **Step 2: Create the interface**

Create `src/backend/FamilyTree.Api/Auth/IGoogleIdTokenValidator.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public interface IGoogleIdTokenValidator
{
    Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken cancellationToken);
}
```

- [ ] **Step 3: Create the real validator**

Create `src/backend/FamilyTree.Api/Auth/GoogleIdTokenValidator.cs`:

```csharp
using Google.Apis.Auth;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Verifies a Google ID token once at sign-in: audience must be our client ID and
/// the email must be verified. Returns null for any invalid token. This is the only
/// place a Google token is touched — there is no per-request Google validation.
/// </summary>
public sealed class GoogleIdTokenValidator : IGoogleIdTokenValidator
{
    private readonly GoogleAuthOptions _options;

    public GoogleIdTokenValidator(IOptions<GoogleAuthOptions> options)
    {
        _options = options.Value;
    }

    public async Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idToken))
        {
            return null;
        }

        try
        {
            var settings = new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { _options.ClientId }
            };

            var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
            if (payload is null || !payload.EmailVerified)
            {
                return null;
            }

            return new GoogleIdentity(payload.Email, payload.Name);
        }
        catch (InvalidJwtException)
        {
            return null;
        }
    }
}
```

(`GoogleJsonWebSignature.ValidateAsync` has no `CancellationToken` overload; the token is accepted in the signature for interface symmetry and future-proofing but is not forwarded — this is intentional and acceptable for a one-shot network validation.)

- [ ] **Step 4: Build to confirm `Google.Apis.Auth` types resolve**

Run: `dotnet build src/backend/FamilyTree.Api`
Expected: **build succeeds** — `GoogleJsonWebSignature`, `InvalidJwtException`, and `payload.EmailVerified`/`payload.Email`/`payload.Name` all resolve from the package added in Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/backend/FamilyTree.Api/Auth/GoogleIdentity.cs src/backend/FamilyTree.Api/Auth/IGoogleIdTokenValidator.cs src/backend/FamilyTree.Api/Auth/GoogleIdTokenValidator.cs
git commit -m "Add Google ID-token validator behind an interface seam"
```

---

## Task 9: Session orchestration — `SessionManager` (+ identity/result records and interface)

This task needs the unit project to reference `FamilyTree.Api` (so `SessionManager`, `GoogleAuthOptions`, `SessionOptions` are reachable from a unit test). Add that reference first.

**Files:**
- Modify: `tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj`
- Create: `src/backend/FamilyTree.Api/Auth/SessionIdentity.cs`
- Create: `src/backend/FamilyTree.Api/Auth/SignInResult.cs`
- Create: `src/backend/FamilyTree.Api/Auth/ISessionManager.cs`
- Create: `src/backend/FamilyTree.Api/Auth/SessionManager.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Auth/SessionManagerTests.cs`

- [ ] **Step 1: Reference `FamilyTree.Api` from the unit test project**

In `tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj`, add to the project-reference `ItemGroup`:

```xml
  <ItemGroup>
    <ProjectReference Include="..\..\..\src\backend\FamilyTree.Domain\FamilyTree.Domain.csproj" />
    <ProjectReference Include="..\..\..\src\backend\FamilyTree.Application\FamilyTree.Application.csproj" />
    <ProjectReference Include="..\..\..\src\backend\FamilyTree.Infrastructure\FamilyTree.Infrastructure.csproj" />
    <ProjectReference Include="..\..\..\src\backend\FamilyTree.Api\FamilyTree.Api.csproj" />
  </ItemGroup>
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/FamilyTree.UnitTests/Auth/SessionManagerTests.cs`:

```csharp
using FamilyTree.Api.Auth;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Auth;

public sealed class SessionManagerTests
{
    private static SessionManager BuildManager(
        Mock<IGoogleIdTokenValidator> validator,
        Mock<ISessionStore> store,
        params string[] editors)
    {
        var google = Options.Create(new GoogleAuthOptions
        {
            ClientId = "client-xyz",
            Editors = editors
        });
        var session = Options.Create(new SessionOptions
        {
            CookieName = "ft_session",
            LifetimeDays = 7,
            SlidingRenewal = true
        });
        return new SessionManager(validator.Object, store.Object, google, session);
    }

    [Fact]
    public async Task SignInAsync_WhenEditorEmail_ShouldSetCanEditTrueAndCreateSession()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("good", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoogleIdentity("editor@example.com", "Editor One"));
        var store = new Mock<ISessionStore>();
        store.Setup(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("opaque-token");
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("good", CancellationToken.None);

        result.Should().NotBeNull();
        result!.Token.Should().Be("opaque-token");
        result.Identity.Email.Should().Be("editor@example.com");
        result.Identity.CanEdit.Should().BeTrue();
        store.Verify(s => s.CreateAsync(
            It.Is<Session>(session => session.CanEdit && session.Email == "editor@example.com"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SignInAsync_WhenNonEditorEmail_ShouldSetCanEditFalse()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("good", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoogleIdentity("guest@example.com", "Guest"));
        var store = new Mock<ISessionStore>();
        store.Setup(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("opaque-token");
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("good", CancellationToken.None);

        result!.Identity.CanEdit.Should().BeFalse();
    }

    [Fact]
    public async Task SignInAsync_WhenEditorEmailDiffersInCase_ShouldStillMatch()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("good", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoogleIdentity("Editor@Example.com", "Editor One"));
        var store = new Mock<ISessionStore>();
        store.Setup(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("opaque-token");
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("good", CancellationToken.None);

        result!.Identity.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task SignInAsync_WhenTokenInvalid_ShouldReturnNullAndNotCreateSession()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("bad", It.IsAny<CancellationToken>()))
            .ReturnsAsync((GoogleIdentity?)null);
        var store = new Mock<ISessionStore>();
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("bad", CancellationToken.None);

        result.Should().BeNull();
        store.Verify(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SignOutAsync_WhenCalled_ShouldDeleteSession()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        var store = new Mock<ISessionStore>();
        var manager = BuildManager(validator, store);

        await manager.SignOutAsync("opaque-token", CancellationToken.None);

        store.Verify(s => s.DeleteAsync("opaque-token", It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~SessionManagerTests`
Expected: **build failure** — `SessionManager` and its records do not exist.

- [ ] **Step 4: Create the identity + result records and the interface**

Create `src/backend/FamilyTree.Api/Auth/SessionIdentity.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed record SessionIdentity(string Email, string Name, bool CanEdit);
```

Create `src/backend/FamilyTree.Api/Auth/SignInResult.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed record SignInResult(string Token, SessionIdentity Identity);
```

Create `src/backend/FamilyTree.Api/Auth/ISessionManager.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public interface ISessionManager
{
    Task<SignInResult?> SignInAsync(string idToken, CancellationToken cancellationToken);
    Task SignOutAsync(string token, CancellationToken cancellationToken);
}
```

- [ ] **Step 5: Create the `SessionManager`**

Create `src/backend/FamilyTree.Api/Auth/SessionManager.cs`:

```csharp
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Auth;

public sealed class SessionManager : ISessionManager
{
    private readonly IGoogleIdTokenValidator _validator;
    private readonly ISessionStore _store;
    private readonly GoogleAuthOptions _googleOptions;
    private readonly SessionOptions _sessionOptions;

    public SessionManager(
        IGoogleIdTokenValidator validator,
        ISessionStore store,
        IOptions<GoogleAuthOptions> googleOptions,
        IOptions<SessionOptions> sessionOptions)
    {
        _validator = validator;
        _store = store;
        _googleOptions = googleOptions.Value;
        _sessionOptions = sessionOptions.Value;
    }

    public async Task<SignInResult?> SignInAsync(string idToken, CancellationToken cancellationToken)
    {
        var identity = await _validator.ValidateAsync(idToken, cancellationToken);
        if (identity is null)
        {
            return null;
        }

        var canEdit = _googleOptions.Editors.Contains(identity.Email, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var session = new Session
        {
            Email = identity.Email,
            Name = identity.Name,
            CanEdit = canEdit,
            CreatedAt = now,
            ExpiresAt = now.AddDays(_sessionOptions.LifetimeDays)
        };

        var token = await _store.CreateAsync(session, cancellationToken);
        return new SignInResult(token, new SessionIdentity(identity.Email, identity.Name, canEdit));
    }

    public Task SignOutAsync(string token, CancellationToken cancellationToken)
    {
        return _store.DeleteAsync(token, cancellationToken);
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/unit/FamilyTree.UnitTests --filter FullyQualifiedName~SessionManagerTests`
Expected: **PASS** (all five tests).

- [ ] **Step 7: Commit**

```bash
git add tests/unit/FamilyTree.UnitTests/FamilyTree.UnitTests.csproj src/backend/FamilyTree.Api/Auth/SessionIdentity.cs src/backend/FamilyTree.Api/Auth/SignInResult.cs src/backend/FamilyTree.Api/Auth/ISessionManager.cs src/backend/FamilyTree.Api/Auth/SessionManager.cs tests/unit/FamilyTree.UnitTests/Auth/SessionManagerTests.cs
git commit -m "Add SessionManager orchestrating Google validation, allow-list, and session creation"
```

---

## Task 10: `SessionCookie` helper + `SessionAuthenticationHandler`

The auth handler reads the session cookie, builds the principal, and applies sliding renewal. It is verified end-to-end by the integration tests in Tasks 13–14 (a unit test of `AuthenticationHandler` requires extensive ASP.NET plumbing and is not worth it here). This task ends at `dotnet build`; behavior is proven by integration.

**Files:**
- Create: `src/backend/FamilyTree.Api/Auth/SessionCookie.cs`
- Create: `src/backend/FamilyTree.Api/Auth/SessionAuthenticationHandler.cs`

- [ ] **Step 1: Create the cookie helper**

Create `src/backend/FamilyTree.Api/Auth/SessionCookie.cs`:

```csharp
using Microsoft.AspNetCore.Http;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Builds the session cookie's attributes in one place so the controller (which sets
/// it at sign-in) and the auth handler (which re-sets it on sliding renewal) never
/// drift. HttpOnly + Secure + SameSite=Lax + host-only (no Domain).
/// </summary>
public static class SessionCookie
{
    public static CookieOptions Build(SessionOptions options)
    {
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromDays(options.LifetimeDays)
        };
    }
}
```

- [ ] **Step 2: Create the authentication handler**

Create `src/backend/FamilyTree.Api/Auth/SessionAuthenticationHandler.cs`:

```csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using FamilyTree.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Auth;

/// <summary>
/// Per-request cookie-session authentication. Reads the opaque token from the session
/// cookie, looks it up in ISessionStore, and builds a ClaimsPrincipal (name, email,
/// canEdit). Applies 7-day sliding renewal: past the session half-life it extends the
/// expiry and re-sets the cookie. No Google token is touched here.
/// </summary>
public sealed class SessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Session";
    public const string CanEditClaimType = "canEdit";

    private readonly ISessionStore _store;
    private readonly SessionOptions _sessionOptions;

    public SessionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISessionStore store,
        IOptions<SessionOptions> sessionOptions)
        : base(options, logger, encoder)
    {
        _store = store;
        _sessionOptions = sessionOptions.Value;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(_sessionOptions.CookieName, out var token) || string.IsNullOrEmpty(token))
        {
            return AuthenticateResult.NoResult();
        }

        var session = await _store.GetAsync(token, Context.RequestAborted);
        if (session is null)
        {
            return AuthenticateResult.Fail("Session not found or expired.");
        }

        if (_sessionOptions.SlidingRenewal)
        {
            var halfLife = session.CreatedAt + (session.ExpiresAt - session.CreatedAt) / 2;
            if (DateTimeOffset.UtcNow > halfLife)
            {
                var newExpiresAt = DateTimeOffset.UtcNow.AddDays(_sessionOptions.LifetimeDays);
                await _store.RenewAsync(token, newExpiresAt, Context.RequestAborted);
                Response.Cookies.Append(_sessionOptions.CookieName, token, SessionCookie.Build(_sessionOptions));
            }
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, session.Name),
            new Claim(ClaimTypes.Email, session.Email),
            new Claim(CanEditClaimType, session.CanEdit ? "true" : "false")
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return AuthenticateResult.Success(ticket);
    }
}
```

(Note for .NET 10: the constructor takes `(IOptionsMonitor<T>, ILoggerFactory, UrlEncoder)` — the legacy `ISystemClock` parameter was removed.)

- [ ] **Step 3: Build to confirm it compiles**

Run: `dotnet build src/backend/FamilyTree.Api`
Expected: **build succeeds** — `AuthenticationHandler<AuthenticationSchemeOptions>`, `AuthenticateResult`, and `AuthenticationTicket` resolve from the ASP.NET Core shared framework (no extra package needed).

- [ ] **Step 4: Commit**

```bash
git add src/backend/FamilyTree.Api/Auth/SessionCookie.cs src/backend/FamilyTree.Api/Auth/SessionAuthenticationHandler.cs
git commit -m "Add session cookie helper and sliding-renewal authentication handler"
```

---

## Task 11: `AuthController` (`POST session`, `POST logout`, `GET me`) + DTOs

**Files:**
- Create: `src/backend/FamilyTree.Api/Auth/LoginRequest.cs`
- Create: `src/backend/FamilyTree.Api/Auth/MeResponse.cs`
- Create: `src/backend/FamilyTree.Api/Controllers/AuthController.cs`

- [ ] **Step 1: Create the request/response DTOs**

Create `src/backend/FamilyTree.Api/Auth/LoginRequest.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed record LoginRequest(string IdToken);
```

Create `src/backend/FamilyTree.Api/Auth/MeResponse.cs`:

```csharp
namespace FamilyTree.Api.Auth;

public sealed record MeResponse(string Email, string Name, bool CanEdit);
```

- [ ] **Step 2: Create the controller**

Create `src/backend/FamilyTree.Api/Controllers/AuthController.cs`:

```csharp
using System.Security.Claims;
using FamilyTree.Api.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly ISessionManager _sessionManager;
    private readonly SessionOptions _sessionOptions;

    public AuthController(ISessionManager sessionManager, IOptions<SessionOptions> sessionOptions)
    {
        _sessionManager = sessionManager;
        _sessionOptions = sessionOptions.Value;
    }

    [HttpPost("session")]
    [AllowAnonymous]
    public async Task<ActionResult<MeResponse>> SignIn([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var result = await _sessionManager.SignInAsync(request.IdToken, cancellationToken);
        if (result is null)
        {
            return Unauthorized();
        }

        Response.Cookies.Append(_sessionOptions.CookieName, result.Token, SessionCookie.Build(_sessionOptions));
        return Ok(new MeResponse(result.Identity.Email, result.Identity.Name, result.Identity.CanEdit));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(_sessionOptions.CookieName, out var token) && !string.IsNullOrEmpty(token))
        {
            await _sessionManager.SignOutAsync(token, cancellationToken);
        }

        Response.Cookies.Delete(_sessionOptions.CookieName);
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = SessionAuthenticationHandler.SchemeName)]
    public ActionResult<MeResponse> Me()
    {
        var email = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var name = User.FindFirstValue(ClaimTypes.Name) ?? "";
        var canEdit = User.FindFirstValue(SessionAuthenticationHandler.CanEditClaimType) == "true";
        return Ok(new MeResponse(email, name, canEdit));
    }
}
```

- [ ] **Step 3: Build to confirm it compiles**

Run: `dotnet build src/backend/FamilyTree.Api`
Expected: **build succeeds**. (`ISender` is not used here; `ISessionManager` is injected directly. `[Authorize]`/`[AllowAnonymous]` resolve from `Microsoft.AspNetCore.Authorization`.)

> The endpoints are not yet reachable at runtime — the scheme, policy, and `UseAuthentication`/`UseAuthorization` are wired in Task 12. Do not write integration tests until then.

- [ ] **Step 4: Commit**

```bash
git add src/backend/FamilyTree.Api/Auth/LoginRequest.cs src/backend/FamilyTree.Api/Auth/MeResponse.cs src/backend/FamilyTree.Api/Controllers/AuthController.cs
git commit -m "Add AuthController with sign-in, logout, and me endpoints"
```

---

## Task 12: Guarded `PUT /api/people/{id}/biography` + Program.cs wiring

This wires everything together: maps the two Options, registers the validator + manager, adds the auth scheme + `CanEdit` policy, calls `UseAuthentication`/`UseAuthorization`, and adds the guarded controller action. After this task the endpoints are live.

**Files:**
- Modify: `src/backend/FamilyTree.Api/Controllers/PeopleController.cs`
- Modify: `src/backend/FamilyTree.Api/Program.cs`

- [ ] **Step 1: Add the guarded `PUT` action**

Replace the entire contents of `src/backend/FamilyTree.Api/Controllers/PeopleController.cs` with:

```csharp
using System.Security.Claims;
using FamilyTree.Application.People;
using Microsoft.AspNetCore.Authorization;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/people")]
public sealed class PeopleController : ControllerBase
{
    private readonly ISender _sender;

    public PeopleController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PersonSummaryDto>>> GetAll(CancellationToken cancellationToken)
    {
        var people = await _sender.Send(new GetAllPeopleQuery(), cancellationToken);
        return Ok(people);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PersonDto>> GetById(string id, CancellationToken cancellationToken)
    {
        var person = await _sender.Send(new GetPersonByIdQuery(id), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpPut("{id}/biography")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> UpdateBiography(
        string id,
        [FromBody] LocalizedTextDto biography,
        CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new UpdatePersonBiographyCommand(id, biography, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }
}
```

- [ ] **Step 2: Wire authentication/authorization and the new services in `Program.cs`**

In `src/backend/FamilyTree.Api/Program.cs`, add to the `using` block at the top:

```csharp
using FamilyTree.Api.Auth;
using Microsoft.AspNetCore.Authentication;
```

Then, immediately after the existing `builder.Services.AddInfrastructure(...)` line, insert the Options mapping + service registrations + auth scheme + policy:

```csharp
// Map the Authentication config sections to the Options that DI-resolved auth
// services consume (mirrors how FamilyData maps to FamilyDataOptions).
builder.Services.Configure<GoogleAuthOptions>(options =>
{
    options.ClientId = appSettings.Authentication.Google.ClientId;
    options.Editors = appSettings.Authentication.Google.Editors;
});
builder.Services.Configure<SessionOptions>(options =>
{
    options.CookieName = appSettings.Authentication.Session.CookieName;
    options.LifetimeDays = appSettings.Authentication.Session.LifetimeDays;
    options.SlidingRenewal = appSettings.Authentication.Session.SlidingRenewal;
});

// Google validation + session orchestration. The in-memory ISessionStore and
// IPersonOverrideStore are registered by AddInfrastructure (singletons).
builder.Services.AddScoped<IGoogleIdTokenValidator, GoogleIdTokenValidator>();
builder.Services.AddScoped<ISessionManager, SessionManager>();

builder.Services.AddAuthentication(SessionAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(
        SessionAuthenticationHandler.SchemeName, null);

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanEdit", policy =>
        policy.RequireAuthenticatedUser()
            .RequireClaim(SessionAuthenticationHandler.CanEditClaimType, "true"));
});
```

- [ ] **Step 3: Add the middleware in the right order**

In `src/backend/FamilyTree.Api/Program.cs`, find the line `app.UseStaticFiles();` and add the two auth middleware calls immediately before `app.MapHealthChecks(...)` (after `UseStaticFiles`), and ensure they run before `app.MapControllers()`:

```csharp
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health", new HealthCheckOptions
```

(Order: `UseRateLimiter` → CORS (dev) → `UseStaticFiles` → `UseAuthentication` → `UseAuthorization` → endpoint mapping. Authn/authz must sit before `MapControllers`.)

- [ ] **Step 4: Build the whole backend**

Run: `dotnet build`
Expected: **build succeeds** — `PeopleController` resolves `UpdatePersonBiographyCommand` (Application) and `[Authorize(Policy="CanEdit")]`; `Program.cs` resolves the auth types via the new usings.

- [ ] **Step 5: Run the full existing suite to confirm no regression**

Run: `dotnet test`
Expected: **PASS** — all prior unit + integration tests still green. Public GETs (`/api/people`, `/api/family/graph`, `/health`) are unauthenticated and unaffected (no `[Authorize]` on them); rate limiting and security headers unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/backend/FamilyTree.Api/Controllers/PeopleController.cs src/backend/FamilyTree.Api/Program.cs
git commit -m "Wire auth scheme, CanEdit policy, and guarded biography PUT endpoint"
```

---

## Task 13: Integration test harness — fake validator + auth-aware factory

The integration suite must never touch Google or Firestore. This task adds a fake `IGoogleIdTokenValidator` and a `WebApplicationFactory` subclass that injects it and configures an editor allow-list via `UseSetting`.

**Files:**
- Create: `tests/integration/FamilyTree.IntegrationTests/Auth/FakeGoogleIdTokenValidator.cs`
- Create: `tests/integration/FamilyTree.IntegrationTests/Auth/AuthApiFactory.cs`

- [ ] **Step 1: Create the fake validator**

Create `tests/integration/FamilyTree.IntegrationTests/Auth/FakeGoogleIdTokenValidator.cs`:

```csharp
using FamilyTree.Api.Auth;

namespace FamilyTree.IntegrationTests.Auth;

/// <summary>
/// Test double for IGoogleIdTokenValidator: maps known fake idToken strings to
/// identities, and returns null for anything else (an "invalid" token). No network.
/// </summary>
public sealed class FakeGoogleIdTokenValidator : IGoogleIdTokenValidator
{
    public const string EditorIdToken = "fake-editor-token";
    public const string GuestIdToken = "fake-guest-token";
    public const string EditorEmail = "editor@example.com";
    public const string GuestEmail = "guest@example.com";

    public Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken cancellationToken)
    {
        GoogleIdentity? identity = idToken switch
        {
            EditorIdToken => new GoogleIdentity(EditorEmail, "Editor One"),
            GuestIdToken => new GoogleIdentity(GuestEmail, "Guest One"),
            _ => null
        };

        return Task.FromResult(identity);
    }
}
```

- [ ] **Step 2: Create the auth-aware factory**

Create `tests/integration/FamilyTree.IntegrationTests/Auth/AuthApiFactory.cs`:

```csharp
using FamilyTree.Api.Auth;
using FamilyTree.IntegrationTests.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace FamilyTree.IntegrationTests;

public sealed class AuthApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "family.test.json");
        builder.UseSetting("FamilyData:FilePath", fixturePath);
        builder.UseSetting("Authentication:Google:ClientId", "test-client.apps.googleusercontent.com");
        builder.UseSetting("Authentication:Google:Editors:0", FakeGoogleIdTokenValidator.EditorEmail);
        builder.UseEnvironment("Development");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IGoogleIdTokenValidator>();
            services.AddScoped<IGoogleIdTokenValidator, FakeGoogleIdTokenValidator>();
        });
    }
}
```

(`ConfigureTestServices` runs after the app's own registrations, so the fake reliably replaces the real validator. The in-memory `ISessionStore`/`IPersonOverrideStore` singletons stay — which is what we want: a single factory instance shares one store across a test's requests, so a login cookie and a saved edit persist within the test. Each test class gets its own `AuthApiFactory` via `IClassFixture`, isolating state between classes.)

- [ ] **Step 3: Build the integration project**

Run: `dotnet build tests/integration/FamilyTree.IntegrationTests`
Expected: **build succeeds** — `RemoveAll` resolves from `Microsoft.Extensions.DependencyInjection.Extensions` (part of the DI shared framework; no package add needed since the project transitively references it through `FamilyTree.Api`).

- [ ] **Step 4: Commit**

```bash
git add tests/integration/FamilyTree.IntegrationTests/Auth/FakeGoogleIdTokenValidator.cs tests/integration/FamilyTree.IntegrationTests/Auth/AuthApiFactory.cs
git commit -m "Add integration test harness with fake Google validator and editor allow-list"
```

---

## Task 14: Integration tests — auth endpoints + biography edit flow

**Files:**
- Create: `tests/integration/FamilyTree.IntegrationTests/Auth/AuthEndpointsTests.cs`
- Create: `tests/integration/FamilyTree.IntegrationTests/Auth/BiographyEditEndpointsTests.cs`

The fixture person id is `p-0001` (from `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`).

- [ ] **Step 1: Write the auth-endpoint tests**

Create `tests/integration/FamilyTree.IntegrationTests/Auth/AuthEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

public sealed class AuthEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AuthEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SignIn_WhenEditorToken_ShouldReturn200WithCookieAndCanEditTrue()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
        var body = await response.Content.ReadFromJsonAsync<MeResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.TryGetValues("Set-Cookie", out var cookies).Should().BeTrue();
        cookies!.Should().Contain(value => value.StartsWith("ft_session="));
        body!.Email.Should().Be(FakeGoogleIdTokenValidator.EditorEmail);
        body.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task SignIn_WhenInvalidToken_ShouldReturn401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest("totally-invalid"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_WhenNoCookie_ShouldReturn401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_WhenSignedIn_ShouldReturn200WithIdentity()
    {
        // The default HttpClient stores the Set-Cookie and replays it on the next call.
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var response = await client.GetAsync("/api/auth/me");
        var body = await response.Content.ReadFromJsonAsync<MeResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Email.Should().Be(FakeGoogleIdTokenValidator.EditorEmail);
        body.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task Logout_WhenSignedIn_ShouldReturn204AndSubsequentMeIs401()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var logout = await client.PostAsync("/api/auth/logout", null);
        var me = await client.GetAsync("/api/auth/me");

        logout.StatusCode.Should().Be(HttpStatusCode.NoContent);
        me.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
```

(`HttpClient` from `WebApplicationFactory.CreateClient()` has a cookie container enabled by default, so the session cookie set by `POST /session` is replayed automatically on subsequent calls — that's what lets `me`/`logout` see the session.)

- [ ] **Step 2: Run the auth-endpoint tests**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~AuthEndpointsTests`
Expected: **PASS** (all five tests).

- [ ] **Step 3: Write the biography-edit flow tests**

Create `tests/integration/FamilyTree.IntegrationTests/Auth/BiographyEditEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Application.Dtos;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

public sealed class BiographyEditEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public BiographyEditEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    private static LocalizedTextDto Bio(string en) => new(null, null, en);

    [Fact]
    public async Task UpdateBiography_WhenNoCookie_ShouldReturn401()
    {
        var client = _factory.CreateClient();

        var response = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("anon"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task UpdateBiography_WhenNonEditorCookie_ShouldReturn403()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.GuestIdToken));

        var response = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("guest edit"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UpdateBiography_WhenEditorCookie_ShouldReturn200AndFollowUpGetReflectsEdit()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var put = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("first edit"));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var fetched = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        fetched!.Biography!.En.Should().Be("first edit");
    }

    [Fact]
    public async Task UpdateBiography_WhenEditedTwice_ShouldReflectLatestEdit()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("edit one"));
        await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("edit two"));

        var fetched = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        fetched!.Biography!.En.Should().Be("edit two");
    }

    [Fact]
    public async Task UpdateBiography_WhenPersonMissing_ShouldReturn404()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        var response = await client.PutAsJsonAsync("/api/people/p-8888/biography", Bio("ghost"));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
```

(These five tests each create their own `HttpClient` from the **shared** `AuthApiFactory` fixture; because the in-memory stores are process-singletons, edits from one test are visible to a later `GET` in the **same** test. The two-edit and single-edit tests both write to `p-0001`, so the last-writer-wins assertion in each must read what *that* test wrote — they do, because each test logs in fresh and the latest append for `p-0001` is whatever ran most recently. To avoid cross-test ordering coupling, the implementer MAY instead give `BiographyEditEndpointsTests` its **own** factory instance per test by implementing `IDisposable` and `new AuthApiFactory()` per test; the simplest robust form is to assert on values unique per test — here `"edit two"` and `"first edit"` differ, but both target `p-0001`. If flakiness appears from shared-store ordering, switch this class from `IClassFixture<AuthApiFactory>` to constructing a fresh `AuthApiFactory` in the constructor and disposing it, so each test gets an isolated store.)

- [ ] **Step 4: Run the biography-edit tests**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter FullyQualifiedName~BiographyEditEndpointsTests`
Expected: **PASS** (all five tests). If the two write-to-`p-0001` tests interfere (shared singleton store across the class fixture), apply the per-test-factory isolation noted in Step 3 and re-run.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/FamilyTree.IntegrationTests/Auth/AuthEndpointsTests.cs tests/integration/FamilyTree.IntegrationTests/Auth/BiographyEditEndpointsTests.cs
git commit -m "Add integration tests for auth endpoints and editor-gated biography edits"
```

---

## Task 15: `appsettings.json` — empty `Authentication` placeholder with comment

**Files:**
- Modify: `src/backend/FamilyTree.Api/appsettings.json`

- [ ] **Step 1: Add the `Authentication` section**

In `src/backend/FamilyTree.Api/appsettings.json`, add an `Authentication` section after the `MediatR` section (so the file mirrors `AppSettings`). The full file becomes:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "FamilyData": {
    "FilePath": "Data/family.json"
  },
  "MediatR": {
    "_comment": "Lucky Penny community licence key. Leave blank here; set via user-secrets (dotnet user-secrets set \"MediatR:LicenseKey\" \"<key>\") or the MediatR__LicenseKey env var. Do not commit the real key.",
    "LicenseKey": ""
  },
  "Authentication": {
    "Google": {
      "_comment": "Public Google OAuth client ID and the editor email allow-list. Leave blank/empty here; set via user-secrets locally or the Authentication__Google__ClientId / Authentication__Google__Editors__0 env vars in deployment. Editor emails are personal data — do not commit them to this public repo.",
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

- [ ] **Step 2: Confirm the app still starts (ValidateOnStart accepts the file)**

Run: `dotnet build && dotnet run --project src/backend/FamilyTree.Api &` then, in another shell, `curl http://localhost:5037/health` and stop the server.
Expected: `200` `{"status":"Healthy",...}` — the empty `Authentication` section binds cleanly (empty `ClientId`, empty `Editors`), and no auth service throws at startup (validation of the Google client ID happens only when a token is presented).

- [ ] **Step 3: Commit**

```bash
git add src/backend/FamilyTree.Api/appsettings.json
git commit -m "Add empty Authentication config placeholder with comment"
```

---

## Task 16: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full clean build + entire suite**

Run: `dotnet build && dotnet test`
Expected: **build succeeds; all unit + integration tests PASS** (the pre-existing suite plus every new test added in Tasks 2–14).

- [ ] **Step 2: Confirm no live Google / Firestore leaked into the test path**

Run: `git grep -n "GoogleJsonWebSignature" tests; git grep -n "Firestore" src tests`
Expected: **no `GoogleJsonWebSignature` matches under `tests/`** (only the real validator in `src` uses it), and **no `Firestore` matches anywhere** (Firestore is a later PR).

- [ ] **Step 3: Confirm public reads stayed anonymous**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests --filter "FullyQualifiedName~PeopleEndpointsTests|FullyQualifiedName~HardeningTests"`
Expected: **PASS** — `/api/people`, `/api/people/{id}`, `/api/family/graph`, `/health`, security headers, and rate limiting are unchanged by the auth work.

- [ ] **Step 4: Smoke-run the API end to end (optional but recommended)**

Run: `dotnet run --project src/backend/FamilyTree.Api &`, then:
- `curl -i -X POST http://localhost:5037/api/auth/session -H "Content-Type: application/json" -d '{"idToken":"x"}'` → expect `401` (no real Google client configured locally → token invalid).
- `curl -i http://localhost:5037/api/auth/me` → expect `401` (no cookie).
- `curl -i -X PUT http://localhost:5037/api/people/p-0001/biography -H "Content-Type: application/json" -d '{"en":"hi"}'` → expect `401` (guarded).

Stop the server afterward. (This confirms the wiring is live and the guards reject unauthenticated requests; a real signed-in flow needs a Google client ID + an allow-listed email, exercised by the integration suite via the fake.)

- [ ] **Step 5: Note the docs follow-up (do not write docs in this plan)**

This PR adds observable API behavior (`/api/auth/session`, `/api/auth/logout`, `/api/auth/me`, guarded `PUT /api/people/{id}/biography`). Per the repo policy, run the **`update-docs-for-pr`** skill at `gh pr create` time to sync `docs/reference/` (auth model: public read, editor allow-list, Google sign-in → opaque-token server session, 7-day sliding renewal, logout/revocation, the durable in-memory biography override) and the README/CLAUDE overview, landing the doc edits **in this same PR**. The Firestore implementations, the TTL snapshot cache, and the frontend are explicitly **out of scope** here and noted as later PRs.

---

## Self-review notes

**Spec coverage (`2026-06-17-google-auth-editor-gate-design.md`, sections 1, 2, 4):**
- §1 login/session/authz: `POST /api/auth/session` (validate once → session → cookie → `{email,name,canEdit}`), opaque `HttpOnly`+`Secure`+`SameSite=Lax`+host-only cookie, custom cookie-session `AuthenticationHandler` with sliding renewal, `CanEdit` policy, `GET /api/auth/me`, `POST /api/auth/logout` (delete = revoke), `PUT /api/people/{id}/biography` via MediatR command + validator, `UseAuthentication`/`UseAuthorization` before `MapControllers` — all covered (Tasks 9–12, 14).
- §2 storage: `ISessionStore` (create/get/renew/delete, SHA-256 keying) + `IPersonOverrideStore` (append-only, latest-wins) with **in-memory** impls only; read-layering in `InMemoryPersonRepository` — covered (Tasks 2–5). **Deliberately omitted this PR:** the 10-minute merged-snapshot TTL cache and the Firestore impls (stated in scope notes; this PR overlays directly).
- §4 config: `Authentication` binding section under `AppSettings`, `GoogleAuthOptions`/`SessionOptions` mapped via `services.Configure<T>`, empty committed placeholder with comment, env-var override path — covered (Tasks 7, 12, 15).

**Placeholder scan:** every code step contains real, complete C#/JSON — no `TBD`, no "similar to above", no ellipsis-as-code. The only conditional guidance is the explicit Task 14 isolation fallback, which is fully spelled out.

**Type/name consistency across tasks (verified):**
- `"canEdit"` claim name is defined once as `SessionAuthenticationHandler.CanEditClaimType` and referenced symbolically in the handler (Task 10), the policy (`RequireClaim(...CanEditClaimType, "true")`, Task 12), and the controller `me` read (Task 11). The `"CanEdit"` **policy** name is a plain string used identically in `AddPolicy("CanEdit", …)` (Task 12) and `[Authorize(Policy = "CanEdit")]` (Task 12).
- `SessionAuthenticationHandler.SchemeName == "Session"` used in `AddAuthentication`/`AddScheme` (Task 12) and `[Authorize(AuthenticationSchemes = …SchemeName)]` on `me` (Task 11).
- Cookie name flows from config (`SessionSettings.CookieName` default `"ft_session"` → `SessionOptions.CookieName`) and is read symbolically everywhere (`SessionCookie.Build`, handler, controller); the integration tests assert the literal `ft_session=` because that is the configured default in `AuthApiFactory`.
- `ISessionStore` signatures (`CreateAsync(Session,…)→string`, `GetAsync(string)→Session?`, `RenewAsync(string,DateTimeOffset,…)`, `DeleteAsync(string,…)`) match between interface (Task 2), impl (Task 2), `SessionManager` (Task 9), and the handler (Task 10).
- `IPersonOverrideStore` signatures (`AppendBiographyAsync`, `GetLatestBiographyAsync`, `GetLatestBiographiesAsync`) match between Domain interface (Task 3), impl (Task 3), repository overlay (Task 4), and the command handler (Task 6).
- `UpdatePersonBiographyCommand(string Id, LocalizedTextDto Biography, string EditorEmail) : IRequest<PersonDto?>` is identical in the command (Task 6), handler, validator, and the controller `Send` call (Task 12).
- `.NET 10 AuthenticationHandler<T>` constructor `(IOptionsMonitor<T>, ILoggerFactory, UrlEncoder)` — no `ISystemClock` (Task 10), per the .NET 10 note.

**Sequencing rationale:** Domain/Infrastructure stores land first with unit tests (Tasks 2–4) since they have no upstream dependencies, then their DI registration (Task 5); the Application command builds on the override store (Task 6); config classes (Task 7) precede the Api auth pieces that consume them (Google validator → SessionManager → cookie/handler → controller, Tasks 8–11); Program wiring activates everything (Task 12); the integration harness + tests prove the live flow (Tasks 13–14); the `appsettings.json` placeholder and final verification close it out (Tasks 15–16). Each task compiles, tests green, and commits on its own; the package add (Task 1) is first so every later build has `Google.Apis.Auth` available.

**Conventions check:** file-scoped namespaces, `I`-prefixed interfaces, `Async` suffixes, `_camelCase` `readonly` fields with constructor injection (services before `IOptions`), `is null`/`is not null`, all control statements braced, `var` where obvious, no null-forgiving `!` except on values already proven non-null by a preceding guard (e.g. `session.Email` after the `is null` check; AwesomeAssertions `!` post-`Should().NotBeNull()` matches the existing test style), and unit-test names follow `<Method>_When<Cond>_Should<Result>`.
