<script setup lang="ts">
import { computed } from 'vue'
import type { PositionedEdge } from '@/layout/treeLayout'

const props = defineProps<{ edge: PositionedEdge }>()

const path = computed(() => {
  const { x1, y1, x2, y2 } = props.edge
  if (props.edge.kind === 'Spouse') {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  // Parent-child: a soft S-curve from the parent down to the child, like a bending branch.
  const midY = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
})
</script>

<template>
  <path :class="['tree-edge', `tree-edge--${edge.kind.toLowerCase()}`]" :d="path" />
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.tree-edge {
  fill: none;
  stroke: $bark-light;
  stroke-linecap: round;

  &--parentchild {
    stroke: $bark-brown;
    stroke-width: 4;
  }

  &--spouse {
    stroke: $accent-terracotta;
    stroke-width: 2;
    stroke-dasharray: 6 5;
  }
}
</style>
