import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MemberPopup from '@/components/MemberPopup.vue'
import type { MemberDetailDto } from '@/types/dto'

function member(overrides: Partial<MemberDetailDto> = {}): MemberDetailDto {
  return {
    id: 'a',
    displayName: 'Anna Bauer',
    sex: 'Female',
    birthDateText: '1801',
    deathDateText: '1879',
    birthPlace: 'Lindau',
    photoUrl: null,
    keyFacts: ['Schoolteacher'],
    bio: 'A teacher and botanical illustrator.',
    socialLinks: [{ kind: 'wikipedia', url: 'https://example.org/anna' }],
    ...overrides
  }
}

describe('MemberPopup', () => {
  it('MemberPopup_whenModeNormal_shouldHideBioUntilExpanded', () => {
    const wrapper = mount(MemberPopup, {
      props: { member: member(), loading: false, error: null }
    })

    expect(wrapper.find('.popup__bio').exists()).toBe(false)
  })

  it('MemberPopup_whenModeExpanded_shouldRenderBioAndSocialLinks', async () => {
    const wrapper = mount(MemberPopup, {
      props: { member: member(), loading: false, error: null }
    })

    await wrapper.find('.popup__toggle').trigger('click')

    expect(wrapper.text()).toContain('botanical illustrator')
    expect(wrapper.find('a.popup__link').attributes('href')).toBe('https://example.org/anna')
  })

  it('MemberPopup_whenCloseClicked_shouldEmitClose', async () => {
    const wrapper = mount(MemberPopup, {
      props: { member: member(), loading: false, error: null }
    })

    await wrapper.find('.popup__close').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('MemberPopup_whenLoading_shouldShowStatus', () => {
    const wrapper = mount(MemberPopup, {
      props: { member: null, loading: true, error: null }
    })

    expect(wrapper.text()).toContain('Loading')
  })
})
