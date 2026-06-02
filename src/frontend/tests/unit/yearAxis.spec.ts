import { describe, expect, it } from 'vitest'
import { computeYearTicks, worldYToScreen } from '@/layout/yearAxis'

describe('computeYearTicks', () => {
  it('yearAxis_whenGenerationRangeGiven_shouldMapOlderYearsLowerThanNewer', () => {
    const ticks = computeYearTicks(1740, 1820, 0, 800)

    expect(ticks.length).toBeGreaterThan(1)
    const sorted = [...ticks].sort((a, b) => a.year - b.year)
    // Older years (smaller) must map to a larger worldY (closer to the bottom).
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].worldY).toBeLessThan(sorted[index - 1].worldY)
    }
  })

  it('yearAxis_whenSingleYear_shouldReturnOneCentredTick', () => {
    const ticks = computeYearTicks(1800, 1800, 0, 800)

    expect(ticks).toHaveLength(1)
    expect(ticks[0]).toEqual({ year: 1800, worldY: 400 })
  })
})

describe('worldYToScreen', () => {
  it('worldYToScreen_whenViewBoxMatchesContainer_shouldScaleProportionally', () => {
    // World y = 400 within a view box [0..800] over a 400px container => 200px.
    expect(worldYToScreen(400, 0, 800, 400)).toBe(200)
  })
})
