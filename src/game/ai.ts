/**
 * Встроенный шахматный ИИ: итеративное углубление, альфа-бета, расширение при шахе,
 * поиск спокойной позиции (quiescence), упорядочивание ходов. Уровни 1–12 различаются
 * глубиной, бюджетом времени и «шумом» (намеренными ошибками на слабых уровнях).
 * Модуль не зависит от DOM — выполняется в Web Worker (см. aiClient.ts).
 * Позже заменяется/дополняется Stockfish (этап 3).
 */
import { Position, parseFen, type Move, type Role, type Square } from '../chess/index.ts'

export interface AiParams {
  /** Максимальная глубина поиска (полуходов). */
  depth: number
  /** Бюджет времени на ход, мс. */
  ms: number
  /** Шум оценки в сотых пешки: >0 — слабый уровень, делает ошибки. */
  noise: number
}

export type AiChoice = { from: Square; to: Square; promotion?: Role }

const PIECE_VALUE: Record<Role, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const MATE = 100000

const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10,
    25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10,
    10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0,
    -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5,
    -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5,
    5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5,
    0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0,
    -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50,
    -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
}


function pstIndex(square: Square, color: 'w' | 'b'): number {
  const idx = (7 - (square >> 3)) * 8 + (square & 7)
  return color === 'w' ? idx : 63 - idx
}

/** Статическая оценка с точки зрения стороны, чей ход. */
function evalSide(pos: Position): number {
  let score = 0
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq]
    if (!p) continue
    const v = PIECE_VALUE[p.role] + (PST[p.role]?.[pstIndex(sq, p.color)] ?? 0)
    score += p.color === 'w' ? v : -v
  }
  return pos.turn === 'w' ? score : -score
}

class Timeout extends Error {}

class Searcher {
  nodes = 0
  private deadline: number
  private killers: (Move | null)[][] = []

  constructor(ms: number) {
    this.deadline = now() + ms
  }

  private check(): void {
    if ((++this.nodes & 511) === 0 && now() > this.deadline) throw new Timeout()
  }

  private orderScore(pos: Position, m: Move, ply: number, first: Move | null): number {
    if (first && m.from === first.from && m.to === first.to && m.promotion === first.promotion) return 1e6
    const info = pos.describe(m)
    let s = 0
    if (info.captured) s = 10000 + PIECE_VALUE[info.captured.role] * 10 - PIECE_VALUE[info.piece.role]
    if (m.promotion) s += 9000 + PIECE_VALUE[m.promotion]
    if (!s) {
      const k = this.killers[ply]
      if (k && k.some((x) => x && x.from === m.from && x.to === m.to)) s = 5000
    }
    return s
  }

  order(pos: Position, moves: Move[], ply: number, first: Move | null = null): Move[] {
    return moves
      .map((m) => ({ m, s: this.orderScore(pos, m, ply, first) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m)
  }

  private quiesce(pos: Position, alpha: number, beta: number, ply: number): number {
    this.check()
    const inCheck = pos.inCheck()
    let best = -Infinity
    if (!inCheck) {
      best = evalSide(pos)
      if (best >= beta) return best
      if (best > alpha) alpha = best
    }
    if (ply > 40) return evalSide(pos)
    const us = pos.turn
    const moves = inCheck
      ? pos.legalMoves()
      : pos.pseudoLegalMoves().filter((m) => m.promotion || pos.describe(m).captured)
    let any = false
    for (const m of this.order(pos, moves, ply)) {
      const next = pos.playUnchecked(m)
      if (!inCheck && Position.isAttacked(next.board, next.kingSquare(us), next.turn)) continue
      any = true
      const score = -this.quiesce(next, -beta, -alpha, ply + 1)
      if (score > best) best = score
      if (score > alpha) alpha = score
      if (alpha >= beta) break
    }
    if (inCheck && !any) return -MATE + ply
    return best === -Infinity ? evalSide(pos) : best
  }

  search(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    this.check()
    const moves = pos.legalMoves()
    if (!moves.length) return pos.inCheck() ? -MATE + ply : 0
    if (pos.halfmoves >= 100 || pos.isInsufficientMaterial()) return 0
    const inCheck = pos.inCheck()
    if (inCheck && ply < 30) depth++
    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply)
    let best = -Infinity
    for (const m of this.order(pos, moves, ply)) {
      const score = -this.search(pos.playUnchecked(m), depth - 1, -beta, -alpha, ply + 1)
      if (score > best) best = score
      if (score > alpha) alpha = score
      if (alpha >= beta) {
        if (!pos.describe(m).captured) {
          const k = (this.killers[ply] ??= [null, null])
          k[1] = k[0]
          k[0] = m
        }
        break
      }
    }
    return best
  }

  /** Лучший ход итеративным углублением (до depth или до конца времени). */
  best(pos: Position, maxDepth: number): Move {
    let moves = this.order(pos, pos.legalMoves(), 0)
    let bestMove = moves[0]
    for (let d = 1; d <= maxDepth; d++) {
      try {
        let alpha = -Infinity
        let iterBest = moves[0]
        const scored: { m: Move; s: number }[] = []
        for (const m of moves) {
          const s = -this.search(pos.playUnchecked(m), d - 1, -Infinity, -alpha, 1)
          scored.push({ m, s })
          if (s > alpha) {
            alpha = s
            iterBest = m
          }
        }
        bestMove = iterBest
        moves = scored.sort((a, b) => b.s - a.s).map((x) => x.m)
        if (alpha > MATE - 100) break // найден форсированный мат
      } catch (e) {
        if (e instanceof Timeout) break
        throw e
      }
    }
    return bestMove
  }

  /** Слабые уровни: оценка каждого хода + случайный шум. */
  noisy(pos: Position, depth: number, noise: number): Move {
    const moves = this.order(pos, pos.legalMoves(), 0)
    let best = moves[0]
    let bestScore = -Infinity
    try {
      for (const m of moves) {
        const s = -this.search(pos.playUnchecked(m), Math.max(0, depth - 1), -Infinity, Infinity, 1)
        const jittered = s + (Math.random() * 2 - 1) * noise
        if (jittered > bestScore) {
          bestScore = jittered
          best = m
        }
      }
    } catch (e) {
      if (!(e instanceof Timeout)) throw e
    }
    return best
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Выбор хода ИИ для позиции FEN. Возвращает null, если ходов нет. */
export function chooseAiMove(fen: string, params: AiParams): AiChoice | null {
  const pos = parseFen(fen)
  const legal = pos.legalMoves()
  if (!legal.length) return null
  const searcher = new Searcher(params.ms)
  const move = legal.length === 1 ? legal[0] : params.noise > 0 ? searcher.noisy(pos, params.depth, params.noise) : searcher.best(pos, params.depth)
  return { from: move.from, to: move.to, promotion: move.promotion }
}
