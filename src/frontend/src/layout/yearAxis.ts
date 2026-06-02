import { scaleLinear } from 'd3-scale'

export interface YearTick {
  year: number
  /** World-space y coordinate of the tick (matches the tree's coordinate system). */
  worldY: number
}

/**
 * Builds the year-axis ticks. The scale maps the oldest birth year to the bottom of the tree and
 * the most recent to the top, so the axis grows upward through time as a visual guide.
 */
export function computeYearTicks(
  minBirthYear: number,
  maxBirthYear: number,
  yTop: number,
  yBottom: number,
  tickCount = 6
): YearTick[] {
  if (minBirthYear === maxBirthYear) {
    return [{ year: minBirthYear, worldY: (yTop + yBottom) / 2 }]
  }

  const scale = scaleLinear().domain([minBirthYear, maxBirthYear]).range([yBottom, yTop])
  return scale.ticks(tickCount).map((year) => ({ year, worldY: scale(year) }))
}

/** Projects a world-space y coordinate to a screen-space y (pixels) using the current view box. */
export function worldYToScreen(
  worldY: number,
  viewBoxY: number,
  viewBoxHeight: number,
  containerHeight: number
): number {
  if (viewBoxHeight === 0) {
    return 0
  }
  return ((worldY - viewBoxY) / viewBoxHeight) * containerHeight
}
