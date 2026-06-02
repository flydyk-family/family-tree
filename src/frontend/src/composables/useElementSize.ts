import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** Tracks an element's pixel size via ResizeObserver (no-op where the observer is unavailable). */
export function useElementSize(target: Ref<HTMLElement | null>) {
  const width = ref(0)
  const height = ref(0)
  let observer: ResizeObserver | null = null

  onMounted(() => {
    const element = target.value
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }

    observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) {
        width.value = rect.width
        height.value = rect.height
      }
    })
    observer.observe(element)
    width.value = element.clientWidth
    height.value = element.clientHeight
  })

  onUnmounted(() => observer?.disconnect())

  return { width, height }
}
