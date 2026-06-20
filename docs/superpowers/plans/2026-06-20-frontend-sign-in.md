# Frontend Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google sign-in to the Vue SPA so a visitor can sign in, see their identity and an editor badge (when allow-listed), and sign out — talking to the backend auth endpoints that already exist (`POST /api/auth/session`, `GET /api/auth/me`, `POST /api/auth/logout`).

**Architecture:** A new `authStore` (Pinia) holds `{ signedIn, email, name, canEdit }` and delegates to a thin cookie-aware `authApi` client (`credentials: 'include'`). Google Identity Services (GIS, the ID-token credential flow) is wrapped in one small module so components and tests never touch the `window.google` global directly. A `SignInControl` component renders the GIS button when signed out and the identity + sign-out + editor badge when signed in; `AppBar` mounts it. `App.vue` calls `fetchMe()` on load to learn authoritative state from the session cookie.

**Tech Stack:** Vue 3 + TypeScript, Pinia (options-store style), vue-i18n, Vitest + @vue/test-utils, Google Identity Services (`https://accounts.google.com/gsi/client`).

## Global Constraints

- **Scope is sign-in only.** No biography-editing UI, no `PUT /api/people/{id}/biography` call, no resilient-save buffer — those are the immediate follow-up PR. (Confirmed scope decision, 2026-06-20.)
- **Cookie auth, no Authorization header.** Every auth call uses `fetch(..., { credentials: 'include' })`. Public GETs are unchanged. The session is an `HttpOnly` cookie the browser never reads in JS.
- **The Google ID token is used transiently at login only** — never stored in the store, `localStorage`, or anywhere persistent.
- **Never commit secrets or personal data.** The Google **client ID** is public-by-nature and supplied at build time via `VITE_GOOGLE_CLIENT_ID` (Cloudflare Pages env) — it is **not** hard-coded. Editor emails live only in backend config; the frontend never sees the allow-list, only the server-computed `canEdit` boolean.
- **Graceful when unconfigured.** When `VITE_GOOGLE_CLIENT_ID` is absent (typical local dev), the sign-in button renders nothing rather than erroring; `fetchMe()` still runs and resolves to signed-out.
- **i18n parity is enforced** by `src/i18n/messages/messages.spec.ts` — every key path must exist in all three catalogs (`en`, `ru`, `be`). Adding a key to one means adding it to all three.
- **Match existing conventions:** options-store Pinia (see `localeStore.ts`), thin `fetch` client returning parsed bodies (see `familyApi.ts`), `data-test` attributes on interactive elements, scoped SCSS using `var(--token)` design tokens.
- Backend responses are camelCase JSON (`System.Text.Json` default): `{ "email", "name", "canEdit" }`. `GET /api/auth/me` returns `401` when not signed in.

---

### Task 1: Auth API client + types

A thin cookie-aware client over the three auth endpoints, mirroring `familyApi.ts`.

**Files:**
- Create: `src/frontend/src/types/auth.ts`
- Create: `src/frontend/src/api/authApi.ts`
- Test: `src/frontend/src/api/authApi.spec.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `interface AuthUser { email: string; name: string; canEdit: boolean; }` (in `types/auth.ts`)
  - `postSession(idToken: string, baseUrl?: string): Promise<AuthUser>` — `POST /api/auth/session`, body `{ idToken }`, throws on non-ok.
  - `getMe(baseUrl?: string): Promise<AuthUser | null>` — `GET /api/auth/me`; returns `null` on `401`, throws on other non-ok, returns parsed `AuthUser` on `200`.
  - `postLogout(baseUrl?: string): Promise<void>` — `POST /api/auth/logout`; throws on non-ok.
  - All three pass `credentials: 'include'`.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/api/authApi.spec.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { postSession, getMe, postLogout } from './authApi';
import type { AuthUser } from '../types/auth';

const user: AuthUser = { email: 'a@b.com', name: 'Ada', canEdit: true };

afterEach(() => { vi.restoreAllMocks(); });

describe('postSession', () => {
  it('posts the id token with credentials and returns the user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => user });
    vi.stubGlobal('fetch', fetchMock);

    const result = await postSession('tok-123');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken: 'tok-123' })
    });
    expect(result).toEqual(user);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(postSession('bad')).rejects.toThrow('401');
  });
});

describe('getMe', () => {
  it('returns the user on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => user });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMe();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
    expect(result).toEqual(user);
  });

  it('returns null on 401 (anonymous)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await getMe()).toBeNull();
  });

  it('throws on a non-401 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getMe()).rejects.toThrow('500');
  });
});

describe('postLogout', () => {
  it('posts logout with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await postLogout();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  });

  it('throws when logout fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(postLogout()).rejects.toThrow('500');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- authApi`
Expected: FAIL — `Cannot find module './authApi'` / `../types/auth`.

- [ ] **Step 3: Create the types**

Create `src/frontend/src/types/auth.ts`:

```ts
/** The authenticated identity as resolved by the backend session, server-authoritative. */
export interface AuthUser {
  email: string;
  name: string;
  /** True when the email is on the backend editor allow-list. Computed server-side. */
  canEdit: boolean;
}
```

- [ ] **Step 4: Create the client**

Create `src/frontend/src/api/authApi.ts`:

```ts
import type { AuthUser } from '../types/auth';

// All auth calls send the session cookie (`credentials: 'include'`) and never an
// Authorization header; the session is an HttpOnly cookie the browser owns.

export async function postSession(idToken: string, baseUrl = ''): Promise<AuthUser> {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed: ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function getMe(baseUrl = ''): Promise<AuthUser | null> {
  const response = await fetch(`${baseUrl}/api/auth/me`, { credentials: 'include' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load session: ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function postLogout(baseUrl = ''): Promise<void> {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(`Sign-out failed: ${response.status}`);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- authApi`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/types/auth.ts src/frontend/src/api/authApi.ts src/frontend/src/api/authApi.spec.ts
git commit -m "feat(frontend): cookie-aware auth API client"
```

---

### Task 2: authStore (Pinia)

Holds session state and orchestrates sign-in / sign-out / fetch-me via `authApi`.

**Files:**
- Create: `src/frontend/src/stores/authStore.ts`
- Test: `src/frontend/src/stores/authStore.spec.ts`

**Interfaces:**
- Consumes: `postSession`, `getMe`, `postLogout` from `../api/authApi`; `AuthUser` from `../types/auth`.
- Produces: `useAuthStore()` with
  - state: `signedIn: boolean`, `email: string`, `name: string`, `canEdit: boolean`
  - actions: `signIn(idToken: string): Promise<void>`, `signOut(): Promise<void>`, `fetchMe(): Promise<void>`
  - `fetchMe()` is **error-tolerant**: a thrown/network error leaves the store signed-out and does not reject (so app load never breaks on a backend hiccup).

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/stores/authStore.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from './authStore';
import * as authApi from '../api/authApi';

beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { vi.restoreAllMocks(); });

describe('authStore', () => {
  it('starts signed out', () => {
    const store = useAuthStore();
    expect(store.signedIn).toBe(false);
    expect(store.canEdit).toBe(false);
  });

  it('signIn posts the token and stores the identity', async () => {
    vi.spyOn(authApi, 'postSession').mockResolvedValue({ email: 'a@b.com', name: 'Ada', canEdit: true });
    const store = useAuthStore();

    await store.signIn('tok');

    expect(authApi.postSession).toHaveBeenCalledWith('tok');
    expect(store.signedIn).toBe(true);
    expect(store.email).toBe('a@b.com');
    expect(store.name).toBe('Ada');
    expect(store.canEdit).toBe(true);
  });

  it('fetchMe populates state when a session exists', async () => {
    vi.spyOn(authApi, 'getMe').mockResolvedValue({ email: 'c@d.com', name: 'Cy', canEdit: false });
    const store = useAuthStore();

    await store.fetchMe();

    expect(store.signedIn).toBe(true);
    expect(store.name).toBe('Cy');
    expect(store.canEdit).toBe(false);
  });

  it('fetchMe leaves the store signed out when there is no session', async () => {
    vi.spyOn(authApi, 'getMe').mockResolvedValue(null);
    const store = useAuthStore();

    await store.fetchMe();

    expect(store.signedIn).toBe(false);
  });

  it('fetchMe swallows errors and stays signed out', async () => {
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new Error('network'));
    const store = useAuthStore();

    await expect(store.fetchMe()).resolves.toBeUndefined();
    expect(store.signedIn).toBe(false);
  });

  it('signOut clears state and calls the api', async () => {
    vi.spyOn(authApi, 'postSession').mockResolvedValue({ email: 'a@b.com', name: 'Ada', canEdit: true });
    vi.spyOn(authApi, 'postLogout').mockResolvedValue();
    const store = useAuthStore();
    await store.signIn('tok');

    await store.signOut();

    expect(authApi.postLogout).toHaveBeenCalled();
    expect(store.signedIn).toBe(false);
    expect(store.email).toBe('');
    expect(store.canEdit).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- authStore`
Expected: FAIL — `Cannot find module './authStore'`.

- [ ] **Step 3: Implement the store**

Create `src/frontend/src/stores/authStore.ts`:

```ts
import { defineStore } from 'pinia';
import { postSession, getMe, postLogout } from '../api/authApi';
import type { AuthUser } from '../types/auth';

interface AuthState {
  signedIn: boolean;
  email: string;
  name: string;
  canEdit: boolean;
}

function emptyState(): AuthState {
  return { signedIn: false, email: '', name: '', canEdit: false };
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => emptyState(),
  actions: {
    apply(user: AuthUser): void {
      this.signedIn = true;
      this.email = user.email;
      this.name = user.name;
      this.canEdit = user.canEdit;
    },
    reset(): void {
      Object.assign(this, emptyState());
    },
    async signIn(idToken: string): Promise<void> {
      this.apply(await postSession(idToken));
    },
    // Called on app load to learn authoritative state from the session cookie.
    // Tolerant by design: a missing session or a backend blip must not break boot.
    async fetchMe(): Promise<void> {
      try {
        const user = await getMe();
        if (user) {
          this.apply(user);
        } else {
          this.reset();
        }
      } catch {
        this.reset();
      }
    },
    async signOut(): Promise<void> {
      try {
        await postLogout();
      } finally {
        this.reset();
      }
    }
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- authStore`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/authStore.ts src/frontend/src/stores/authStore.spec.ts
git commit -m "feat(frontend): authStore for sign-in/out + fetchMe"
```

---

### Task 3: i18n strings for auth (en / ru / be)

Add the auth label keys to all three catalogs (parity is enforced).

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`
- Modify: `src/frontend/src/i18n/messages/ru.ts`
- Modify: `src/frontend/src/i18n/messages/be.ts`
- Test: `src/frontend/src/i18n/messages/messages.spec.ts` (extend the existing parity test)

**Interfaces:**
- Produces the key paths consumed by `SignInControl.vue` (Task 5): `auth.signIn`, `auth.signOut`, `auth.signedInAs` (interpolates `{name}`), `auth.editorBadge`.

- [ ] **Step 1: Extend the parity test**

In `src/frontend/src/i18n/messages/messages.spec.ts`, add inside the existing `for (const catalog of [en, ru, be])` loop in the `'include the person popup labels'` test (after the last `expect(keys).toContain('nav.layout');`):

```ts
      expect(keys).toContain('auth.signIn');
      expect(keys).toContain('auth.signOut');
      expect(keys).toContain('auth.signedInAs');
      expect(keys).toContain('auth.editorBadge');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix src/frontend test -- messages`
Expected: FAIL — `expected [ ... ] to contain 'auth.signIn'`.

- [ ] **Step 3: Add the `auth` block to each catalog**

In `src/frontend/src/i18n/messages/en.ts`, add this property to the exported object (e.g. after the `theme: { ... }` line):

```ts
  auth: { signIn: 'Sign in', signOut: 'Sign out', signedInAs: 'Signed in as {name}', editorBadge: 'Editor' },
```

In `src/frontend/src/i18n/messages/ru.ts`, add the matching block:

```ts
  auth: { signIn: 'Войти', signOut: 'Выйти', signedInAs: 'Вы вошли как {name}', editorBadge: 'Редактор' },
```

In `src/frontend/src/i18n/messages/be.ts`, add the matching block:

```ts
  auth: { signIn: 'Увайсці', signOut: 'Выйсці', signedInAs: 'Вы ўвайшлі як {name}', editorBadge: 'Рэдактар' },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix src/frontend test -- messages`
Expected: PASS (both the parity test and the label test).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/i18n/messages/
git commit -m "feat(frontend): i18n strings for sign-in (ru/be/en)"
```

---

### Task 4: Google Identity Services wrapper + types + env

One small module isolating the `window.google` global and the GIS `<script>`, plus the type declarations and the `VITE_GOOGLE_CLIENT_ID` env type. This module is the only place that touches GIS; it is excluded from coverage (a thin third-party-global wrapper with no testable branching — the same rationale as `main.ts` being excluded, and the backend `[ExcludeFromCodeCoverage]` on SDK wrappers).

**Files:**
- Create: `src/frontend/src/auth/googleIdentity.ts`
- Create: `src/frontend/src/types/google-accounts.d.ts`
- Modify: `src/frontend/src/env.d.ts`
- Modify: `src/frontend/vite.config.ts` (coverage `exclude` list)

**Interfaces:**
- Consumes: nothing.
- Produces (used by `SignInControl.vue` in Task 5):
  - `interface CredentialResponse { credential: string; }`
  - `loadGisScript(): Promise<void>` — idempotently injects the GIS script, resolves when ready.
  - `initGis(clientId: string, callback: (response: CredentialResponse) => void): void`
  - `renderSignInButton(el: HTMLElement): void`
  - `disableAutoSelect(): void`

- [ ] **Step 1: Add the env type for the client ID**

In `src/frontend/src/env.d.ts`, append:

```ts
interface ImportMetaEnv {
  /** Google OAuth client ID for GIS sign-in. Public by nature; build-time via Pages env. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Declare the GIS global**

Create `src/frontend/src/types/google-accounts.d.ts`:

```ts
// Minimal typings for the Google Identity Services client we use (ID-token flow).
// Only the surface our wrapper calls is declared.
export {};

interface GisIdConfiguration {
  client_id: string;
  callback: (response: { credential: string }) => void;
}

interface GisButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
}

interface GisIdClient {
  initialize(config: GisIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GisButtonOptions): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GisIdClient } };
  }
}
```

- [ ] **Step 3: Implement the wrapper**

Create `src/frontend/src/auth/googleIdentity.ts`:

```ts
// The single home for the Google Identity Services integration. Everything else
// (store, components, tests) depends on these functions, never on window.google,
// so the third-party global is mockable and contained.

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface CredentialResponse {
  credential: string;
}

let scriptPromise: Promise<void> | null = null;

/** Inject the GIS client script once; resolve when it has loaded. */
export function loadGisScript(): Promise<void> {
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function initGis(clientId: string, callback: (response: CredentialResponse) => void): void {
  window.google?.accounts.id.initialize({ client_id: clientId, callback });
}

export function renderSignInButton(el: HTMLElement): void {
  window.google?.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'medium' });
}

export function disableAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect();
}
```

- [ ] **Step 4: Exclude the wrapper from coverage**

In `src/frontend/vite.config.ts`, change the coverage `exclude` array (currently `['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.d.ts']`) to also exclude the GIS wrapper:

```ts
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/auth/googleIdentity.ts', 'src/**/*.d.ts']
```

- [ ] **Step 5: Verify type-check + existing tests still pass**

Run: `npm --prefix src/frontend run build`
Expected: PASS (vue-tsc type-check succeeds — the new `.d.ts`, env augmentation, and wrapper all compile).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/auth/googleIdentity.ts src/frontend/src/types/google-accounts.d.ts src/frontend/src/env.d.ts src/frontend/vite.config.ts
git commit -m "feat(frontend): Google Identity Services wrapper + types"
```

---

### Task 5: SignInControl component

Renders the GIS button when signed out; identity + editor badge + sign-out when signed in. Graceful no-op when no client ID is configured.

**Files:**
- Create: `src/frontend/src/components/SignInControl.vue`
- Test: `src/frontend/src/components/SignInControl.spec.ts`

**Interfaces:**
- Consumes: `useAuthStore` (Task 2); `loadGisScript`, `initGis`, `renderSignInButton`, `disableAutoSelect`, `CredentialResponse` (Task 4); `auth.*` i18n keys (Task 3).
- Produces: a self-contained `<SignInControl />` with `data-test="sign-in-control"`. Signed-out renders `data-test="gis-button"` (the GIS button mount point). Signed-in renders `data-test="sign-in-identity"`, an editor badge `data-test="editor-badge"` when `canEdit`, and a sign-out button `data-test="sign-out"`.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/SignInControl.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SignInControl from './SignInControl.vue';
import { useAuthStore } from '../stores/authStore';
import { i18n } from '../i18n';

// The GIS wrapper touches window.google + injects a script — mock it entirely.
vi.mock('../auth/googleIdentity', () => ({
  loadGisScript: vi.fn().mockResolvedValue(undefined),
  initGis: vi.fn(),
  renderSignInButton: vi.fn(),
  disableAutoSelect: vi.fn()
}));

function mountControl() {
  return mount(SignInControl, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
  i18n.global.locale.value = 'en';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SignInControl', () => {
  it('shows the GIS button mount point when signed out', () => {
    const w = mountControl();
    expect(w.find('[data-test="gis-button"]').exists()).toBe(true);
    expect(w.find('[data-test="sign-in-identity"]').exists()).toBe(false);
  });

  it('shows the identity and a sign-out button when signed in', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    const w = mountControl();
    await w.vm.$nextTick();

    expect(w.find('[data-test="sign-in-identity"]').text()).toContain('Ada');
    expect(w.find('[data-test="sign-out"]').exists()).toBe(true);
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    expect(w.find('[data-test="editor-badge"]').exists()).toBe(false);
  });

  it('shows the editor badge when canEdit', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const w = mountControl();
    await w.vm.$nextTick();

    expect(w.find('[data-test="editor-badge"]').exists()).toBe(true);
  });

  it('calls signOut when the sign-out button is clicked', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const spy = vi.spyOn(store, 'signOut').mockResolvedValue();
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="sign-out"]').trigger('click');

    expect(spy).toHaveBeenCalled();
  });

  it('renders nothing interactive when no client id is configured', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const w = mountControl();
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    expect(w.find('[data-test="sign-out"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- SignInControl`
Expected: FAIL — `Cannot find module './SignInControl.vue'`.

- [ ] **Step 3: Implement the component**

Create `src/frontend/src/components/SignInControl.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/authStore';
import {
  loadGisScript,
  initGis,
  renderSignInButton,
  disableAutoSelect,
  type CredentialResponse
} from '../auth/googleIdentity';

const { t } = useI18n({ useScope: 'global' });
const auth = useAuthStore();

// Public-by-nature client ID, injected at build time. Absent in plain local dev →
// the control renders nothing rather than erroring.
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const configured = computed(() => clientId.length > 0);

const buttonEl = ref<HTMLElement | null>(null);

async function onCredential(response: CredentialResponse): Promise<void> {
  await auth.signIn(response.credential);
}

// Render the GIS button whenever we are signed out and configured. GIS draws into
// the mount element, so (re)render after it exists and after sign-out returns us to it.
async function renderButton(): Promise<void> {
  if (!configured.value || auth.signedIn || !buttonEl.value) {
    return;
  }
  await loadGisScript();
  initGis(clientId, onCredential);
  renderSignInButton(buttonEl.value);
}

async function signOut(): Promise<void> {
  await auth.signOut();
  disableAutoSelect();
}

onMounted(renderButton);
watch(() => auth.signedIn, renderButton);
</script>

<template>
  <div v-if="configured" class="signin" data-test="sign-in-control">
    <template v-if="auth.signedIn">
      <span class="signin__identity" data-test="sign-in-identity">
        {{ t('auth.signedInAs', { name: auth.name || auth.email }) }}
      </span>
      <span v-if="auth.canEdit" class="signin__badge" data-test="editor-badge">{{ t('auth.editorBadge') }}</span>
      <button type="button" class="signin__out" data-test="sign-out" @click="signOut">
        {{ t('auth.signOut') }}
      </button>
    </template>
    <div v-else ref="buttonEl" class="signin__gis" data-test="gis-button" :aria-label="t('auth.signIn')" />
  </div>
</template>

<style scoped lang="scss">
.signin {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
}
.signin__identity {
  font-size: 15px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.signin__badge {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bark);
  color: var(--on-accent);
}
.signin__out {
  font-family: var(--font-display);
  font-size: 15px;
  padding: 6px 12px;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  background: var(--control-grad-top);
  color: var(--ink-soft);
  cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.signin__gis { display: inline-flex; }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- SignInControl`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/SignInControl.vue src/frontend/src/components/SignInControl.spec.ts
git commit -m "feat(frontend): SignInControl (GIS button + identity + editor badge)"
```

---

### Task 6: Mount SignInControl in AppBar

Place the control in the desktop control row and in the mobile menu sheet.

**Files:**
- Modify: `src/frontend/src/components/AppBar.vue`
- Test: `src/frontend/src/components/AppBar.spec.ts` (extend)

**Interfaces:**
- Consumes: `SignInControl` (Task 5).
- Produces: `SignInControl` present in the desktop row and inside the opened mobile sheet.

- [ ] **Step 1: Extend the test**

In `src/frontend/src/components/AppBar.spec.ts`, add these two tests inside the `describe('AppBar', ...)` block:

```ts
  it('renders the sign-in control on desktop', async () => {
    const wrapper = await mountBar();
    expect(wrapper.find('[data-test="sign-in-control-slot"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'SignInControl' }).exists()).toBe(true);
  });

  it('includes the sign-in control in the mobile menu sheet', async () => {
    const w = await mountMobileBar();
    await w.get('[data-test="nav-menu"]').trigger('click');
    const sheet = w.get('[data-test="nav-sheet"]');
    expect(sheet.findComponent({ name: 'SignInControl' }).exists()).toBe(true);
  });
```

Note: `SignInControl` mocks GIS internally only in its own spec; here it mounts for real. Because `VITE_GOOGLE_CLIENT_ID` is unset under Vitest, the control renders nothing visible but the component still mounts — `findComponent` finds it regardless. `mountBar()` unstubs globals, so no GIS script is injected. To make the desktop wrapper assertion robust, wrap the control in a slot element (next step) so the test targets the wrapper, not the conditionally-rendered inner markup.

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix src/frontend test -- AppBar`
Expected: FAIL — `[data-test="sign-in-control-slot"]` not found / `SignInControl` component not found.

- [ ] **Step 3: Wire SignInControl into AppBar**

In `src/frontend/src/components/AppBar.vue`:

3a. Add the import after the other component imports (after `import ThemeToggle from './ThemeToggle.vue';`):

```ts
import SignInControl from './SignInControl.vue';
```

3b. In the desktop row, add a wrapped control after `<ThemeToggle />` (inside `.app-bar__row--desktop`, before the closing `</div>`):

```html
      <span class="app-bar__signin" data-test="sign-in-control-slot"><SignInControl /></span>
```

3c. In the mobile sheet, add a new group after the theme group (after the `</div>` that closes the `theme.label` group, before the sheet's closing `</div>`):

```html
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('auth.signIn') }}</span>
            <SignInControl />
          </div>
```

3d. Add a style rule in the `<style scoped>` block (e.g. after `.app-bar__spacer { flex: 1 1 auto; }`):

```scss
.app-bar__signin { flex: 0 0 auto; display: inline-flex; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix src/frontend test -- AppBar`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts
git commit -m "feat(frontend): mount SignInControl in the app bar (desktop + mobile)"
```

---

### Task 7: Fetch session state on app load

Call `authStore.fetchMe()` once when the app mounts so a returning editor's session is reflected immediately.

**Files:**
- Modify: `src/frontend/src/App.vue`
- Test: `src/frontend/src/App.spec.ts` (create if absent; otherwise extend)

**Interfaces:**
- Consumes: `useAuthStore` (Task 2).
- Produces: no new exports — a behavior (`fetchMe` called on mount).

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/App.spec.ts` (if it already exists, add the `it(...)` case to it):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { i18n } from './i18n';
import { useAuthStore } from './stores/authStore';

const stub = { template: '<div />' };

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'tree', component: stub }]
  });
}

beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { vi.restoreAllMocks(); });

describe('App', () => {
  it('fetches the current session on mount', async () => {
    const store = useAuthStore();
    const spy = vi.spyOn(store, 'fetchMe').mockResolvedValue();
    const router = makeRouter();
    await router.push('/');
    await router.isReady();

    mount(App, {
      global: {
        plugins: [i18n, router],
        stubs: { AppFrame: { template: '<div><slot /></div>' }, AppBar: stub, AppVersion: stub }
      }
    });

    expect(spy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix src/frontend test -- App.spec`
Expected: FAIL — `fetchMe` not called (`expected "spy" to be called once`).

- [ ] **Step 3: Call fetchMe on mount**

In `src/frontend/src/App.vue`, update the `<script setup>`:

3a. Add the import after `import { useUiStore } from './stores/uiStore';`:

```ts
import { useAuthStore } from './stores/authStore';
```

3b. Add the store + mount call alongside the existing `ui` lines:

```ts
const auth = useAuthStore();
onMounted(() => {
  ui.init();
  // Fire-and-forget; fetchMe is error-tolerant and never rejects.
  void auth.fetchMe();
});
```

Replace the existing `onMounted(() => ui.init());` line with the combined block above (do not leave two `onMounted` calls that both init `ui`).

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix src/frontend test -- App.spec`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite + build**

Run: `npm --prefix src/frontend test`
Expected: PASS (all suites green).

Run: `npm --prefix src/frontend run build`
Expected: PASS (type-check + production build).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/App.vue src/frontend/src/App.spec.ts
git commit -m "feat(frontend): fetch session state on app load"
```

---

### Task 8: Documentation

Document the observable sign-in behavior in the reference docs and update the roadmap. (Run the `update-docs-for-pr` skill at PR time; this task captures the known doc deltas.)

**Files:**
- Modify: `docs/reference/` — the frontend/UX behavior reference and the auth reference (find the right files; see Step 1).
- Modify: `docs/reference/roadmap.md` (or equivalent) — move "frontend sign-in UI" from roadmap to shipped; note the **biography editor UI is still pending** (next PR).
- Consider: root `README.md` / `CLAUDE.md` overview line that says "frontend sign-in UI is a later PR" — update to reflect that sign-in now exists (editing UI still pending).

**Interfaces:** none (docs only).

- [ ] **Step 1: Locate the relevant docs**

Run: `npm --prefix src/frontend run build` is not needed here. Instead inspect:

```bash
ls docs/reference
grep -rln "sign-in\|Google sign\|canEdit\|editor allow-list\|later PR" docs/reference README.md CLAUDE.md
```

Identify the frontend/UX reference page, the auth reference page, and the roadmap/technical-debt pages.

- [ ] **Step 2: Document the sign-in UX**

In the frontend/UX reference, add a short section describing: the sign-in control in the app bar (desktop row + mobile sheet); Google ID-token sign-in → server session cookie; the signed-in identity display and the **Editor** badge shown when `canEdit`; sign-out; and that public viewing is unchanged. State that the frontend never sees the editor allow-list — only the server-computed `canEdit`. Note the **graceful no-op when `VITE_GOOGLE_CLIENT_ID` is unset** (local dev). Note that the **biography editing UI is not in this release** (next PR).

- [ ] **Step 3: Update the roadmap / overview**

Move "frontend sign-in UI" to delivered. Keep "editor biography editing UI" as the next item. Update the `CLAUDE.md` overview sentence "frontend sign-in UI is a later PR" → sign-in UI exists; editing UI is the remaining frontend piece.

- [ ] **Step 4: Commit**

```bash
git add docs/ README.md CLAUDE.md
git commit -m "docs: document the frontend sign-in UI"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** This plan covers the spec's section 3 (Frontend — sign-in UI) **minus** the biography editor / resilient save, which were explicitly de-scoped to the next PR (decision 2026-06-20). The `authStore` actions, AppBar sign-in/out + editor badge, cookie-aware client (`credentials: 'include'`), `fetchMe` on load, and ru/be/en i18n are all present. The proxy note ("revisit Authorization when auth is added") in `functions/api/[[path]].ts` is **left as-is** — the proxy already forwards `Cookie`/`Set-Cookie` verbatim and cookie auth needs no change there; updating that comment belongs with the deploy PR (PR-d) and is out of scope here.
- **Verification reminder:** after Task 7, run the app end-to-end (`node scripts/dev.mjs` on a non-default port) and, if a real `VITE_GOOGLE_CLIENT_ID` is available, confirm the GIS button renders and a sign-in round-trips to `/api/auth/me`. Without a client ID the control is a deliberate no-op — verify it renders nothing and the app is otherwise unchanged.
- **No secrets:** no client ID, email, or token is committed anywhere in this plan's diffs.
