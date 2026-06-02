import { computed, reactive, type Ref } from 'vue'

export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

const minViewBoxWidth = 80
const maxViewBoxWidth = 40000

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Whole-tree pan and zoom driven entirely through the SVG <c>viewBox</c> (D3 is intentionally not
 * used for transforms, so Vue keeps sole ownership of the DOM). Supports wheel zoom, drag pan, and
 * two-finger pinch via Pointer Events (works on desktop Chrome, iOS Safari and Android Chrome).
 */
export function usePanZoom(svgRef: Ref<SVGSVGElement | null>) {
  const viewBox = reactive<ViewBox>({ x: 0, y: 0, width: 1000, height: 1000 })

  const viewBoxString = computed(
    () => `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
  )

  const pointers = new Map<number, { x: number; y: number }>()
  let lastPan: { x: number; y: number } | null = null
  let lastPinchDistance = 0

  function fitTo(contentWidth: number, contentHeight: number, padding = 90): void {
    const rect = svgRef.value?.getBoundingClientRect()
    const aspect = rect && rect.height > 0 ? rect.width / rect.height : 1

    const paddedWidth = Math.max(contentWidth + padding * 2, minViewBoxWidth)
    const paddedHeight = Math.max(contentHeight + padding * 2, minViewBoxWidth)

    let width = paddedWidth
    let height = paddedHeight
    if (paddedWidth / paddedHeight > aspect) {
      height = paddedWidth / aspect
    } else {
      width = paddedHeight * aspect
    }

    viewBox.width = width
    viewBox.height = height
    viewBox.x = contentWidth / 2 - width / 2
    viewBox.y = contentHeight / 2 - height / 2
  }

  function zoomAt(clientX: number, clientY: number, scale: number): void {
    const rect = svgRef.value?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) {
      return
    }

    const fractionX = (clientX - rect.left) / rect.width
    const fractionY = (clientY - rect.top) / rect.height
    const worldX = viewBox.x + fractionX * viewBox.width
    const worldY = viewBox.y + fractionY * viewBox.height

    const newWidth = clamp(viewBox.width * scale, minViewBoxWidth, maxViewBoxWidth)
    if (newWidth === viewBox.width) {
      // Already at a zoom limit — do not shift the focal point.
      return
    }
    const newHeight = newWidth * (viewBox.height / viewBox.width)

    viewBox.x = worldX - fractionX * newWidth
    viewBox.y = worldY - fractionY * newHeight
    viewBox.width = newWidth
    viewBox.height = newHeight
  }

  /**
   * Keeps the view box aspect ratio matched to the container so the SVG's `xMidYMid meet` mapping
   * stays linear (no letterboxing) — preserves the current zoom and centre on resize/rotation.
   */
  function syncAspect(containerWidth: number, containerHeight: number): void {
    if (containerWidth <= 0 || containerHeight <= 0 || viewBox.height === 0) {
      return
    }
    const aspect = containerWidth / containerHeight
    const centerY = viewBox.y + viewBox.height / 2
    const newHeight = viewBox.width / aspect
    viewBox.y = centerY - newHeight / 2
    viewBox.height = newHeight
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1.1 : 0.9)
  }

  function onPointerDown(event: PointerEvent): void {
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) {
      lastPan = { x: event.clientX, y: event.clientY }
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) {
      return
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.size === 1 && lastPan) {
      panBy(event.clientX - lastPan.x, event.clientY - lastPan.y)
      lastPan = { x: event.clientX, y: event.clientY }
      return
    }

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()]
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      const midX = (first.x + second.x) / 2
      const midY = (first.y + second.y) / 2
      if (lastPinchDistance > 0 && distance > 0) {
        zoomAt(midX, midY, lastPinchDistance / distance)
      }
      lastPinchDistance = distance
    }
  }

  function onPointerUp(event: PointerEvent): void {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) {
      lastPinchDistance = 0
    }
    if (pointers.size === 0) {
      lastPan = null
    }
  }

  function panBy(deltaClientX: number, deltaClientY: number): void {
    const rect = svgRef.value?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) {
      return
    }
    viewBox.x -= (deltaClientX / rect.width) * viewBox.width
    viewBox.y -= (deltaClientY / rect.height) * viewBox.height
  }

  return {
    viewBox,
    viewBoxString,
    fitTo,
    syncAspect,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp
  }
}
