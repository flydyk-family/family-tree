import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { MemberDetailDto, TreeEdgeDto, TreeNodeDto } from '@/types/dto'
import { getFamilyTree, getMemberDetail } from '@/api/familyApi'
import { computeLayout } from '@/layout/treeLayout'

export const useFamilyTreeStore = defineStore('familyTree', () => {
  const nodes = ref<TreeNodeDto[]>([])
  const edges = ref<TreeEdgeDto[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const selectedMember = ref<MemberDetailDto | null>(null)
  const selectedMemberLoading = ref(false)
  const selectedMemberError = ref<string | null>(null)

  // Monotonic token so an out-of-order (slow) member response cannot overwrite a newer selection.
  let selectionToken = 0

  const layout = computed(() => computeLayout(nodes.value, edges.value))

  async function loadTree(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const tree = await getFamilyTree()
      nodes.value = tree.nodes
      edges.value = tree.edges
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load the family tree.'
    } finally {
      loading.value = false
    }
  }

  async function selectMember(id: string): Promise<void> {
    const token = ++selectionToken
    selectedMemberLoading.value = true
    selectedMemberError.value = null
    try {
      const detail = await getMemberDetail(id)
      if (token !== selectionToken) {
        return
      }
      selectedMember.value = detail
    } catch (cause) {
      if (token !== selectionToken) {
        return
      }
      selectedMember.value = null
      selectedMemberError.value = cause instanceof Error ? cause.message : 'Failed to load member.'
    } finally {
      if (token === selectionToken) {
        selectedMemberLoading.value = false
      }
    }
  }

  function clearSelection(): void {
    selectionToken += 1
    selectedMember.value = null
    selectedMemberError.value = null
  }

  return {
    nodes,
    edges,
    loading,
    error,
    selectedMember,
    selectedMemberLoading,
    selectedMemberError,
    layout,
    loadTree,
    selectMember,
    clearSelection
  }
})
