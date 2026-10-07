import type { Color, Piece, Role, Square } from './types.ts'

export const FILE_NAMES = 'abcdefgh'

export const fileOf = (s: Square): number => s & 7
export const rankOf = (s: Square): number => s >> 3
export const makeSquare = (file: number, rank: number): Square => rank * 8 + file

export function squareName(s: Square): string {
  return FILE_NAMES[fileOf(s)] + String(rankOf(s) + 1)
}

export function parseSquare(name: string): Square | null {
  if (name.length !== 2) return null
  const f = FILE_NAMES.indexOf(name[0])
  const r = name.charCodeAt(1) - 49
  if (f < 0 || r < 0 || r > 7) return null
  return makeSquare(f, r)
}

export const isLightSquare = (s: Square): boolean => (fileOf(s) + rankOf(s)) % 2 === 1

export function pieceToChar(p: Piece): string {
  return p.color === 'w' ? p.role.toUpperCase() : p.role
}

export function pieceFromChar(ch: string): Piece | null {
  const lower = ch.toLowerCase()
  if (!'pnbrqk'.includes(lower) || ch.length !== 1) return null
  return { color: ch === lower ? 'b' : 'w', role: lower as Role }
}

export const backRank = (c: Color): number => (c === 'w' ? 0 : 7)
