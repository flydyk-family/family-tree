// TypeScript mirrors of the backend DTOs (FamilyTree.Application.Dtos).

export type Sex = 'Unknown' | 'Male' | 'Female'

export type EdgeKind = 'ParentChild' | 'Spouse'

export interface TreeNodeDto {
  id: string
  displayName: string
  generation: number
  sex: Sex
  birthYear: number | null
  deathYear: number | null
  photoUrl: string | null
  isLeaf: boolean
}

export interface TreeEdgeDto {
  fromId: string
  toId: string
  kind: EdgeKind
}

export interface FamilyTreeDto {
  nodes: TreeNodeDto[]
  edges: TreeEdgeDto[]
  minGeneration: number
  maxGeneration: number
}

export interface SocialLinkDto {
  kind: string
  url: string
}

export interface MemberDetailDto {
  id: string
  displayName: string
  sex: Sex
  birthDateText: string | null
  deathDateText: string | null
  birthPlace: string | null
  photoUrl: string | null
  keyFacts: string[]
  bio: string | null
  socialLinks: SocialLinkDto[]
}
