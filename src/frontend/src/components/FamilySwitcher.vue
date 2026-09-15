<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamiliesStore } from '../stores/familiesStore';
import { useLocaleStore } from '../stores/localeStore';
import { activeFamilyId, familyLocation, isView, type FamilyView } from '../router/familyRoutes';
import { localize } from '../i18n/localize';
import type { FamilySummary } from '../types/family';

const { t } = useI18n({ useScope: 'global' });
const families = useFamiliesStore();
const localeStore = useLocaleStore();
const route = useRoute();
const router = useRouter();
const labelId = useId();

// The route is the source of truth; the unprefixed routes are the default family.
const activeId = computed(() => activeFamilyId(route) ?? families.defaultFamilyId);

function label(family: FamilySummary): string {
  return localize(family.name, localeStore.currentLocale) || family.id;
}

// Keep the visitor's view where it carries across families. A person page or a selected member
// does not (person ids are per family), so those land on the new family's tree or roster.
function viewForSwitch(): FamilyView {
  if (isView(route, 'chronicle')) {
    return 'chronicle';
  }
  if (isView(route, 'members')) {
    return 'members';
  }
  return 'tree';
}

function switchTo(family: FamilySummary): void {
  // Already on this family — nothing to navigate.
  if (family.id === activeId.value) {
    return;
  }
  void router.push(familyLocation(viewForSwitch(), families.routeFamily(family.id)));
}
</script>

<template>
  <div v-if="families.hasMultiple" class="family-switcher" data-test="family-switcher">
    <span :id="labelId" class="family-switcher__label">{{ t('family.label') }}</span>
    <ul class="family-switcher__list" :aria-labelledby="labelId">
      <li v-for="family in families.families" :key="family.id">
        <button
          type="button"
          class="family-switcher__option"
          :class="{ 'family-switcher__option--on': family.id === activeId }"
          :aria-current="family.id === activeId ? 'true' : undefined"
          data-test="family-switcher-option"
          @click="switchTo(family)"
        >{{ label(family) }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.family-switcher {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.family-switcher__label {
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--gilt-deep);
  font-family: var(--font-display);
}
.family-switcher__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.family-switcher__option {
  font-family: var(--font-body);
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--gilt);
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 17px;
  cursor: pointer;

  &:hover:not(&--on) { background: var(--control-hover); }
  &--on { background: var(--bark); color: var(--on-accent); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
</style>
