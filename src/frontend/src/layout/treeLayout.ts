import type { FamilyGraph, PersonSummary } from '../types/family';
import { createTimeScale, type TimeScale } from './timeScale';

export type NodeRole = 'root' | 'trunk' | 'branch' | 'leaf';

export interface LayoutNode {
  id: string;
  person: PersonSummary;
  x: number;
  y: number;
  year: number;
  role: NodeRole;
  generation: number; // 0 = focus, negative = ancestors, positive = descendants
}

export interface LayoutLink {
  id: string;
  kind: 'descent' | 'union';
  source: string;
  target: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  scale: TimeScale;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  width: number;
  height: number;
}

export interface LayoutOptions {
  focusId: string;
  ancestorTrunkDepth?: number;
  descendantTrunkDepth?: number;
  xGap?: number;
  pxPerYear?: number;
  spouseGap?: number;
  includeSiblings?: boolean;
  // When true, render the entire connected family and use `focusId` only as the
  // centering anchor (focus pinned to x=0), instead of pruning to the focus's
  // ancestors/descendants/siblings neighbourhood.
  fullTree?: boolean;
}

interface FamilyIndex {
  personById: Map<string, PersonSummary>;
  childrenOf: Map<string, string[]>;
  spousesOf: Map<string, string[]>;
}

const GENERATION_YEARS = 28;

function parentsOf(person: PersonSummary): string[] {
  return [person.parents.motherId, person.parents.fatherId].filter((id): id is string => Boolean(id));
}

function buildIndex(graph: FamilyGraph): FamilyIndex {
  const personById = new Map(graph.people.map(person => [person.id, person]));
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const union of graph.unions) {
    for (const partnerId of union.partnerIds) {
      if (!personById.has(partnerId)) {
        continue;
      }
      const children = childrenOf.get(partnerId) ?? [];
      children.push(...union.childIds.filter(childId => personById.has(childId)));
      childrenOf.set(partnerId, children);

      const spouses = spousesOf.get(partnerId) ?? [];
      spouses.push(...union.partnerIds.filter(other => other !== partnerId && personById.has(other)));
      spousesOf.set(partnerId, spouses);
    }
  }
  return { personById, childrenOf, spousesOf };
}

// Tidy leaf-count layout: leaves are placed left-to-right; parents centre over their children.
// The root is translated to x=0.
function tidyLayout(rootId: string, getChildren: (id: string) => string[], xGap: number): Map<string, number> {
  const x = new Map<string, number>();
  const visited = new Set<string>();
  let cursor = 0;

  function place(id: string): void {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const children = getChildren(id).filter(childId => !visited.has(childId));
    if (children.length === 0) {
      x.set(id, cursor);
      cursor += xGap;
      return;
    }
    for (const childId of children) {
      place(childId);
    }
    const positions = children
      .map(childId => x.get(childId))
      .filter((value): value is number => value !== undefined);
    const sum = positions.reduce((total, value) => total + value, 0);
    x.set(id, sum / positions.length);
  }

  place(rootId);
  const rootX = x.get(rootId) ?? 0;
  for (const [id, value] of x) {
    x.set(id, value - rootX);
  }
  return x;
}

// Tidy layout over a forest: lay every root's subtree out left-to-right sharing a
// single cursor and visited set, so the whole bloodline is placed in one pass.
// Unlike tidyLayout it does not re-anchor — the caller pins the focus to x=0.
function forestTidyLayout(roots: string[], getChildren: (id: string) => string[], xGap: number): Map<string, number> {
  const x = new Map<string, number>();
  const visited = new Set<string>();
  let cursor = 0;

  function place(id: string): void {
    visited.add(id);
    // The visited filter also guards against cycles: a child already placed (or an
    // ancestor loop) is dropped here, so a malformed union can't recurse forever.
    const children = getChildren(id).filter(childId => !visited.has(childId));
    if (children.length === 0) {
      x.set(id, cursor);
      cursor += xGap;
      return;
    }
    for (const childId of children) {
      place(childId);
    }
    const positions = children
      .map(childId => x.get(childId))
      .filter((value): value is number => value !== undefined);
    x.set(id, positions.reduce((total, value) => total + value, 0) / positions.length);
  }

  for (const rootId of roots) {
    place(rootId);
  }
  return x;
}

// Generation of every connected person relative to the focus (0), walking the
// family graph undirected: a parent is one tier older (−1), a child one tier
// younger (+1), a spouse the same tier. BFS keeps the first (shortest-path) tier.
function generationsFromFocus(
  focusId: string,
  parentIdsOf: (id: string) => string[],
  childrenOf: Map<string, string[]>,
  spousesOf: Map<string, string[]>
): Map<string, number> {
  const gen = new Map<string, number>([[focusId, 0]]);
  const queue: string[] = [focusId];
  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id)!;
    for (const parentId of parentIdsOf(id)) {
      if (!gen.has(parentId)) {
        gen.set(parentId, g - 1);
        queue.push(parentId);
      }
    }
    for (const childId of childrenOf.get(id) ?? []) {
      if (!gen.has(childId)) {
        gen.set(childId, g + 1);
        queue.push(childId);
      }
    }
    for (const spouseId of spousesOf.get(id) ?? []) {
      if (!gen.has(spouseId)) {
        gen.set(spouseId, g);
        queue.push(spouseId);
      }
    }
  }
  return gen;
}

function assignYears(ids: string[], index: FamilyIndex, focusId: string): Map<string, number> {
  const year = new Map<string, number>();
  for (const id of ids) {
    const birthYear = index.personById.get(id)?.birthYear;
    if (birthYear != null) {
      year.set(id, birthYear);
    }
  }
  let changed = true;
  let guard = 0;
  while (changed && guard++ < ids.length + 5) {
    changed = false;
    for (const id of ids) {
      if (year.has(id)) {
        continue;
      }
      const person = index.personById.get(id)!;
      const knownParents = parentsOf(person).filter(parentId => year.has(parentId));
      if (knownParents.length) {
        const avg = knownParents.reduce((total, parentId) => total + year.get(parentId)!, 0) / knownParents.length;
        year.set(id, Math.round(avg) + GENERATION_YEARS);
        changed = true;
        continue;
      }
      const knownChildren = (index.childrenOf.get(id) ?? []).filter(childId => year.has(childId));
      if (knownChildren.length) {
        const avg = knownChildren.reduce((total, childId) => total + year.get(childId)!, 0) / knownChildren.length;
        year.set(id, Math.round(avg) - GENERATION_YEARS);
        changed = true;
        continue;
      }
      const knownSpouse = (index.spousesOf.get(id) ?? []).find(spouseId => year.has(spouseId));
      if (knownSpouse) {
        year.set(id, year.get(knownSpouse)!);
        changed = true;
      }
    }
  }
  const fallback = year.get(focusId) ?? 1900;
  for (const id of ids) {
    if (!year.has(id)) {
      year.set(id, fallback);
    }
  }
  return year;
}

function ancestryDepth(id: string, index: FamilyIndex, memo: Map<string, number>): number {
  const cached = memo.get(id);
  if (cached !== undefined) {
    return cached;
  }
  memo.set(id, 0); // cycle guard
  const person = index.personById.get(id);
  const parents = person ? parentsOf(person) : [];
  const depth = parents.length
    ? 1 + Math.max(...parents.map(parentId => ancestryDepth(parentId, index, memo)))
    : 0;
  memo.set(id, depth);
  return depth;
}

function primaryAncestorChain(focusId: string, index: FamilyIndex, depth: number): Set<string> {
  const chain = new Set<string>();
  const memo = new Map<string, number>();
  let current = focusId;
  for (let step = 0; step < depth; step++) {
    const person = index.personById.get(current);
    if (!person) {
      break;
    }
    const parents = parentsOf(person);
    if (!parents.length) {
      break;
    }
    const father = person.parents.fatherId;
    let best = parents[0];
    let bestDepth = -1;
    for (const parentId of parents) {
      const parentDepth = ancestryDepth(parentId, index, memo);
      if (parentDepth > bestDepth || (parentDepth === bestDepth && parentId === father)) {
        best = parentId;
        bestDepth = parentDepth;
      }
    }
    chain.add(best);
    current = best;
  }
  return chain;
}

// Approximate half-width of a framed medallion per role, mirroring the frame
// widths in components/medallion/geometry.ts (trunk 200 / branch·root 186 /
// leaf 158) plus a small margin. Used only to keep same-generation cards from
// overlapping. Tuned against the live oak (this plan, Task 9).
const CARD_HALF_WIDTH: Record<NodeRole, number> = {
  trunk: 108,
  branch: 101,
  root: 101,
  leaf: 87
};

// The tidy layout can place same-generation cards closer than a card's width — a
// parent centred over its children, or a married-in spouse offset beside another
// subtree. Because the cards are tall, neighbours in a generation rely entirely on
// horizontal separation, so push overlapping ones apart (left-to-right), re-centre
// each row on its original mean to avoid drifting, then re-anchor the focus to x=0.
function separateOverlaps(nodes: LayoutNode[], focusId: string): void {
  const byGeneration = new Map<number, LayoutNode[]>();
  for (const node of nodes) {
    const row = byGeneration.get(node.generation) ?? [];
    row.push(node);
    byGeneration.set(node.generation, row);
  }

  for (const row of byGeneration.values()) {
    if (row.length < 2) {
      continue;
    }
    row.sort((a, b) => a.x - b.x);
    const meanBefore = row.reduce((total, node) => total + node.x, 0) / row.length;
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const cur = row[i];
      const minDistance = CARD_HALF_WIDTH[prev.role] + CARD_HALF_WIDTH[cur.role] + 14;
      if (cur.x - prev.x < minDistance) {
        cur.x = prev.x + minDistance;
      }
    }
    const meanAfter = row.reduce((total, node) => total + node.x, 0) / row.length;
    const shift = meanBefore - meanAfter;
    for (const node of row) {
      node.x += shift;
    }
  }

  const focus = nodes.find(node => node.id === focusId);
  if (focus) {
    const dx = focus.x;
    for (const node of nodes) {
      node.x -= dx;
    }
  }
}

export function buildLayout(graph: FamilyGraph, options: LayoutOptions): TreeLayout {
  const { focusId } = options;
  const ancestorTrunkDepth = options.ancestorTrunkDepth ?? 2;
  const descendantTrunkDepth = options.descendantTrunkDepth ?? 2;
  // Spacing accommodates the framed medallions (much wider/taller than the bare
  // ovals): cards sit ~160-200px wide, so siblings and spouses need room not to
  // overlap, and the extra vertical pitch keeps a card's banner clear of the
  // generation below it.
  const xGap = options.xGap ?? 180;
  const pxPerYear = options.pxPerYear ?? 14;
  const spouseGap = options.spouseGap ?? 205;

  const index = buildIndex(graph);
  if (!index.personById.has(focusId)) {
    throw new Error(`Focus person '${focusId}' not found in graph`);
  }

  // Parent ids that actually exist in the graph (a person's parents.* may reference
  // an ancestor whose full record was not returned — skip those rather than crash).
  const parentIdsOf = (id: string): string[] => {
    const person = index.personById.get(id);
    return person ? parentsOf(person).filter(parentId => index.personById.has(parentId)) : [];
  };

  const xOf = new Map<string, number>();
  const genOf = new Map<string, number>();

  if (options.fullTree) {
    // Whole-tree mode: render the entire connected family, using the focus only
    // as the centering anchor. Generations are measured relative to the focus.
    for (const [id, g] of generationsFromFocus(focusId, parentIdsOf, index.childrenOf, index.spousesOf)) {
      genOf.set(id, g);
    }
    // Lay out the bloodline from its founders (no parents, not married-in) that
    // belong to the focus's connected component, then attach married-in spouses
    // beside their already-placed partners.
    const roots = graph.people
      .filter(person => genOf.has(person.id) && parentIdsOf(person.id).length === 0 && !person.marriedIntoFamily)
      .sort((a, b) => (a.birthYear ?? Infinity) - (b.birthYear ?? Infinity) || a.id.localeCompare(b.id))
      .map(person => person.id);
    for (const [id, x] of forestTidyLayout(roots, id => index.childrenOf.get(id) ?? [], xGap)) {
      xOf.set(id, x);
    }
    for (const id of [...xOf.keys()]) {
      for (const spouseId of index.spousesOf.get(id) ?? []) {
        if (!xOf.has(spouseId)) {
          xOf.set(spouseId, (xOf.get(id) ?? 0) + spouseGap);
        }
      }
    }
    // Pin the focus to x=0 so the canopy is centred on it.
    const focusX = xOf.get(focusId) ?? 0;
    for (const id of [...xOf.keys()]) {
      xOf.set(id, (xOf.get(id) ?? 0) - focusX);
    }
    genOf.set(focusId, 0);
    return finishLayout(graph, index, focusId, xOf, genOf, { pxPerYear, ancestorTrunkDepth, descendantTrunkDepth });
  }

  const descX = tidyLayout(focusId, id => index.childrenOf.get(id) ?? [], xGap);
  const ancX = tidyLayout(focusId, parentIdsOf, xGap);

  xOf.set(focusId, 0);
  genOf.set(focusId, 0);

  const descQueue: Array<[string, number]> = [[focusId, 0]];
  const descSeen = new Set<string>([focusId]);
  while (descQueue.length) {
    const [id, generation] = descQueue.shift()!;
    for (const childId of index.childrenOf.get(id) ?? []) {
      if (descSeen.has(childId)) {
        continue;
      }
      descSeen.add(childId);
      genOf.set(childId, generation + 1);
      if (descX.has(childId)) {
        xOf.set(childId, descX.get(childId)!);
      }
      descQueue.push([childId, generation + 1]);
    }
  }

  const ancQueue: Array<[string, number]> = [[focusId, 0]];
  const ancSeen = new Set<string>([focusId]);
  while (ancQueue.length) {
    const [id, generation] = ancQueue.shift()!;
    for (const parentId of parentIdsOf(id)) {
      if (ancSeen.has(parentId)) {
        continue;
      }
      ancSeen.add(parentId);
      genOf.set(parentId, generation - 1);
      if (ancX.has(parentId)) {
        xOf.set(parentId, ancX.get(parentId)!);
      }
      ancQueue.push([parentId, generation - 1]);
    }
  }

  // Focus's siblings (share a parent) plus each sibling's descendant subtree, placed
  // beside the focus so brothers/sisters and their lines appear in the canopy.
  if (options.includeSiblings ?? true) {
    const focusPerson = index.personById.get(focusId)!;
    const focusFatherId = focusPerson.parents.fatherId;
    const focusMotherId = focusPerson.parents.motherId;
    const focusYear = focusPerson.birthYear ?? 0;

    const siblings = graph.people.filter(person => {
      if (person.id === focusId || xOf.has(person.id)) {
        return false;
      }
      const sharesFather = focusFatherId != null && person.parents.fatherId === focusFatherId;
      const sharesMother = focusMotherId != null && person.parents.motherId === focusMotherId;
      return sharesFather || sharesMother;
    });

    const focusSideXs = (): number[] =>
      [...xOf.entries()].filter(([id]) => (genOf.get(id) ?? 0) >= 0).map(([, x]) => x);
    let rightEdge = Math.max(0, ...focusSideXs());
    let leftEdge = Math.min(0, ...focusSideXs());

    const placeSiblingSubtree = (siblingId: string, side: 'left' | 'right'): void => {
      const subtree = tidyLayout(siblingId, id => index.childrenOf.get(id) ?? [], xGap);
      const subtreeXs = [...subtree.values()];
      const halfWidth = (Math.max(...subtreeXs) - Math.min(...subtreeXs)) / 2;
      const anchor = side === 'right' ? rightEdge + xGap + halfWidth : leftEdge - xGap - halfWidth;
      if (side === 'right') {
        rightEdge = anchor + halfWidth;
      } else {
        leftEdge = anchor - halfWidth;
      }
      const queue: Array<[string, number]> = [[siblingId, 0]];
      const seen = new Set<string>([siblingId]);
      while (queue.length) {
        const [id, generation] = queue.shift()!;
        if (!xOf.has(id) && subtree.has(id)) {
          xOf.set(id, subtree.get(id)! + anchor);
          genOf.set(id, generation);
        }
        for (const childId of index.childrenOf.get(id) ?? []) {
          if (!seen.has(childId)) {
            seen.add(childId);
            queue.push([childId, generation + 1]);
          }
        }
      }
    };

    siblings
      .filter(sibling => (sibling.birthYear ?? focusYear) <= focusYear)
      .forEach(sibling => placeSiblingSubtree(sibling.id, 'left'));
    siblings
      .filter(sibling => (sibling.birthYear ?? focusYear) > focusYear)
      .forEach(sibling => placeSiblingSubtree(sibling.id, 'right'));
  }

  // Attach married-in spouses beside focus-or-descendant partners (generation >= 0).
  for (const id of [...xOf.keys()]) {
    if ((genOf.get(id) ?? 0) < 0) {
      continue;
    }
    for (const spouseId of index.spousesOf.get(id) ?? []) {
      if (xOf.has(spouseId)) {
        continue;
      }
      xOf.set(spouseId, (xOf.get(id) ?? 0) + spouseGap);
      genOf.set(spouseId, genOf.get(id) ?? 0);
    }
  }

  return finishLayout(graph, index, focusId, xOf, genOf, { pxPerYear, ancestorTrunkDepth, descendantTrunkDepth });
}

interface FinishParams {
  pxPerYear: number;
  ancestorTrunkDepth: number;
  descendantTrunkDepth: number;
}

// Shared tail for both layout modes: assign years, build the time scale, classify
// roles, separate same-generation overlaps, and emit descent/union links.
function finishLayout(
  graph: FamilyGraph,
  index: FamilyIndex,
  focusId: string,
  xOf: Map<string, number>,
  genOf: Map<string, number>,
  { pxPerYear, ancestorTrunkDepth, descendantTrunkDepth }: FinishParams
): TreeLayout {
  // Order nodes by their position in the source people list so the rendered
  // sequence is deterministic and independent of traversal order.
  const placed = new Set(xOf.keys());
  const ids = graph.people.filter(person => placed.has(person.id)).map(person => person.id);
  const year = assignYears(ids, index, focusId);
  const scale = createTimeScale(ids.map(id => year.get(id)!), pxPerYear);
  const primaryChain = primaryAncestorChain(focusId, index, ancestorTrunkDepth);

  const nodes: LayoutNode[] = ids.map(id => {
    const person = index.personById.get(id)!;
    const generation = genOf.get(id) ?? 0;
    const nodeYear = year.get(id)!;
    const childless = (index.childrenOf.get(id) ?? []).length === 0;
    let role: NodeRole;
    if (id === focusId) {
      role = 'trunk';
    } else if (generation < 0) {
      // ancestor side: classified structurally — ancestors are never leaves
      if (generation < -ancestorTrunkDepth) {
        role = 'root';
      } else if (primaryChain.has(id)) {
        role = 'trunk';
      } else {
        role = 'branch';
      }
    } else if (childless) {
      // focus-or-descendant side terminal node
      role = 'leaf';
    } else if (generation <= descendantTrunkDepth) {
      role = 'trunk';
    } else {
      role = 'branch';
    }
    return { id, person, x: xOf.get(id)!, y: scale.yForYear(nodeYear), year: nodeYear, role, generation };
  });

  separateOverlaps(nodes, focusId);

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const links: LayoutLink[] = [];
  for (const union of graph.unions) {
    for (const partnerId of union.partnerIds) {
      const parent = nodeById.get(partnerId);
      if (!parent) {
        continue;
      }
      for (const childId of union.childIds) {
        const child = nodeById.get(childId);
        if (!child) {
          continue;
        }
        links.push({
          id: `d:${partnerId}->${childId}`,
          kind: 'descent',
          source: partnerId,
          target: childId,
          x1: parent.x, y1: parent.y, x2: child.x, y2: child.y
        });
      }
    }
    const present = union.partnerIds.map(id => nodeById.get(id)).filter((node): node is LayoutNode => Boolean(node));
    if (present.length === 2) {
      links.push({
        id: `u:${union.id}`,
        kind: 'union',
        source: present[0].id,
        target: present[1].id,
        x1: present[0].x, y1: present[0].y, x2: present[1].x, y2: present[1].y
      });
    }
  }

  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
  return {
    nodes,
    links,
    scale,
    bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY
  };
}
