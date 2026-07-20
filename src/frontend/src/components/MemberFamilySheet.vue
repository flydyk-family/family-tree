<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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

// Collapsed by default (handle only) so the sheet never occludes the dossier;
// the handle reveals the whole family at once.
const expanded = ref(false);
function toggle(): void {
  expanded.value = !expanded.value;
}
// Collapse again whenever the selected person changes.
watch(() => props.personId, () => { expanded.value = false; });

const groups = computed(() => [
  { key: 'parents', label: t('members.parents'), members: relatives.value.parents },
  { key: 'spouse', label: t('members.spouse'), members: relatives.value.spouses },
  { key: 'siblings', label: t('members.siblings'), members: relatives.value.siblings },
  { key: 'children', label: t('members.children'), members: relatives.value.children }
].filter(g => g.members.length > 0));

const hasFamily = computed(() => groups.value.length > 0);

function name(person: PersonSummary): string {
  return formatPersonName(person.givenName, person.middleName, person.surname, locale.value as Locale);
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
        {{ t('members.familyLabel') }}
        <template v-if="hasFamily"> · {{ expanded ? t('members.showLess') : t('members.showMore') }}</template>
        <span v-else class="family-sheet__handle-note"> · {{ t('members.noFamily') }}</span>
      </span>
    </button>

    <div v-if="expanded" class="family-sheet__body">
      <div v-for="g in groups" :key="g.key" class="family-sheet__group">
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
            <span v-else class="family-sheet__chip-thumb family-sheet__chip-thumb--empty" aria-hidden="true">{{ initial(m) }}</span>
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
// A bottom sheet anchored to the detail pane by the parent. Collapsed it is just
// the handle; expanding reveals the whole family with an inner scroll. Layout
// leaves room for future add/remove affordances (cut 2) — none render now.
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 12px 7px;
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
.family-sheet__body {
  display: flex; flex-direction: column; gap: 16px;
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
.family-sheet__heading {
  margin: 0 0 8px; font-family: var(--font-display); font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: var(--gilt-deep);
}
.family-sheet__chips { display: flex; flex-wrap: wrap; gap: 10px; }
.family-sheet__chip {
  display: flex; align-items: center; gap: 10px; padding: 8px 16px 8px 8px; min-height: 44px;
  background: var(--stat-card-bg); border: 1px solid var(--gilt); border-radius: 10px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.family-sheet__chip-thumb { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gilt); }
.family-sheet__chip-thumb--empty {
  display: flex; align-items: center; justify-content: center;
  background: var(--field-bg); color: var(--ink-soft); font-family: var(--font-display); font-size: 17px;
}
.family-sheet__chip-text { display: flex; flex-direction: column; gap: 1px; }
.family-sheet__chip-name { font-family: var(--font-display); font-size: 16px; color: var(--ink); }
.family-sheet__chip-years { font-size: 12px; font-style: italic; color: var(--ink-soft); }
</style>
