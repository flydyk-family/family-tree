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

export function buildLayout(graph: FamilyGraph, options: LayoutOptions): TreeLayout {
  const { focusId } = options;
  const ancestorTrunkDepth = options.ancestorTrunkDepth ?? 2;
  const descendantTrunkDepth = options.descendantTrunkDepth ?? 2;
  const xGap = options.xGap ?? 70;
  const pxPerYear = options.pxPerYear ?? 8;
  const spouseGap = options.spouseGap ?? 46;

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

  const descX = tidyLayout(focusId, id => index.childrenOf.get(id) ?? [], xGap);
  const ancX = tidyLayout(focusId, parentIdsOf, xGap);

  const xOf = new Map<string, number>([[focusId, 0]]);
  const genOf = new Map<string, number>([[focusId, 0]]);

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

  const ids = [...xOf.keys()];
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
