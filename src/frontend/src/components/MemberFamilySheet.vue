<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Locale } from '../constants/locales';
import { formatPersonName } from '../format/personName';
import { formatYearSpan } from '../format/lifespan';
import { deriveRelatives } from '../composables/useRelatives';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { PersonSummary, Union } from '../types/family';

const CHILDREN_PREVIEW_LIMIT = 5;

const props = defineProps<{ personId: string; people: PersonSummary[]; unions: Union[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t, locale } = useI18n({ useScope: 'global' });
const relatives = computed(() => deriveRelatives(props.personId, props.people, props.unions));

// Collapsed by default (handle only) so the sheet never occludes the dossier;
// the handle reveals the whole family at once.
const expanded = ref(false);
function toggle(): void {
  expanded.value = !expanded.value;
}
const showAllChildren = ref(false);
// Collapse again (and re-hide extra children) whenever the selected person changes.
watch(() => props.personId, () => {
  expanded.value = false;
  showAllChildren.value = false;
});

const hasFamily = computed(() => {
  const r = relatives.value;
  return r.parents.length > 0 || r.spouses.length > 0 || r.siblings.length > 0 || r.children.length > 0;
});

const visibleChildren = computed(() => {
  const children = relatives.value.children;
  return showAllChildren.value ? children : children.slice(0, CHILDREN_PREVIEW_LIMIT);
});
const childrenTruncated = computed(() =>
  !showAllChildren.value && relatives.value.children.length > CHILDREN_PREVIEW_LIMIT
);

function marriageYear(spouseId: string): number | null {
  const union = props.unions.find(u => u.partnerIds.includes(props.personId) && u.partnerIds.includes(spouseId));
  return union?.marriageYear ?? null;
}
function marriedLabel(spouseId: string): string | null {
  const year = marriageYear(spouseId);
  return year === null ? null : t('members.married', { year });
}

function name(person: PersonSummary): string {
  return formatPersonName(person.givenName, person.surname, locale.value as Locale);
}
function years(person: PersonSummary): string {
  return formatYearSpan(person.birthYear, person.deathYear);
}
function thumbUrl(person: PersonSummary): string | null {
  const source = person.portraitThumb ?? person.portrait;
  return source ? resolveMediaUrl(source) : null;
}
function initial(person: PersonSummary): string {
  return name(person).charAt(0).toUpperCase();
}
</script>

<template>
  <section
    class="family-sheet"
    :class="{ 'family-sheet--expanded': expanded }"
    data-test="family-sheet"
    :aria-label="t('members.familyLabel')"
  >
    <button
      type="button"
      class="family-sheet__handle"
      data-test="family-sheet-handle"
      :aria-expanded="expanded"
      :disabled="!hasFamily"
      @click="toggle"
    >
      <span class="family-sheet__grip" aria-hidden="true"></span>
      <span class="family-sheet__handle-label">
        <template v-if="hasFamily">{{ t('members.dragForDetails') }}</template>
        <span v-else class="family-sheet__handle-note">{{ t('members.noFamily') }}</span>
      </span>
      <svg
        v-if="hasFamily"
        class="family-sheet__chevron"
        :class="{ 'family-sheet__chevron--open': expanded }"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="expanded" class="family-sheet__body">
      <div class="family-sheet__columns">
        <div
          v-if="relatives.parents.length"
          class="family-sheet__column"
          data-test="family-column-parents"
        >
          <h3 class="family-sheet__heading">{{ t('members.parents') }}</h3>
          <div class="family-sheet__cards">
            <button
              v-for="m in relatives.parents"
              :key="m.id"
              type="button"
              class="family-sheet__card"
              data-test="relative-chip"
              @click="emit('select', m.id)"
            >
              <img v-if="thumbUrl(m)" class="family-sheet__card-thumb" :src="thumbUrl(m) as string" alt="" />
              <span v-else class="family-sheet__card-thumb family-sheet__card-thumb--empty" aria-hidden="true">{{ initial(m) }}</span>
              <span class="family-sheet__card-name">{{ name(m) }}</span>
              <span class="family-sheet__card-years">{{ years(m) }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="relatives.spouses.length"
          class="family-sheet__column"
          data-test="family-column-spouse"
        >
          <h3 class="family-sheet__heading">{{ t('members.spouse') }}</h3>
          <div class="family-sheet__cards">
            <div v-for="m in relatives.spouses" :key="m.id" class="family-sheet__spouse-card">
              <button
                type="button"
                class="family-sheet__card"
                data-test="relative-chip"
                @click="emit('select', m.id)"
              >
                <img v-if="thumbUrl(m)" class="family-sheet__card-thumb" :src="thumbUrl(m) as string" alt="" />
                <span v-else class="family-sheet__card-thumb family-sheet__card-thumb--empty" aria-hidden="true">{{ initial(m) }}</span>
                <span class="family-sheet__card-name">{{ name(m) }}</span>
                <span class="family-sheet__card-years">{{ years(m) }}</span>
              </button>
              <p v-if="marriedLabel(m.id)" class="family-sheet__married">{{ marriedLabel(m.id) }}</p>
            </div>
          </div>
        </div>

        <div
          v-if="relatives.children.length"
          class="family-sheet__column"
          data-test="family-column-children"
        >
          <h3 class="family-sheet__heading">{{ t('members.children') }}</h3>
          <div class="family-sheet__cards">
            <button
              v-for="m in visibleChildren"
              :key="m.id"
              type="button"
              class="family-sheet__card"
              data-test="relative-chip"
              @click="emit('select', m.id)"
            >
              <img v-if="thumbUrl(m)" class="family-sheet__card-thumb" :src="thumbUrl(m) as string" alt="" />
              <span v-else class="family-sheet__card-thumb family-sheet__card-thumb--empty" aria-hidden="true">{{ initial(m) }}</span>
              <span class="family-sheet__card-name">{{ name(m) }}</span>
              <span class="family-sheet__card-years">{{ years(m) }}</span>
            </button>
          </div>
          <button
            v-if="childrenTruncated"
            type="button"
            class="family-sheet__view-all"
            data-test="view-all-children"
            @click="showAllChildren = true"
          >
            {{ t('members.viewAllChildren', { n: relatives.children.length }) }}
          </button>
        </div>
      </div>

      <div
        v-if="relatives.siblings.length"
        class="family-sheet__group family-sheet__group--siblings"
        data-test="family-siblings"
      >
        <h3 class="family-sheet__heading">{{ t('members.siblings') }}</h3>
        <div class="family-sheet__cards">
          <button
            v-for="m in relatives.siblings"
            :key="m.id"
            type="button"
            class="family-sheet__card"
            data-test="relative-chip"
            @click="emit('select', m.id)"
          >
            <img v-if="thumbUrl(m)" class="family-sheet__card-thumb" :src="thumbUrl(m) as string" alt="" />
            <span v-else class="family-sheet__card-thumb family-sheet__card-thumb--empty" aria-hidden="true">{{ initial(m) }}</span>
            <span class="family-sheet__card-name">{{ name(m) }}</span>
            <span class="family-sheet__card-years">{{ years(m) }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// A bottom sheet anchored to the detail pane by the parent. Collapsed it is just
// the handle; expanding reveals the whole family (Parents · Spouse · Children columns,
// plus Siblings when present) with an inner scroll. Layout leaves room for future
// add/remove affordances (cut 2) — none render now.
.family-sheet {
  display: flex;
  flex-direction: column;
  max-height: 44px;
  background: var(--surface-card);
  border: 1px solid var(--gilt);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -8px 24px var(--shadow, rgba(0, 0, 0, 0.18));
  transition: max-height var(--motion-fade-ms, 220ms) ease;

  &--expanded {
    max-height: 66%;
  }
}
.family-sheet__handle {
  flex: 0 0 auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 44px;
  padding: 8px 40px 7px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--panel-edge);
  cursor: pointer;
  &:disabled { cursor: default; }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: -2px; }
}
.family-sheet__grip {
  width: 44px; height: 4px; border-radius: 2px; background: var(--gilt); opacity: 0.75;
}
.family-sheet__handle-label {
  font-family: var(--font-display); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-soft);
}
.family-sheet__handle-note { text-transform: none; font-style: italic; letter-spacing: 0.4px; }
.family-sheet__chevron {
  position: absolute;
  right: 14px;
  top: 50%;
  width: 16px;
  height: 16px;
  color: var(--gilt-deep);
  transform: translateY(-50%);
  transition: transform var(--motion-fade-ms, 220ms) ease;
  &--open { transform: translateY(-50%) rotate(180deg); }
}
.family-sheet__body {
  display: flex; flex-direction: column; gap: 20px;
  padding: 16px 20px 22px;
  overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--gilt) transparent;
  &::-webkit-scrollbar { width: 9px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(var(--gilt-light), var(--gilt));
    border: 1px solid var(--gilt-deep); border-radius: 6px;
  }
}
.family-sheet__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 20px;
}
.family-sheet__column {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.family-sheet__group { display: flex; flex-direction: column; }
.family-sheet__heading {
  margin: 0 0 8px; font-family: var(--font-display); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: var(--gilt-deep);
}
.family-sheet__cards { display: flex; flex-wrap: wrap; gap: 12px; }
.family-sheet__spouse-card { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.family-sheet__card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  min-width: 84px; min-height: 44px; padding: 10px 8px;
  background: var(--stat-card-bg); border: 1px solid var(--gilt); border-radius: 12px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.family-sheet__card-thumb {
  width: 48px; height: 56px; border-radius: 50% / 42%; object-fit: cover; border: 1px solid var(--gilt);
}
.family-sheet__card-thumb--empty {
  display: flex; align-items: center; justify-content: center;
  background: var(--field-bg); color: var(--ink-soft); font-family: var(--font-display); font-size: 18px;
}
.family-sheet__card-name { font-family: var(--font-display); color: var(--ink); font-size: 13px; text-align: center; }
.family-sheet__card-years { font-size: 11px; font-style: italic; color: var(--ink-soft); text-align: center; }
.family-sheet__married { margin: 0; font-size: 12px; font-style: italic; color: var(--ink-soft); text-align: center; }
.family-sheet__view-all {
  align-self: flex-start;
  margin-top: 10px;
  min-height: 44px;
  padding: 0 16px;
  background: var(--stat-card-bg);
  border: 1px solid var(--gilt);
  border-radius: 10px;
  color: var(--gilt-deep);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}

@media (max-width: 720px) {
  .family-sheet__columns {
    grid-template-columns: 1fr;
  }
}
</style>
