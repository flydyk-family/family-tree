# Friendly person URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-id person deep link (`/person/p-0003`) with a human-readable slug (`/person/franciszek-kowalski-1788-p-0003`) while keeping links stable and backward-compatible.

**Architecture:** Resolution is **frontend-only** — the real id (`p-<digits>`) is appended verbatim as the last part of every slug and is the single source of truth; a regex pulls it back out, and the existing `GET /api/people/{id}` endpoint is unchanged. A new pure helper module builds slugs and extracts ids; `TreeView.vue` swaps the route param `:id`→`:slug`, builds slugs when navigating, and self-heals the address bar to the canonical slug once the person summary is known.

**Tech Stack:** Vue 3 + TypeScript, Vue Router 4, Pinia, Vitest. No backend changes.

## Global Constraints

- **Person id format is `p-<digits>`** (e.g. `p-0003`) — verified across the whole dataset. The slug always ends with this id verbatim.
- **No backend changes.** API routes and DTOs stay as they are.
- **Slug language:** English (`en`) name when present; otherwise transliterate `ru`, then `be`. Slug is locale-independent (one canonical URL per person).
- **Frontend conventions:** TypeScript strict; pure util module has **no Vue/store imports**; tests are `*.spec.ts` colocated with the source; run from `src/frontend`.
- **Backward compatibility:** legacy `/person/p-0003` links must still resolve.

---

### Task 1: `personSlug` / `extractPersonId` utility

A pure module that builds the slug from a `PersonSummary` and extracts the id from a slug. No Vue, no stores — just data in, string out.

**Files:**
- Create: `src/frontend/src/utils/personSlug.ts`
- Test: `src/frontend/src/utils/personSlug.spec.ts`

**Interfaces:**
- Consumes: `PersonSummary`, `LocalizedText` from `src/frontend/src/types/family.ts`.
- Produces:
  - `personSlug(person: PersonSummary): string`
  - `extractPersonId(slug: string | null | undefined): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/utils/personSlug.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { personSlug, extractPersonId } from './personSlug';
import type { PersonSummary } from '../types/family';

function makePerson(overrides: Partial<PersonSummary>): PersonSummary {
  return {
    id: 'p-0001',
    givenName: { ru: null, be: null, en: 'Jan' },
    surname: { ru: null, be: null, en: 'Nowak' },
    maidenName: null,
    sex: 'male',
    birthYear: 1900,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false,
    ...overrides
  };
}

describe('personSlug', () => {
  it('builds <given>-<surname>-<birthYear>-<id> from the English name', () => {
    const slug = personSlug(makePerson({
      id: 'p-0003',
      givenName: { ru: 'Франциск', be: null, en: 'Franciszek' },
      surname: { ru: 'Ковальский', be: null, en: 'Kowalski' },
      birthYear: 1788
    }));
    expect(slug).toBe('franciszek-kowalski-1788-p-0003');
  });

  it('folds Latin diacritics and strokes to ASCII', () => {
    const slug = personSlug(makePerson({
      id: 'p-0007',
      givenName: { ru: null, be: null, en: 'Łukasz' },
      surname: { ru: null, be: null, en: 'Żółć' },
      birthYear: 1950
    }));
    expect(slug).toBe('lukasz-zolc-1950-p-0007');
  });

  it('omits the birth year when it is unknown', () => {
    const slug = personSlug(makePerson({
      id: 'p-0042',
      givenName: { ru: null, be: null, en: 'Jan' },
      surname: { ru: null, be: null, en: 'Nowak' },
      birthYear: null
    }));
    expect(slug).toBe('jan-nowak-p-0042');
  });

  it('transliterates the Russian name when English is missing', () => {
    const slug = personSlug(makePerson({
      id: 'p-0009',
      givenName: { ru: 'Иван', be: null, en: null },
      surname: { ru: 'Петров', be: null, en: null },
      birthYear: 1850
    }));
    expect(slug).toBe('ivan-petrov-1850-p-0009');
  });

  it('collapses to just the id when no name locale is available', () => {
    const slug = personSlug(makePerson({
      id: 'p-0005',
      givenName: { ru: null, be: null, en: null },
      surname: { ru: null, be: null, en: null },
      birthYear: null
    }));
    expect(slug).toBe('p-0005');
  });
});

describe('extractPersonId', () => {
  it('pulls the trailing id out of a full slug', () => {
    expect(extractPersonId('franciszek-kowalski-1788-p-0003')).toBe('p-0003');
  });

  it('resolves a legacy bare-id link', () => {
    expect(extractPersonId('p-0003')).toBe('p-0003');
  });

  it('resolves regardless of the decorative name part', () => {
    expect(extractPersonId('anything-at-all-p-0042')).toBe('p-0042');
  });

  it('returns null when there is no id', () => {
    expect(extractPersonId('franciszek-kowalski')).toBeNull();
    expect(extractPersonId('')).toBeNull();
    expect(extractPersonId(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend run test -- personSlug`
Expected: FAIL — `Failed to resolve import './personSlug'` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/utils/personSlug.ts`:

```ts
import type { LocalizedText, PersonSummary } from '../types/family';

// Latin renderings of the Cyrillic alphabets (ru + be), lowercase. Used only as a
// fallback when a person has no English name; need not be reversible, only stable.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', і: 'i', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  "'": '', '’': ''
};

// Latin letters with strokes/ligatures that Unicode NFD does not decompose.
const SPECIAL_LATIN: Record<string, string> = {
  ł: 'l', đ: 'd', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe'
};

function asciiFold(text: string): string {
  // NFD splits accented letters into base char + combining marks; drop the marks.
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugifyText(raw: string): string {
  const mapped = [...raw.toLowerCase()]
    .map(ch => SPECIAL_LATIN[ch] ?? CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('');
  return asciiFold(mapped)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugifyName(name: LocalizedText): string {
  const source = (name.en ?? name.ru ?? name.be ?? '').trim();
  return slugifyText(source);
}

/** Build the canonical friendly slug: `<given>-<surname>-<birthYear>-<id>`. */
export function personSlug(person: PersonSummary): string {
  const name = [slugifyName(person.givenName), slugifyName(person.surname)]
    .filter(Boolean)
    .join('-');
  const year = person.birthYear != null ? String(person.birthYear) : '';
  return [name, year, person.id].filter(Boolean).join('-');
}

/** Recover the person id (`p-<digits>`) from a slug, or null if absent. */
export function extractPersonId(slug: string | null | undefined): string | null {
  if (!slug) {
    return null;
  }
  const match = slug.match(/p-\d+$/i);
  return match ? match[0].toLowerCase() : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix src/frontend run test -- personSlug`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/utils/personSlug.ts src/frontend/src/utils/personSlug.spec.ts
git commit -m "feat: add personSlug / extractPersonId helpers for friendly URLs"
```

---

### Task 2: Wire slugs into routing and `TreeView`

Rename the route param, build slugs when navigating, derive the selected id from the slug, and self-heal the URL to the canonical slug once the person summary loads (covers cold deep-links into a bare id). Router + component + its spec change together so the suite stays green.

**Files:**
- Modify: `src/frontend/src/router/index.ts:11`
- Modify: `src/frontend/src/views/TreeView.vue` (imports, `selectedId`, panel watcher, `onSelect`, new `slugFor` + canonicalization watcher)
- Test: `src/frontend/src/views/TreeView.spec.ts`

**Interfaces:**
- Consumes: `personSlug`, `extractPersonId` from `src/frontend/src/utils/personSlug.ts` (Task 1); `useFamilyStore().personById(id)` returning `PersonSummary | undefined`.
- Produces: route `person` now carries `params.slug` (string). `selectedId` is the extracted `p-<digits>` id or null — unchanged downstream contract (`panel.openPerson(id)` still gets a real id).

- [ ] **Step 1: Update the route param and the TreeView spec to expect slugs (failing first)**

In `src/frontend/src/router/index.ts`, change line 11 from:

```ts
    { path: '/person/:id', name: 'person', component: TreeView }
```

to:

```ts
    { path: '/person/:slug', name: 'person', component: TreeView }
```

In `src/frontend/src/views/TreeView.spec.ts`:

(a) The fixtures use bare ids `a`/`b`/`c`; the slug extractor needs the real `p-<digits>` format. Replace the person ids — these appear only as **lowercase** quoted strings, while names/search terms are uppercase (`'A'`, `'B'`, `'C'`, `'X'`), so the remap is unambiguous. Apply three whole-string replacements across the file:
  - `'a'` → `'p-0001'`
  - `'b'` → `'p-0002'`
  - `'c'` → `'p-0003'`

  (Union id `'u'` is untouched. The `router.push('/person/b')` string is handled explicitly in (c) — it contains no standalone `'b'` token.)

(b) In `makeRouter`, change the person route to the slug param:

```ts
      { path: '/person/:slug', name: 'person', component: TreeView }
```

(c) Replace the "navigates" test body's assertions. Change:

```ts
    expect(router.currentRoute.value.name).toBe('person');
    expect(router.currentRoute.value.params.id).toBe('b');
```

to:

```ts
    expect(router.currentRoute.value.name).toBe('person');
    expect(router.currentRoute.value.params.slug).toBe('b-x-1880-p-0002');
```

(d) In the "opens a person panel on deep link" test, change the navigation from a slug-less id to exercise the **legacy bare-id link**, and keep the id assertions (already remapped to `p-0002` by step (a)). Change:

```ts
    router.push('/person/b');
```

to:

```ts
    router.push('/person/p-0002');
```

- [ ] **Step 2: Run the TreeView spec to verify the relevant tests fail**

Run: `npm --prefix src/frontend run test -- TreeView`
Expected: FAIL — the "navigates" test fails on `params.slug` being `undefined` (component still reads `route.params.id` / pushes `params.id`), and the deep-link test fails because `route.params.slug` does not resolve to a person id yet.

- [ ] **Step 3: Wire the slug helpers into TreeView.vue**

In `src/frontend/src/views/TreeView.vue`:

(a) Add the import near the other util/store imports (after line 8's store imports is fine):

```ts
import { personSlug, extractPersonId } from '../utils/personSlug';
```

(b) Replace the `selectedId` computed (lines 52–55):

```ts
const selectedId = computed(() => {
  const slug = route.params.slug;
  return typeof slug === 'string' ? extractPersonId(slug) : null;
});
```

(c) Add a `slugFor` helper immediately after `selectedId` — it builds the canonical slug when the person summary is loaded, falling back to the bare id otherwise:

```ts
// Canonical slug for a person id, using the graph summary when available.
// Falls back to the bare id (still resolvable) before the graph has loaded.
function slugFor(id: string): string {
  const person = store.personById(id);
  return person ? personSlug(person) : id;
}
```

(d) Replace the panel-store → URL watcher (lines 62–77) so it syncs the slug:

```ts
watch(
  () => panel.expandedId,
  id => {
    if (id) {
      void selection.open(id);
      const slug = slugFor(id);
      if (route.params.slug !== slug) {
        void router.replace({ name: 'person', params: { slug } });
      }
    } else {
      selection.close();
      if (route.name !== 'tree') {
        void router.replace({ name: 'tree' });
      }
    }
  }
);
```

(e) Add a canonicalization watcher right after the `selectedId` watcher (after line 93). It re-fires when the graph finishes loading, upgrading a bare-id URL to the pretty slug:

```ts
// Self-heal the address bar to the canonical pretty slug once the person's
// summary is known (e.g. a cold deep-link arrived as a bare id, or the name
// part was stale/mangled). `replace` keeps it out of the history stack.
watch(
  () => (selectedId.value ? slugFor(selectedId.value) : null),
  slug => {
    if (slug && route.params.slug !== slug) {
      void router.replace({ name: 'person', params: { slug } });
    }
  }
);
```

(f) Replace `onSelect` (lines 95–104) to push the slug:

```ts
function onSelect(id: string): void {
  // Capture the clicked medallion now (before the popup mounts) so the bigger
  // view can grow out of it.
  const medallion = document.querySelector(`[data-node-id="${id}"]`);
  void router.push({ name: 'person', params: { slug: slugFor(id) } }).finally(() => {
    if (!isMobile.value) {
      void dockMorph.openFrom(id, medallion);
    }
  });
}
```

- [ ] **Step 4: Run the TreeView spec to verify it passes**

Run: `npm --prefix src/frontend run test -- TreeView`
Expected: PASS — all TreeView tests green, including the slug "navigates" assertion and the legacy bare-id deep-link.

- [ ] **Step 5: Run the full frontend suite + type-check**

Run: `npm --prefix src/frontend test`
Expected: PASS — no other spec regressed (AppBar / TabNav / ChronicleView / firstVisit routers use stub components and the `/person/...` path still matches).

Run: `npm --prefix src/frontend run build`
Expected: `vue-tsc` type-check passes and the production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/router/index.ts src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "feat: render friendly person slugs in the URL"
```

---

### Task 3: Update the routing reference docs

Document the slug URL form and resolution in the authoritative routing doc, so the docs land with the change (per the docs-land-with-the-PR rule).

**Files:**
- Modify: `docs/reference/features/search-and-navigation.md`

- [ ] **Step 1: Update the routing & deep-links section**

In `docs/reference/features/search-and-navigation.md`, change the page intro (line 5) reference from `/person/:id` to `/person/:slug`. Then replace the route table row and behavior block (lines 14–23).

Change the table row:

```
| `/person/:id` | `person` | `TreeView` |
```

to:

```
| `/person/:slug` | `person` | `TreeView` |
```

Replace the `**/person/:id** behavior:` block and the sync bullets (lines 16–23) with:

```markdown
**`/person/:slug` behavior:**
- The slug is `<given>-<surname>-<birthYear>-<id>`, e.g. `/person/franciszek-kowalski-1788-p-0003`. The name is the **English** name (or a Cyrillic→Latin transliteration of `ru`/`be` when `en` is absent), diacritics folded to ASCII; the birth year is omitted when unknown.
- **Resolution is frontend-only** ([`utils/personSlug.ts`](../../../src/frontend/src/utils/personSlug.ts)): the trailing `p-<digits>` id is the source of truth — `extractPersonId` recovers it and the existing `GET /api/people/{id}` fetches the person. The name part is decorative; a truncated or stale name still resolves.
- **Backward compatible:** legacy `/person/p-0003` links still work (the bare id is a valid trailing-id match), and the URL self-heals to the canonical slug via `router.replace` once the person summary is loaded.
- Valid id → person panel expands in the rail and `selection.open(id)` fetches detail. (Entering via the URL does **not** open the popup — only desktop tree-node clicks do.)
- Invalid/unknown id → fetch fails; `selectionStore.error` is set and shown in the panel; the panel still opens with the raw id.

**URL ⇄ selection sync (two-way):**
- URL → store: a watcher extracts the id from the slug and drives `openPerson` / `minimizeAllPersons`.
- Store → URL: expanding a person `router.replace`s to the canonical `/person/:slug`; clearing replaces back to `/`.
- Tree-node click `router.push`es `/person/:slug` (adds history). A guard prevents redundant double-navigation.
- Browser **Back** from `/person/:slug` → `/` clears the selection and closes detail.
```

- [ ] **Step 2: Commit**

```bash
git add docs/reference/features/search-and-navigation.md
git commit -m "docs: describe friendly person slug URLs"
```

- [ ] **Step 3: Sweep remaining doc references at PR time**

When opening the PR, the `update-docs-for-pr` skill (PreToolUse hook on `gh pr create`) will prompt a wider sync. Confirm these incidental `/person/:id` mentions read correctly or get updated: `docs/reference/features/app-shell-and-localization.md:39`, `docs/reference/roadmap.md:17`, and the project overview in `CLAUDE.md` / `README.md` if it describes the deep-link form. These are descriptive and may keep `:id` shorthand, but the route-name and slug contract must not contradict Task 3 Step 1.

---

## Self-Review

**Spec coverage:**
- English-translit name + birth year in the slug → Task 1 `personSlug` (tests for en name, diacritics, missing year, ru fallback). ✓
- Slug + trailing id resolution, decorative name → Task 1 `extractPersonId` (full slug, decorative-name, legacy bare-id). ✓
- Backend untouched → no backend task; fetch path unchanged in Task 2. ✓
- Canonicalization (self-heal to pretty URL) → Task 2 Step 3(e) watcher. ✓
- Legacy `/person/p-0003` keeps working → Task 1 test + Task 2 deep-link test pushes `/person/p-0002`. ✓
- Empty-name collapse-to-id → Task 1 test. ✓
- Docs land with the PR → Task 3. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code and test step shows full content. ✓

**Type consistency:** `personSlug(person: PersonSummary): string` and `extractPersonId(slug: string | null | undefined): string | null` are used identically in Task 2 (`slugFor` passes a `PersonSummary` from `store.personById`; `selectedId` passes `route.params.slug` as a string). `store.personById(id)` returns `PersonSummary | undefined`, matching `slugFor`'s narrowing. ✓
