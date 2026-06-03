import type { FamilyGraph, PersonDetail } from '../types/family';

export async function fetchFamilyGraph(baseUrl = ''): Promise<FamilyGraph> {
  const response = await fetch(`${baseUrl}/api/family/graph`);
  if (!response.ok) {
    throw new Error(`Failed to load family graph: ${response.status}`);
  }
  return (await response.json()) as FamilyGraph;
}

export async function fetchPerson(id: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to load person ${id}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
