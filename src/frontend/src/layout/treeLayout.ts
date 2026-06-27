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

// Couple-aware tidy layout for the whole-tree view. Each bloodline person plus
// their married-in spouse(s) form a unit: the bloodline person is centred over
// their children (so descent lines stay tidy) and spouses are placed in adjacent
// slots to the right. Children subtrees are laid out left-to-right, so siblings
// are always contiguous and only a sibling's own spouse can sit between siblings —
// satisfying the "siblings together, spouses adjacent" rules without a fixed-offset
// spouse pass that could drop an in-law between unrelated people.
function coupleTidyLayout(
  graph: FamilyGraph,
  index: FamilyIndex,
  genOf: Map<string, number>,
  parentIdsOf: (id: string) => string[],
  { xGap, spouseGap }: { xGap: number; spouseGap: number }
): Map<string, number> {
  // index.childrenOf concatenates each of a person's unions' childIds, so the same
  // child appears twice if malformed data lists it under two unions of one parent.
  // De-duplicate so centering math counts each child once and place() isn't called
  // twice for it.
  const childrenOf = (id: string): string[] => {
    const seen = new Set<string>();
    return (index.childrenOf.get(id) ?? []).filter(childId => {
      if (seen.has(childId)) {
        return false;
      }
      seen.add(childId);
      return true;
    });
  };

  // The bloodline = founders (in this component, no parents, not married-in) and
  // everyone descended from them. Married-in spouses are attached, never laid out
  // as their own subtree.
  const founders = graph.people
    .filter(person => genOf.has(person.id) && parentIdsOf(person.id).length === 0 && !person.marriedIntoFamily)
    .sort((a, b) => (a.birthYear ?? Infinity) - (b.birthYear ?? Infinity) || a.id.localeCompare(b.id))
    .map(person => person.id);

  const bloodline = new Set<string>();
  const bfs = [...founders];
  while (bfs.length) {
    const id = bfs.shift()!;
    if (bloodline.has(id)) {
      continue;
    }
    bloodline.add(id);
    bfs.push(...childrenOf(id));
  }

  const birthYearOf = (id: string): number => index.personById.get(id)?.birthYear ?? Infinity;

  const x = new Map<string, number>();
  const claimed = new Set<string>();
  let cursor = 0;

  const layMembers = (primaryId: string, primaryX: number): void => {
    x.set(primaryId, primaryX);
    let slot = primaryX;
    for (const spouseId of index.spousesOf.get(primaryId) ?? []) {
      if (!genOf.has(spouseId) || bloodline.has(spouseId) || claimed.has(spouseId)) {
        continue;
      }
      claimed.add(spouseId);
      slot += spouseGap;
      x.set(spouseId, slot);
    }
  };

  const place = (primaryId: string): void => {
    if (claimed.has(primaryId)) {
      return;
    }
    claimed.add(primaryId);
    const children = childrenOf(primaryId)
      .filter(childId => bloodline.has(childId) && !claimed.has(childId))
      .sort((a, b) => birthYearOf(a) - birthYearOf(b) || a.localeCompare(b));

    if (children.length === 0) {
      layMembers(primaryId, cursor + xGap / 2);
      cursor += xGap;
    } else {
      for (const childId of children) {
        place(childId);
      }
      const centers = children.map(childId => x.get(childId)!);
      const center = centers.reduce((total, value) => total + value, 0) / centers.length;
      layMembers(primaryId, center);
    }
    // Reserve cursor space for any spouse slots that extend past the subtree, so
    // the next root's subtree cannot collide with a married-in spouse.
    const own = [primaryId, ...(index.spousesOf.get(primaryId) ?? [])]
      .map(id => x.get(id))
      .filter((value): value is number => value !== undefined);
    cursor = Math.max(cursor, Math.max(...own) + xGap / 2);
  };

  for (const founderId of founders) {
    place(founderId);
  }
  // Defensive: place any connected person the bloodline walk missed — e.g. the
  // other married-in partner of a married-in spouse — in a trailing slot so no
  // node is ever left without a position. The overlap pass keeps it clear.
  for (const id of genOf.keys()) {
    if (x.has(id)) {
      continue;
    }
    x.set(id, cursor + xGap / 2);
    cursor += xGap;
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

// Approximate half-extents of a framed medallion per role, mirroring the frame
// widths in components/medallion/geometry.ts (trunk 200 / branch·root 186 /
// leaf 158) and heights (~w · frame ratio). Used to keep cards from overlapping.
const CARD_HALF_WIDTH: Record<NodeRole, number> = {
  trunk: 108,
  branch: 101,
  root: 101,
  leaf: 87
};
const CARD_HALF_HEIGHT: Record<NodeRole, number> = {
  trunk: 122,
  branch: 113,
  root: 113,
  leaf: 96
};
const OVERLAP_MARGIN_X = 14;
const OVERLAP_MARGIN_Y = 12;

// Because y is the time axis (birth year), cards in *different* generations can
// land at nearly the same height — a parent born close to a child, or in-laws of
// adjacent generations — so a strict per-generation pass cannot see those
// collisions. Resolve overlaps in 2D instead: sweep left-to-right and, for any
// earlier card this one overlaps both horizontally and vertically, push it right
// just enough to clear. Only ever increasing x preserves the left-to-right order,
// so couples stay adjacent and sibling groups stay contiguous (their gap may grow,
// nothing is ever inserted between them). Finally re-anchor the focus to x=0.
//
// Unlike the old per-generation pass, this deliberately does NOT re-centre each row
// on its prior mean (re-centering fights the one-directional push). A long cascade
// can therefore grow the tree asymmetrically to the right of the focus; the focus
// re-anchor keeps x=0 stable for the framed area and panning reaches the rest.
function separateOverlaps(nodes: LayoutNode[], focusId: string): void {
  // Widest possible clearance between two cards — once an earlier card is at least
  // this far to the left it (and everything before it) is guaranteed clear.
  const maxHalfWidth = Math.max(...Object.values(CARD_HALF_WIDTH));
  const maxClearance = 2 * maxHalfWidth + OVERLAP_MARGIN_X;

  const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
  for (let i = 1; i < order.length; i++) {
    const cur = order[i];
    for (let j = i - 1; j >= 0; j--) {
      const prev = order[j];
      if (cur.x - prev.x >= maxClearance) {
        break;
      }
      const minX = CARD_HALF_WIDTH[prev.role] + CARD_HALF_WIDTH[cur.role] + OVERLAP_MARGIN_X;
      const minY = CARD_HALF_HEIGHT[prev.role] + CARD_HALF_HEIGHT[cur.role] + OVERLAP_MARGIN_Y;
      // prev.x may exceed cur.x if prev was pushed right by an earlier iteration;
      // then cur.x - prev.x is negative (< minX) and pushing cur to prev.x + minX
      // still clears the overlap and keeps the cascade monotonic.
      if (cur.x - prev.x < minX && Math.abs(cur.y - prev.y) < minY) {
        cur.x = prev.x + minX;
      }
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
    for (const [id, x] of coupleTidyLayout(graph, index, genOf, parentIdsOf, { xGap, spouseGap })) {
      xOf.set(id, x);
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
