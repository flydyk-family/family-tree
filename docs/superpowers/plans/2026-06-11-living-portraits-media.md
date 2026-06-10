# Living Portraits & Private Media Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real portrait images plus a few-second "living portrait" video in the person popup, served from Cloudflare R2 at `/media/*` so media bytes never enter the public GitHub repo.

**Architecture:** A new optional `portraitVideo` filename field flows JSON → domain → DTOs → frontend exactly like `portrait` does today. Media bytes live in an R2 bucket bound to the existing Cloudflare Pages project and are served same-origin by a new Pages Function (`functions/media/[[path]].ts`) with range-request support; the URL convention moves from `/assets/portraits/…` to `/media/portraits/…`. The detail view (`PersonDetail.vue`, shared by the floating popup and the docked rail) renders video → image → initials with error fallback, and clicking the portrait opens a screen-centered `MediaLightbox` that navigates between clip and still.

**Tech Stack:** .NET 10 (System.Text.Json, Mapster, xUnit + AwesomeAssertions), Vue 3 + TypeScript + Vitest, Cloudflare Pages Functions + R2, wrangler CLI, Vite dev middleware.

**Spec:** [`docs/superpowers/specs/2026-06-10-living-portraits-media-design.md`](../specs/2026-06-10-living-portraits-media-design.md)

**Environment notes (this machine):**
- Run backend commands from the repo root (the `.slnx` is picked up automatically). Run frontend commands from `src/frontend`.
- System Node 18 shadows the required Node 22. Before any `npm`/`node`/`npx` command, prepend the portable Node to PATH:
  - PowerShell: `$env:PATH = "$env:LOCALAPPDATA\Programs\nodejs-22;$env:PATH"`
  - Git Bash: `export PATH="$LOCALAPPDATA/Programs/nodejs-22:$PATH"`
- Work on the current worktree branch; commit after every task. Do **not** merge — the owner reviews the PR (CLAUDE.md workflow).

---

### Task 1: Backend — `portraitVideo` end-to-end (domain, DTOs, loader, mapping, API)

**Files:**
- Modify: `src/backend/FamilyTree.Domain/Person.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonDto.cs`
- Modify: `src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs`
- Test: `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`
- Test: `tests/integration/FamilyTree.IntegrationTests/FamilyEndpointsTests.cs`
- Test: `tests/integration/FamilyTree.IntegrationTests/PeopleEndpointsTests.cs`

No Mapster config change is needed: `PortraitVideo` maps by name, like `Portrait`. No `family.json` change either — the field is optional and the owner adds real filenames later as a data task.

- [ ] **Step 1: Write the failing loader test**

In `tests/unit/FamilyTree.UnitTests/Infrastructure/JsonFamilyDataLoaderTests.cs`, inside the JSON literal of `Deserialize_WhenGivenValidJson_ShouldMapPeopleUnionsAndLowercaseEnums`, add two properties to the `p-0001` person object right after `"vocation": "teacher",`:

```json
              "portrait": "p-0001.jpg",
              "portraitVideo": "p-0001.mp4",
```

And add two assertions right after `person.IsDefaultRoot.Should().BeTrue();`:

```csharp
        person.Portrait.Should().Be("p-0001.jpg");
        person.PortraitVideo.Should().Be("p-0001.mp4");
```

- [ ] **Step 2: Write the failing mapping test**

In `tests/unit/FamilyTree.UnitTests/Application/MappingConfigTests.cs`, add `PortraitVideo = "p-0001.mp4",` to `SamplePerson()` right after `Portrait = "p-0001.jpg",`, then add this test after `Map_WhenPersonToDetail_ShouldMapNestedCollectionsAndEvents`:

```csharp
    [Fact]
    public void Map_WhenPortraitVideoSet_ShouldMapToSummaryAndDetail()
    {
        var summary = SamplePerson().Adapt<PersonSummaryDto>(BuildConfig());
        var detail = SamplePerson().Adapt<PersonDto>(BuildConfig());

        summary.Portrait.Should().Be("p-0001.jpg");
        summary.PortraitVideo.Should().Be("p-0001.mp4");
        detail.Portrait.Should().Be("p-0001.jpg");
        detail.PortraitVideo.Should().Be("p-0001.mp4");
    }
```

- [ ] **Step 3: Verify the tests fail (compile error)**

Run from the repo root: `dotnet test tests/unit/FamilyTree.UnitTests`
Expected: build FAILS with `'Person' does not contain a definition for 'PortraitVideo'` (a compile failure is this step's "red").

- [ ] **Step 4: Add the property to the domain and DTOs**

In `src/backend/FamilyTree.Domain/Person.cs`, after `public string? Portrait { get; init; }`:

```csharp
    public string? PortraitVideo { get; init; }
```

In `src/backend/FamilyTree.Application/Dtos/PersonDto.cs`, after `string? Portrait,`:

```csharp
    string? PortraitVideo,
```

In `src/backend/FamilyTree.Application/Dtos/PersonSummaryDto.cs`, after `string? Portrait,`:

```csharp
    string? PortraitVideo,
```

(Nothing constructs these records positionally outside Mapster — verify with `git grep -n "new PersonDto\|new PersonSummaryDto"`, expected: no matches.)

- [ ] **Step 5: Run the unit tests**

Run: `dotnet test tests/unit/FamilyTree.UnitTests`
Expected: PASS (all tests green).

- [ ] **Step 6: Extend the integration fixture and write failing integration tests**

In `tests/integration/FamilyTree.IntegrationTests/Fixtures/family.test.json`, add to the `p-0001` person right after `"vocation": "church",`:

```json
      "portrait": "p-0001.jpg", "portraitVideo": "p-0001.mp4",
```

In `tests/integration/FamilyTree.IntegrationTests/FamilyEndpointsTests.cs`, add after `GetGraph_WhenCalled_ShouldReturnPeopleAndUnions`:

```csharp
    [Fact]
    public async Task GetGraph_WhenPersonHasPortraitMedia_ShouldIncludeFilenamesInSummary()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/family/graph");
        var graph = await response.Content.ReadFromJsonAsync<FamilyGraphDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var jan = graph!.People.Single(person => person.Id == "p-0001");
        jan.Portrait.Should().Be("p-0001.jpg");
        jan.PortraitVideo.Should().Be("p-0001.mp4");
    }
```

In `tests/integration/FamilyTree.IntegrationTests/PeopleEndpointsTests.cs`, add after `GetById_WhenIdExists_ShouldReturnPerson`:

```csharp
    [Fact]
    public async Task GetById_WhenPersonHasPortraitMedia_ShouldIncludeFilenames()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/people/p-0001");
        var person = await response.Content.ReadFromJsonAsync<PersonDto>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        person!.Portrait.Should().Be("p-0001.jpg");
        person.PortraitVideo.Should().Be("p-0001.mp4");
    }
```

(`System.Linq` is available via implicit usings; `FamilyEndpointsTests.cs` already imports everything else it needs.)

- [ ] **Step 7: Run the integration tests**

Run: `dotnet test tests/integration/FamilyTree.IntegrationTests`
Expected: PASS. (The new tests pass immediately because Step 4 already added the field — the fixture change is what exercises it; if they fail, the JSON edit landed in the wrong person.)

- [ ] **Step 8: Run the whole backend suite and commit**

Run: `dotnet test`
Expected: PASS.

```bash
git add src/backend tests
git commit -m "Carry an optional portraitVideo filename through domain, DTOs, and API"
```

---

### Task 2: Frontend — `portraitVideo` type, `mediaUrl()` helper, medallion path change

**Files:**
- Modify: `src/frontend/src/types/family.ts`
- Create: `src/frontend/src/media/mediaUrl.ts`
- Create: `src/frontend/src/media/mediaUrl.spec.ts`
- Modify: `src/frontend/src/components/PersonMedallion.vue:56-58`
- Modify (fixtures gain `portraitVideo: null`): `src/frontend/src/composables/useFamilyStats.spec.ts:16`, `src/frontend/src/views/ChronicleView.spec.ts:17-18`, `src/frontend/src/views/TreeView.spec.ts:16-17,29`, `src/frontend/src/stores/familyStore.spec.ts:19`, `src/frontend/src/layout/projection.spec.ts:9`, `src/frontend/src/components/OakTree.spec.ts:12-13`, `src/frontend/src/layout/treeLayout.spec.ts:12`, `src/frontend/src/components/PanelRail.spec.ts:17,31`, `src/frontend/src/components/PersonDetail.spec.ts:19`, `src/frontend/src/components/PersonMedallion.spec.ts:19`, `src/frontend/src/components/PersonPopup.spec.ts:20`, `src/frontend/src/components/StatsPanel.spec.ts` (the `person()` factory)

- [ ] **Step 1: Write the failing `mediaUrl` test**

Create `src/frontend/src/media/mediaUrl.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mediaUrl } from './mediaUrl';

describe('mediaUrl', () => {
  it('builds a /media URL for a portrait filename', () => {
    expect(mediaUrl('portraits', 'p-0001.jpg')).toBe('/media/portraits/p-0001.jpg');
  });

  it('URL-encodes filenames so spaces and unicode survive', () => {
    expect(mediaUrl('portraits', 'дед мороз.mp4')).toBe(
      '/media/portraits/%D0%B4%D0%B5%D0%B4%20%D0%BC%D0%BE%D1%80%D0%BE%D0%B7.mp4'
    );
  });
});
```

- [ ] **Step 2: Verify it fails**

Run from `src/frontend`: `npx vitest run src/media/mediaUrl.spec.ts`
Expected: FAIL — cannot resolve `./mediaUrl`.

- [ ] **Step 3: Implement `mediaUrl`**

Create `src/frontend/src/media/mediaUrl.ts`:

```typescript
/**
 * Builds the public URL for a media object. Media is served same-origin at
 * /media/* — by the R2-backed Pages Function in production, and by the local
 * media/ folder (or a proxy to production) under the Vite dev server.
 */
export type MediaKind = 'portraits';

export function mediaUrl(kind: MediaKind, filename: string): string {
  return `/media/${kind}/${encodeURIComponent(filename)}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/media/mediaUrl.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add `portraitVideo` to the frontend types**

In `src/frontend/src/types/family.ts`, add after `portrait: string | null;` in **both** `PersonSummary` (line 21) and `PersonDetail` (line 70):

```typescript
  portraitVideo: string | null;
```

- [ ] **Step 6: Update the medallion to the /media path (failing test first)**

In `src/frontend/src/components/PersonMedallion.spec.ts`, change the existing assertion (line 81) from:

```typescript
    expect(image.attributes('href')).toBe('/assets/portraits/p-0001.jpg');
```

to:

```typescript
    expect(image.attributes('href')).toBe('/media/portraits/p-0001.jpg');
```

and rename that test (line 77) from `'renders a portrait image from the assets path when a portrait exists'` to `'renders a portrait image from the media path when a portrait exists'`.

- [ ] **Step 7: Verify the medallion test fails**

Run: `npx vitest run src/components/PersonMedallion.spec.ts`
Expected: FAIL — href is still `/assets/portraits/p-0001.jpg`. (It may also fail type-check on the fixture missing `portraitVideo`; both are fixed next.)

- [ ] **Step 8: Implement the medallion change**

In `src/frontend/src/components/PersonMedallion.vue`, add to the imports block:

```typescript
import { mediaUrl } from '../media/mediaUrl';
```

and replace lines 56–58:

```typescript
const portraitHref = computed(() =>
  props.node.person.portrait ? `/assets/portraits/${props.node.person.portrait}` : null
);
```

with:

```typescript
const portraitHref = computed(() =>
  props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null
);
```

- [ ] **Step 9: Add `portraitVideo: null` to every spec fixture**

The required field breaks the typed fixtures. In each location below, add `portraitVideo: null,` immediately after the existing `portrait: …,` entry:

- `src/frontend/src/composables/useFamilyStats.spec.ts:16` (the factory default)
- `src/frontend/src/views/ChronicleView.spec.ts:17` and `:18`
- `src/frontend/src/views/TreeView.spec.ts:16`, `:17`, and `:29`
- `src/frontend/src/stores/familyStore.spec.ts:19`
- `src/frontend/src/layout/projection.spec.ts:9`
- `src/frontend/src/components/OakTree.spec.ts:12` and `:13`
- `src/frontend/src/layout/treeLayout.spec.ts:12`
- `src/frontend/src/components/PanelRail.spec.ts:17` and `:31`
- `src/frontend/src/components/PersonDetail.spec.ts:19`
- `src/frontend/src/components/PersonMedallion.spec.ts:19`
- `src/frontend/src/components/PersonPopup.spec.ts:20`
- `src/frontend/src/components/StatsPanel.spec.ts` — inside the object literal returned by the `person()` factory

Then run `npx vue-tsc --noEmit` and fix any remaining flagged fixture the same way (files using `as unknown as` casts won't be flagged — that's fine).

- [ ] **Step 10: Run the full frontend suite and commit**

Run: `npm test` (from `src/frontend`)
Expected: PASS — including the renamed medallion test.

```bash
git add src/frontend
git commit -m "Move portrait URLs to /media and carry portraitVideo in frontend types"
```

---

### Task 3: PersonDetail — inline media chain (video → image → initials)

**Files:**
- Modify: `src/frontend/src/components/PersonDetail.vue`
- Test: `src/frontend/src/components/PersonDetail.spec.ts`

- [ ] **Step 1: Write the failing rendering-matrix tests**

In `src/frontend/src/components/PersonDetail.spec.ts`, add inside the `describe` block:

```typescript
  it('plays the living portrait with the still as poster when both exist', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    const video = w.find('[data-test="portrait-video"]');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe('/media/portraits/p-0016.mp4');
    expect(video.attributes('poster')).toBe('/media/portraits/p-0016.jpg');
    expect(video.attributes()).toHaveProperty('autoplay');
    expect(video.attributes()).toHaveProperty('loop');
    expect(video.attributes()).toHaveProperty('playsinline');
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-fallback"]').exists()).toBe(false);
  });

  it('shows the still image when only a portrait exists', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    const img = w.find('[data-test="portrait-image"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/media/portraits/p-0016.jpg');
    expect(w.find('[data-test="portrait-video"]').exists()).toBe(false);
  });

  it('falls back from a failing video to the still image', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-video"]').trigger('error');
    expect(w.find('[data-test="portrait-video"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(true);
  });

  it('falls back from a failing image to the initials', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    await w.find('[data-test="portrait-image"]').trigger('error');
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });
```

(The existing test `shows the initial when there is no portrait` already covers the no-media case — `tadeusz.portrait` is `null`.)

- [ ] **Step 2: Verify they fail**

Run: `npx vitest run src/components/PersonDetail.spec.ts`
Expected: FAIL — `[data-test="portrait-video"]` / `[data-test="portrait-image"]` don't exist.

- [ ] **Step 3: Implement the media chain**

In `src/frontend/src/components/PersonDetail.vue` `<script setup>`, change the Vue import to include `ref` and `watch`:

```typescript
import { computed, ref, watch } from 'vue';
```

add to the imports:

```typescript
import { mediaUrl } from '../media/mediaUrl';
```

and add after the `initial` computed:

```typescript
// Media failure flags: a broken video falls back to the still, a broken still
// to the initials. Reset whenever a different person is shown.
const videoFailed = ref(false);
const imageFailed = ref(false);
watch(() => detail.value?.id, () => {
  videoFailed.value = false;
  imageFailed.value = false;
});

const stillUrl = computed(() =>
  detail.value?.portrait && !imageFailed.value ? mediaUrl('portraits', detail.value.portrait) : null);
const videoUrl = computed(() =>
  detail.value?.portraitVideo && !videoFailed.value ? mediaUrl('portraits', detail.value.portraitVideo) : null);
const hasMedia = computed(() => videoUrl.value !== null || stillUrl.value !== null);
```

Replace the portrait block in the template:

```html
        <div class="detail__portrait">
          <span class="detail__initial" data-test="portrait-fallback">{{ initial }}</span>
        </div>
```

with:

```html
        <div class="detail__portrait">
          <video
            v-if="videoUrl"
            class="detail__media"
            data-test="portrait-video"
            :src="videoUrl"
            :poster="stillUrl ?? undefined"
            autoplay
            muted
            loop
            playsinline
            @error="videoFailed = true"
          />
          <img
            v-else-if="stillUrl"
            class="detail__media"
            data-test="portrait-image"
            :src="stillUrl"
            alt=""
            @error="imageFailed = true"
          />
          <span v-else class="detail__initial" data-test="portrait-fallback">{{ initial }}</span>
        </div>
```

In the `<style>` block, change `.detail__portrait` to clip media and add `.detail__media`:

```scss
.detail__portrait { flex: 0 0 auto; width: 84px; height: 84px; border-radius: 50%; border: 1px solid var(--glass-border); background: var(--parchment-2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.detail__media { width: 100%; height: 100%; object-fit: cover; display: block; }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/PersonDetail.spec.ts`
Expected: PASS — all existing tests plus the four new ones.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonDetail.vue src/frontend/src/components/PersonDetail.spec.ts
git commit -m "Play the living portrait in the person detail with graceful fallbacks"
```

---

### Task 4: i18n strings + MediaLightbox component

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `src/frontend/src/i18n/messages/ru.ts`, `src/frontend/src/i18n/messages/be.ts`
- Create: `src/frontend/src/media/types.ts`
- Create: `src/frontend/src/components/MediaLightbox.vue`
- Create: `src/frontend/src/components/MediaLightbox.spec.ts`

- [ ] **Step 1: Add the i18n strings**

In each messages file, add a `media` block at the top level, after the `social` block. The keys must match across locales.

`en.ts`:

```typescript
  media: {
    view: 'View portrait of {name}',
    dialog: 'Portrait of {name}',
    prev: 'Previous image',
    next: 'Next image'
  },
```

`ru.ts`:

```typescript
  media: {
    view: 'Открыть портрет — {name}',
    dialog: 'Портрет — {name}',
    prev: 'Предыдущий кадр',
    next: 'Следующий кадр'
  },
```

`be.ts`:

```typescript
  media: {
    view: 'Адкрыць партрэт — {name}',
    dialog: 'Партрэт — {name}',
    prev: 'Папярэдні кадр',
    next: 'Наступны кадр'
  },
```

- [ ] **Step 2: Create the shared media item type**

Create `src/frontend/src/media/types.ts`:

```typescript
export interface MediaItem {
  kind: 'video' | 'image';
  src: string;
  /** Static still shown while a video loads / when autoplay is blocked. */
  poster?: string;
}
```

- [ ] **Step 3: Write the failing MediaLightbox tests**

Create `src/frontend/src/components/MediaLightbox.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../i18n';
import MediaLightbox from './MediaLightbox.vue';
import type { MediaItem } from '../media/types';

const clip: MediaItem = { kind: 'video', src: '/media/portraits/p-0016.mp4', poster: '/media/portraits/p-0016.jpg' };
const still: MediaItem = { kind: 'image', src: '/media/portraits/p-0016.jpg' };

function mountBox(items: MediaItem[]) {
  return mount(MediaLightbox, {
    props: { items, name: 'Tadeusz Kowalski' },
    global: { plugins: [i18n] }
  });
}

describe('MediaLightbox', () => {
  it('opens on the first item (the living portrait) with poster and loop attributes', () => {
    const w = mountBox([clip, still]);
    const video = w.find('[data-test="lightbox-video"]');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe(clip.src);
    expect(video.attributes('poster')).toBe(clip.poster);
    expect(video.attributes()).toHaveProperty('loop');
  });

  it('is a labelled modal dialog', () => {
    const w = mountBox([still]);
    const dialog = w.find('[data-test="media-lightbox"]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toContain('Tadeusz');
  });

  it('navigates between clip and still with the arrow buttons, wrapping', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="lightbox-next"]').trigger('click');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    await w.find('[data-test="lightbox-next"]').trigger('click');
    expect(w.find('[data-test="lightbox-video"]').exists()).toBe(true);
    await w.find('[data-test="lightbox-prev"]').trigger('click');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
  });

  it('navigates with the arrow keys', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(w.find('[data-test="lightbox-video"]').exists()).toBe(true);
  });

  it('hides arrows and dots for a single item, and arrow keys do nothing', async () => {
    const w = mountBox([still]);
    expect(w.find('[data-test="lightbox-prev"]').exists()).toBe(false);
    expect(w.find('[data-test="lightbox-next"]').exists()).toBe(false);
    expect(w.find('[data-test="lightbox-dots"]').exists()).toBe(false);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
  });

  it('emits close on Esc, backdrop click, and the close button', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'Escape' });
    await w.find('[data-test="lightbox-scrim"]').trigger('click');
    await w.find('[data-test="lightbox-close"]').trigger('click');
    expect(w.emitted('close')).toHaveLength(3);
  });

  it('falls back from a failing video to the still instead of closing', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="lightbox-video"]').trigger('error');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    expect(w.emitted('close')).toBeUndefined();
  });

  it('closes when the only item fails to load', async () => {
    const w = mountBox([still]);
    await w.find('[data-test="lightbox-image"]').trigger('error');
    expect(w.emitted('close')).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Verify they fail**

Run: `npx vitest run src/components/MediaLightbox.spec.ts`
Expected: FAIL — cannot resolve `./MediaLightbox.vue`.

- [ ] **Step 5: Implement MediaLightbox**

Create `src/frontend/src/components/MediaLightbox.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaItem } from '../media/types';

const props = defineProps<{ items: MediaItem[]; name: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n({ useScope: 'global' });

const index = ref(0);
const current = computed(() => props.items[index.value]);
const closeRef = ref<HTMLButtonElement | null>(null);

function step(delta: number): void {
  if (props.items.length < 2) return;
  index.value = (index.value + delta + props.items.length) % props.items.length;
}

// A broken video falls back to the still (if there is one); a broken still —
// or a broken only-item — closes the lightbox rather than showing a dead frame.
function onMediaError(): void {
  if (current.value.kind === 'video') {
    const stillIndex = props.items.findIndex((item) => item.kind === 'image');
    if (stillIndex !== -1 && stillIndex !== index.value) {
      index.value = stillIndex;
      return;
    }
  }
  emit('close');
}

onMounted(() => closeRef.value?.focus());
</script>

<template>
  <div
    class="lightbox"
    data-test="media-lightbox"
    role="dialog"
    aria-modal="true"
    :aria-label="t('media.dialog', { name })"
    @keydown.esc.prevent="emit('close')"
    @keydown.left.prevent="step(-1)"
    @keydown.right.prevent="step(1)"
  >
    <div class="lightbox__scrim" data-test="lightbox-scrim" @click="emit('close')" />
    <figure class="lightbox__stage">
      <video
        v-if="current.kind === 'video'"
        class="lightbox__media"
        data-test="lightbox-video"
        :src="current.src"
        :poster="current.poster"
        autoplay
        muted
        loop
        playsinline
        @error="onMediaError"
      />
      <img
        v-else
        class="lightbox__media"
        data-test="lightbox-image"
        :src="current.src"
        alt=""
        @error="onMediaError"
      />
    </figure>
    <button
      ref="closeRef"
      type="button"
      class="lightbox__btn lightbox__close"
      data-test="lightbox-close"
      :aria-label="t('person.close')"
      @click="emit('close')"
    >✕</button>
    <template v-if="items.length > 1">
      <button
        type="button"
        class="lightbox__btn lightbox__nav lightbox__nav--prev"
        data-test="lightbox-prev"
        :aria-label="t('media.prev')"
        @click="step(-1)"
      >‹</button>
      <button
        type="button"
        class="lightbox__btn lightbox__nav lightbox__nav--next"
        data-test="lightbox-next"
        :aria-label="t('media.next')"
        @click="step(1)"
      >›</button>
      <div class="lightbox__dots" data-test="lightbox-dots" aria-hidden="true">
        <span v-for="(item, i) in items" :key="i" class="lightbox__dot" :class="{ 'lightbox__dot--active': i === index }" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
/* Above the person popup overlay (z-index: 60 in PersonPopup.vue). */
.lightbox { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; }
.lightbox__scrim { position: absolute; inset: 0; background: rgba(20, 16, 10, 0.72); }
.lightbox__stage { position: relative; z-index: 1; margin: 0; max-width: min(90vw, 960px); max-height: 85vh; display: flex; align-items: center; justify-content: center; }
.lightbox__media { max-width: 100%; max-height: 85vh; width: auto; height: auto; display: block; border-radius: 8px; box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5); }
.lightbox__btn { position: absolute; z-index: 2; width: 40px; height: 40px; border: none; border-radius: 50%; background: rgba(20, 16, 10, 0.55); color: var(--parchment, #f3ead8); font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; &:hover { background: rgba(20, 16, 10, 0.8); } &:focus-visible { outline: 2px solid var(--parchment, #f3ead8); outline-offset: 2px; } }
.lightbox__close { top: 16px; right: 16px; }
.lightbox__nav { top: 50%; transform: translateY(-50%); font-size: 30px; &--prev { left: 16px; } &--next { right: 16px; } }
.lightbox__dots { position: absolute; z-index: 2; bottom: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
.lightbox__dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(243, 234, 216, 0.45); &--active { background: rgba(243, 234, 216, 0.95); } }
</style>
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/MediaLightbox.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/MediaLightbox.vue src/frontend/src/components/MediaLightbox.spec.ts src/frontend/src/media/types.ts src/frontend/src/i18n/messages
git commit -m "Add a screen-centered media lightbox with still/clip navigation"
```

---

### Task 5: PersonDetail — lightbox trigger, teleport, focus return

**Files:**
- Modify: `src/frontend/src/components/PersonDetail.vue`
- Test: `src/frontend/src/components/PersonDetail.spec.ts`

- [ ] **Step 1: Write the failing trigger tests**

In `src/frontend/src/components/PersonDetail.spec.ts`, change `mountWith` so teleported content renders in place and the DOM is attached (needed for focus assertions):

```typescript
function mountWith(detail: PersonDetailType) {
  const store = useSelectionStore();
  store.$patch({ selectedId: detail.id, detail, mode: 'normal', loading: false, error: null });
  return mount(PersonDetail, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}
```

Then add the tests:

```typescript
  it('makes the portrait a labelled button when media exists', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    const trigger = w.find('[data-test="portrait-trigger"]');
    expect(trigger.exists()).toBe(true);
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.attributes('aria-label')).toContain('Tadeusz');
  });

  it('keeps the initials non-interactive when there is no media', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="portrait-trigger"]').exists()).toBe(false);
  });

  it('opens the lightbox with the clip first and closes it returning focus', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-trigger"]').trigger('click');
    const box = w.findComponent({ name: 'MediaLightbox' });
    expect(box.exists()).toBe(true);
    expect(box.props('items')).toEqual([
      { kind: 'video', src: '/media/portraits/p-0016.mp4', poster: '/media/portraits/p-0016.jpg' },
      { kind: 'image', src: '/media/portraits/p-0016.jpg' }
    ]);
    await box.vm.$emit('close');
    await w.vm.$nextTick();
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(false);
    expect(document.activeElement).toBe(w.find('[data-test="portrait-trigger"]').element);
    w.unmount();
  });
```

- [ ] **Step 2: Verify they fail**

Run: `npx vitest run src/components/PersonDetail.spec.ts`
Expected: FAIL — `[data-test="portrait-trigger"]` does not exist.

- [ ] **Step 3: Implement the trigger and teleported lightbox**

In `src/frontend/src/components/PersonDetail.vue` `<script setup>`, add the imports:

```typescript
import type { MediaItem } from '../media/types';
import MediaLightbox from './MediaLightbox.vue';
```

add after the `hasMedia` computed:

```typescript
const lightboxOpen = ref(false);
const portraitTriggerRef = ref<HTMLButtonElement | null>(null);
const lightboxItems = computed<MediaItem[]>(() => {
  const items: MediaItem[] = [];
  if (videoUrl.value) {
    items.push({ kind: 'video', src: videoUrl.value, poster: stillUrl.value ?? undefined });
  }
  if (stillUrl.value) {
    items.push({ kind: 'image', src: stillUrl.value });
  }
  return items;
});
function closeLightbox(): void {
  lightboxOpen.value = false;
  portraitTriggerRef.value?.focus();
}
```

and extend the person-switch watch to also close the lightbox:

```typescript
watch(() => detail.value?.id, () => {
  videoFailed.value = false;
  imageFailed.value = false;
  lightboxOpen.value = false;
});
```

In the template, replace the Task-3 portrait block:

```html
        <div class="detail__portrait">
          <video ... />
          <img ... />
          <span v-else class="detail__initial" data-test="portrait-fallback">{{ initial }}</span>
        </div>
```

with a button when media exists (media elements unchanged from Task 3):

```html
        <button
          v-if="hasMedia"
          ref="portraitTriggerRef"
          type="button"
          class="detail__portrait detail__portrait--media"
          data-test="portrait-trigger"
          :aria-label="t('media.view', { name: fullName })"
          @click="lightboxOpen = true"
        >
          <video
            v-if="videoUrl"
            class="detail__media"
            data-test="portrait-video"
            :src="videoUrl"
            :poster="stillUrl ?? undefined"
            autoplay
            muted
            loop
            playsinline
            @error="videoFailed = true"
          />
          <img
            v-else
            class="detail__media"
            data-test="portrait-image"
            :src="stillUrl!"
            alt=""
            @error="imageFailed = true"
          />
        </button>
        <div v-else class="detail__portrait">
          <span class="detail__initial" data-test="portrait-fallback">{{ initial }}</span>
        </div>
```

At the end of the template, just before the closing `</div>` of `.detail`, add:

```html
    <Teleport to="body">
      <MediaLightbox v-if="lightboxOpen" :items="lightboxItems" :name="fullName" @close="closeLightbox" />
    </Teleport>
```

In the `<style>` block, add after `.detail__media`:

```scss
.detail__portrait--media { padding: 0; cursor: zoom-in; font: inherit; &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
```

(`Teleport` needs no import — it's a Vue built-in. The `v-else` on the `<img>` keeps the Task-3 fallback semantics: when the video fails, `videoUrl` becomes null and the image renders; when both fail, `hasMedia` turns false and the initials `<div>` takes over.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/PersonDetail.spec.ts`
Expected: PASS — all previous tests plus the three new ones.

- [ ] **Step 5: Run the whole frontend suite (popup/rail render PersonDetail too) and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/frontend/src/components/PersonDetail.vue src/frontend/src/components/PersonDetail.spec.ts
git commit -m "Open a full-size media lightbox from the detail portrait"
```

---

### Task 6: Media-serving pure helpers (key resolution + range parsing)

**Files:**
- Create: `src/frontend/src/media/mediaServing.ts`
- Create: `src/frontend/src/media/mediaServing.spec.ts`

These are the unit-tested core of the Pages Function (Task 7), mirroring how `functions/api/[[path]].ts` keeps its logic in `src/api/apiProxy.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/media/mediaServing.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveMediaKey, parseRange } from './mediaServing';

describe('resolveMediaKey', () => {
  it('maps a /media path to an R2 key', () => {
    expect(resolveMediaKey('/media/portraits/p-0001.jpg')).toBe('portraits/p-0001.jpg');
  });

  it('decodes percent-encoded filenames', () => {
    expect(resolveMediaKey('/media/portraits/%D0%B4%D0%B5%D0%B4.mp4')).toBe('portraits/дед.mp4');
  });

  it.each([
    ['/media/', 'empty key'],
    ['/media/portraits/', 'trailing slash'],
    ['/media//portraits/x.jpg', 'empty segment'],
    ['/media/../secrets.txt', 'dot-dot traversal'],
    ['/media/portraits/%2e%2e/x.jpg', 'encoded traversal'],
    ['/media/portraits/%zz.jpg', 'malformed percent-encoding'],
    ['/elsewhere/x.jpg', 'non-media path'],
    ['/media/portraits/a\\b.jpg', 'backslash']
  ])('rejects %s (%s)', (pathname) => {
    expect(resolveMediaKey(pathname)).toBeNull();
  });
});

describe('parseRange', () => {
  it('returns null (full body) when there is no Range header', () => {
    expect(parseRange(null, 1000)).toBeNull();
  });

  it('parses an open-ended range', () => {
    expect(parseRange('bytes=200-', 1000)).toEqual({ offset: 200, length: 800 });
  });

  it('parses a bounded range inclusively', () => {
    expect(parseRange('bytes=100-199', 1000)).toEqual({ offset: 100, length: 100 });
  });

  it('clamps an end past the object size', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ offset: 900, length: 100 });
  });

  it('parses a suffix range as the last N bytes', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ offset: 0, length: 1000 });
  });

  it('flags a start at or past the size as unsatisfiable', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it.each(['bytes=-', 'bytes=abc-def', 'items=0-10', 'bytes=200-100', 'bytes=0-10,20-30'])(
    'serves the full body for malformed or multi-range header %s',
    (header) => {
      expect(parseRange(header, 1000)).toBeNull();
    }
  );
});
```

- [ ] **Step 2: Verify they fail**

Run: `npx vitest run src/media/mediaServing.spec.ts`
Expected: FAIL — cannot resolve `./mediaServing`.

- [ ] **Step 3: Implement the helpers**

Create `src/frontend/src/media/mediaServing.ts`:

```typescript
/**
 * Pure helpers behind functions/media/[[path]].ts (the R2-backed Pages
 * Function). Kept here, like src/api/apiProxy.ts, so they are type-checked
 * and unit-tested; the function file itself is thin glue.
 */

export interface ByteRange {
  offset: number;
  length: number;
}

/**
 * Maps a request pathname to an R2 object key, or null when the path is not
 * a well-formed /media/<key>. Rejects traversal and empty segments outright —
 * keys are always like `portraits/p-0001.jpg`.
 */
export function resolveMediaKey(pathname: string): string | null {
  if (!pathname.startsWith('/media/')) {
    return null;
  }
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice('/media/'.length));
  } catch {
    return null;
  }
  if (!key || key.includes('\\') || key.endsWith('/')) {
    return null;
  }
  if (key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return key;
}

/**
 * Parses a single-range `Range: bytes=…` header against the object size.
 * Returns null to serve the full body (no header, malformed, or multi-range —
 * per RFC 9110 a server MAY ignore Range), 'unsatisfiable' for a 416, or the
 * byte window to serve with a 206.
 */
export function parseRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }
  if (match[1] === '') {
    // Suffix form bytes=-N: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0) {
      return 'unsatisfiable';
    }
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(match[1]);
  if (start >= size) {
    return 'unsatisfiable';
  }
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (end < start) {
    return null;
  }
  return { offset: start, length: end - start + 1 };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/media/mediaServing.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/media/mediaServing.ts src/frontend/src/media/mediaServing.spec.ts
git commit -m "Add tested key-resolution and range-parsing helpers for media serving"
```

---

### Task 7: Pages Function `/media/*` serving from R2

**Files:**
- Create: `src/frontend/functions/media/[[path]].ts`

No unit test for the function file itself — consistent with `functions/api/[[path]].ts`, all logic lives in the Task-6 helpers. The function deploys automatically with the existing `wrangler pages deploy dist` step (wrangler picks up `functions/` from the working directory); it needs the one-time `MEDIA` R2 binding documented in Task 9.

- [ ] **Step 1: Implement the function**

Create `src/frontend/functions/media/[[path]].ts`:

```typescript
import { resolveMediaKey, parseRange } from '../../src/media/mediaServing';

// Minimal structural slice of the Workers R2Bucket API this function uses
// (the functions/ dir is outside the app tsconfig, so no @cloudflare/workers-types).
interface R2ObjectHead {
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
}
interface R2ObjectBody extends R2ObjectHead {
  body: ReadableStream | null;
}
interface MediaBucket {
  head(key: string): Promise<R2ObjectHead | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
}

interface Env {
  MEDIA?: MediaBucket;
}

// Filenames are immutable by convention (a changed image gets a new name),
// so far-future caching is safe.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!env.MEDIA) {
    // Missing R2 binding — a project misconfiguration, not a client error.
    // Log it clearly instead of throwing an opaque 1101 exception page.
    console.error('Media misconfiguration: the MEDIA R2 bucket binding is missing.');
    return new Response('Bad gateway: media storage is misconfigured.', { status: 502 });
  }

  const key = resolveMediaKey(new URL(request.url).pathname);
  if (!key) {
    return new Response('Bad request.', { status: 400 });
  }

  const head = await env.MEDIA.head(key);
  if (!head) {
    return new Response('Not found.', { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    'content-type': head.httpMetadata?.contentType ?? 'application/octet-stream',
    etag: head.httpEtag,
    'accept-ranges': 'bytes',
    'cache-control': CACHE_CONTROL
  };

  if (request.method === 'HEAD') {
    return new Response(null, { headers: { ...baseHeaders, 'content-length': String(head.size) } });
  }

  const range = parseRange(request.headers.get('range'), head.size);
  if (range === 'unsatisfiable') {
    return new Response('Range not satisfiable.', {
      status: 416,
      headers: { 'content-range': `bytes */${head.size}` }
    });
  }

  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object?.body) {
    return new Response('Not found.', { status: 404 });
  }

  if (range) {
    const lastByte = range.offset + range.length - 1;
    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        'content-length': String(range.length),
        'content-range': `bytes ${range.offset}-${lastByte}/${head.size}`
      }
    });
  }
  return new Response(object.body, {
    headers: { ...baseHeaders, 'content-length': String(head.size) }
  });
};
```

- [ ] **Step 2: Verify nothing regressed**

Run: `npm test` (from `src/frontend`)
Expected: PASS — the function file is outside the vitest/tsconfig scope; this confirms no accidental import breakage.

- [ ] **Step 3: Commit**

```bash
git add "src/frontend/functions/media/[[path]].ts"
git commit -m "Serve /media/* from the R2 bucket with ranges and immutable caching"
```

---

### Task 8: Vite dev/preview `/media` handling; retire the `/assets` proxy

**Files:**
- Modify: `src/frontend/vite.config.ts`

Behavior: when a local `<repo root>/media/` folder exists, the dev server serves it at `/media/*`; otherwise `/media` is proxied to production so contributors see real media (or clean 404s → initials). The `/assets` proxy is removed — that convention is dead (production `/assets` belongs to the SPA bundles).

- [ ] **Step 1: Rewrite `vite.config.ts`**

Replace the entire file with:

```typescript
/// <reference types="vitest" />
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

const versionPath = fileURLToPath(new URL('../../VERSION', import.meta.url));
const version = existsSync(versionPath)
  ? readFileSync(versionPath, 'utf-8').trim()
  : '0.0.0-dev';
const commit = (process.env.APP_COMMIT ?? 'local').slice(0, 7);

// Media (family photos / living-portrait clips) is deliberately NOT in this
// public repo. Locally it lives in the gitignored <repo root>/media folder
// (mirroring the R2 bucket keys); in production it is served from R2 by
// functions/media/[[path]].ts. Dev serves the local folder when it exists,
// and otherwise proxies /media to the production site so the UI shows real
// media (contributors without either just get 404s → initials fallback).
const mediaDir = fileURLToPath(new URL('../../media', import.meta.url));
const hasLocalMedia = existsSync(mediaDir);
const PROD_SITE = 'https://family-tree-4fl.pages.dev';

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

// Minimal static server for the local media folder (no range support — fine
// for short, small dev clips). The '/media' mount strips the prefix from req.url.
function localMediaPlugin(dir: string): Plugin {
  const serve = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      next();
      return;
    }
    const file = join(dir, normalize(pathname).replace(/^[/\\]+/, ''));
    if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
      next();
      return;
    }
    res.setHeader('Content-Type', MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'family-tree:local-media',
    configureServer(server) {
      server.middlewares.use('/media', serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/media', serve);
    }
  };
}

const mediaProxy = hasLocalMedia
  ? {}
  : { '/media': { target: PROD_SITE, changeOrigin: true } };

export default defineConfig({
  plugins: hasLocalMedia ? [vue(), localMediaPlugin(mediaDir)] : [vue()],
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit)
  },
  server: {
    port: 5173,
    // Bind to all interfaces so the dev server is reachable from other devices on
    // the same network (http://<this-machine-LAN-IP>:5173). The /api proxy and
    // /media handling run server-side, so the backend stays on localhost.
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      ...mediaProxy
    }
  },
  // `vite preview` serves the minified production build. /api goes to the local
  // API; /media behaves exactly like dev (local folder or production proxy).
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      ...mediaProxy
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Vitest 4 changed the default worker pool to 'forks' (child processes).
    // Keep the 'threads' pool that Vitest 1 defaulted to: it's faster for this
    // jsdom suite and avoids child-process worker start-up timeouts.
    pool: 'threads',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.d.ts']
    }
  }
});
```

- [ ] **Step 2: Verify the suite and the build still work**

Run from `src/frontend`: `npm test`, then `npm run build`
Expected: both PASS (the config is exercised by every vitest run; `vue-tsc` type-checks nothing new since `vite.config.ts` is covered by `tsconfig.node.json`).

- [ ] **Step 3: Manual dev-server smoke test**

Create a throwaway file `<repo root>/media/portraits/smoke.txt` with any content, then from `src/frontend` run `npm run dev` and request `http://localhost:5173/media/portraits/smoke.txt`.
Expected: 200 with the file content (Content-Type `application/octet-stream`). A missing path like `/media/portraits/nope.jpg` returns the SPA fallback or 404 — either is fine, the UI only needs the load to fail. Delete `media/portraits/smoke.txt` afterwards and stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/vite.config.ts
git commit -m "Serve local media in dev and retire the dead /assets proxy"
```

---

### Task 9: Upload script, .gitignore, owner docs

**Files:**
- Create: `scripts/upload-media.mjs` (repo root)
- Modify: `.gitignore`
- Modify: `docs/ci-cd/deploy.md`
- Modify: `CLAUDE.md` (Deploy Configuration section)

- [ ] **Step 1: Ignore the local media folder**

In `.gitignore`, add after the `.wrangler/` entry:

```gitignore
# Family media (photos / living-portrait clips) — lives in Cloudflare R2,
# never in this public repo. scripts/upload-media.mjs syncs this folder up.
/media/
```

- [ ] **Step 2: Create the upload script**

Create `scripts/upload-media.mjs`:

```javascript
#!/usr/bin/env node
// Uploads the local gitignored <repo root>/media folder to the R2 bucket the
// site serves at /media/* (folder structure mirrors object keys one-to-one).
//
// Usage:   node scripts/upload-media.mjs [--dry-run]
// Auth:    `npx wrangler login` once, or set CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID).
// Bucket:  family-tree-media (override with the R2_BUCKET env var).
//
// Re-running is safe: filenames are immutable by convention (a changed image
// gets a new name), so re-uploads are byte-identical overwrites.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUCKET = process.env.R2_BUCKET ?? 'family-tree-media';
const root = fileURLToPath(new URL('../media', import.meta.url));
const dryRun = process.argv.includes('--dry-run');

const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

if (!existsSync(root)) {
  console.error(`No media folder at ${root} — nothing to upload.`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

const quote = (value) => `"${value.replace(/"/g, '\\"')}"`;
let count = 0;

for (const file of walk(root)) {
  const key = relative(root, file).split('\\').join('/');
  const contentType = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  console.log(`→ ${key} (${contentType})`);
  if (!dryRun) {
    // --remote targets the real bucket (wrangler defaults to local simulation).
    execSync(
      ['npx', 'wrangler', 'r2', 'object', 'put', quote(`${BUCKET}/${key}`),
        '--file', quote(file), '--content-type', contentType, '--remote'].join(' '),
      { stdio: 'inherit' }
    );
  }
  count += 1;
}

console.log(`${count} file(s) ${dryRun ? 'listed (dry run)' : 'uploaded to ' + BUCKET}.`);
```

- [ ] **Step 3: Dry-run the script**

Create a throwaway file `<repo root>/media/portraits/smoke.txt`, then from the repo root run: `node scripts/upload-media.mjs --dry-run`
Expected output:

```
→ portraits/smoke.txt (application/octet-stream)
1 file(s) listed (dry run).
```

Delete `media/portraits/smoke.txt` afterwards. Also verify `git status` does **not** list the `media/` folder (the .gitignore entry works).

- [ ] **Step 4: Document the one-time R2 setup and media workflow**

In `docs/ci-cd/deploy.md`, append a new subsection after the `### Cloudflare (SPA + proxy)` section (before `### GitHub (repo settings)`):

```markdown
### Cloudflare R2 (media)

Family photos and living-portrait clips are **not in the git repo**. They live in an
R2 bucket and are served same-origin at `/media/*` by `src/frontend/functions/media/[[path]].ts`.

One-time setup:

1. Create the bucket: `npx wrangler r2 bucket create family-tree-media`
2. In the Pages project (**family-tree** → Settings → Functions → R2 bucket bindings),
   add binding **`MEDIA`** → bucket **`family-tree-media`** (Production; add Preview too
   if previews should show media). Without the binding, `/media/*` returns 502.

Adding / updating media:

1. Keep originals in the gitignored `<repo root>/media/` folder; its structure mirrors
   object keys (`media/portraits/p-0001.jpg` → `/media/portraits/p-0001.jpg`).
2. **Filenames are immutable** — a changed image gets a *new* name (the function serves
   `Cache-Control: immutable`). Reference the filenames from `family.json`
   (`portrait`, `portraitVideo`).
3. Upload: `node scripts/upload-media.mjs` (add `--dry-run` to preview). Auth via
   `npx wrangler login` or `CLOUDFLARE_API_TOKEN`.
4. Encoding guidance: stills JPEG/WebP ≤ ~200 KB; living-portrait clips MP4 (H.264,
   no audio track), ≤ 720 px on the long edge, 2–6 s, loop-friendly cut.

Verify after upload: `curl -I https://family-tree-4fl.pages.dev/media/portraits/<name>` → 200
with `accept-ranges: bytes` and `cache-control: … immutable`.
```

- [ ] **Step 5: Note the media setup in CLAUDE.md**

In `CLAUDE.md`, in the **Deploy Configuration** section, add a bullet after the "Post-deploy health check" line:

```markdown
- Media (photos / living-portrait clips): **Cloudflare R2** bucket `family-tree-media` bound to the Pages project as `MEDIA`, served same-origin at `/media/*` by `src/frontend/functions/media/[[path]].ts` — media bytes are never committed to this public repo. Local source of truth: gitignored `<repo root>/media/`; upload with `node scripts/upload-media.mjs`.
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/upload-media.mjs docs/ci-cd/deploy.md CLAUDE.md
git commit -m "Add the R2 media upload script and owner setup docs"
```

---

### Task 10: Full verification and PR

- [ ] **Step 1: Backend suite**

Run from the repo root: `dotnet test`
Expected: PASS, zero failures.

- [ ] **Step 2: Frontend suite + production build**

Run from `src/frontend`: `npm test` then `npm run build`
Expected: both PASS (`npm run build` includes the `vue-tsc` type-check).

- [ ] **Step 3: End-to-end smoke (optional but recommended)**

Drop any small `.jpg` into `<repo root>/media/portraits/`, temporarily set that filename as `"portrait"` on one person in `src/backend/FamilyTree.Api/Data/family.json`, run the API (`dotnet run --project src/backend/FamilyTree.Api`) and the dev server (`npm run dev`), open the person: the medallion and the popup portrait show the image, and clicking the popup portrait opens the lightbox. **Revert the `family.json` edit and remove the test image afterwards** (`git checkout -- src/backend/FamilyTree.Api/Data/family.json`).

- [ ] **Step 4: Push and open the PR**

Use the superpowers:finishing-a-development-branch skill. PR base: `main`; title: **"Living portraits: serve family media from R2, never from the repo"**. The body should call out: the `/assets/portraits/` → `/media/portraits/` convention change, the one-time `MEDIA` R2 binding the owner must add before media works in production (docs/ci-cd/deploy.md), and that `family.json` gets real filenames as a separate data task. **Do not merge** — the owner reviews.

---

## Post-implementation (separate effort — not in this plan)

Spec §10: a small generator tool (`gpt-image-2` stills + OpenAI image-to-video living versions, writing into `media/portraits/`). It gets its own spec/plan when picked up.
