# Vocation Motif Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subtle per-vocation line-art motif beside the vocation label in the person popup.

**Architecture:** A new presentational component `VocationIcon.vue` renders one inline SVG motif per vocation (`teacher|church|writer|office|other`), inheriting the surrounding ink color via `currentColor`. `PersonPopup.vue` places it next to the existing vocation label. Unknown/empty vocations render nothing. Popup-only scope — `OakTree.vue` is untouched.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), scoped SCSS with design tokens, Vitest + Vue Test Utils.

**Spec:** [docs/superpowers/specs/2026-06-04-vocation-motif-design.md](../specs/2026-06-04-vocation-motif-design.md)

**Conventions:** All commands run from `src/frontend`. Single-file test run: `npx vitest run <path-relative-to-src/frontend>`. Full suite: `npm run test`. Type-check/build gate: `npm run build`.

---

### Task 1: VocationIcon component

**Files:**
- Create: `src/frontend/src/components/VocationIcon.vue`
- Test: `src/frontend/src/components/VocationIcon.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/VocationIcon.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import VocationIcon from './VocationIcon.vue';

const KNOWN = ['teacher', 'church', 'writer', 'office', 'other'] as const;

describe('VocationIcon', () => {
  it.each(KNOWN)('renders a decorative svg motif for "%s"', (vocation) => {
    const wrapper = mount(VocationIcon, { props: { vocation } });
    const svg = wrapper.find('[data-test="vocation-icon"]');

    expect(svg.exists()).toBe(true);
    expect(svg.attributes('data-vocation')).toBe(vocation);
    // decorative: must not be announced by assistive tech
    expect(svg.attributes('aria-hidden')).toBe('true');
    // has actual geometry, not an empty svg
    expect(svg.element.querySelectorAll('path, line, circle').length).toBeGreaterThan(0);
  });

  it('renders nothing for an unknown vocation', () => {
    const wrapper = mount(VocationIcon, { props: { vocation: 'unknown' } });
    expect(wrapper.find('[data-test="vocation-icon"]').exists()).toBe(false);
  });

  it('renders nothing for an empty vocation', () => {
    const wrapper = mount(VocationIcon, { props: { vocation: '' } });
    expect(wrapper.find('[data-test="vocation-icon"]').exists()).toBe(false);
  });

  it('renders distinct geometry per vocation', () => {
    const teacher = mount(VocationIcon, { props: { vocation: 'teacher' } })
      .find('[data-test="vocation-icon"]').element.innerHTML;
    const church = mount(VocationIcon, { props: { vocation: 'church' } })
      .find('[data-test="vocation-icon"]').element.innerHTML;

    expect(teacher).not.toBe(church);
    expect(teacher.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VocationIcon.spec.ts`
Expected: FAIL — cannot resolve `./VocationIcon.vue` (file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/components/VocationIcon.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ vocation: string }>();

// teacher | church | writer | office | other — see PersonDetail.vocation
const KNOWN = ['teacher', 'church', 'writer', 'office', 'other'];

const isKnown = computed(() => KNOWN.includes(props.vocation));
</script>

<template>
  <svg
    v-if="isKnown"
    class="vocation-icon"
    data-test="vocation-icon"
    :data-vocation="vocation"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="vocation === 'teacher'">
      <path d="M12 7 C 9.5 5.5 6 5.3 3.5 6.2 L 3.5 18 C 6 17.1 9.5 17.3 12 18.8" />
      <path d="M12 7 C 14.5 5.5 18 5.3 20.5 6.2 L 20.5 18 C 18 17.1 14.5 17.3 12 18.8" />
      <line x1="12" y1="7" x2="12" y2="18.8" />
    </template>

    <template v-else-if="vocation === 'church'">
      <line x1="12" y1="3.5" x2="12" y2="20.5" />
      <line x1="6.5" y1="9.5" x2="17.5" y2="9.5" />
    </template>

    <template v-else-if="vocation === 'writer'">
      <line x1="4" y1="20" x2="10.5" y2="13.5" />
      <path d="M10.5 13.5 C 12.5 7.5 16.5 4.5 20.5 3.5 C 19.5 7.5 16.5 11.5 10.5 13.5 Z" />
      <line x1="13" y1="11" x2="17" y2="7" />
    </template>

    <template v-else-if="vocation === 'office'">
      <path d="M6 3.5 L 14.5 3.5 L 18 7 L 18 20.5 L 6 20.5 Z" />
      <path d="M14.5 3.5 L 14.5 7 L 18 7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="14" x2="15" y2="14" />
      <line x1="9" y1="17" x2="12.5" y2="17" />
    </template>

    <template v-else-if="vocation === 'other'">
      <path d="M12 3.5 C 6.5 7 6.5 16 12 20.5 C 17.5 16 17.5 7 12 3.5 Z" />
      <line x1="12" y1="3.5" x2="12" y2="20.5" />
      <path d="M12 8.5 L 9 10.5 M 12 8.5 L 15 10.5 M 12 12.5 L 9.5 14.5 M 12 12.5 L 14.5 14.5" />
    </template>
  </svg>
</template>

<style scoped lang="scss">
.vocation-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
}
</style>
```

Notes:
- `stroke`/`fill` live on the root `<svg>` so each motif's child elements inherit them (DRY) and `currentColor` picks up the surrounding text color.
- `width/height: 1em` makes the icon self-size to its context's font-size — no parent override needed; it stays proportional and subtle.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/VocationIcon.spec.ts`
Expected: PASS — all cases green (5 motifs render, unknown/empty render nothing, distinct geometry).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/VocationIcon.vue src/frontend/src/components/VocationIcon.spec.ts
git commit -m "feat(frontend): add VocationIcon motif component

Subtle per-vocation line-art (teacher/church/writer/office/other)
inheriting currentColor; unknown/empty vocations render nothing.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Show the motif in PersonPopup

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue` (script import; the `.popup__vocation` line in the template; the `&__vocation` SCSS rule)
- Test: `src/frontend/src/components/PersonPopup.spec.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/frontend/src/components/PersonPopup.spec.ts`, inside the existing `describe('PersonPopup (normal)', ...)` block (the `tadeusz` fixture has `vocation: 'teacher'`):

```ts
  it('shows the vocation motif next to the label', () => {
    const wrapper = mountWith(tadeusz);
    const icon = wrapper.find('[data-test="vocation-icon"]');

    expect(icon.exists()).toBe(true);
    expect(icon.attributes('data-vocation')).toBe('teacher');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PersonPopup.spec.ts`
Expected: FAIL — `[data-test="vocation-icon"]` not found (popup does not render the icon yet).

- [ ] **Step 3: Implement the change**

In `src/frontend/src/components/PersonPopup.vue`:

(a) Add the import after the existing component-script imports (near the top `<script setup>` block, alongside the other `import ... from '../...'` lines):

```ts
import VocationIcon from './VocationIcon.vue';
```

(b) Replace this template line:

```html
            <p class="popup__vocation">{{ vocationLabel }}</p>
```

with:

```html
            <p v-if="vocationLabel" class="popup__vocation">
              <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
            </p>
```

(c) In the `<style scoped lang="scss">` block, the shared rule currently reads:

```scss
  &__maiden,
  &__life,
  &__vocation {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--ink-soft);
  }
```

Leave that rule as-is and add a dedicated `&__vocation` rule immediately after it:

```scss
  &__vocation {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
```

Notes:
- `detail` is non-null inside the surrounding `<template v-else-if="detail">`, so `detail.vocation` is safe (matches the existing `detail.biography` / `detail.residences` usage).
- The icon inherits `color: var(--ink-soft)` and `font-size: 13px` from the shared rule, so it renders ~13px in the muted ink tone with no extra sizing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PersonPopup.spec.ts`
Expected: PASS — the new motif test passes and all existing PersonPopup tests (label, lifespan, expand, esc, re-localize, expanded) remain green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "feat(frontend): show vocation motif in PersonPopup

Render VocationIcon beside the vocation label; the line now hides
entirely when no vocation label is present.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verify suite, types, and the rendered result

**Files:** none changed unless a geometry refinement is needed (then `src/frontend/src/components/VocationIcon.vue`).

- [ ] **Step 1: Run the full frontend test suite**

Run: `npm run test`
Expected: PASS — every existing frontend spec plus the two new ones are green.

- [ ] **Step 2: Type-check / build gate**

Run: `npm run build`
Expected: `vue-tsc -b` reports no type errors and `vite build` completes. (Confirms the new component and the `:vocation` binding type-check.)

- [ ] **Step 3: Visually verify the motif in the running app**

Start the dev server and open a person popup (a `teacher` person from `family.json`). Use the preview tooling to:
- take a `preview_snapshot` / `preview_screenshot` of the popup,
- confirm the motif sits next to the vocation label, is subtle (muted ink, ~label height), and reads correctly,
- spot-check at least one other vocation if the data has one.

If any motif looks wrong at real size, refine only the path geometry in `VocationIcon.vue` (the test asserts presence/distinctness, not exact coordinates, so it stays green), re-run Step 1, and re-screenshot.

- [ ] **Step 4: Commit any refinement (only if geometry changed)**

```bash
git add src/frontend/src/components/VocationIcon.vue
git commit -m "style(frontend): refine vocation motif geometry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §2 reusable `VocationIcon.vue` → Task 1. ✓
- §2 integration into `PersonPopup.vue` → Task 2. ✓
- §2 out-of-scope (no OakTree, no i18n keys, no deps) → respected; no task touches them. ✓
- §3 five motifs (book/cross/quill/ledger/leaf) → Task 1 Step 3 renders all five. ✓
- §4 props, MOTIFS-by-vocation, graceful degradation, currentColor, aria-hidden, data-test hooks → Task 1 Step 3 + tests. ✓
- §5 popup integration (`v-if` guard, inline-flex + gap) → Task 2. ✓
- §6 tests: VocationIcon.spec.ts (5 vocations, unknown/empty, aria-hidden) + PersonPopup extension + existing label test stays green → Task 1 / Task 2 / Task 3 Step 1. ✓
- §7 conventions (script-setup, scoped SCSS tokens, data-test, Vitest) → followed throughout. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. Geometry "refinement" in Task 3 is optional polish gated on visual review, not a missing implementation. ✓

**Type/name consistency:** Component exported as default `VocationIcon`, imported as `VocationIcon` (Task 2). Prop name `vocation` used consistently in component, tests, and the `:vocation` binding. `data-test="vocation-icon"` and `data-vocation` identical across component and both spec files. ✓
