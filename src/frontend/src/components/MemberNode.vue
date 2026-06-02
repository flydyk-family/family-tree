<script setup lang="ts">
import { computed } from 'vue'
import type { PositionedNode } from '@/layout/treeLayout'

const props = defineProps<{ node: PositionedNode; selected: boolean }>()
const emit = defineEmits<{ select: [id: string] }>()

const lifespan = computed(() => {
  const { birthYear, deathYear } = props.node
  if (birthYear === null && deathYear === null) {
    return ''
  }
  const born = birthYear ?? '?'
  return deathYear === null ? `${born}` : `${born}–${deathYear}`
})

function choose(): void {
  emit('select', props.node.id)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    choose()
  }
}
</script>

<template>
  <g
    :transform="`translate(${node.x}, ${node.y})`"
    :class="[
      'member-node',
      `member-node--${node.sex.toLowerCase()}`,
      { 'member-node--selected': selected, 'member-node--leaf': node.isLeaf }
    ]"
    role="button"
    tabindex="0"
    :aria-label="lifespan ? `${node.displayName}, ${lifespan}` : node.displayName"
    @click="choose"
    @keydown="onKeydown"
  >
    <circle class="member-node__disc" r="34" />
    <circle v-if="node.isLeaf" class="member-node__leaf" r="6" cx="26" cy="-26" />
    <text class="member-node__name" y="56" text-anchor="middle">{{ node.displayName }}</text>
    <text v-if="lifespan" class="member-node__years" y="74" text-anchor="middle">{{ lifespan }}</text>
  </g>
</template>

<style scoped lang="scss">
@use 'sass:color';
@use '../styles/variables' as *;

.member-node {
  cursor: pointer;
  outline: none;

  &__disc {
    fill: $parchment-deep;
    stroke: $bark-brown;
    stroke-width: 3;
    transition: stroke 0.15s ease, fill 0.15s ease;
  }

  &--male &__disc {
    fill: #cdd3c2;
  }

  &--female &__disc {
    fill: #e6d2c4;
  }

  &__leaf {
    fill: $leaf-sage;
    stroke: $leaf-sage-dark;
    stroke-width: 1.5;
  }

  &__name {
    fill: $ink;
    font-size: 18px;
    font-weight: 600;
  }

  &__years {
    fill: $ink-soft;
    font-size: 14px;
  }

  &:hover &__disc,
  &:focus-visible &__disc {
    stroke: $accent-terracotta;
    stroke-width: 4;
  }

  &--selected &__disc {
    stroke: $accent-terracotta;
    stroke-width: 5;
    fill: color.adjust($accent-terracotta, $lightness: 32%);
  }
}
</style>
