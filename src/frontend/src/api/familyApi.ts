import type { FamilyGraph } from '../types/family';

export async function fetchFamilyGraph(baseUrl = ''): Promise<FamilyGraph> {
  const response = await fetch(`${baseUrl}/api/family/graph`);
  if (!response.ok) {
    throw new Error(`Failed to load family graph: ${response.status}`);
  }
  return (await response.json()) as FamilyGraph;
}
