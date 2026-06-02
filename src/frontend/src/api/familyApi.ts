import type { FamilyTreeDto, MemberDetailDto } from '@/types/dto'
import { getJson } from './httpClient'

export function getFamilyTree(signal?: AbortSignal): Promise<FamilyTreeDto> {
  return getJson<FamilyTreeDto>('/api/family-tree', signal)
}

export function getMemberDetail(id: string, signal?: AbortSignal): Promise<MemberDetailDto> {
  return getJson<MemberDetailDto>(`/api/members/${id}`, signal)
}
