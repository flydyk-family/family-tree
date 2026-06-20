# Google sign-in setup (OAuth client + local dev)

How to set up **Sign in with Google** for this app — the one-time Google Cloud
Console configuration (shared by production and local dev), then the exact
local-dev wiring needed to sign in and exercise an editor action on your machine.

Sign-in uses the **Google Identity Services (GIS) ID-token flow** ("Sign in with
Google"), identity only — no OAuth scopes, no popup, no redirect. The browser gets
a Google **ID token**, posts it to `POST /api/auth/session`, and the backend issues
its own session cookie (`ft_session`). See the auth model in
[`docs/reference/features/backend-api.md`](../reference/features/backend-api.md)
and [`app-shell-and-localization.md`](../reference/features/app-shell-and-localization.md).

> **What's a secret and what isn't.** The **client ID** is public by nature (it ships
> in the SPA bundle and is sent to every browser) — safe to put in env/config. The
> OAuth client's **client secret is not used** by this flow at all (the SPA never
> exchanges a code, and the backend validates the ID token by *audience*, not by
> secret) — you can ignore it. **Editor emails are personal data** — they live only
> in backend config/secrets, never in the public repo.

---

## Part 1 — Google Cloud Console (one-time)

Do this once; the same OAuth client serves production and every local machine.

1. **Project.** Use the family-tree GCP project (or any project you control) at
   <https://console.cloud.google.com>.

2. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - **User type / Audience: External.** (Internal is only available for a Google
     Workspace org and would restrict sign-in to that org; a personal/consumer
     Google account needs **External**.)
   - Fill in app name + a support email + a developer contact email.
   - Keep it in **Testing** mode and add every Google account that will sign in
     under **Test users**. In Testing mode only listed test users (and project
     members) can complete sign-in.
   - Scopes: none beyond the default `openid` / `email` / `profile`. These are
     **non-sensitive**, so there is **no Google app-verification process** — even
     when you later publish to production.

3. **Create the OAuth client** (APIs & Services → Credentials → Create credentials →
   OAuth client ID):
   - **Application type: Web application.**
   - Name it (e.g. "Family tree Web app").
   - **Authorized JavaScript origins** — add the exact origins the app loads from
     (scheme + host + port, **no trailing slash, no path**):
     - Production: `https://family-tree-4fl.pages.dev`
     - Local dev: `http://localhost:5173`, `http://localhost:5174`,
       `http://localhost:5175` (the dev launcher uses the lowest free
       `5173+/5037+` pair — registering a few ports lets several worktrees run; add
       whichever ports you actually use).
   - **Authorized redirect URIs:** none needed — the ID-token flow does not redirect.
   - Create, then **copy the Client ID** (`…apps.googleusercontent.com`).

4. **Propagation.** Origin changes can take **~5 minutes up to a few hours** to
   propagate across Google's edge. Until then GIS may log
   `[GSI_LOGGER]: The given origin is not allowed for the given client ID` and the
   button library may `403` — even though the entry is saved. Wait, then hard-reload.

The **same Client ID** is used by both the frontend (`VITE_GOOGLE_CLIENT_ID`) and the
backend (`Authentication:Google:ClientId`, the token *audience*). They **must match**,
or sign-in token validation fails.

---

## Part 2 — Local dev sign-in

Local dev needs **no Firestore and no credentials file** — the session and override
stores are in-memory (selected automatically when `Firestore:ProjectId` is blank).
You only need to supply the client ID (both sides) and your editor email.

> Run commands from the **repo root**.

### 2a. Backend — client ID + editor allow-list (user-secrets)

The backend validates the ID token's audience against `Authentication:Google:ClientId`
and grants `canEdit` when your email is in `Authentication:Google:Editors[]`. Keep both
out of the repo via .NET user-secrets:

```bash
dotnet user-secrets init --project src/backend/FamilyTree.Api
dotnet user-secrets set "Authentication:Google:ClientId" "<CLIENT_ID>.apps.googleusercontent.com" --project src/backend/FamilyTree.Api
dotnet user-secrets set "Authentication:Google:Editors:0" "<your-google-email>" --project src/backend/FamilyTree.Api
```

- Omit `Editors:0` and you can still sign in, just without the **Editor** badge /
  edit rights.
- Add more editors as `Editors:1`, `Editors:2`, …
- These persist per-user on the machine (`%APPDATA%\Microsoft\UserSecrets`), shared
  across worktrees.

### 2b. Frontend — client ID (`.env.local`)

The SPA reads the client ID from a build-time env var. Create
**`src/frontend/.env.local`**:

```
VITE_GOOGLE_CLIENT_ID=<CLIENT_ID>.apps.googleusercontent.com
```

- Vite reads env files **at startup** — restart the dev server after creating it.
- When the var is **absent**, the sign-in control renders nothing (a deliberate
  no-op) and the app is otherwise unchanged — so a contributor without a client ID
  isn't blocked.
- Note: the repo's `.gitignore` ignores `.env` but **not** `.env.local`. The client
  ID is public so committing it isn't a security problem, but to keep it untracked
  either rely on the `.env` rule (name the file `src/frontend/.env`) or add
  `.env.local` to `.gitignore`.

### 2c. Run the app on a whitelisted port

The frontend origin **must exactly match** an Authorized JavaScript origin from
Part 1. Pin the port so it's stable:

```bash
node scripts/dev.mjs --port 5174 --api-port 5038
```

This launches the API + Vue dev server as a coordinated pair (API on 5038, SPA on
5174, `/api` proxied to the pair's API). Open **http://localhost:5174**.

### 2d. Sign in

1. Click **Sign in with Google** (top-right control row on desktop; inside the ☰
   menu below the responsive breakpoint).
2. Pick your account. In **Testing** mode you'll see an *"unverified app"* screen —
   that's expected; choose **Advanced → continue** (you're a listed test user).
3. You should land back signed in, showing your name and — if your email is in
   `Editors` — the **Editor** badge. Sign out clears it.

The session cookie works over `http://localhost` because localhost is a secure
context (so the `Secure` cookie is accepted) and the dev server proxies `/api`
same-origin.

---

## Part 3 — Validate an editor action (biography edit via curl)

Sign-in only proves identity; this proves the **gated, durable edit** loop end to
end. The edit endpoint (`PUT /api/people/{id}/biography`) is gated by the `CanEdit`
policy, so the request needs your **session cookie** — curl can't do the Google
sign-in, so grab the cookie from the browser after signing in.

1. **Get the cookie.** After signing in at `http://localhost:5174`, open DevTools →
   **Application → Cookies → `http://localhost:5174`** → copy the **`ft_session`**
   value. (It's `HttpOnly`, so it's not readable from the JS console — use the
   Cookies panel.)

2. **PUT the biography** (`id` must match `p-<number>`; body is `{ru, be, en}` with
   at least one non-empty):

   **Git Bash / curl.exe:**
   ```bash
   SESSION='paste-ft_session-value'
   curl -X PUT http://localhost:5038/api/people/p-0001/biography \
     -H "Content-Type: application/json" \
     -b "ft_session=$SESSION" \
     -d '{"en":"A short biography."}'
   ```

   **PowerShell** (PS `curl` is an alias for `Invoke-WebRequest` — use
   `Invoke-RestMethod` or `curl.exe`):
   ```powershell
   $session = "paste-ft_session-value"
   Invoke-RestMethod -Method Put `
     -Uri "http://localhost:5038/api/people/p-0001/biography" `
     -ContentType "application/json" `
     -Headers @{ Cookie = "ft_session=$session" } `
     -Body '{"en":"A short biography."}'
   ```

   A non-editor session returns **403**; no cookie returns **401**. The editor email
   is taken from your session, not the body.

3. **Verify** — the save triggers an immediate snapshot refresh, so a read reflects
   it right away:
   ```bash
   curl http://localhost:5038/api/people/p-0001
   ```
   Pick a real id with `curl http://localhost:5038/api/people` (the seed uses
   `p-0001`, `p-0002`, …). Locally the edit persists in the in-memory override store
   (no Firestore).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **No sign-in button at all** | `VITE_GOOGLE_CLIENT_ID` not loaded → `configured` is false → the control renders nothing. Check the file is `src/frontend/.env.local`, the var name is exact, and you **restarted** the dev server. Quick check in DevTools: `document.querySelector('[data-test="sign-in-control"]')` — `null` means the client ID isn't loaded. |
| **`[GSI_LOGGER]: The given origin is not allowed for the given client ID`** + `403` from `accounts.google.com` | The page origin isn't an Authorized JavaScript origin on the client whose ID is loaded. Confirm the running port (e.g. `http://localhost:5174`) is listed **exactly** on the client matching `VITE_GOOGLE_CLIENT_ID`, then allow for propagation (minutes–hours) and hard-reload. Harmless once propagated; a non-issue in production. |
| **Sign-in popup blocked / "access blocked: app is in testing"** | Your Google account isn't a **Test user** on the consent screen (Part 1, step 2). Add it. |
| **Button appears but sign-in returns 401** | The backend `Authentication:Google:ClientId` doesn't match the frontend `VITE_GOOGLE_CLIENT_ID` (token audience mismatch), or the email isn't verified. Make both client IDs identical. |
| **Signed in but no Editor badge / edits 403** | Your email isn't in `Authentication:Google:Editors[]`. Add it (Part 2a) and sign in again. |
| **Can't find the control on a narrow window** | Below the responsive breakpoint the sign-in control lives inside the ☰ mobile menu, not the desktop row. |

---

## Production

The same OAuth client covers production via the whitelisted
`https://family-tree-4fl.pages.dev` origin. The deployed app additionally needs the
Cloud Run / Pages env vars (`Authentication__Google__ClientId`,
`Authentication__Google__Editors__*`, `Firestore__ProjectId`, and the Pages build
var `VITE_GOOGLE_CLIENT_ID`) — see [`deploy.md`](deploy.md) for the owner deploy
steps. No DB password and no OAuth client secret are needed.
