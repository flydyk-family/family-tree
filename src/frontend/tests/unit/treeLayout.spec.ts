import { describe, expect, it } from 'vitest'
import { computeLayout, defaultLayoutOptions } from '@/layout/treeLayout'
import type { TreeEdgeDto, TreeNodeDto } from '@/types/dto'

function makeNode(id: string, generation: number, overrides: Partial<TreeNodeDto> = {}): TreeNodeDto {
  return {
    id,
    displayName: id,
    generation,
    sex: 'Unknown',
    birthYear: null,
    deathYear: null,
    photoUrl: null,
    isLeaf: false,
    ...overrides
  }
}

describe('computeLayout', () => {
  it('computeLayout_whenNodesSpanThreeGenerations_shouldPlaceOldestAtBottom', () => {
    const nodes = [makeNode('a', 0), makeNode('b', 1), makeNode('c', 2)]

    const layout = computeLayout(nodes, [])

    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    // Generation 0 is the oldest and must sit lower (greater y) than the youngest generation.
    expect(byId.get('a')!.y).toBeGreaterThan(byId.get('c')!.y)
    expect(byId.get('a')!.y).toBeGreaterThan(byId.get('b')!.y)
  })

  it('computeLayout_whenSpousesPresent_shouldPlaceSpousesAdjacent', () => {
    const nodes = [makeNode('husband', 0), makeNode('wife', 0)]
    const edges: TreeEdgeDto[] = [{ fromId: 'husband', toId: 'wife', kind: 'Spouse' }]

    const layout = computeLayout(nodes, edges)

    const husband = layout.nodes.find((node) => node.id === 'husband')!
    const wife = layout.nodes.find((node) => node.id === 'wife')!
    expect(husband.y).toBe(wife.y)
    expect(Math.abs(husband.x - wife.x)).toBe(defaultLayoutOptions.nodeSpacingX)
  })

  it('computeLayout_whenDatasetEmpty_shouldReturnEmptyLayout', () => {
    const layout = computeLayout([], [])

    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
  })

  it('computeLayout_whenBirthYearsPresent_shouldDeriveYearRange', () => {
    const nodes = [
      makeNode('a', 0, { birthYear: 1740 }),
      makeNode('b', 1, { birthYear: 1801 })
    ]

    const layout = computeLayout(nodes, [])

    expect(layout.minBirthYear).toBe(1740)
    expect(layout.maxBirthYear).toBe(1801)
  })
})
