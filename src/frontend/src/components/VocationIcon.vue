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
