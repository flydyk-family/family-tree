<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useUiStore } from '../stores/uiStore';
import { usePanelStore } from '../stores/panelStore';
import { buildLayout } from '../layout/treeLayout';
import { projectLayout } from '../layout/projection';
import { useSearchMatches } from '../composables/useSearchMatches';
import type { CenterRequest, Viewport } from '../interactions/panZoom';
import { useMediaQuery, MOBILE_MEDIA_QUERY, SLIM_MEDIA_QUERY } from '../composables/useMediaQuery';
import { useEntranceCeremony } from '../motion/useEntranceCeremony';
import { useDockMorph } from '../composables/useDockMorph';
import { useLayoutMorph, type CameraHandle } from '../composables/useLayoutMorph';
import { branchFade } from '../motion/layoutFlip';
import TimeRail from '../components/TimeRail.vue';
import OakTree from '../components/OakTree.vue';
import PersonPopup from '../components/PersonPopup.vue';
import PanelRail from '../components/PanelRail.vue';

const store = useFamilyStore();
const selection = useSelectionStore();
const ui = useUiStore();
const panel = usePanelStore();
const dockMorph = useDockMorph();
const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
const isSlim = useMediaQuery(SLIM_MEDIA_QUERY);
// Slim screens default to the horizontal layout (the oak reads better wide-on-a-
// phone); a manual orientation toggle still wins for the session.
watch(isSlim, slim => ui.applyResponsiveOrientation(slim ? 'horizontal' : 'vertical'), { immediate: true });
const { people, unions, focusId, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

// The oak owns the pan/zoom gesture surface and reports its viewport up so the
// time rail can apply the same transform and stay aligned.
const oakViewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
function onViewport(value: Viewport): void {
  oakViewport.value = value;
}

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const selectedId = computed(() => {
  const id = route.params.id;
  return typeof id === 'string' ? id : null;
});

// Panel store expandedId → selection store + URL: when the user expands a panel
// (e.g. via the rail controls) we fetch the person's detail and keep the URL in
// sync. Guards on the current route value prevent infinite navigation loops.
// Registered BEFORE the selectedId watcher so it catches changes made by the
// selectedId watcher's immediate firing.
watch(
  () => panel.expandedId,
  id => {
    if (id) {
      void selection.open(id);
      if (route.params.id !== id) {
        void router.replace({ name: 'person', params: { id } });
      }
    } else {
      selection.close();
      if (route.name !== 'tree') {
        void router.replace({ name: 'tree' });
      }
    }
  }
);

// Route param → panel store: opening a /person/:id URL opens (or expands) that
// person's panel. Navigating back to the tree root minimizes all person panels.
// NOTE: popup is NOT opened here — only tree-clicks open the popup so that
// expandPerson (which also updates the route) does not accidentally open it.
watch(
  selectedId,
  id => {
    if (id) {
      panel.openPerson(id);
    } else {
      panel.minimizeAllPersons();
    }
  },
  { immediate: true }
);

function onSelect(id: string): void {
  // Capture the clicked medallion now (before the popup mounts) so the bigger
  // view can grow out of it.
  const medallion = document.querySelector(`[data-node-id="${id}"]`);
  void router.push({ name: 'person', params: { id } }).finally(() => {
    if (!isMobile.value) {
      void dockMorph.openFrom(id, medallion);
    }
  });
}

const baseLayout = computed(() => {
  if (!focusId.value || people.value.length === 0) return null;
  return buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
});
const layout = computed(() => (baseLayout.value ? projectLayout(baseLayout.value, ui.orientation) : null));

const oakRef = ref<InstanceType<typeof OakTree> | null>(null);
// OakTree exposes animateFitTo via defineExpose; narrow to the camera handle the
// morph needs (a plain cast avoids Ref-invariance friction with the instance type).
const oakCamera = computed<CameraHandle | null>(() => oakRef.value as CameraHandle | null);

const { displayLayout, morphProgress, branchOrientation } = useLayoutMorph({
  baseLayout,
  orientation: computed(() => ui.orientation),
  orientationExplicit: computed(() => ui.orientationExplicit),
  oak: oakCamera
});

// Entrance ceremony: once per session the oak grows from its roots. The oak
// component hands out its svg + viewport refs; this view owns the gating,
// the replay control, and tap-to-skip.
const { cues: entranceCues, active: entranceActive, canReplay, replay, skip: skipEntrance } = useEntranceCeremony({
  layout,
  orientation: computed(() => ui.orientation),
  oak: oakRef,
  isDeepLink: () => route.name === 'person'
});

const SEARCH_CENTER_DEBOUNCE_MS = 300;

// Search → camera: follow the current match. Typing is debounced; Enter
// (cursor change) is an explicit command and applies immediately. A match
// outside the rendered layout re-roots the tree onto that person first.
const { current } = useSearchMatches();
const centerRequest = ref<CenterRequest | null>(null);
let centerSeq = 0;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function clearSearchDebounce(): void {
  if (searchDebounce != null) {
    clearTimeout(searchDebounce);
    searchDebounce = null;
  }
}

watch(
  [() => current.value?.id ?? null, () => ui.searchCursor],
  ([id, cursor], [, prevCursor]) => {
    clearSearchDebounce();
    if (!id) {
      centerRequest.value = null;
      return;
    }
    const apply = (): void => {
      if (baseLayout.value && !baseLayout.value.nodes.some(node => node.id === id)) {
        store.setFocus(id);
      }
      centerRequest.value = { id, seq: ++centerSeq };
    };
    // A cursor delta means Enter (or setSearch's reset from a non-zero cursor,
    // which then centers one keystroke eagerly — acceptable): apply at once.
    // A pure id change means typing: debounce. The timer is keyed on the
    // target, not the keystroke — same-target keystrokes keep the original
    // deadline, which is intended.
    if (cursor !== prevCursor) {
      apply();
    } else {
      searchDebounce = setTimeout(() => {
        searchDebounce = null;
        apply();
      }, SEARCH_CENTER_DEBOUNCE_MS);
    }
  }
);

onBeforeUnmount(clearSearchDebounce);
</script>

<template>
  <main class="tree-view">
    <p v-if="loading" class="tree-view__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="tree-view__status tree-view__status--error">{{ t('status.error') }}</p>
    <div v-else-if="layout" class="tree-view__canvas" :class="`tree-view__canvas--${ui.orientation}`">
      <TimeRail
        class="tree-view__rail"
        :scale="layout.scale"
        :viewport="oakViewport"
        :orientation="ui.orientation"
        :style="{ opacity: entranceActive ? 0 : branchFade(morphProgress), transition: 'opacity var(--motion-fade-ms) ease' }"
      />
      <div
        class="tree-view__oak"
        @pointerdown.capture="skipEntrance"
        @wheel.capture="skipEntrance"
        @touchstart.capture="skipEntrance"
        @keydown.capture="skipEntrance"
      >
        <OakTree
          ref="oakRef"
          :layout="displayLayout ?? layout"
          :selected-id="selectedId"
          :orientation="ui.orientation"
          :branch-orientation="branchOrientation"
          :morph-progress="morphProgress"
          :ceremony-active="entranceActive"
          :center-request="centerRequest"
          :entrance-cues="entranceCues"
          @select="onSelect"
          @viewport="onViewport"
        />
        <button
          v-if="canReplay"
          type="button"
          class="tree-view__replay"
          data-test="entrance-replay"
          :aria-label="t('entrance.replay')"
          @click="replay"
        >&#10227; {{ t('entrance.replay') }}</button>
      </div>
    </div>

    <PanelRail v-if="layout" :people="people" />
    <PersonPopup v-if="panel.biggerViewId" />
  </main>
</template>

<style scoped lang="scss">
.tree-view {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;

  &__status {
    padding: 24px;
    font-style: italic;
    &--error { color: #8a3b32; }
  }

  &__canvas { display: flex; height: 100%; width: 100%; }
  &__canvas--horizontal { flex-direction: column-reverse; }
  &__rail { flex: 0 0 auto; overflow: hidden; }
  &__canvas--vertical &__rail { width: 88px; height: 100%; }
  &__canvas--horizontal &__rail { width: 100%; height: 62px; }
  &__oak {
    flex: 1 1 auto; min-width: 0; min-height: 0;
    position: relative; border: 1px solid var(--panel-edge); border-radius: 10px; overflow: hidden;
    background: var(--canvas-bg);
    box-shadow: inset 0 0 40px rgba(120, 150, 70, 0.10);
  }
  &__replay {
    position: absolute; right: 14px; bottom: 14px; z-index: 2;
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 14px; border-radius: 9px; cursor: pointer;
    background: var(--surface-card);
    border: 1px solid var(--gilt); color: var(--ink);
    font-family: var(--font-display); font-size: 14px; letter-spacing: 0.4px;
    box-shadow: 0 4px 12px var(--shadow);
    &:hover { border-color: var(--gilt-deep); }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }
  @media (max-width: 640px) { &__canvas--vertical &__rail { width: 64px; } }
}
</style>
