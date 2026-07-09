<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Locale } from '../constants/locales';
import { formatPersonName } from '../format/personName';
import { formatYearSpan } from '../format/lifespan';
import { deriveRelatives } from '../composables/useRelatives';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { PersonSummary, Union } from '../types/family';

const props = defineProps<{ personId: string; people: PersonSummary[]; unions: Union[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t, locale } = useI18n({ useScope: 'global' });
const relatives = computed(() => deriveRelatives(props.personId, props.people, props.unions));

const expanded = ref(false);
function toggle(): void {
  expanded.value = !expanded.value;
}

// Peek shows the vertical line — parents, spouse, children. Siblings (the wider
// cohort) reveal on expand, matching the approved bottom-sheet design.
const peekGroups = computed(() => [
  { key: 'parents', label: t('members.parents'), members: relatives.value.parents },
  { key: 'spouse', label: t('members.spouse'), members: relatives.value.spouses },
  { key: 'children', label: t('members.children'), members: relatives.value.children }
].filter(g => g.members.length > 0));

const siblingGroup = computed(() => {
  const members = relatives.value.siblings;
  return members.length > 0 ? { key: 'siblings', label: t('members.siblings'), members } : null;
});

const visibleGroups = computed(() =>
  expanded.value && siblingGroup.value ? [...peekGroups.value, siblingGroup.value] : peekGroups.value
);

const canExpand = computed(() => siblingGroup.value !== null);

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
      :disabled="!canExpand"
      @click="toggle"
    >
      <span class="family-sheet__grip" aria-hidden="true"></span>
      <span class="family-sheet__handle-label">
        {{ t('members.familyLabel') }}
        <template v-if="canExpand">· {{ expanded ? t('members.showLess') : t('members.showMore') }}</template>
      </span>
    </button>

    <div class="family-sheet__body">
      <div v-for="g in visibleGroups" :key="g.key" class="family-sheet__group">
        <h3 class="family-sheet__heading">{{ g.label }}</h3>
        <div class="family-sheet__chips">
          <button
            v-for="m in g.members"
            :key="m.id"
            type="button"
            class="family-sheet__chip"
            data-test="relative-chip"
            @click="emit('select', m.id)"
          >
            <img v-if="thumbUrl(m)" class="family-sheet__chip-thumb" :src="thumbUrl(m) as string" alt="" />
            <span v-else class="family-sheet__chip-thumb family-sheet__chip-thumb--empty" aria-hidden="true"></span>
            <span class="family-sheet__chip-text">
              <span class="family-sheet__chip-name">{{ name(m) }}</span>
              <span class="family-sheet__chip-years">{{ years(m) }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// A bottom sheet anchored to the detail pane by the parent. Peek height shows
// the immediate line; expanding grows it (and reveals siblings) with an inner
// scroll. Layout leaves room for future add/remove affordances (cut 2) — none
// are rendered now.
.family-sheet {
  display: flex;
  flex-direction: column;
  max-height: 42%;
  background: var(--surface-card);
  border-top: 1px solid var(--gilt);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -8px 24px var(--shadow, rgba(0, 0, 0, 0.18));
  transition: max-height var(--motion-fade-ms, 220ms) ease;

  &--expanded {
    max-height: 72%;
  }
}
.family-sheet__handle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 12px 6px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--panel-edge);
  cursor: pointer;
  &:disabled { cursor: default; }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: -2px; }
}
.family-sheet__grip {
  width: 42px; height: 4px; border-radius: 2px; background: var(--gilt); opacity: 0.7;
}
.family-sheet__handle-label {
  font-family: var(--font-display); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-soft);
}
.family-sheet__body {
  display: flex; flex-direction: column; gap: 14px;
  padding: 14px 18px 20px;
  overflow-y: auto;
}
.family-sheet__heading {
  margin: 0 0 8px; font-family: var(--font-display); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-soft);
}
.family-sheet__chips { display: flex; flex-wrap: wrap; gap: 10px; }
.family-sheet__chip {
  display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; min-height: 44px;
  background: var(--stat-card-bg); border: 1px solid var(--panel-edge); border-radius: 10px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.family-sheet__chip-thumb { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.family-sheet__chip-thumb--empty { background: var(--field-bg); border: 1px solid var(--panel-edge); }
.family-sheet__chip-text { display: flex; flex-direction: column; gap: 1px; }
.family-sheet__chip-name { font-family: var(--font-display); color: var(--ink); }
.family-sheet__chip-years { font-size: 12px; font-style: italic; color: var(--ink-soft); }
</style>
