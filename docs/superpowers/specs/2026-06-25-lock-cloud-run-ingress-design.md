# Lock Cloud Run ingress to Cloudflare (shared-secret origin gate) — design

**Date:** 2026-06-25
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem & goal

The deployment is **Browser → Cloudflare Pages (SPA) → a Pages Function reverse-proxies
`/api/*` to the Cloud Run API**. Cloud Run is deployed `--allow-unauthenticated`, so its URL
is **directly reachable, bypassing Cloudflare**. PR #105 added `UseForwardedHeaders`
(clears `KnownProxies`/`KnownIPNetworks`, trusts `X-Forwarded-For`) so the rate limiter
partitions by the real client IP behind the proxy. The documented residual risk: a caller
that reaches Cloud Run directly can forge `X-Forwarded-For` to game the rate limiter. The IP
feeds **only** the limiter (never authentication, authorization, or data access), so the
impact ceiling is rate-limit gaming on public-read data — but the proper fix is to ensure
**only the Cloudflare proxy can reach Cloud Run**, after which trusting `X-Forwarded-For` is
sound.

This is the tracked follow-up from the deploy-config design
([`2026-06-21-deploy-config-design.md`](2026-06-21-deploy-config-design.md), "Follow-ups").

**Goal:** add an application-level origin gate — the Cloudflare proxy injects a
high-entropy secret header that the API requires in production — so a request that bypasses
Cloudflare is rejected before it can touch the rate limiter. Land the code/script/docs in a
PR; the **owner** sets the secret on both sides and cuts the release.

## Decisions (from brainstorming, 2026-06-25)

- **Shared-secret header**, not network isolation. The Cloudflare Pages proxy injects
  `X-Origin-Verify: <secret>`; the API requires it when configured. No load balancer, no
  Cloud Armor, no Cloudflare-IP-range maintenance — proportionate for a public-read app
  whose only residual risk is rate-limit gaming. (Network isolation — restricting Cloud Run
  ingress behind an external HTTPS LB + Cloud Armor scoped to Cloudflare IPs — was weighed
  and deferred as heavier infra than this threat model warrants.)
- **Reject with `403 Forbidden`** and a short, non-revealing body (no mention of the
  header/secret). The Cloud Run URL is discoverable anyway (DNS/cert logs), so a
  `404`-to-hide-existence buys little while costing debuggability.
- **Zero-downtime rotation via an accepted *set*.** The API accepts any of a small
  configured set of secrets (normally one). Rotation never produces a 403 window.
- **Enable when configured** (the secret is non-empty), mirroring the repo's
  graceful-degradation pattern (blank `MediatR__LicenseKey` / `ClientId` / `Firestore`
  project → feature off). Local dev and CI set no secret → the gate is dormant → existing
  tests stay green without sending the header.
- **`/health` is always exempt** — the deploy verification curls `GET <cloud-run-url>/health`
  directly on Cloud Run (not through Cloudflare), and it returns no sensitive data.
- **Cloud Run stays `--allow-unauthenticated`.** The application performs the gating; we do
  not move to Cloud Run IAM (that belongs to the deferred network-isolation approach).

## Scope / boundary

- **In (agent, this PR):** the backend gate (logic + middleware + config), the Cloudflare
  proxy header injection, idempotent provisioning additions to `setup-gcp-deploy.ps1`, the
  owner runbook, reference-doc updates, and tests.
- **Out (owner actions, not in this PR):** generating/setting the origin secret in GCP
  Secret Manager (or running the provisioning script), setting the Cloudflare Pages
  `ORIGIN_VERIFY_SECRET` environment variable, and cutting the `vX.Y.Z` release. **No agent
  runs `gcloud`/`wrangler` against the project.**
- **Out (deferred):** network-level ingress isolation (LB + Cloud Armor / Authenticated
  Origin Pulls). Remains a tracked follow-up for if/when the app handles sensitive data.

## Architecture / changes

### Shared constant

The header **name** is not secret and must agree on both sides, so it is a fixed constant —
`X-Origin-Verify` — defined in code on each side (a `const` in the .NET middleware and a
`const` in the proxy helper), **not** configuration. Only the **value** is secret.

### 1. Backend — origin gate

Two units with a clean boundary (security logic vs. HTTP plumbing), both under
`src/backend/FamilyTree.Api/Security/`:

**`OriginVerifier` (pure, unit-testable)**
- Constructed from the configured secrets (`IOptions<OriginVerifyOptions>`).
- `bool IsEnabled` — true iff at least one non-blank secret is configured.
- `bool IsTrusted(string? headerValue)` — returns false for a null/empty header; otherwise
  true iff `headerValue` matches **any** accepted secret. Comparison uses
  `CryptographicOperations.FixedTimeEquals` over UTF-8 bytes, evaluating **all** secrets
  (no early-out) to avoid leaking which/whether one matched. It never logs and never
  exposes a secret. (Callers only consult `IsTrusted` when `IsEnabled` is true.)

**`OriginVerificationMiddleware` (plumbing)**
- Conventional middleware `(RequestDelegate next, OriginVerifier verifier, ILogger<…>)`.
- Logic: if `!verifier.IsEnabled` → `next()`; else if the request path is `/health` →
  `next()`; else if `verifier.IsTrusted(header)` → `next()`; else short-circuit
  **403** with a generic JSON body (e.g. `{ "title": "Forbidden." }`) and a
  **non-identifying** `LogWarning` (no secret, no header value — just that an unverified
  request to `{Path}` was rejected; PII/secret-safe for the CodeQL gate).
- Always registered in the pipeline; it self-disables when no secret is configured, so the
  enable decision lives in one tested place and `Program.cs` stays simple.

**Config** (`AppSettings` + a new options class, mirroring the existing pattern):

```json
{
  "Security": {
    "OriginVerify": {
      "Secrets": []
    }
  }
}
```

- `Security:OriginVerify:Secrets` is a `string[]`, bound from indexed keys
  (`Security__OriginVerify__Secrets__0`, `…__1`, …), each sourced from a Secret-Manager
  secret `origin-verify-<n>` — the same indexed-secret shape as the editor allow-list.
  Blank entries are ignored; empty list ⇒ gate dormant.
- A new `OriginVerifyOptions { IReadOnlyList<string> Secrets }` is mapped in `Program.cs`
  the way `GoogleAuthOptions`/`SessionAuthOptions` are.

**Pipeline placement (`Program.cs`)** — insert the middleware **after** the security-headers
middleware and **before** `app.UseRateLimiter()`:

```
UseForwardedHeaders → UseExceptionHandler → security-headers
  → [OriginVerificationMiddleware]            ← new
  → UseRateLimiter → body-size guard → … → /health, controllers
```

Rationale: an off-Cloudflare caller is rejected **before** the rate limiter, so it can never
reach (let alone game) the limiter — every request that does reach the limiter has passed
the gate, i.e. came through Cloudflare, making PR #105's `X-Forwarded-For` trust sound.
Placing it after the security-headers middleware means the 403 still carries the standard
security headers (the "every response" contract). `/health` is exempted inside the
middleware, so the direct deploy health check still works (it passes the gate and is then
rate-limited like any endpoint — a handful of probe requests, well under the limit).

### 2. Frontend — Cloudflare proxy injects the header

In `src/frontend/src/api/apiProxy.ts`, add an exported helper alongside `buildApiTargetUrl`
and `stripUnsafeUpstreamHeaders`:

```ts
export const ORIGIN_VERIFY_HEADER = 'X-Origin-Verify';

export function applyOriginVerification(headers: Headers, secret: string | undefined): void {
  if (secret && secret.length > 0) {
    headers.set(ORIGIN_VERIFY_HEADER, secret);   // set() overwrites any client-supplied value
  }
}
```

- `Headers.set` **overwrites**, so a client that tries to smuggle its own `X-Origin-Verify`
  through the proxy is harmless — its value is replaced (when configured) or simply
  forwarded-then-rejected by the API (when the proxy has no secret, e.g. an unconfigured
  preview). For defense-in-depth, `x-origin-verify` is also added to the
  `stripUnsafeUpstreamHeaders` strip list so a client value is removed even on the no-secret
  path.
- In `src/frontend/functions/api/[[path]].ts`: add `ORIGIN_VERIFY_SECRET?: string` to the
  `Env` interface and call `applyOriginVerification(upstream.headers, env.ORIGIN_VERIFY_SECRET)`
  after `stripUnsafeUpstreamHeaders(...)`. No-op locally / when unset.

### 3. Rotation (zero-downtime, owner-run)

Documented in the runbook:

1. Create `origin-verify-1` = new secret; bind `Security__OriginVerify__Secrets__1` on Cloud
   Run and deploy a revision. The API now accepts `{old, new}`.
2. Set the Cloudflare Pages `ORIGIN_VERIFY_SECRET` to the new value and redeploy the SPA. The
   proxy now sends `new` (still accepted).
3. Remove the `origin-verify-0` binding and deploy. The API now accepts `{new}` only.

No window in which legitimate proxied requests are rejected.

### 4. Provisioning — `setup-gcp-deploy.ps1` (agent writes, owner runs)

Add an idempotent step mirroring the MediatR/editor-secret steps:

- New param `-OriginVerifySecret` (string, optional). **If omitted, the script generates a
  high-entropy value** (32 random bytes, base64url) — a machine secret, so generation is the
  better UX than asking the owner to invent one.
- Enable `secretmanager.googleapis.com`; create or version `origin-verify-0` from the value;
  grant the runtime SA `roles/secretmanager.secretAccessor`; bind
  `Security__OriginVerify__Secrets__0=origin-verify-0:latest` on the Cloud Run service.
- **Print the value once** with a clear "paste into Cloudflare Pages →
  `ORIGIN_VERIFY_SECRET` (Production), then redeploy the SPA" instruction (the script does
  not set Cloudflare env vars — same as `API_ORIGIN`). Add it to the script's summary's
  "ACTION REQUIRED" Cloudflare block.
- **No `deploy.yml` change** — the Cloud Run secret binding is set once on the service and
  preserved across deploys; the Cloudflare `ORIGIN_VERIFY_SECRET` is a Pages project env var
  read by the Function at runtime (like `API_ORIGIN`).

### 5. Docs (same PR)

- `docs/ci-cd/deploy.md`: an "origin verification" subsection — what the gate does, where the
  secret lives (`origin-verify-0` in Secret Manager + Cloudflare Pages `ORIGIN_VERIFY_SECRET`),
  how to set it (script generates/uses + paste into Cloudflare), the 3-step rotation, and an
  explicit note that **`/health` stays reachable directly on the Cloud Run URL** and that the
  gate is **dormant until configured**.
- `docs/reference/features/backend-api.md`: document the gate (403, `/health` exempt,
  enable-on-configured) and update the rate-limiting note — the `X-Forwarded-For` spoofing
  trade-off is **closed** when the gate is enabled.
- `docs/reference/ci-cd.md`: add the `Security__OriginVerify__Secrets__0` Cloud Run secret
  binding (→ `origin-verify-0`) to the production-config table and the Cloudflare Pages
  `ORIGIN_VERIFY_SECRET` env var to the GitHub/Cloudflare table; note the new proxy header
  injection in the `/api/*` proxy description.
- `docs/reference/roadmap.md`: move "Lock Cloud Run ingress to Cloudflare IPs" from unbuilt
  to implemented, **reworded** — the mechanism is a shared-secret header (app-level), not IP
  ranges; network isolation remains a deferred further follow-up.
- Run the `update-docs-for-pr` skill at PR time.

## Testing

- **Backend unit (`OriginVerifier`):** disabled when no/blank secrets; `IsTrusted` accepts a
  configured secret; accepts any of a configured set; rejects a wrong value, an empty string,
  and `null`/missing.
- **Backend integration (`HardeningTests` / a focused factory):** with the gate configured
  via `UseSetting("Security:OriginVerify:Secrets:0", "<secret>")` — a request **without** the
  header → **403**; with a **wrong** header → **403**; with the **correct** header → **200**
  (normal response); **`/health` reachable without** the header. With the gate **unconfigured**
  (default), the existing suites stay green (they send no header) — an explicit assertion that
  an un-headered `/api/family/graph` is **200** when no secret is set.
- **Frontend unit (`apiProxy.spec.ts`):** `applyOriginVerification` sets the header when the
  secret is non-empty; overwrites a client-supplied value; is a no-op when the secret is
  empty/undefined; and `stripUnsafeUpstreamHeaders` removes a client `x-origin-verify`.
- **Script:** not unit-tested (infra) — validated by review; its idempotent guards and the
  optional-param skip path (matching the existing MediatR/editor handling) are the safety net.

## Out of scope

- Running the provisioning or the release (owner actions).
- Network-level ingress isolation (LB + Cloud Armor / Authenticated Origin Pulls) — deferred.
- Cloud Run IAM (`--no-allow-unauthenticated` + OIDC) — not used; the app gates instead.
- Any change to the auth model, the editor UI, the data model, or the rate-limit policy
  itself (only the gate is added in front of it).

## Risks / notes

- **Secret-only trust.** Security rests on the secret staying secret and on TLS to Cloud Run
  (the header is only as confidential as the transport). The Cloud Run URL stays publicly
  reachable but rejects un-headered requests with 403. This is the accepted trade-off of the
  app-level approach vs. network isolation; the residual it leaves (someone who exfiltrates
  the secret) is far narrower than today's open `X-Forwarded-For` spoof, and is closed by
  rotation.
- **Order of operations.** Until the owner sets the secret on **both** sides, the gate is
  dormant (no secret on the API ⇒ off), so landing this PR changes nothing about the live
  site. If the API secret is set but Cloudflare's is not (misorder), legitimate proxied
  traffic would 403 — the runbook states the order (set Cloudflare's value as part of the
  same change, redeploy the SPA) and `/health` remains a direct, gate-exempt signal to
  diagnose it.
- **No secret in logs.** The middleware logs only a non-identifying rejection outcome; the
  verifier never logs. The provisioning script prints the generated value to the **owner's
  local console** once (so they can paste it into Cloudflare) — application logs never carry
  it, satisfying the CodeQL "exposure of private information" gate.
- **Relationship to PR #105.** This does not change `UseForwardedHeaders`; it makes its
  `X-Forwarded-For` trust sound by guaranteeing all rate-limiter-reaching traffic came
  through Cloudflare. The reference doc's spoofing caveat is updated to "closed when the gate
  is enabled."
