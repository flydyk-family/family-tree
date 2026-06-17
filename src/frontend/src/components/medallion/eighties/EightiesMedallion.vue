<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { cardEra, filmVariant } from '../era';
import CabinetCard from './CabinetCard.vue';
import GelatinPrint from './GelatinPrint.vue';
import FilmFrame from './FilmFrame.vue';
import EdgePrintFrame from './EdgePrintFrame.vue';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
const era = computed(() => cardEra(props.node.person.birthYear));
// within the film era, 1990+ births get the holeless edge-print frame
const edgePrint = computed(() => era.value === 'film' && filmVariant(props.node.person.birthYear) === 'edgeprint');
</script>

<template>
  <CabinetCard v-if="era === 'cabinet'" :node="node" :selected="selected" :match="match" />
  <GelatinPrint v-else-if="era === 'gelatin'" :node="node" :selected="selected" :match="match" />
  <EdgePrintFrame v-else-if="edgePrint" :node="node" :selected="selected" :match="match" />
  <FilmFrame v-else :node="node" :selected="selected" :match="match" />
</template>
