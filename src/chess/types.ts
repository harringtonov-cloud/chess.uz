/**
 * Базовые типы шахматного ядра. Ядро — чистый TypeScript без DOM и без зависимостей,
 * поэтому один и тот же код работает в браузере, в Web Worker и на сервере (Node).
 */

export type Color = 'w' | 'b'
export type Role = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
/** Индекс клетки 0..63: a1 = 0, b1 = 1, … h1 = 7, a2 = 8, … h8 = 63. */
export type Square = number
export type CastleSide = 'k' | 'q'

/** Реализованные варианты. Остальные (crazyhouse, atomic, …) подключаются на этапе 2. */
export type VariantId = 'standard' | 'chess960'

export interface Piece {
  color: Color
  role: Role
}

/**
 * Ход. Рокировка кодируется как «король берёт свою ладью» (from = клетка короля,
 * to = клетка ладьи): так однозначно работает и обычная рокировка, и Chess960.
 * Для интерфейса и UCI есть преобразования (см. Position.findMove / moveToUci).
 */
export interface Move {
  from: Square
  to: Square
  promotion?: Role
}

export interface CastlingRights {
  w: { k: Square | null; q: Square | null }
  b: { k: Square | null; q: Square | null }
}

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w')

export type GameResult = '1-0' | '0-1' | '1/2-1/2'

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'fivefold-repetition'
  | 'seventyfive-moves'
  | 'threefold-repetition'
  | 'fifty-moves'
  | 'agreement'
  | 'resignation'
  | 'timeout'
  | 'abandoned'

export interface Outcome {
  result: GameResult
  winner: Color | null
  reason: EndReason
}
