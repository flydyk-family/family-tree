import type { FamilySummary } from '../types/family';

export async function fetchFamilies(baseUrl = ''): Promise<FamilySummary[]> {
  const response = await fetch(`${baseUrl}/api/families`);
  if (!response.ok) {
    throw new Error(`Failed to load families: ${response.status}`);
  }
  return (await response.json()) as FamilySummary[];
}
