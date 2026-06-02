import type { EdgeKind, TreeEdgeDto, TreeNodeDto } from '@/types/dto'

export interface LayoutOptions {
  /** Horizontal distance between adjacent members in a generation row. */
  nodeSpacingX: number
  /** Vertical distance between generation rows. */
  rowHeight: number
}

export const defaultLayoutOptions: LayoutOptions = {
  nodeSpacingX: 180,
  rowHeight: 160
}

export interface PositionedNode extends TreeNodeDto {
  x: number
  y: number
}

export interface PositionedEdge {
  fromId: string
  toId: string
  kind: EdgeKind
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface TreeLayout {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  width: number
  height: number
  /** Vertical world-space extent used by the year axis. */
  yTop: number
  yBottom: number
  /** Approximate year range derived from member birth years (axis guide only). */
  minBirthYear: number
  maxBirthYear: number
}

const fallbackYearRange = { min: 1700, max: 2025 }

/**
 * Lays members out by generation: generation 0 (oldest) sits at the bottom, the youngest at the
 * top. Rows are horizontally centred and spouses are ordered adjacent to one another. The layout
 * is pure (no DOM, no D3 selections) so it can be unit-tested in isolation.
 */
export function computeLayout(
  nodes: TreeNodeDto[],
  edges: TreeEdgeDto[],
  options: LayoutOptions = defaultLayoutOptions
): TreeLayout {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
      yTop: 0,
      yBottom: 0,
      minBirthYear: fallbackYearRange.min,
      maxBirthYear: fallbackYearRange.max
    }
  }

  const { nodeSpacingX, rowHeight } = options
  const generations = nodes.map((node) => node.generation)
  const maxGeneration = Math.max(...generations)
  const minGeneration = Math.min(...generations)

  const spouseIdsById = buildSpouseMap(edges)
  const rows = groupByGeneration(nodes)
  const maxRowSize = Math.max(...[...rows.values()].map((row) => row.length))
  const totalWidth = maxRowSize * nodeSpacingX

  const positionedById = new Map<string, PositionedNode>()
  const positioned: PositionedNode[] = []

  for (const [generation, rowNodes] of rows) {
    const ordered = orderRowWithSpousesAdjacent(rowNodes, spouseIdsById)
    const rowWidth = ordered.length * nodeSpacingX
    const startX = (totalWidth - rowWidth) / 2 + nodeSpacingX / 2
    const y = (maxGeneration - generation) * rowHeight + rowHeight / 2

    ordered.forEach((node, index) => {
      const placed: PositionedNode = { ...node, x: startX + index * nodeSpacingX, y }
      positioned.push(placed)
      positionedById.set(node.id, placed)
    })
  }

  const positionedEdges = edges
    .map((edge) => toPositionedEdge(edge, positionedById))
    .filter((edge): edge is PositionedEdge => edge !== null)

  const height = (maxGeneration - minGeneration + 1) * rowHeight
  const birthYears = nodes
    .map((node) => node.birthYear)
    .filter((year): year is number => year !== null)

  return {
    nodes: positioned,
    edges: positionedEdges,
    width: totalWidth,
    height,
    yTop: 0,
    yBottom: height,
    minBirthYear: birthYears.length > 0 ? Math.min(...birthYears) : fallbackYearRange.min,
    maxBirthYear: birthYears.length > 0 ? Math.max(...birthYears) : fallbackYearRange.max
  }
}

function groupByGeneration(nodes: TreeNodeDto[]): Map<number, TreeNodeDto[]> {
  const rows = new Map<number, TreeNodeDto[]>()
  for (const node of nodes) {
    const row = rows.get(node.generation)
    if (row) {
      row.push(node)
    } else {
      rows.set(node.generation, [node])
    }
  }
  return rows
}

function buildSpouseMap(edges: TreeEdgeDto[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const add = (a: string, b: string) => {
    const existing = map.get(a)
    if (existing) {
      existing.push(b)
    } else {
      map.set(a, [b])
    }
  }
  for (const edge of edges) {
    if (edge.kind === 'Spouse') {
      add(edge.fromId, edge.toId)
      add(edge.toId, edge.fromId)
    }
  }
  return map
}

function orderRowWithSpousesAdjacent(
  rowNodes: TreeNodeDto[],
  spouseIdsById: Map<string, string[]>
): TreeNodeDto[] {
  const byId = new Map(rowNodes.map((node) => [node.id, node]))
  const placed = new Set<string>()
  const ordered: TreeNodeDto[] = []

  for (const node of rowNodes) {
    if (placed.has(node.id)) {
      continue
    }
    ordered.push(node)
    placed.add(node.id)

    for (const spouseId of spouseIdsById.get(node.id) ?? []) {
      const spouse = byId.get(spouseId)
      if (spouse && !placed.has(spouseId)) {
        ordered.push(spouse)
        placed.add(spouseId)
      }
    }
  }

  return ordered
}

function toPositionedEdge(
  edge: TreeEdgeDto,
  positionedById: Map<string, PositionedNode>
): PositionedEdge | null {
  const from = positionedById.get(edge.fromId)
  const to = positionedById.get(edge.toId)
  if (!from || !to) {
    return null
  }
  return {
    fromId: edge.fromId,
    toId: edge.toId,
    kind: edge.kind,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y
  }
}
