import type { PersonSummary } from '../types/family';

/**
 * Computes each person's genealogical generation from their `parents` refs.
 *
 * Founders — people with no parent present in `people` — are generation 1;
 * a child is `1 + max(parent generations)`. Cycle-safe: a parent chain that
 * loops back on itself is broken at the repeated id, treating it as a founder
 * for that traversal rather than recursing forever.
 */
export function computeGenerations(people: PersonSummary[]): Map<string, number> {
  const byId = new Map(people.map(person => [person.id, person]));
  const generations = new Map<string, number>();

  const resolve = (id: string, visiting: Set<string>): number => {
    const cached = generations.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const person = byId.get(id);
    if (!person || visiting.has(id)) {
      return 1;
    }

    visiting.add(id);
    const parentIds = [person.parents.motherId, person.parents.fatherId].filter(
      (parentId): parentId is string => parentId != null && byId.has(parentId)
    );
    const generation =
      parentIds.length === 0
        ? 1
        : 1 + Math.max(...parentIds.map(parentId => resolve(parentId, visiting)));
    visiting.delete(id);

    generations.set(id, generation);
    return generation;
  };

  for (const person of people) {
    resolve(person.id, new Set());
  }

  return generations;
}

/** Sorted, distinct generation numbers present in a `computeGenerations` result. */
export function generationOptions(gens: Map<string, number>): number[] {
  return [...new Set(gens.values())].sort((a, b) => a - b);
}
