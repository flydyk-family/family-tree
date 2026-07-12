# Members Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the read-only Members page (`/members/:slug?`) to match the "Family Chronicle" mockup in the Classic theme — ornate header crest + iconized nav, a filtered roster, an oval-framed dossier, and a three-column family drawer — responsive, mobile-friendly, layout-ready for later editing, with no inert controls.

**Architecture:** Frontend-heavy Vue 3 + SCSS redesign of four existing components (`MembersIndex`, `MemberDetail`, `MemberFamilySheet`, plus shared `AppBar`/`TabNav`), backed by (a) one additive backend DTO field (`BirthPlace`) to enable the Place filter and (b) a pure `familyGenerations` util for the Generation filter. New decorative SVG is factored into small, `aria-hidden`, token-driven `heraldry/*` components so the page components stay focused.

**Tech Stack:** .NET 10 / Mapster / xUnit (backend); Vue 3 + TypeScript + SCSS + Pinia + vue-i18n + Vitest (frontend).

## Global Constraints

- **Theme:** Classic is the design target. **Never hardcode a gold hex/rgba** — use theme tokens (`--gilt`, `--gilt-light`, `--gilt-deep`, `--ink`, `--ink-soft`, `--surface-card`, `--stat-card-bg`, `--panel-edge`, `--shadow`, `--bark`, `--on-accent`). Film must degrade sanely.
- **No editing:** render **no** inert edit controls (pencils / add / delete). Layout-ready only — a default-`false` `editable` prop gates future seams; nothing extra renders while `false`.
- **Decorative SVG:** every crest/shield/botanical/ornament is `aria-hidden="true"`, `pointer-events: none`, and must never force horizontal scroll or overlap content at any supported size.
- **i18n:** every new message key is added to **all three** locales (`en.ts`, `ru.ts`, `be.ts`) in the same commit; the `messages.spec.ts` parity test must stay green.
- **Responsive:** preserve the existing breakpoints — two-column desktop, `≤720px` drill-down, family bottom-sheet. Touch targets ≥44px.
- **C# conventions:** file-scoped namespaces, `readonly` fields, XML doc where it applies (see CLAUDE.md).
- **Frontend commands** run from `src/frontend`: `npm test` (Vitest), `npm run build` (vue-tsc type-check + build). **Backend** from repo root: `dotnet test`.
- **TDD + frequent commits.** Each task ends green and is committed.
- **Delivery:** branch `claude/members-page-redesign-36c10f` (already cut off `main`). No self-merge.

---

### Task 1: Backend — `BirthPlace` on the person summary

**Files:**
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`
- Modify: `src/backend/FamilyTree.Application/Mapping/MappingConfig.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/PersonMappingTests.cs` (extend; read it first for the fixture style)

**Interfaces:**
- Produces: `PersonSummaryDto.BirthPlace : LocalizedTextDto?` — the localized birth place (`Person.Birth.Place`), `null` when the birth event has no place.

- [ ] **Step 1: Read `PersonMappingTests.cs`** to learn the existing `Person → PersonSummaryDto` mapping test + how a `Person`/`LifeEvent` fixture with a `Place` is built.

- [ ] **Step 2: Write a failing test** asserting the summary mapping carries the birth place. Add to `PersonMappingTests.cs`, mirroring the fixture style already there. Assert that a `Person` whose `Birth.Place` is a `LocalizedText("Мінск","Мінск","Minsk")` maps to a `PersonSummaryDto` with `BirthPlace!.En == "Minsk"`, and that a `Person` with a null birth place maps to `BirthPlace == null`.

- [ ] **Step 3: Run it, verify it fails** — `dotnet test --filter FullyQualifiedName~PersonMapping`. Expected: compile error (no `BirthPlace` member) or assertion failure.

- [ ] **Step 4: Add the DTO field.** In `PersonSummaryDto.cs` add `LocalizedTextDto? BirthPlace` to the record — place it after `DeathYear` (keep `Portrait…` etc. after it), e.g.:
```csharp
public sealed record PersonSummaryDto(
    string Id,
    LocalizedTextDto GivenName,
    LocalizedTextDto Surname,
    LocalizedTextDto? MaidenName,
    string Sex,
    int? BirthYear,
    int? DeathYear,
    LocalizedTextDto? BirthPlace,
    string Vocation,
    string? Portrait,
    string? PortraitThumb,
    string? PortraitVideo,
    ParentsDto Parents,
    bool MarriedIntoFamily,
    bool IsDefaultRoot);
```

- [ ] **Step 5: Map it.** In `MappingConfig.cs`, in the `Person → PersonSummaryDto` config add:
```csharp
.Map(dest => dest.BirthPlace, src => src.Birth.Place)
```
(Mapster maps `LocalizedText? → LocalizedTextDto?` via the existing `LocalizedText→LocalizedTextDto` config; a null `Place` yields null.)

- [ ] **Step 6: Run tests, verify pass** — `dotnet test --filter FullyQualifiedName~PersonMapping`. Then full `dotnet test` to catch any integration snapshot that pins the summary shape (update expected JSON if an integration test asserts the summary field set).

- [ ] **Step 7: Commit** — `git commit -am "Add BirthPlace to person summary DTO"`.

---

### Task 2: Frontend — carry `birthPlace` through the graph type

**Files:**
- Modify: `src/frontend/src/types/family.ts:12-27` (`PersonSummary`)

**Interfaces:**
- Consumes: Task 1's DTO field.
- Produces: `PersonSummary.birthPlace : LocalizedText | null` — available on every roster person (the graph is parsed as raw JSON in `api/familyApi.ts`, so no mapping code changes; only the type).

- [ ] **Step 1: Add the field** to `PersonSummary` after `deathYear`:
```ts
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: LocalizedText | null;
```

- [ ] **Step 2: Type-check** — from `src/frontend`, `npm run build`. Fixtures in specs that build `PersonSummary` objects will now fail type-check (missing `birthPlace`). Note the failing spec files for Task-6/8 fixture updates, or add `birthPlace: null` to shared test factories now if one exists (`src/frontend/src/**/testFactories*` / search `PersonSummary` in specs). Prefer fixing a shared factory once.

- [ ] **Step 3: Run `npm test`** — make green by adding `birthPlace: null` (or a value) to any `PersonSummary` fixture the type-check flagged.

- [ ] **Step 4: Commit** — `git commit -am "Carry birthPlace through the frontend PersonSummary type"`.

---

### Task 3: i18n — add every new key (en / ru / be)

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`
- Test: `src/frontend/src/i18n/messages/messages.spec.ts` stays green (parity).

**Interfaces:**
- Produces the message keys consumed by Tasks 6–9. Exact keys + English copy (translate ru/be to match the existing tone — see the current `members`/`nav` blocks for register):

Add to the `members` block:
```ts
    searchPlaceholder: 'Search name or place…',   // REPLACE existing 'Search by name…'
    filter: { generation: 'Generation', surname: 'Surname', place: 'Place', all: 'All' }, // extend existing
    generationOption: 'Generation {n}',
    married: 'Married {year}',
    viewAllChildren: 'View all children ({n})',
    dragForDetails: 'Drag up for more details',
    membersCount: '{n} members',   // roster footer (may reuse existing 'count'); keep one, drop the other
```
Keep existing `members.count`, `sort`, `parents/spouse/siblings/children`, `field.*`, etc. If reusing `count` for the footer, do **not** add `membersCount` — pick one and be consistent in Task 6.

- [ ] **Step 1:** Add the keys above to `en.ts` (replace `searchPlaceholder`, extend `filter`, add `generationOption`/`married`/`viewAllChildren`/`dragForDetails`).
- [ ] **Step 2:** Mirror into `ru.ts` and `be.ts` with locale-appropriate copy (ru: «Поколение {n}», «Женаты/В браке с {year}» → use a neutral «В браке: {year}»; «Показать всех детей ({n})»; «Потяните вверх за подробностями»; placeholder «Поиск по имени или месту…». be: analogous). Match the existing translations' tone.
- [ ] **Step 3: Run `npm test`** — `messages.spec.ts` parity test must pass (all locales have identical key sets).
- [ ] **Step 4: Commit** — `git commit -am "Add i18n keys for the Members redesign"`.

---

### Task 4: `familyGenerations` util (Generation filter source)

**Files:**
- Create: `src/frontend/src/composables/familyGenerations.ts`
- Test: `src/frontend/src/composables/familyGenerations.spec.ts`

**Interfaces:**
- Produces:
```ts
export function computeGenerations(people: PersonSummary[]): Map<string, number>
// generation(person) = 1 + max(parent generations present in the set); founders (no known
// parent in `people`) = 1. Cycle-safe (guard visited). Missing parent ids treated as absent.
export function generationOptions(gens: Map<string, number>): number[]
// sorted ascending list of the distinct generation numbers present.
```

- [ ] **Step 1: Write failing tests** in `familyGenerations.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeGenerations, generationOptions } from './familyGenerations';
import type { PersonSummary } from '../types/family';

// minimal factory
const p = (id: string, motherId: string | null, fatherId: string | null): PersonSummary => ({
  id, givenName: { ru: null, be: null, en: id }, surname: { ru: null, be: null, en: 'X' },
  maidenName: null, sex: 'male', birthYear: null, deathYear: null, birthPlace: null,
  vocation: 'other', portrait: null, portraitThumb: null, portraitVideo: null,
  parents: { motherId, fatherId }, marriedIntoFamily: false, isDefaultRoot: false,
});

describe('computeGenerations', () => {
  it('assigns founders generation 1', () => {
    const gens = computeGenerations([p('a', null, null)]);
    expect(gens.get('a')).toBe(1);
  });
  it('assigns a child one below its parent', () => {
    const gens = computeGenerations([p('a', null, null), p('b', 'a', null)]);
    expect(gens.get('b')).toBe(2);
  });
  it('uses the deeper parent when parents differ', () => {
    // a(1) -> b(2); c is founder(1); d has parents b and c -> 1 + max(2,1) = 3
    const gens = computeGenerations([
      p('a', null, null), p('b', 'a', null), p('c', null, null), p('d', 'b', 'c'),
    ]);
    expect(gens.get('d')).toBe(3);
  });
  it('is cycle-safe', () => {
    const gens = computeGenerations([p('a', 'b', null), p('b', 'a', null)]);
    expect(gens.get('a')).toBeGreaterThanOrEqual(1);
    expect(gens.get('b')).toBeGreaterThanOrEqual(1);
  });
});

describe('generationOptions', () => {
  it('returns sorted distinct generations', () => {
    const gens = new Map([['a', 1], ['b', 2], ['c', 2], ['d', 3]]);
    expect(generationOptions(gens)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npm test familyGenerations`.
- [ ] **Step 3: Implement** `familyGenerations.ts`. Use recursion with memoization + a visited-guard for cycles; treat a parent id absent from the `people` set as "no parent". `generationOptions` = `[...new Set(gens.values())].sort((a,b)=>a-b)`.
- [ ] **Step 4: Run, verify pass** — `npm test familyGenerations`.
- [ ] **Step 5: Commit** — `git commit -am "Add familyGenerations util for the Generation filter"`.

---

### Task 5: Heraldry components (decorative SVG)

**Files:**
- Create: `src/frontend/src/components/heraldry/CrestMark.vue` (header emblem — shield + oak sprig + coronet)
- Create: `src/frontend/src/components/heraldry/CoatOfArms.vue` (detail shield + laurel branches)
- Create: `src/frontend/src/components/heraldry/BotanicalCorner.vue` (roster corner branch/leaves)
- Create: `src/frontend/src/components/heraldry/OrnamentDivider.vue` (small fleuron rule)
- Test: `src/frontend/src/components/heraldry/heraldry.spec.ts`

**Interfaces:**
- Produces four presentational components. Each renders inline `<svg>` using `currentColor` / theme tokens for strokes/fills (via `stroke="var(--gilt)"` etc.), sets `aria-hidden="true"` on the root, and `pointer-events: none`. No props required except `CrestMark`/`CoatOfArms` accept an optional `size` (px, default sensible). Follow the hand-drawn idiom of `AppFrame.vue` (thin bark strokes, small leaf accents) — keep them tasteful and simple, not photoreal.

- [ ] **Step 1: Write failing tests** (`heraldry.spec.ts`) — mount each component and assert it renders an `<svg>` with `aria-hidden="true"`:
```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CrestMark from './CrestMark.vue';
import CoatOfArms from './CoatOfArms.vue';
import BotanicalCorner from './BotanicalCorner.vue';
import OrnamentDivider from './OrnamentDivider.vue';

for (const [name, C] of [['CrestMark', CrestMark], ['CoatOfArms', CoatOfArms],
  ['BotanicalCorner', BotanicalCorner], ['OrnamentDivider', OrnamentDivider]] as const) {
  describe(name, () => {
    it('renders an aria-hidden svg', () => {
      const w = mount(C);
      const svg = w.find('svg');
      expect(svg.exists()).toBe(true);
      expect(w.element.getAttribute('aria-hidden')).toBe('true');
    });
  });
}
```

- [ ] **Step 2: Run, verify fail** — `npm test heraldry`.
- [ ] **Step 3: Implement** the four SVG components. Token-driven colors, `aria-hidden="true"` on the root svg, scoped `pointer-events: none`. Use **live preview verification** (browser MCP) later during QA to refine paths against the mockup — for now, produce clean, correct, tasteful SVG that reads as a crest / shield-with-laurel / leafy branch / fleuron.
- [ ] **Step 4: Run, verify pass** — `npm test heraldry`.
- [ ] **Step 5: Commit** — `git commit -am "Add heraldry decorative SVG components"`.

---

### Task 6: Header — nav-tab icons + crest mark

**Files:**
- Modify: `src/frontend/src/components/TabNav.vue`
- Modify: `src/frontend/src/components/AppBar.vue`
- Test: `src/frontend/src/components/TabNav.spec.ts` (create if absent), and extend `AppBar` spec if one exists.

**Interfaces:**
- Consumes: `heraldry/CrestMark.vue` (Task 5).
- Produces: iconized nav tabs (icon + label) and a desktop-only crest at the far-left of the bar.

- [ ] **Step 1: Write/extend a failing test** — TabNav renders an icon element (e.g. `svg` or `.tabnav__icon`) inside each tab alongside the label; the Members tab still routes to `/members`. AppBar renders `CrestMark` on desktop (stub the media query to desktop) and not in the mobile compact bar.

- [ ] **Step 2: Run, verify fail** — `npm test TabNav` / `npm test AppBar`.

- [ ] **Step 3: Implement TabNav icons.** Add a small inline SVG per tab id (`chronicle`→scroll, `tree`→oak, `members`→figures, `timeline`→hourglass) as a `.tabnav__icon` before the label. Keep the pill layout; icon inherits `currentColor`. Preserve `disabled`/active/`data-test` behavior. Ensure the icon is `aria-hidden` (label carries the name).

- [ ] **Step 4: Implement crest in AppBar.** Render `<CrestMark class="app-bar__crest" />` at the start of the desktop `app-bar__nav` cell (before `<TabNav />`), sized ~34–40px. Hide it under the narrow-desktop width if it crowds (`@media` or reuse `isNarrowDesktop`). Do **not** add it to the mobile bar.

- [ ] **Step 5: Run, verify pass** — `npm test`.

- [ ] **Step 6: Verify no regression on other pages** — `npm run build`. (Live cross-page check happens in QA.)

- [ ] **Step 7: Commit** — `git commit -am "Add crest mark and nav-tab icons to the app header"`.

---

### Task 7: Roster redesign — `MembersIndex.vue`

**Files:**
- Modify: `src/frontend/src/components/MembersIndex.vue`
- Modify: `src/frontend/src/components/MembersIndex.spec.ts`

**Interfaces:**
- Consumes: `familyGenerations` (Task 4), `heraldry/BotanicalCorner.vue` (Task 5), `birthPlace` (Task 2), i18n keys (Task 3).
- Props unchanged (`people: PersonSummary[]`, `selectedId: string | null`); emits `select` unchanged.

- [ ] **Step 1: Write failing tests** (extend `MembersIndex.spec.ts`):
  - A **Place filter** narrows the list to people whose localized birth place equals the chosen value.
  - A **Generation filter** narrows to people in the chosen generation (build a small parent-linked fixture).
  - **Place-aware search:** a query matching only a person's birth place (not their name) includes them.
  - **Clear** resets query + surname + place + generation + sort.
  - Footer shows the filtered count.

- [ ] **Step 2: Run, verify fail** — `npm test MembersIndex`.

- [ ] **Step 3: Implement logic.**
  - Add refs `generationFilter` (number | ''), `placeFilter` (string). Compute `generations = computeGenerations(props.people)` and `generationOpts = generationOptions(generations)`; `places` = sorted distinct localized `birthPlace`.
  - Extend `filtered` to apply generation + place alongside surname/sort. Extend the search predicate to also match localized `birthPlace` (compose with `personMatchesQuery`, or add a place check).
  - `hasFilters`/`clearFilters` include the two new filters.
  - Footer count uses the chosen i18n key.

- [ ] **Step 4: Implement markup + styles** to the mockup:
  - Search: wrap the input with an inset magnifier glyph (absolute-positioned SVG, `aria-hidden`), placeholder from `members.searchPlaceholder`.
  - Filter chips row: **Generation · Surname · Place** as `<label>`+`<select>` pills (existing `.members-index__chip` pattern) each with a small leading icon; a second row with **Sort** pill + **Clear** link.
  - Rows: keep grid; on the selected row add a right-edge **fleuron marker** (small inline SVG or `OrnamentDivider`), plus the gilt frame/fill (existing `--selected` style, refined).
  - Footer: bottom-left count.
  - `<BotanicalCorner class="members-index__botanical" />` absolutely positioned bottom, behind the list (`z-index` under rows, `pointer-events: none`).
  - Use only theme tokens for color. Verify the chips wrap gracefully at the rail's min width (260px).

- [ ] **Step 5: Run, verify pass** — `npm test MembersIndex`; `npm run build`.

- [ ] **Step 6: Commit** — `git commit -am "Redesign the members roster (filters, chips, fleuron, botanical)"`.

---

### Task 8: Detail redesign — `MemberDetail.vue`

**Files:**
- Modify: `src/frontend/src/components/MemberDetail.vue`
- Modify: `src/frontend/src/components/MemberDetail.spec.ts`

**Interfaces:**
- Consumes: `heraldry/CoatOfArms.vue`, `heraldry/OrnamentDivider.vue` (Task 5), i18n keys.
- Produces: an `editable?: boolean` prop (default `false`) that gates future edit seams; with `false`, no edit controls render.

- [ ] **Step 1: Write failing tests** (extend `MemberDetail.spec.ts`):
  - Renders the field tablets (Given/Surname/Maiden/Sex/Vocation/Born, and Died when present) — assert labels/values still present after restructure.
  - `editable` defaults to `false` and **no** element with a `data-test="field-edit"` (or `.member-detail__edit`) renders; when `editable` is set `true`, the seam element(s) render (prove the seam exists without wiring an action). Mock `fetchPerson` as the existing spec does.
  - `CoatOfArms` is present and `aria-hidden`.

- [ ] **Step 2: Run, verify fail** — `npm test MemberDetail`.

- [ ] **Step 3: Implement.**
  - Add `const props = defineProps<{ personId: string; editable?: boolean }>()` (keep `personId`); default `editable` to `false`.
  - **Portrait:** replace the circular ring with an **oval gilt frame + coronet finial** — an SVG/CSS ornamental oval (`border-radius: 50% / 42%` oval, layered gilt border via tokens, a small coronet SVG absolutely centered above). Keep the initials fallback.
  - **Name + lifespan:** name unchanged; insert `<OrnamentDivider />` between name/maiden and the lifespan.
  - **Find on tree:** keep the action; refine to a gilt gradient pill (tokens).
  - **Field tablets:** arrange to the mockup grid (Given · Sex · Vocation / Surname · Birth · Death, Maiden under Surname). Each tablet reserves a top-right seam: `<button v-if="editable" class="member-detail__edit" data-test="field-edit" …>` — rendered only when `editable`. Nothing else changes for read-only.
  - **Coat of arms:** `<CoatOfArms class="member-detail__crest" />` positioned top-right of the fields; hides/reflows on narrow.
  - **Residences:** add a small house glyph before each place; reserve (do not render) the "+ Add residence" / row edit-delete seams behind `editable`.
  - Keep `<PersonPhotos … :can-edit="false" />` after the columns.

- [ ] **Step 4: Run, verify pass** — `npm test MemberDetail`; `npm run build`.

- [ ] **Step 5: Commit** — `git commit -am "Redesign the member dossier (oval frame, tablets, coat-of-arms)"`.

---

### Task 9: Family drawer redesign — `MemberFamilySheet.vue`

**Files:**
- Modify: `src/frontend/src/components/MemberFamilySheet.vue`
- Modify: `src/frontend/src/components/MemberFamilySheet.spec.ts`

**Interfaces:**
- Consumes: i18n keys (Task 3); `deriveRelatives` (existing), `Union.marriageYear`.
- Produces: three-column family layout with portrait cards; "View all children" expansion; siblings only when present.

- [ ] **Step 1: Write failing tests** (extend `MemberFamilySheet.spec.ts`):
  - Handle label reads `members.dragForDetails`.
  - Spouse card shows `Married {year}` when the union has a `marriageYear`, and omits it when null.
  - Children beyond a threshold (e.g. > 5) are truncated with a "View all children ({n})" control that reveals the rest on click.
  - Siblings section renders **only** when the person has siblings (absent otherwise).

- [ ] **Step 2: Run, verify fail** — `npm test MemberFamilySheet`.

- [ ] **Step 3: Implement.**
  - Relabel the handle to `members.dragForDetails` with a chevron; keep click/keyboard toggle.
  - Restructure the expanded body into columns: **Parents · Spouse · Children** (the mockup's three). Each relative is a portrait **card** (oval thumb + name + years) instead of a chip; keep them `<button>`s emitting `select`.
  - Spouse: look up the union between `personId` and the spouse (from `props.unions`) to read `marriageYear`; render `t('members.married', { year })` when present.
  - Children: if `children.length > N` (N=5), show the first N + a `View all children (n)` toggle that expands to all.
  - Siblings: render as an additional same-styled section **only when `siblings.length > 0`**.
  - Columns stack vertically on narrow (`@media max-width: 720px`).

- [ ] **Step 4: Run, verify pass** — `npm test MemberFamilySheet`; `npm run build`.

- [ ] **Step 5: Commit** — `git commit -am "Redesign the family drawer (parents/spouse/children columns)"`.

---

### Task 10: Full verification sweep

**Files:** none (verification + any fixups).

- [ ] **Step 1:** From repo root, `dotnet test` — all green.
- [ ] **Step 2:** From `src/frontend`, `npm test` — all green.
- [ ] **Step 3:** From `src/frontend`, `npm run build` — type-check + build clean.
- [ ] **Step 4:** Fix any failures inline (small commits). Do not proceed to QA/PR until all three are green.
- [ ] **Step 5: Commit** any fixups — `git commit -am "Fix up Members redesign verification"`.

---

## Post-plan workflow (main session, not subagent tasks)

1. **Live QA** (gstack-qa / browser MCP): run the app (custom ports — see `run-app` skill; never default 5037/5173), drive the Members page against the mockup at desktop / narrow-desktop / mobile widths; verify roster filters, drill-down, family drawer, and that Chronicle/Tree pages still render cleanly (header change). Sanity-check Film theme. Fix visual/functional bugs.
2. **Code review** (superpowers:requesting-code-review) → **accept** (superpowers:receiving-code-review) in subagents.
3. **Docs** (update-docs-for-pr): sync `docs/reference/features/search-and-navigation.md` (Members section) + `person-details.md` if touched + the overview if the product description changed.
4. **PR** into `main`; fix PR comments / check failures. No self-merge.

## Self-review notes

- **Spec coverage:** header (T5,T6) · roster filters/search/fleuron/botanical/footer (T7) · oval frame/ornament/tablets/coat-of-arms/residences/editable seam (T8) · family three-column/married/view-all/siblings (T9) · backend BirthPlace (T1,T2) · generation util (T4) · heraldry (T5) · i18n (T3) · responsive+build (T7–T10) · tests (each task). Photo grid retained (T8). All covered.
- **Editing-ready, no inert controls:** `editable` default-false seams in T8 (and reserved residence seams); nothing renders while false. ✔
- **Tokens only, no hardcoded gold:** stated in Global Constraints and each style step. ✔
