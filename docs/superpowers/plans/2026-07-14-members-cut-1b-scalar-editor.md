# Members Cut 1b — Scalar-Field Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in editor correct a person's scalar fields (names ×3 locales, sex, birth/death year, vocation) from the Members dossier, driving the already-shipped `PUT /api/people/{id}/profile` endpoint.

**Architecture:** Frontend-only cut — the backend (override store, snapshot merge, endpoint, validation) shipped in cut 1a. A new `MemberFieldsEditor.vue` (invoked from `MemberDetail` behind an Edit toggle) copies `BiographyEditor`'s resilient-save state machine. The save payload is `current override ∪ user edits` (only changed fields/locales become overrides; untouched fields keep inheriting the `family.json` seed), computed by a pure, unit-tested helper. After save: patch display fields into `familyStore` in place, refetch the graph only when birth year changed (so the oak re-lays-out), and recompute the friendly slug.

**Tech Stack:** Vue 3 + TypeScript + Pinia + vue-router + vue-i18n; Vitest + @vue/test-utils for tests.

## Global Constraints

- **No new backend work.** `GET /api/people/{id}/profile` (returns `PersonProfileDto`, all-null when no override) and `PUT /api/people/{id}/profile` (returns the merged `PersonDto`, `[Authorize(Policy="CanEdit")]`) already exist. Do not modify `src/backend/`.
- **No writes to `family.json`.** Edits persist only through the override layer via the endpoint.
- **Theme-aware.** Use SCSS design tokens (`var(--gilt)`, `var(--gilt-light)`, `var(--gilt-deep)`, `var(--ink)`, `var(--ink-soft)`, `var(--field-bg)`, `var(--surface-card)`, `var(--umber)`, `var(--leaf-deep)`, `var(--on-accent)`, `var(--shadow)`). **Never hardcode a gold hex/rgba** — the Film theme remaps the gilt tokens to grey. Verify in both themes.
- **Localized.** Every user-facing string is an i18n key present in **all three** catalogs (`src/frontend/src/i18n/messages/{ru,be,en}.ts`); a catalog-parity test fails otherwise.
- **Only changed fields override** (supersedes the eng-review "submit the complete set"): payload = `{ ...currentOverride, ...userEdits }`, per-field and per-locale. Revert-to-seed submits `null` for a field.
- **Enum values (exact):** sex = `male | female | unknown`; vocation = `teacher | church | writer | office | other | unknown`. i18n keys `sex.<value>` and `vocation.<value>` already exist for all three locales.
- **Wire shape is camelCase.** `PersonProfileDto` serializes as `{ givenName, surname, maidenName, sex, birthYear, deathYear, vocation }` with `LocalizedText = { ru, be, en }` (nullable strings). The 400 validation body is `{ title, errors: [{ propertyName, errorMessage }] }`.
- **Run frontend commands from `src/frontend/`.** Tests: `npm test -- --run <path>`; type-check/build: `npm run build`.

---

## File Structure

- **Create** `src/frontend/src/api/profileApi.ts` — `PersonProfile` type, `ProfileSaveError`, `getProfile`, `putProfile`. HTTP boundary only.
- **Create** `src/frontend/src/composables/profileDraft.ts` — pure draft/payload logic: `ProfileDraft`, `ProfileField`, `seedDraft`, `isOverridden`, `buildProfilePayload`. No Vue, no I/O.
- **Modify** `src/frontend/src/stores/familyStore.ts` — add `applyPersonProfile(id, patch)` action (in-place summary patch mirroring the backend merge).
- **Create** `src/frontend/src/components/MemberFieldsEditor.vue` — the editor UI. Consumes the three above.
- **Modify** `src/frontend/src/components/MemberDetail.vue` — Edit toggle (behind `canEdit`), render the editor over the field tablets, and the `onSaved` orchestration (store sync + refetch-on-birth-year + slug recompute).
- **Modify** `src/frontend/src/i18n/messages/{ru,be,en}.ts` — add `members.editProfile`, `members.revert`, `members.revertHint`, `members.cancelEdit` (each in Tasks 4/5).
- **Test files** colocated: `profileApi.spec.ts`, `profileDraft.spec.ts`, `MemberFieldsEditor.spec.ts`; extend `familyStore.spec.ts`, `MemberDetail.spec.ts`.

---

### Task 1: Profile API client (`profileApi.ts`)

**Files:**
- Create: `src/frontend/src/api/profileApi.ts`
- Test: `src/frontend/src/api/profileApi.spec.ts`

**Interfaces:**
- Consumes: `LocalizedText`, `PersonDetail` from `../types/family`.
- Produces:
  - `interface PersonProfile { givenName: LocalizedText | null; surname: LocalizedText | null; maidenName: LocalizedText | null; sex: string | null; birthYear: number | null; deathYear: number | null; vocation: string | null; }`
  - `interface ProfileFieldError { propertyName: string; errorMessage: string; }`
  - `class ProfileSaveError extends Error { status: number; fieldErrors: ProfileFieldError[]; }`
  - `getProfile(personId: string, baseUrl?: string): Promise<PersonProfile>`
  - `putProfile(personId: string, profile: PersonProfile, baseUrl?: string): Promise<PersonDetail>`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/api/profileApi.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from './profileApi';

const emptyProfile: PersonProfile = {
  givenName: null, surname: null, maidenName: null, sex: null, birthYear: null, deathYear: null, vocation: null
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('profileApi', () => {
  it('getProfile GETs the profile endpoint and returns the parsed body', async () => {
    const body: PersonProfile = { ...emptyProfile, birthYear: 1901 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
    const result = await getProfile('p-1');
    expect(fetch).toHaveBeenCalledWith('/api/people/p-1/profile', expect.objectContaining({ credentials: 'include' }));
    expect(result).toEqual(body);
  });

  it('getProfile throws on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 404));
    await expect(getProfile('p-9')).rejects.toThrow();
  });

  it('putProfile PUTs the payload as JSON and returns the updated detail', async () => {
    const detail = { id: 'p-1', birth: { year: 1902 } };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(detail));
    const payload: PersonProfile = { ...emptyProfile, birthYear: 1902 };
    const result = await putProfile('p-1', payload);
    expect(fetch).toHaveBeenCalledWith('/api/people/p-1/profile', expect.objectContaining({
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    expect(result).toEqual(detail);
  });

  it('putProfile throws a ProfileSaveError carrying parsed field errors on 400', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(
      { title: 'Validation failed', errors: [{ propertyName: 'Profile.BirthYear', errorMessage: 'out of range' }] },
      false, 400
    ));
    await expect(putProfile('p-1', emptyProfile)).rejects.toMatchObject({
      status: 400,
      fieldErrors: [{ propertyName: 'Profile.BirthYear', errorMessage: 'out of range' }]
    });
  });

  it('putProfile throws a ProfileSaveError with empty fieldErrors on non-400 failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 403));
    await expect(putProfile('p-1', emptyProfile)).rejects.toBeInstanceOf(ProfileSaveError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/api/profileApi.spec.ts`
Expected: FAIL — cannot resolve `./profileApi`.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/api/profileApi.ts`:

```ts
import type { LocalizedText, PersonDetail } from '../types/family';

/** Wire shape of PersonProfileDto: the editable scalar override, each field nullable
 *  (null = inherit the family.json seed). */
export interface PersonProfile {
  givenName: LocalizedText | null;
  surname: LocalizedText | null;
  maidenName: LocalizedText | null;
  sex: string | null;
  birthYear: number | null;
  deathYear: number | null;
  vocation: string | null;
}

export interface ProfileFieldError {
  propertyName: string;
  errorMessage: string;
}

/** Thrown by putProfile on a non-OK response. On a 400 it carries the handler's
 *  per-field validation messages so the editor can show them inline. */
export class ProfileSaveError extends Error {
  constructor(readonly status: number, readonly fieldErrors: ProfileFieldError[]) {
    super(`Failed to save profile: ${status}`);
    this.name = 'ProfileSaveError';
  }
}

export async function getProfile(personId: string, baseUrl = ''): Promise<PersonProfile> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/profile`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to load profile: ${response.status}`);
  }
  return (await response.json()) as PersonProfile;
}

export async function putProfile(personId: string, profile: PersonProfile, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/profile`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
  if (!response.ok) {
    let fieldErrors: ProfileFieldError[] = [];
    if (response.status === 400) {
      try {
        const body = await response.json();
        if (Array.isArray(body?.errors)) {
          fieldErrors = body.errors as ProfileFieldError[];
        }
      } catch {
        // body not JSON — leave fieldErrors empty
      }
    }
    throw new ProfileSaveError(response.status, fieldErrors);
  }
  return (await response.json()) as PersonDetail;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/api/profileApi.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/api/profileApi.ts src/frontend/src/api/profileApi.spec.ts
git commit -m "feat(members): add profile API client for cut 1b editor"
```

---

### Task 2: Pure draft/payload logic (`profileDraft.ts`)

**Files:**
- Create: `src/frontend/src/composables/profileDraft.ts`
- Test: `src/frontend/src/composables/profileDraft.spec.ts`

**Interfaces:**
- Consumes: `LocalizedText`, `PersonDetail` from `../types/family`; `PersonProfile` from `../api/profileApi`.
- Produces:
  - `type ProfileField = 'givenName' | 'surname' | 'maidenName' | 'sex' | 'birthYear' | 'deathYear' | 'vocation'`
  - `const NAME_FIELDS: readonly ['givenName','surname','maidenName']`
  - `interface ProfileDraft { givenName: LocalizedText; surname: LocalizedText; maidenName: LocalizedText; sex: string; birthYear: number | null; deathYear: number | null; vocation: string; }` (name locales are `''` for empty, never null)
  - `seedDraft(detail: PersonDetail): ProfileDraft` — fresh independent object each call
  - `isOverridden(base: PersonProfile, field: ProfileField): boolean`
  - `buildProfilePayload(base: PersonProfile, draft: ProfileDraft, original: ProfileDraft, reverted: ReadonlySet<ProfileField>): PersonProfile`

**Payload rules** (per field): if `reverted` → `null`; else if unchanged from `original` → keep `base[field]` (preserve existing override or null); else the user's value. For name fields, computed per-locale: start from `base[field]`, overlay only the locales that changed, and if the result has no non-empty locale, collapse to `null` (inherit seed) — so blanking a name never sends a provided-but-all-blank object.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/composables/profileDraft.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedDraft, isOverridden, buildProfilePayload, type ProfileDraft } from './profileDraft';
import type { PersonProfile } from '../api/profileApi';
import type { PersonDetail } from '../types/family';

function detail(over: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null,
    sex: 'female',
    birth: { year: 1901, month: null, day: null, approx: false, place: null },
    death: { year: 1980, month: null, day: null, approx: false, place: null },
    vocation: 'teacher', summary: null, biography: null,
    portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...over
  } as PersonDetail;
}

const emptyBase: PersonProfile = {
  givenName: null, surname: null, maidenName: null, sex: null, birthYear: null, deathYear: null, vocation: null
};

function clone(d: ProfileDraft): ProfileDraft {
  return JSON.parse(JSON.stringify(d));
}

describe('seedDraft', () => {
  it('seeds effective values, empty string for missing name locales', () => {
    const d = seedDraft(detail({ maidenName: null }));
    expect(d.givenName).toEqual({ ru: 'Анна', be: 'Ганна', en: 'Anna' });
    expect(d.maidenName).toEqual({ ru: '', be: '', en: '' });
    expect(d.sex).toBe('female');
    expect(d.birthYear).toBe(1901);
    expect(d.deathYear).toBe(1980);
    expect(d.vocation).toBe('teacher');
  });

  it('returns an independent object each call', () => {
    const a = seedDraft(detail());
    const b = seedDraft(detail());
    a.givenName.ru = 'changed';
    expect(b.givenName.ru).toBe('Анна');
  });
});

describe('isOverridden', () => {
  it('is true when a scalar override is present', () => {
    expect(isOverridden({ ...emptyBase, birthYear: 1901 }, 'birthYear')).toBe(true);
    expect(isOverridden(emptyBase, 'birthYear')).toBe(false);
  });
  it('is true when any name locale is overridden', () => {
    expect(isOverridden({ ...emptyBase, surname: { ru: null, be: null, en: 'X' } }, 'surname')).toBe(true);
    expect(isOverridden({ ...emptyBase, surname: { ru: null, be: null, en: null } }, 'surname')).toBe(false);
  });
});

describe('buildProfilePayload', () => {
  it('untouched non-overridden fields stay null (inherit seed)', () => {
    const d = seedDraft(detail());
    const payload = buildProfilePayload(emptyBase, d, clone(d), new Set());
    expect(payload).toEqual(emptyBase);
  });

  it('preserves an existing override the user did not touch', () => {
    const base: PersonProfile = { ...emptyBase, vocation: 'writer' };
    const d = seedDraft(detail({ vocation: 'writer' }));
    const payload = buildProfilePayload(base, d, clone(d), new Set());
    expect(payload.vocation).toBe('writer');
  });

  it('a changed scalar becomes an override', () => {
    const d = seedDraft(detail());
    const orig = clone(d);
    d.birthYear = 1902;
    const payload = buildProfilePayload(emptyBase, d, orig, new Set());
    expect(payload.birthYear).toBe(1902);
  });

  it('clearing a year sends null (inherit seed)', () => {
    const base: PersonProfile = { ...emptyBase, deathYear: 1980 };
    const d = seedDraft(detail());
    const orig = clone(d);
    d.deathYear = null;
    const payload = buildProfilePayload(base, d, orig, new Set());
    expect(payload.deathYear).toBeNull();
  });

  it('a reverted field sends null even if a value is shown', () => {
    const base: PersonProfile = { ...emptyBase, sex: 'female' };
    const d = seedDraft(detail());
    const payload = buildProfilePayload(base, d, clone(d), new Set(['sex']));
    expect(payload.sex).toBeNull();
  });

  it('editing one name locale overrides only that locale, preserving others', () => {
    const base: PersonProfile = { ...emptyBase, surname: { ru: 'Овр', be: null, en: null } };
    const d = seedDraft(detail({ surname: { ru: 'Овр', be: 'Тэст', en: 'Test' } }));
    const orig = clone(d);
    d.surname.en = 'Edited';
    const payload = buildProfilePayload(base, d, orig, new Set());
    // ru override preserved, en newly overridden, be untouched → stays null (inherit seed)
    expect(payload.surname).toEqual({ ru: 'Овр', be: null, en: 'Edited' });
  });

  it('blanking every name locale collapses to null (inherit seed), not a provided-blank object', () => {
    const base: PersonProfile = { ...emptyBase, maidenName: { ru: 'Новак', be: null, en: null } };
    const d = seedDraft(detail({ maidenName: { ru: 'Новак', be: null, en: null } }));
    const orig = clone(d);
    d.maidenName.ru = '';
    const payload = buildProfilePayload(base, d, orig, new Set());
    expect(payload.maidenName).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/composables/profileDraft.spec.ts`
Expected: FAIL — cannot resolve `./profileDraft`.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/composables/profileDraft.ts`:

```ts
import type { LocalizedText, PersonDetail } from '../types/family';
import type { PersonProfile } from '../api/profileApi';

export type ProfileField =
  | 'givenName' | 'surname' | 'maidenName' | 'sex' | 'birthYear' | 'deathYear' | 'vocation';

export const NAME_FIELDS = ['givenName', 'surname', 'maidenName'] as const;
type NameField = (typeof NAME_FIELDS)[number];
const LOCALES = ['ru', 'be', 'en'] as const;

/** Editable buffer: name locales are '' (never null) so they bind cleanly to inputs. */
export interface ProfileDraft {
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText;
  sex: string;
  birthYear: number | null;
  deathYear: number | null;
  vocation: string;
}

function seedName(text: LocalizedText | null): LocalizedText {
  return { ru: text?.ru ?? '', be: text?.be ?? '', en: text?.en ?? '' };
}

export function seedDraft(detail: PersonDetail): ProfileDraft {
  return {
    givenName: seedName(detail.givenName),
    surname: seedName(detail.surname),
    maidenName: seedName(detail.maidenName),
    sex: detail.sex,
    birthYear: detail.birth?.year ?? null,
    deathYear: detail.death?.year ?? null,
    vocation: detail.vocation
  };
}

function isNameField(field: ProfileField): field is NameField {
  return (NAME_FIELDS as readonly string[]).includes(field);
}

export function isOverridden(base: PersonProfile, field: ProfileField): boolean {
  const value = base[field];
  if (value === null || value === undefined) {
    return false;
  }
  if (isNameField(field)) {
    const text = value as LocalizedText;
    return LOCALES.some(l => (text[l] ?? '') !== '');
  }
  return true;
}

// Overlay the changed locales of a name field onto its current override base.
function buildName(
  baseText: LocalizedText | null,
  draft: LocalizedText,
  original: LocalizedText
): LocalizedText | null {
  const result: LocalizedText = {
    ru: baseText?.ru ?? null,
    be: baseText?.be ?? null,
    en: baseText?.en ?? null
  };
  let touched = false;
  for (const l of LOCALES) {
    if (draft[l] !== original[l]) {
      touched = true;
      result[l] = (draft[l] ?? '').trim() || null;
    }
  }
  if (!touched) {
    return baseText ?? null;
  }
  const anyValue = LOCALES.some(l => (result[l] ?? '') !== '');
  return anyValue ? result : null;
}

export function buildProfilePayload(
  base: PersonProfile,
  draft: ProfileDraft,
  original: ProfileDraft,
  reverted: ReadonlySet<ProfileField>
): PersonProfile {
  const scalar = <T>(field: ProfileField, draftValue: T, originalValue: T, baseValue: T | null): T | null => {
    if (reverted.has(field)) {
      return null;
    }
    if (draftValue === originalValue) {
      return baseValue ?? null;
    }
    return draftValue;
  };

  const name = (field: NameField): LocalizedText | null => {
    if (reverted.has(field)) {
      return null;
    }
    return buildName(base[field], draft[field], original[field]);
  };

  return {
    givenName: name('givenName'),
    surname: name('surname'),
    maidenName: name('maidenName'),
    sex: scalar('sex', draft.sex, original.sex, base.sex),
    birthYear: scalar('birthYear', draft.birthYear, original.birthYear, base.birthYear),
    deathYear: scalar('deathYear', draft.deathYear, original.deathYear, base.deathYear),
    vocation: scalar('vocation', draft.vocation, original.vocation, base.vocation)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/composables/profileDraft.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/profileDraft.ts src/frontend/src/composables/profileDraft.spec.ts
git commit -m "feat(members): pure profile-draft payload builder (override union edits)"
```

---

### Task 3: `familyStore.applyPersonProfile` action

**Files:**
- Modify: `src/frontend/src/stores/familyStore.ts`
- Test: `src/frontend/src/stores/familyStore.spec.ts` (extend)

**Interfaces:**
- Consumes: `LocalizedText` from `../types/family`.
- Produces: `applyPersonProfile(id: string, patch: { givenName: LocalizedText; surname: LocalizedText; maidenName: LocalizedText | null; sex: string; vocation: string; birthYear: number | null; deathYear: number | null }): void` — patches the matching `PersonSummary` in place; no-op if the id is absent. Mirrors the backend merge so the store can't drift from the graph without a refetch.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/stores/familyStore.spec.ts` (inside the top-level `describe`):

```ts
  it('applyPersonProfile patches the matching summary in place', () => {
    const store = useFamilyStore();
    store.$patch({ people: [{
      id: 'p-1', givenName: { ru: 'A', be: 'A', en: 'A' }, surname: { ru: 'S', be: 'S', en: 'S' },
      maidenName: null, sex: 'unknown', birthYear: 1900, deathYear: null, vocation: 'unknown',
      portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false
    }] });

    store.applyPersonProfile('p-1', {
      givenName: { ru: 'Б', be: 'Б', en: 'B' }, surname: { ru: 'S', be: 'S', en: 'S' },
      maidenName: { ru: 'M', be: null, en: null }, sex: 'male', vocation: 'writer',
      birthYear: 1902, deathYear: 1980
    });

    const p = store.personById('p-1')!;
    expect(p.givenName.en).toBe('B');
    expect(p.maidenName).toEqual({ ru: 'M', be: null, en: null });
    expect(p.sex).toBe('male');
    expect(p.vocation).toBe('writer');
    expect(p.birthYear).toBe(1902);
    expect(p.deathYear).toBe(1980);
  });

  it('applyPersonProfile is a no-op for an unknown id', () => {
    const store = useFamilyStore();
    expect(() => store.applyPersonProfile('p-x', {
      givenName: { ru: 'A', be: 'A', en: 'A' }, surname: { ru: 'S', be: 'S', en: 'S' },
      maidenName: null, sex: 'male', vocation: 'other', birthYear: 1900, deathYear: null
    })).not.toThrow();
  });
```

(If `familyStore.spec.ts` does not already import `useFamilyStore` + set up Pinia, mirror the existing setup in that file. It does today.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/stores/familyStore.spec.ts`
Expected: FAIL — `applyPersonProfile is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/src/stores/familyStore.ts`, add the `LocalizedText` import and a new action after `applyPersonMedia`:

```ts
    /**
     * Patch one person's editable scalar fields in place after a profile save, so the roster
     * and tree medallion reflect the edit without a full refetch. Mirrors the backend merge;
     * the caller still refetches the graph when a layout-affecting field (birth year) changed.
     */
    applyPersonProfile(id: string, patch: {
      givenName: LocalizedText;
      surname: LocalizedText;
      maidenName: LocalizedText | null;
      sex: string;
      vocation: string;
      birthYear: number | null;
      deathYear: number | null;
    }): void {
      const person = this.people.find(p => p.id === id);
      if (person) {
        person.givenName = patch.givenName;
        person.surname = patch.surname;
        person.maidenName = patch.maidenName;
        person.sex = patch.sex;
        person.vocation = patch.vocation;
        person.birthYear = patch.birthYear;
        person.deathYear = patch.deathYear;
      }
    }
```

Update the import at the top of the file:

```ts
import type { LocalizedText, PersonSummary, Union } from '../types/family';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/stores/familyStore.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/familyStore.ts src/frontend/src/stores/familyStore.spec.ts
git commit -m "feat(members): familyStore.applyPersonProfile in-place patch"
```

---

### Task 4: `MemberFieldsEditor.vue` component

**Files:**
- Create: `src/frontend/src/components/MemberFieldsEditor.vue`
- Modify: `src/frontend/src/i18n/messages/{ru,be,en}.ts`
- Test: `src/frontend/src/components/MemberFieldsEditor.spec.ts`

**Interfaces:**
- Consumes: `getProfile`, `putProfile`, `ProfileSaveError`, `PersonProfile` (Task 1); `seedDraft`, `buildProfilePayload`, `isOverridden`, `ProfileDraft`, `ProfileField` (Task 2); `PersonDetail`, `LocalizedText` (`../types/family`); `LOCALE_OPTIONS`, `Locale` (`../constants/locales`); `VocationIcon.vue`.
- Produces: `<MemberFieldsEditor :person-id="string" :detail="PersonDetail" @saved="(detail: PersonDetail) => void" @cancel="() => void" />`.

- [ ] **Step 1: Add i18n keys (all three locales)**

In `src/frontend/src/i18n/messages/en.ts`, inside the `members` object (next to `backToList`):

```ts
    editProfile: 'Edit details',
    cancelEdit: 'Cancel',
    revert: 'Reset to seed',
    revertHint: 'Will reset to the original value on save',
```

In `src/frontend/src/i18n/messages/ru.ts`, inside `members`:

```ts
    editProfile: 'Редактировать',
    cancelEdit: 'Отмена',
    revert: 'Сбросить',
    revertHint: 'При сохранении вернётся к исходному значению',
```

In `src/frontend/src/i18n/messages/be.ts`, inside `members`:

```ts
    editProfile: 'Рэдагаваць',
    cancelEdit: 'Адмена',
    revert: 'Скінуць',
    revertHint: 'Пры захаванні вернецца да зыходнага значэння',
```

- [ ] **Step 2: Write the failing test**

Create `src/frontend/src/components/MemberFieldsEditor.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import type { PersonDetail } from '../types/family';

vi.mock('../api/profileApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/profileApi')>();
  return { ...actual, getProfile: vi.fn(), putProfile: vi.fn() };
});
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from '../api/profileApi';
import MemberFieldsEditor from './MemberFieldsEditor.vue';

const emptyProfile: PersonProfile = {
  givenName: null, surname: null, maidenName: null, sex: null, birthYear: null, deathYear: null, vocation: null
};

function detail(over: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, sex: 'female',
    birth: { year: 1901, month: null, day: null, approx: false, place: null },
    death: { year: 1980, month: null, day: null, approx: false, place: null },
    vocation: 'teacher', summary: null, biography: null,
    portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...over
  } as PersonDetail;
}

async function mountEditor(base: PersonProfile = emptyProfile, d = detail()) {
  vi.mocked(getProfile).mockResolvedValue(base);
  const wrapper = mount(MemberFieldsEditor, {
    props: { personId: d.id, detail: d },
    global: { plugins: [i18n] }
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(getProfile).mockReset();
  vi.mocked(putProfile).mockReset();
});

describe('MemberFieldsEditor', () => {
  it('seeds inputs from the effective detail', async () => {
    const wrapper = await mountEditor();
    expect((wrapper.get('[data-test="field-birthYear"]').element as HTMLInputElement).value).toBe('1901');
    expect((wrapper.get('[data-test="field-sex"]').element as HTMLSelectElement).value).toBe('female');
  });

  it('Save is disabled until a field is dirty', async () => {
    const wrapper = await mountEditor();
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('builds the payload from override ∪ edits and emits saved on success', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail({ birth: { year: 1902, month: null, day: null, approx: false, place: null } }));
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({ birthYear: 1902, surname: null }));
    expect(wrapper.emitted('saved')).toBeTruthy();
  });

  it('shows the reset control only for a currently-overridden field', async () => {
    const overridden = await mountEditor({ ...emptyProfile, birthYear: 1901 });
    expect(overridden.find('[data-test="revert-birthYear"]').exists()).toBe(true);
    const plain = await mountEditor(emptyProfile);
    expect(plain.find('[data-test="revert-vocation"]').exists()).toBe(false);
  });

  it('reset marks the field to submit null', async () => {
    const wrapper = await mountEditor({ ...emptyProfile, birthYear: 1901 });
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="revert-birthYear"]').trigger('click');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({ birthYear: null }));
  });

  it('keeps buffers and shows an error when the save fails', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockRejectedValue(new ProfileSaveError(400, [{ propertyName: 'Profile.BirthYear', errorMessage: 'bad' }]));
    await wrapper.get('[data-test="field-birthYear"]').setValue('9999');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('saved')).toBeFalsy();
    expect(wrapper.find('[data-test="fields-error"]').exists()).toBe(true);
    expect((wrapper.get('[data-test="field-birthYear"]').element as HTMLInputElement).value).toBe('9999');
  });

  it('cancel with no changes emits cancel immediately', async () => {
    const wrapper = await mountEditor();
    await wrapper.get('[data-test="fields-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run src/components/MemberFieldsEditor.spec.ts`
Expected: FAIL — cannot resolve `./MemberFieldsEditor.vue`.

- [ ] **Step 4: Write the component**

Create `src/frontend/src/components/MemberFieldsEditor.vue`:

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALE_OPTIONS, type Locale } from '../constants/locales';
import type { PersonDetail } from '../types/family';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from '../api/profileApi';
import { seedDraft, buildProfilePayload, isOverridden, type ProfileDraft, type ProfileField } from '../composables/profileDraft';
import VocationIcon from './VocationIcon.vue';

const props = defineProps<{ personId: string; detail: PersonDetail }>();
const emit = defineEmits<{ saved: [detail: PersonDetail]; cancel: [] }>();
const { t } = useI18n({ useScope: 'global' });

const NAME_TABS: Locale[] = ['ru', 'be', 'en'];
const SEX_OPTIONS = ['male', 'female', 'unknown'] as const;
const VOCATION_OPTIONS = ['teacher', 'church', 'writer', 'office', 'other', 'unknown'] as const;
function localeName(code: Locale): string {
  return LOCALE_OPTIONS.find(o => o.code === code)?.nativeName ?? code;
}

const draft = reactive<ProfileDraft>(seedDraft(props.detail));
const original: ProfileDraft = seedDraft(props.detail);
const activeTab = ref<Locale>('ru');

// The current sparse override (payload base + drives which fields show a reset control).
const base = ref<PersonProfile>({
  givenName: null, surname: null, maidenName: null, sex: null, birthYear: null, deathYear: null, vocation: null
});
void getProfile(props.personId).then(p => { base.value = p; }).catch(() => { /* keep all-null base */ });

const reverted = reactive<Set<ProfileField>>(new Set());
const saving = ref(false);
const error = ref<string | null>(null);
const fieldErrors = reactive<Record<string, string>>({});
const pendingDiscard = ref(false);

function toggleRevert(field: ProfileField): void {
  if (reverted.has(field)) {
    reverted.delete(field);
  } else {
    reverted.add(field);
  }
}
function canReset(field: ProfileField): boolean {
  return isOverridden(base.value, field);
}
function nameDirty(field: 'givenName' | 'surname' | 'maidenName'): boolean {
  return NAME_TABS.some(l => draft[field][l] !== original[field][l]);
}
const dirty = computed(() =>
  reverted.size > 0
  || nameDirty('givenName') || nameDirty('surname') || nameDirty('maidenName')
  || draft.sex !== original.sex
  || draft.vocation !== original.vocation
  || draft.birthYear !== original.birthYear
  || draft.deathYear !== original.deathYear
);

// Numeric inputs bind through a string proxy so an empty field is null, not NaN.
function yearModel(field: 'birthYear' | 'deathYear') {
  return computed<string>({
    get: () => (draft[field] == null ? '' : String(draft[field])),
    set: (v: string) => {
      const n = parseInt(v, 10);
      draft[field] = Number.isFinite(n) ? n : null;
    }
  });
}
const birthYear = yearModel('birthYear');
const deathYear = yearModel('deathYear');

function errorFor(prop: string): string | undefined {
  return fieldErrors[prop];
}

async function save(): Promise<void> {
  if (!dirty.value || saving.value) {
    return;
  }
  saving.value = true;
  error.value = null;
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k]);
  try {
    const payload = buildProfilePayload(base.value, draft, original, reverted);
    const updated = await putProfile(props.personId, payload);
    emit('saved', updated);
  } catch (e) {
    if (e instanceof ProfileSaveError) {
      for (const fe of e.fieldErrors) {
        fieldErrors[fe.propertyName] = fe.errorMessage;
      }
    }
    error.value = t('editor.saveFailed');
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (dirty.value) {
    pendingDiscard.value = true;
    return;
  }
  emit('cancel');
}
function confirmDiscard(): void { emit('cancel'); }
function dismissDiscard(): void { pendingDiscard.value = false; }
</script>

<template>
  <div class="fields-editor" data-test="member-fields-editor">
    <!-- Localized name block: one locale tab row drives all three name inputs -->
    <div class="fields-editor__tabs" role="tablist">
      <button
        v-for="code in NAME_TABS"
        :key="code"
        type="button"
        role="tab"
        class="fields-editor__tab"
        :class="{ 'fields-editor__tab--active': activeTab === code }"
        :aria-selected="activeTab === code"
        :data-test="`name-tab-${code}`"
        @click="activeTab = code"
      >{{ localeName(code) }}</button>
    </div>

    <div class="fields-editor__grid">
      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.givenName') }}
          <button v-if="canReset('givenName')" type="button" class="fields-editor__revert" data-test="revert-givenName" :title="t('members.revertHint')" @click="toggleRevert('givenName')">↺</button>
        </span>
        <input v-model="draft.givenName[activeTab]" type="text" class="fields-editor__input" data-test="field-givenName" :disabled="reverted.has('givenName')" />
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.surname') }}
          <button v-if="canReset('surname')" type="button" class="fields-editor__revert" data-test="revert-surname" :title="t('members.revertHint')" @click="toggleRevert('surname')">↺</button>
        </span>
        <input v-model="draft.surname[activeTab]" type="text" class="fields-editor__input" data-test="field-surname" :disabled="reverted.has('surname')" />
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.maidenName') }}
          <button v-if="canReset('maidenName')" type="button" class="fields-editor__revert" data-test="revert-maidenName" :title="t('members.revertHint')" @click="toggleRevert('maidenName')">↺</button>
        </span>
        <input v-model="draft.maidenName[activeTab]" type="text" class="fields-editor__input" data-test="field-maidenName" :disabled="reverted.has('maidenName')" />
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.sex') }}
          <button v-if="canReset('sex')" type="button" class="fields-editor__revert" data-test="revert-sex" :title="t('members.revertHint')" @click="toggleRevert('sex')">↺</button>
        </span>
        <select v-model="draft.sex" class="fields-editor__input" data-test="field-sex" :disabled="reverted.has('sex')">
          <option v-for="s in SEX_OPTIONS" :key="s" :value="s">{{ t(`sex.${s}`) }}</option>
        </select>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.vocation') }}
          <button v-if="canReset('vocation')" type="button" class="fields-editor__revert" data-test="revert-vocation" :title="t('members.revertHint')" @click="toggleRevert('vocation')">↺</button>
        </span>
        <select v-model="draft.vocation" class="fields-editor__input" data-test="field-vocation" :disabled="reverted.has('vocation')">
          <option v-for="v in VOCATION_OPTIONS" :key="v" :value="v">{{ t(`vocation.${v}`) }}</option>
        </select>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.birth') }}
          <button v-if="canReset('birthYear')" type="button" class="fields-editor__revert" data-test="revert-birthYear" :title="t('members.revertHint')" @click="toggleRevert('birthYear')">↺</button>
        </span>
        <input v-model="birthYear" type="number" inputmode="numeric" class="fields-editor__input" data-test="field-birthYear" :disabled="reverted.has('birthYear')" />
        <span v-if="errorFor('Profile.BirthYear')" class="fields-editor__field-error" data-test="error-birthYear">{{ errorFor('Profile.BirthYear') }}</span>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.death') }}
          <button v-if="canReset('deathYear')" type="button" class="fields-editor__revert" data-test="revert-deathYear" :title="t('members.revertHint')" @click="toggleRevert('deathYear')">↺</button>
        </span>
        <input v-model="deathYear" type="number" inputmode="numeric" class="fields-editor__input" data-test="field-deathYear" :disabled="reverted.has('deathYear')" />
        <span v-if="errorFor('Profile.DeathYear')" class="fields-editor__field-error" data-test="error-deathYear">{{ errorFor('Profile.DeathYear') }}</span>
      </label>
    </div>

    <p v-if="error" class="fields-editor__error" data-test="fields-error">{{ error }}</p>

    <div v-if="pendingDiscard" class="fields-editor__confirm" data-test="fields-confirm">
      <p class="fields-editor__confirm-msg">{{ t('editor.confirmDiscard') }}</p>
      <div class="fields-editor__actions">
        <button type="button" class="fields-editor__btn fields-editor__btn--warn" data-test="fields-confirm-discard" @click="confirmDiscard">{{ t('editor.discard') }}</button>
        <button type="button" class="fields-editor__btn fields-editor__btn--ghost" data-test="fields-confirm-keep" @click="dismissDiscard">{{ t('editor.keepEditing') }}</button>
      </div>
    </div>

    <div v-else class="fields-editor__actions">
      <button type="button" class="fields-editor__btn fields-editor__btn--ghost" data-test="fields-cancel" @click="cancel">{{ t('members.cancelEdit') }}</button>
      <button type="button" class="fields-editor__btn fields-editor__btn--primary" data-test="fields-save" :disabled="!dirty || saving" @click="save">{{ saving ? t('editor.saving') : t('editor.save') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.fields-editor { display: flex; flex-direction: column; gap: 12px; font-family: var(--font-body); }
.fields-editor__tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.fields-editor__tab {
  height: 30px; padding: 0 14px; border-radius: 15px; cursor: pointer;
  border: 1px solid var(--gilt); background: transparent; color: var(--ink-soft);
  font-family: var(--font-display); font-size: 15px;
  &--active { background: var(--panel); color: var(--gilt-deep); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.fields-editor__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.fields-editor__field { display: flex; flex-direction: column; gap: 4px; }
.fields-editor__label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--gilt-deep);
}
.fields-editor__revert {
  border: 1px solid var(--gilt); background: transparent; color: var(--ink-soft);
  width: 20px; height: 20px; border-radius: 50%; cursor: pointer; line-height: 1;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.fields-editor__input {
  width: 100%; box-sizing: border-box; padding: 8px 10px;
  background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
  font-family: var(--font-body); font-size: 16px;
  &:disabled { opacity: 0.5; }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.fields-editor__field-error { font-size: 12px; color: var(--umber); }
.fields-editor__error { margin: 0; font-size: 14px; color: var(--umber); }
.fields-editor__confirm { border: 1px solid var(--gilt); background: var(--surface-card); border-radius: 8px; padding: 10px 12px; }
.fields-editor__confirm-msg { margin: 0 0 10px; font-size: 14px; color: var(--umber); }
.fields-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.fields-editor__btn {
  height: 32px; padding: 0 16px; border-radius: 8px; cursor: pointer;
  font-family: var(--font-display); font-size: 14px;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  &--ghost { border: none; background: transparent; color: var(--ink-soft); font-family: var(--font-body); &:hover { background: var(--btn-hover); } }
  &--primary { border: 1px solid var(--leaf-deep); background: var(--leaf-deep); color: var(--on-accent); &:disabled { opacity: 0.45; cursor: default; } }
  &--warn { border: 1px solid var(--umber); background: var(--umber); color: var(--on-accent); }
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/components/MemberFieldsEditor.spec.ts src/i18n`
Expected: PASS (editor spec + catalog-parity spec).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/MemberFieldsEditor.vue src/frontend/src/components/MemberFieldsEditor.spec.ts src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts
git commit -m "feat(members): MemberFieldsEditor scalar-field editor component"
```

---

### Task 5: Wire the editor into `MemberDetail.vue`

**Files:**
- Modify: `src/frontend/src/components/MemberDetail.vue`
- Test: `src/frontend/src/components/MemberDetail.spec.ts` (extend)

**Interfaces:**
- Consumes: `MemberFieldsEditor` (Task 4), `useAuthStore` (`../stores/authStore`), `useFamilyStore.applyPersonProfile` (Task 3), `personSlug` (`../utils/personSlug`).
- Produces: the Edit toggle + `onSaved` orchestration. No new exports.

**Orchestration (`onSaved(updated: PersonDetail)`):** capture the previous birth year before applying; set local `detail = updated`; `family.applyPersonProfile(updated.id, {...})`; if birth year changed, `await store.load()` (re-lay-out the oak); recompute `personSlug` from the store summary and `router.replace` the `/members/:slug` if it changed; close the editor.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/components/MemberDetail.spec.ts`. First, extend the top imports and add an auth-store import:

```ts
import { useAuthStore } from '../stores/authStore';
import { useFamilyStore } from '../stores/familyStore';
```

Then add this `describe` block after the existing one:

```ts
describe('MemberDetail editing', () => {
  function summary(id: string, birthYear: number) {
    return {
      id, givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
      maidenName: null, sex: 'female', birthYear, deathYear: 1980, vocation: 'teacher',
      portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false
    };
  }

  it('shows the Edit button only when the user can edit', async () => {
    const { wrapper } = await mountDetail('p-1');
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(false);
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(true);
  });

  it('opens the editor and hides the read-only tablets when Edit is clicked', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="fields-edit"]').trigger('click');
    expect(wrapper.find('[data-test="member-fields-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="member-fields"]').exists()).toBe(false);
  });
});
```

Note: `mountDetail` in this spec already mounts with a router + i18n + a fresh Pinia. `useAuthStore()`/`useFamilyStore()` resolve against that active Pinia.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/MemberDetail.spec.ts`
Expected: FAIL — no `[data-test="fields-edit"]` element exists.

- [ ] **Step 3: Modify the component — script**

In `src/frontend/src/components/MemberDetail.vue`, extend the `<script setup>`:

Add imports (after the existing imports):

```ts
import { useAuthStore } from '../stores/authStore';
import MemberFieldsEditor from './MemberFieldsEditor.vue';
```

Add state + orchestration (after the existing `const store = useFamilyStore();` line — add the auth store there too; then add `editing` and `onSaved` near `findOnTree`):

```ts
const auth = useAuthStore();
const editing = ref(false);
const canEdit = computed(() => auth.canEdit);

// Close the editor if the panel switches to a different person.
watch(() => props.personId, () => { editing.value = false; });

async function onSaved(updated: PersonDetail): Promise<void> {
  const previousBirthYear = detail.value?.birth?.year ?? null;
  detail.value = updated;
  editing.value = false;

  store.applyPersonProfile(updated.id, {
    givenName: updated.givenName,
    surname: updated.surname,
    maidenName: updated.maidenName,
    sex: updated.sex,
    vocation: updated.vocation,
    birthYear: updated.birth?.year ?? null,
    deathYear: updated.death?.year ?? null
  });

  // A birth-year change moves the person in the oak layout and its era frame — refetch.
  if ((updated.birth?.year ?? null) !== previousBirthYear) {
    await store.load();
  }

  const summary = store.personById(updated.id);
  if (summary) {
    const nextSlug = personSlug(summary);
    if (route.params.slug !== nextSlug) {
      void router.replace({ name: 'members', params: { slug: nextSlug } });
    }
  }
}
```

Ensure `ref`, `watch`, `computed` are imported (they already are) and that `route` is available. `MemberDetail` currently uses `useRouter` but not `useRoute`; add it:

```ts
import { useRouter, useRoute } from 'vue-router';
```
and near the other setup lines:
```ts
const route = useRoute();
```

- [ ] **Step 4: Modify the component — template**

In the header, add an Edit button beside the Find-on-tree button, shown only when `canEdit && !editing`. Locate the `member-detail__heading` block and add, after the `member-detail__find` button:

```vue
          <button
            v-if="canEdit && !editing"
            type="button"
            class="member-detail__find member-detail__edit"
            data-test="fields-edit"
            @click="editing = true"
          >{{ t('members.editProfile') }}</button>
```

Replace the field-tablets block so the editor takes its place when editing. Change the opening of the tablets `<div>` to be conditional, and render the editor otherwise:

```vue
      <!-- Field tablets (read-only) OR the inline editor -->
      <MemberFieldsEditor
        v-if="editing"
        :person-id="detail.id"
        :detail="detail"
        @saved="onSaved"
        @cancel="editing = false"
      />
      <div v-else class="member-detail__tablets" data-test="member-fields">
        <!-- …existing tablet markup unchanged… -->
      </div>
```

(Keep every existing tablet `<div class="member-detail__tablet">…` exactly as-is inside the `v-else` block.)

Add a style rule for the edit button (it reuses `member-detail__find` sizing but should read as secondary):

```scss
.member-detail__edit { background: var(--surface-card); color: var(--ink); border-color: var(--gilt); &:hover { background: var(--control-hover); } }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/components/MemberDetail.spec.ts`
Expected: PASS (existing + 2 new editing tests).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/MemberDetail.vue src/frontend/src/components/MemberDetail.spec.ts
git commit -m "feat(members): wire the scalar-field editor into MemberDetail (toggle + store sync + slug)"
```

---

### Task 6: Docs, full-suite verification, and dogfood

**Files:**
- Modify: `docs/reference/features/search-and-navigation.md`
- Modify: `docs/reference/README.md`
- Modify: `docs/reference/roadmap.md`
- Modify: `docs/reference/testing.md`

- [ ] **Step 1: Run the full frontend suite + type-check**

Run (from `src/frontend/`): `npm test -- --run` then `npm run build`
Expected: all specs pass; `vue-tsc` build succeeds with no type errors.

- [ ] **Step 2: Update the reference docs**

In `docs/reference/features/search-and-navigation.md`, in the **Dossier** paragraph, replace the "display-only" framing for scalar fields with: a signed-in editor sees an **Edit details** button that opens `MemberFieldsEditor` (tabbed ru/be/en names, sex/vocation dropdowns, birth/death year), saving via `PUT /api/people/{id}/profile`; **only changed fields override** (untouched fields keep inheriting the seed; a per-field **reset** clears an override); after save the store patches in place and refetches the graph only when birth year changed, and the `/members/:slug` URL is recomputed. Residences remain read-only (cut 1c).

In `docs/reference/README.md`, change the Members bullet from "Fields … are **display-only** — there is no in-app editor UI yet" to note that **scalar fields are now editable** by signed-in editors (names/sex/birth-death year/vocation via `PUT /api/people/{id}/profile`); residences + add/remove still read-only/deferred.

In `docs/reference/roadmap.md`, move scalar-field editing from deferred/dormant to **shipped (cut 1b)**; keep residence editing (1c) and add/remove (2) as deferred.

In `docs/reference/testing.md`, bump the frontend spec-file and case counts to the actual values printed by the full run, and add `MemberFieldsEditor`, `profileApi`, `profileDraft`, and the new `familyStore`/`MemberDetail` cases to the frontend inventory.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/reference
git commit -m "docs(members): document the cut-1b scalar-field editor"
```

- [ ] **Step 4: Live dogfood (manual, owner)**

Google sign-in is configured locally. Run the dev pair on a whitelisted origin:

```bash
node scripts/dev.mjs --port 5174 --api-port 5038
```

Open `http://localhost:5174/members`, sign in (Editor), pick a person, click **Edit details**, and verify against the five queued real corrections:
- change a birth year → Save → the roster row and the **oak tree** both move (refetch); the URL slug updates.
- change a name locale → Save → only that locale changes; a later `family.json` fix to an untouched field still shows.
- use **reset** on an overridden field → Save → it falls back to the seed value.
- an out-of-range year or a child-before-parent edit → the inline error shows and the typed value is kept.
- reload → the change persists (in-memory override locally; Firestore in prod).

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin claude/members-cut-1b
```
Open a PR into `main` (title states the idea, e.g. "Add the in-app scalar-field editor to the Members page"). Run the `update-docs-for-pr` skill at PR time; do not self-merge.

---

## Self-Review

**Spec coverage** (against the "Cut 1b — Scalar-Field Editor" spec section):
- Component + Edit toggle → Tasks 4, 5. ✓
- Resilient save (buffers kept on failure, error shown) → Task 4 (test: "keeps buffers…"). ✓
- Field set (names ×3 locales, sex, birth/death year, vocation) → Task 4 template + Task 2 draft. ✓
- Override model "only changed fields override" → Task 2 `buildProfilePayload` + tests. ✓
- Revert-to-seed per field → Task 2 (reverted set) + Task 4 (reset controls, shown only when overridden). ✓
- Hybrid store sync (patch in place; refetch on birth-year) → Task 3 + Task 5 `onSaved`. ✓
- Slug recompute + `router.replace` → Task 5. ✓
- Validation display (per-field on 400) → Task 1 (`ProfileSaveError` parse) + Task 4 (`errorFor`). ✓
- No backend change → confirmed; `GET /profile` supplies the override base for reset. ✓
- Not-in-scope (residences, add/remove, place, concurrency) → untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one "…existing tablet markup unchanged…" in Task 5 explicitly means "leave the current markup", not "fill in later".

**Type consistency:** `PersonProfile` shape identical across Tasks 1/2/4; `ProfileField`/`ProfileDraft` identical across Tasks 2/4; `applyPersonProfile` patch object identical in Task 3 (definition) and Task 5 (call); `getProfile`/`putProfile`/`ProfileSaveError` signatures identical across Tasks 1/4. Enum option lists match the exact values in Global Constraints.
