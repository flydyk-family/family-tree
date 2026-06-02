import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MemberNode from '@/components/MemberNode.vue'
import type { PositionedNode } from '@/layout/treeLayout'

function positionedNode(overrides: Partial<PositionedNode> = {}): PositionedNode {
  return {
    id: 'node-1',
    displayName: 'Anna Bauer',
    generation: 2,
    sex: 'Female',
    birthYear: 1801,
    deathYear: 1879,
    photoUrl: null,
    isLeaf: true,
    x: 100,
    y: 200,
    ...overrides
  }
}

describe('MemberNode', () => {
  it('MemberNode_whenClicked_shouldEmitSelectWithId', async () => {
    const wrapper = mount(MemberNode, { props: { node: positionedNode(), selected: false } })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['node-1']])
  })

  it('MemberNode_whenLeaf_shouldRenderLeafMarker', () => {
    const wrapper = mount(MemberNode, { props: { node: positionedNode({ isLeaf: true }), selected: false } })

    expect(wrapper.find('.member-node__leaf').exists()).toBe(true)
  })

  it('MemberNode_whenLifespanKnown_shouldRenderBirthAndDeathYears', () => {
    const wrapper = mount(MemberNode, { props: { node: positionedNode(), selected: false } })

    expect(wrapper.text()).toContain('1801–1879')
  })
})
