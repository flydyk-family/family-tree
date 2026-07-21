<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useMediaQuery, MOBILE_MEDIA_QUERY } from '../composables/useMediaQuery';
import { personSlug, extractPersonId } from '../utils/personSlug';
import MembersIndex from '../components/MembersIndex.vue';
import MemberDetail from '../components/MemberDetail.vue';
import MemberFamilySheet from '../components/MemberFamilySheet.vue';

const store = useFamilyStore();
const { people, unions, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

// Below the app's mobile boundary (< 1200px wide, matching the tree rail) the
// roster and dossier can't comfortably share the viewport, so we drill down: the
// roster is full-screen until a person is picked, then the dossier is full-screen
// with a back control to the roster.
const isNarrow = useMediaQuery(MOBILE_MEDIA_QUERY);

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const selectedId = computed<string | null>(() => {
  const slug = route.params.slug;
  return typeof slug === 'string' ? extractPersonId(slug) : null;
});

function select(id: string): void {
  const person = store.personById(id);
  void router.push({ name: 'members', params: { slug: person ? personSlug(person) : id } });
}

// Clear the selection (drops the slug) so the narrow view returns to the roster.
function backToList(): void {
  void router.push({ name: 'members' });
}
</script>

<template>
  <main class="members" data-test="members-view">
    <p v-if="loading" class="members__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="members__status members__status--error">{{ t('status.error') }}</p>
    <div v-else class="members__layout" :class="{ 'members__layout--detail': isNarrow && selectedId }">
      <!-- Kept mounted (v-show) so the roster's search/filter survives a drill-down
           and is still there on the way back. Hidden on narrow while a person is open. -->
      <MembersIndex
        v-show="!isNarrow || !selectedId"
        class="members__index"
        :people="people"
        :selected-id="selectedId"
        @select="select"
      />
      <div v-if="selectedId" class="members__detail-wrap">
        <button
          v-if="isNarrow"
          type="button"
          class="members__back"
          data-test="members-back"
          @click="backToList"
        >
          <span class="members__back-icon" aria-hidden="true">←</span>
          {{ t('members.backToList') }}
        </button>
        <MemberDetail class="members__detail" :person-id="selectedId" />
        <MemberFamilySheet
          class="members__family"
          :person-id="selectedId"
          :people="people"
          :unions="unions"
          @select="select"
        />
      </div>
      <p v-else-if="!isNarrow" class="members__hint">{{ t('members.pickHint') }}</p>
    </div>
  </main>
</template>

<style scoped lang="scss">
.members { height: 100%; overflow: hidden; }
.members__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: var(--umber, #8a3b32); } }
// No bottom padding: the family sheet (an overlay, not page content) and the
// dossier's own bottom padding already clear the lowest content — extra padding
// here just left a dead gap under the roster/handle.
.members__layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 20px; height: 100%; padding: 16px 16px 0; }
// Carved divider between the left index column and the right person detail.
.members__index { min-height: 0; padding-right: 20px; border-right: 1px solid var(--gilt); }
// The detail wrap is the positioning context for the family bottom sheet, which
// overlays the scrolling dossier rather than scrolling away with it. A flex column
// so the (mobile-only) back bar sits above the scrolling dossier. No overflow
// clipping here — it cut off the panels'/sheet's box-shadow at the left/right
// edges; nothing inside actually needs to be clamped at this level.
.members__detail-wrap { position: relative; min-height: 0; display: flex; flex-direction: column; }
.members__back {
  flex: 0 0 auto; align-self: flex-start;
  display: inline-flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 9px 18px;
  font-family: var(--font-display); font-size: 15px; letter-spacing: 0.5px;
  color: var(--ink); background: var(--surface-card);
  border: 1px solid var(--gilt); border-radius: 999px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.members__back-icon { font-size: 18px; line-height: 1; }
.members__detail {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--gilt) transparent;
  &::-webkit-scrollbar { width: 9px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(var(--gilt-light), var(--gilt));
    border: 1px solid var(--gilt-deep); border-radius: 6px;
  }
}
.members__family { position: absolute; left: 0; right: 0; bottom: 0; }
.members__hint { color: var(--ink-soft); font-style: italic; align-self: start; padding: 24px; }
// Mirror MOBILE_MEDIA_QUERY (the JS drill-down switch) so the CSS single-column
// layout flips at the same boundary — width < 1200px or a short screen.
@media (max-width: 1199.98px), (max-height: 559.98px) {
  .members__layout { grid-template-columns: 1fr; }
  // Single column: drop the vertical divider/padding meant for the two-column split.
  .members__index { border-right: none; padding-right: 0; }
}
</style>
