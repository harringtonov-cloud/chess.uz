/**
 * Пре-мувы: ход, заданный заранее, пока соперник ещё думает.
 *
 * Как на Lichess, допустимость пре-мува проверяется только геометрией фигуры
 * (блокировки и шахи игнорируются — позиция к моменту хода изменится). Когда соперник
 * сходил, пре-мув пытаются сыграть как обычный ход; если он нелегален — он молча отменяется.
 */
import type { Position } from './position.ts'
import { KING_MOVES, KNIGHT_MOVES } from './position.ts'
import type { Move, Role, Square } from './types.ts'
import { backRank, fileOf, makeSquare, rankOf } from './util.ts'

export interface Premove {
  from: Square
  to: Square
  promotion?: Role
}

const STEPS_ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const STEPS_DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function slide(from: Square, steps: number[][]): Square[] {
  const out: Square[] = []
  for (const [df, dr] of steps) {
    let f = fileOf(from) + df
    let r = rankOf(from) + dr
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      out.push(makeSquare(f, r))
      f += df
      r += dr
    }
  }
  return out
}

/**
 * Клетки, на которые фигура с клетки `from` может быть поставлена в пре-мув.
 * Берётся фигура на `from` (она определяет цвет игрока), блокирующие фигуры игнорируются.
 */
export function premoveDests(pos: Position, from: Square): Square[] {
  const piece = pos.board[from]
  if (!piece) return []
  const color = piece.color
  const mine = (s: Square) => pos.board[s]?.color === color
  let targets: Square[] = []

  switch (piece.role) {
    case 'p': {
      const dir = color === 'w' ? 1 : -1
      const startRank = color === 'w' ? 1 : 6
      const f = fileOf(from)
      const r = rankOf(from)
      if (r + dir >= 0 && r + dir < 8) {
        targets.push(makeSquare(f, r + dir))
        if (r === startRank) targets.push(makeSquare(f, r + 2 * dir))
        for (const df of [-1, 1]) if (f + df >= 0 && f + df < 8) targets.push(makeSquare(f + df, r + dir))
      }
      break
    }
    case 'n':
      targets = [...KNIGHT_MOVES[from]]
      break
    case 'k': {
      targets = [...KING_MOVES[from]]
      // рокировка: на клетки g/c и на клетки своих рокировочных ладей
      const rights = pos.castling[color]
      if (rankOf(from) === backRank(color)) {
        for (const side of ['k', 'q'] as const) {
          const rook = rights[side]
          if (rook === null) continue
          targets.push(rook, makeSquare(side === 'k' ? 6 : 2, backRank(color)))
        }
      }
      break
    }
    case 'b':
      targets = slide(from, STEPS_DIAG)
      break
    case 'r':
      targets = slide(from, STEPS_ORTHO)
      break
    case 'q':
      targets = slide(from, [...STEPS_ORTHO, ...STEPS_DIAG])
      break
  }
  // своя фигура на клетке назначения запрещает ход (кроме своей рокировочной ладьи для короля)
  return [...new Set(targets)].filter((t) => {
    if (t === from) return false
    if (!mine(t)) return true
    const isCastleRook = piece.role === 'k' && (pos.castling[color].k === t || pos.castling[color].q === t)
    return isCastleRook
  })
}

/** Нужно ли превращение для пре-мува (пешка идёт на последнюю горизонталь). */
export function premoveNeedsPromotion(pos: Position, from: Square, to: Square): boolean {
  const p = pos.board[from]
  return !!p && p.role === 'p' && rankOf(to) === (p.color === 'w' ? 7 : 0)
}

/**
 * Хранилище пре-мува одного игрока. Один пре-мув, как на Lichess по умолчанию.
 */
export class PremoveController {
  private current: Premove | null = null

  get premove(): Premove | null {
    return this.current
  }

  /** Установить пре-мув. Возвращает false, если ход не подходит по геометрии. */
  set(pos: Position, premove: Premove): boolean {
    if (!premoveDests(pos, premove.from).includes(premove.to)) return false
    this.current = { ...premove }
    return true
  }

  clear(): void {
    this.current = null
  }

  /**
   * Вызывать, когда соперник сходил и позиция `pos` перешла к игроку.
   * Возвращает легальный ход для исполнения или null (пре-мув отменён/отсутствует).
   * В любом случае пре-мув после вызова сбрасывается.
   */
  resolve(pos: Position): Move | null {
    const pm = this.current
    this.current = null
    if (!pm) return null
    return pos.findMove(pm.from, pm.to, pm.promotion)
  }
}
