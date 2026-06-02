import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { FamilyTreeDto, MemberDetailDto } from '@/types/dto'
import { useFamilyTreeStore } from '@/stores/familyTree'
import * as familyApi from '@/api/familyApi'

vi.mock('@/api/familyApi')

const tree: FamilyTreeDto = {
  nodes: [
    {
      id: 'a',
      displayName: 'A',
      generation: 0,
      sex: 'Male',
      birthYear: 1740,
      deathYear: 1805,
      photoUrl: null,
      isLeaf: false
    }
  ],
  edges: [],
  minGeneration: 0,
  maxGeneration: 0
}

const member: MemberDetailDto = {
  id: 'a',
  displayName: 'A',
  sex: 'Male',
  birthDateText: '1740',
  deathDateText: '1805',
  birthPlace: null,
  photoUrl: null,
  keyFacts: [],
  bio: null,
  socialLinks: []
}

describe('useFamilyTreeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('familyTreeStore_whenLoadTreeSucceeds_shouldPopulateNodes', async () => {
    vi.mocked(familyApi.getFamilyTree).mockResolvedValue(tree)
    const store = useFamilyTreeStore()

    await store.loadTree()

    expect(store.nodes).toHaveLength(1)
    expect(store.error).toBeNull()
  })

  it('familyTreeStore_whenLoadTreeFails_shouldSetError', async () => {
    vi.mocked(familyApi.getFamilyTree).mockRejectedValue(new Error('boom'))
    const store = useFamilyTreeStore()

    await store.loadTree()

    expect(store.nodes).toHaveLength(0)
    expect(store.error).toBe('boom')
  })

  it('familyTreeStore_whenSelectMember_shouldFetchDetailAndSetSelected', async () => {
    vi.mocked(familyApi.getMemberDetail).mockResolvedValue(member)
    const store = useFamilyTreeStore()

    await store.selectMember('a')

    expect(store.selectedMember).toEqual(member)
  })

  it('familyTreeStore_whenSelectMemberRacesOutOfOrder_shouldKeepLatestSelection', async () => {
    let resolveA!: (value: MemberDetailDto) => void
    let resolveB!: (value: MemberDetailDto) => void
    const pendingA = new Promise<MemberDetailDto>((resolve) => {
      resolveA = resolve
    })
    const pendingB = new Promise<MemberDetailDto>((resolve) => {
      resolveB = resolve
    })
    vi.mocked(familyApi.getMemberDetail).mockReturnValueOnce(pendingA).mockReturnValueOnce(pendingB)
    const store = useFamilyTreeStore()

    const callA = store.selectMember('a')
    const callB = store.selectMember('b')
    // Newer request (B) resolves first, then the stale request (A) resolves late.
    resolveB({ ...member, id: 'b', displayName: 'B' })
    await callB
    resolveA({ ...member, id: 'a', displayName: 'A' })
    await callA

    expect(store.selectedMember?.id).toBe('b')
  })

  it('familyTreeStore_whenClearSelection_shouldResetSelectedMember', async () => {
    vi.mocked(familyApi.getMemberDetail).mockResolvedValue(member)
    const store = useFamilyTreeStore()
    await store.selectMember('a')

    store.clearSelection()

    expect(store.selectedMember).toBeNull()
  })
})
