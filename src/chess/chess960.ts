/**
 * Chess960 (Фишер-рандом): генерация стартовых позиций по схеме Шарнагля (0…959).
 * Номер 518 — обычная начальная позиция.
 */
import { Position } from './position.ts'
import type { Role } from './types.ts'

const KNIGHT_PLACEMENTS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]

export function chess960BackRank(index: number): Role[] {
  if (!Number.isInteger(index) || index < 0 || index > 959) throw new RangeError('Номер позиции Chess960: 0…959')
  const row: (Role | null)[] = new Array(8).fill(null)
  let n = index
  row[[1, 3, 5, 7][n % 4]] = 'b'
  n = Math.floor(n / 4)
  row[[0, 2, 4, 6][n % 4]] = 'b'
  n = Math.floor(n / 4)
  const free = () => row.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0)
  row[free()[n % 6]] = 'q'
  n = Math.floor(n / 6)
  const [a, b] = KNIGHT_PLACEMENTS[n]
  const f = free()
  const sa = f[a]
  const sb = f[b]
  row[sa] = 'n'
  row[sb] = 'n'
  const rest = free()
  row[rest[0]] = 'r'
  row[rest[1]] = 'k'
  row[rest[2]] = 'r'
  return row as Role[]
}

export function chess960Position(index: number): Position {
  return Position.fromBackRank(chess960BackRank(index), 'chess960')
}

export function randomChess960Index(rng: () => number = Math.random): number {
  return Math.floor(rng() * 960)
}
