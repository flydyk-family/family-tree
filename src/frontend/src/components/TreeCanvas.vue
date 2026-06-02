<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { TreeLayout } from '@/layout/treeLayout'
import { usePanZoom } from '@/composables/usePanZoom'
import { useElementSize } from '@/composables/useElementSize'
import TreeEdge from './TreeEdge.vue'
import MemberNode from './MemberNode.vue'
import YearAxis from './YearAxis.vue'

const props = defineProps<{ layout: TreeLayout; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)

const { width: containerWidth, height: containerHeight } = useElementSize(containerRef)
const { viewBox, viewBoxString, fitTo, syncAspect, onWheel, onPointerDown, onPointerMove, onPointerUp } =
  usePanZoom(svgRef)

let hasFitted = false

function fit(): void {
  fitTo(props.layout.width, props.layout.height)
  hasFitted = true
}

onMounted(async () => {
  await nextTick()
  fit()
})

watch(() => [props.layout.width, props.layout.height], fit)

// On resize/rotation keep the view-box aspect matched to the container so the year axis stays
// aligned with the nodes, without discarding the user's current zoom/pan.
watch([containerWidth, containerHeight], () => {
  if (hasFitted) {
    syncAspect(containerWidth.value, containerHeight.value)
  }
})
</script>

<template>
  <div ref="containerRef" class="tree-canvas">
    <svg
      ref="svgRef"
      class="tree-canvas__svg"
      :viewBox="viewBoxString"
      preserveAspectRatio="xMidYMid meet"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <g class="tree-canvas__edges">
        <TreeEdge v-for="(edge, index) in layout.edges" :key="index" :edge="edge" />
      </g>
      <g class="tree-canvas__nodes">
        <MemberNode
          v-for="node in layout.nodes"
          :key="node.id"
          :node="node"
          :selected="node.id === selectedId"
          @select="emit('select', $event)"
        />
      </g>
    </svg>

    <YearAxis
      :view-box="viewBox"
      :container-height="containerHeight"
      :min-birth-year="layout.minBirthYear"
      :max-birth-year="layout.maxBirthYear"
      :y-top="layout.yTop"
      :y-bottom="layout.yBottom"
    />
  </div>
</template>

<style scoped lang="scss">
.tree-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;

  &__svg {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none; // gestures are handled manually via Pointer Events
    cursor: grab;
  }

  &__svg:active {
    cursor: grabbing;
  }
}
</style>
