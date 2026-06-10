<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useFamilyStats } from '../composables/useFamilyStats';
import { buildLayout } from '../layout/treeLayout';

const store = useFamilyStore();
const { people, unions, focusId, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const router = useRouter();

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const family = useFamilyStats(people);
const earliest = family.earliestBirthYear;

// Generation count is read off the laid-out oak so it stays consistent with the
// Tree view (same focus, same parent/union resolution).
const generations = computed<number>(() => {
  if (!focusId.value || people.value.length === 0) {
    return 0;
  }
  const layout = buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
  return new Set(layout.nodes.map(node => node.generation)).size;
});

const stats = computed(() => [
  { key: 'members', label: t('stats.members'), value: family.members.value },
  { key: 'generations', label: t('stats.generations'), value: generations.value || '—' },
  { key: 'earliest', label: t('stats.earliest'), value: earliest.value ?? '—' },
  { key: 'withPortraits', label: t('stats.withPortraits'), value: family.withPortraits.value },
  { key: 'living', label: t('stats.living'), value: family.living.value }
]);

const intro = computed(() => t('chronicle.intro', { year: earliest.value ?? '—' }));

function enterTree(): void {
  void router.push({ name: 'tree' });
}
</script>

<template>
  <main class="chronicle" data-test="chronicle-view">
    <p v-if="loading" class="chronicle__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="chronicle__status chronicle__status--error">{{ t('status.error') }}</p>
    <article v-else class="chronicle__page">
      <h2 class="chronicle__heading">{{ t('chronicle.heading') }}</h2>
      <div class="chronicle__rule" aria-hidden="true"></div>
      <p class="chronicle__intro">{{ intro }}</p>
      <dl class="chronicle__stats">
        <div v-for="s in stats" :key="s.key" class="chronicle__stat" :data-test="`chronicle-stat-${s.key}`">
          <dt class="chronicle__stat-value">{{ s.value }}</dt>
          <dd class="chronicle__stat-label">{{ s.label }}</dd>
        </div>
      </dl>
      <button type="button" class="chronicle__enter" data-test="chronicle-enter" @click="enterTree">
        {{ t('chronicle.enter') }} →
      </button>
    </article>
  </main>
</template>

<style scoped lang="scss">
.chronicle {
  height: 100%;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 5vh 20px;

  &__status {
    padding: 24px;
    font-style: italic;
    color: var(--ink-soft);
    &--error { color: #8a3b32; }
  }

  &__page {
    position: relative;
    width: 100%;
    max-width: 660px;
    margin: auto 0;
    padding: 34px 40px 34px;
    background: linear-gradient(#f8f2df, #f1e7cb);
    border: 1px solid var(--gilt);
    border-radius: 12px;
    box-shadow: 0 10px 30px var(--shadow);

    &::before {
      content: '';
      position: absolute;
      inset: 6px;
      border: 1px solid rgba(183, 145, 63, 0.35);
      border-radius: 8px;
      pointer-events: none;
    }
  }

  &__heading {
    margin: 2px 0 0;
    text-align: center;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 2px;
    font-size: 34px;
    color: var(--ink);
  }

  &__rule {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gilt), transparent);
    margin: 12px 2px 18px;
  }

  &__intro {
    margin: 0 0 24px;
    font-family: var(--font-body);
    font-size: 22px;
    line-height: 1.6;
    color: var(--ink-soft);
    text-align: justify;

    // illuminated initial, in keeping with the chronicle masthead
    &::first-letter {
      font-family: var(--font-accent);
      font-size: 3.4em;
      line-height: 0.78;
      float: left;
      margin: 4px 10px 0 0;
      color: var(--umber);
    }
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    gap: 12px;
    margin: 0 0 26px;
  }

  &__stat {
    text-align: center;
    padding: 12px 6px;
    border: 1px solid var(--panel-edge);
    border-radius: 8px;
    background: rgba(255, 253, 245, 0.5);
  }
  &__stat-value {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 34px;
    color: var(--umber);
  }
  &__stat-label {
    margin: 4px 0 0;
    font-family: var(--font-body);
    font-size: 17.5px;
    color: var(--ink-soft);
  }

  &__enter {
    display: block;
    margin: 0 auto;
    padding: 10px 22px;
    font-family: var(--font-display);
    font-size: 19px;
    letter-spacing: 0.5px;
    color: var(--on-accent);
    background: var(--bark);
    border: 1px solid var(--bark-dark);
    border-radius: 9px;
    cursor: pointer;

    &:hover { background: var(--bark-dark); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
  }
}
@media (max-width: 640px) {
  .chronicle__page { padding: 24px 20px; }
  .chronicle__intro { font-size: 20px; text-align: left; }
}
</style>
