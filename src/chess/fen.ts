/**
 * FEN: разбор и генерация. Поддерживаются X-FEN (KQkq) и Shredder-FEN (буквы вертикалей, AHah)
 * для Chess960. Разбор строгий: некорректная позиция → FenError.
 */
import { Position } from './position.ts'
import type { Board } from './position.ts'
import type { CastleSide, CastlingRights, Color, Piece, Square, VariantId } from './types.ts'
import { opposite } from './types.ts'
import { FILE_NAMES, backRank, fileOf, makeSquare, parseSquare, pieceFromChar, pieceToChar, rankOf, squareName } from './util.ts'

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export class FenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FenError'
  }
}

export interface ParseFenOptions {
  /** Принудительно считать позицию Chess960 (иначе определяется по правам рокировки). */
  variant?: VariantId
}

export function parseFen(fen: string, opts: ParseFenOptions = {}): Position {
  const parts = fen.trim().split(/\s+/)
  if (parts.length < 2) throw new FenError('FEN должен содержать минимум расстановку и очередь хода')
  const [boardPart, turnPart, castlingPart = '-', epPart = '-', halfPart = '0', fullPart = '1'] = parts

  const rows = boardPart.split('/')
  if (rows.length !== 8) throw new FenError('В FEN должно быть 8 горизонталей')
  const board: Board = new Array(64).fill(null)
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i
    let file = 0
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch)
      } else {
        const piece = pieceFromChar(ch)
        if (!piece) throw new FenError(`Неизвестный символ «${ch}» в расстановке`)
        if (file > 7) throw new FenError(`Слишком длинная горизонталь ${rank + 1}`)
        board[makeSquare(file, rank)] = piece
        file++
      }
    }
    if (file !== 8) throw new FenError(`Горизонталь ${rank + 1} содержит ${file} клеток вместо 8`)
  }

  if (turnPart !== 'w' && turnPart !== 'b') throw new FenError('Очередь хода должна быть w или b')
  const turn = turnPart as Color

  // короли и пешки
  const kings: Record<Color, Square[]> = { w: [], b: [] }
  const counts: Record<Color, { p: number; all: number }> = { w: { p: 0, all: 0 }, b: { p: 0, all: 0 } }
  for (let s = 0; s < 64; s++) {
    const p = board[s]
    if (!p) continue
    counts[p.color].all++
    if (p.role === 'k') kings[p.color].push(s)
    if (p.role === 'p') {
      counts[p.color].p++
      if (rankOf(s) === 0 || rankOf(s) === 7) throw new FenError('Пешка не может стоять на 1-й или 8-й горизонтали')
    }
  }
  for (const c of ['w', 'b'] as Color[]) {
    if (kings[c].length !== 1) throw new FenError(`Должен быть ровно один король у ${c === 'w' ? 'белых' : 'чёрных'}`)
    if (counts[c].p > 8) throw new FenError('Слишком много пешек')
    if (counts[c].all > 16) throw new FenError('Слишком много фигур')
  }

  // права рокировки
  const castling: CastlingRights = { w: { k: null, q: null }, b: { k: null, q: null } }
  let nonStandardCastling = false
  if (castlingPart !== '-') {
    for (const ch of castlingPart) {
      const color: Color = ch === ch.toUpperCase() ? 'w' : 'b'
      const lower = ch.toLowerCase()
      const rank = backRank(color)
      const kingSq = kings[color][0]
      if (rankOf(kingSq) !== rank) continue // король сошёл с горизонтали — право недействительно
      let side: CastleSide
      let rookSq: Square | null = null
      if (lower === 'k' || lower === 'q') {
        side = lower
        // X-FEN: берём самую дальнюю от короля ладью с соответствующей стороны
        const kf = fileOf(kingSq)
        const files = side === 'k' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
        for (const f of files) {
          if ((side === 'k' && f <= kf) || (side === 'q' && f >= kf)) continue
          const p = board[makeSquare(f, rank)]
          if (p && p.color === color && p.role === 'r') {
            rookSq = makeSquare(f, rank)
            break
          }
        }
      } else if (lower >= 'a' && lower <= 'h') {
        const f = FILE_NAMES.indexOf(lower)
        rookSq = makeSquare(f, rank)
        side = f > fileOf(kingSq) ? 'k' : 'q'
        const p = board[rookSq]
        if (!p || p.color !== color || p.role !== 'r') rookSq = null
      } else {
        throw new FenError(`Неверное право рокировки «${ch}»`)
      }
      if (rookSq !== null) {
        castling[color][side] = rookSq
        if (fileOf(rookSq) !== (side === 'k' ? 7 : 0) || fileOf(kingSq) !== 4) nonStandardCastling = true
      }
    }
  }

  // взятие на проходе: принимаем только осмысленное
  let epSquare: Square | null = null
  if (epPart !== '-') {
    const ep = parseSquare(epPart)
    if (ep === null) throw new FenError('Неверная клетка взятия на проходе')
    const expectedRank = turn === 'w' ? 5 : 2
    const pawnSq = ep + (turn === 'w' ? -8 : 8)
    const origin = ep + (turn === 'w' ? 8 : -8)
    const pawn = board[pawnSq]
    if (
      rankOf(ep) === expectedRank &&
      board[ep] === null &&
      board[origin] === null &&
      pawn &&
      pawn.role === 'p' &&
      pawn.color === opposite(turn)
    ) {
      epSquare = ep
    }
  }

  const halfmoves = Number(halfPart)
  const fullmoves = Number(fullPart)
  if (!Number.isInteger(halfmoves) || halfmoves < 0) throw new FenError('Неверный счётчик полуходов')
  if (!Number.isInteger(fullmoves) || fullmoves < 1) throw new FenError('Неверный номер хода')

  const variant: VariantId = opts.variant ?? (nonStandardCastling ? 'chess960' : 'standard')
  const pos = new Position({ board, turn, castling, epSquare, halfmoves, fullmoves, variant })

  // сторона, не имеющая хода, не может стоять под шахом
  if (Position.isAttacked(pos.board, pos.kingSquare(opposite(turn)), turn)) {
    throw new FenError('Король стороны, не имеющей хода, находится под шахом')
  }
  return pos
}

export function tryParseFen(fen: string, opts?: ParseFenOptions): Position | null {
  try {
    return parseFen(fen, opts)
  } catch {
    return null
  }
}

/** Расстановка фигур (первое поле FEN). */
export function boardFen(board: Board): string {
  const rows: string[] = []
  for (let rank = 7; rank >= 0; rank--) {
    let row = ''
    let empty = 0
    for (let file = 0; file < 8; file++) {
      const p: Piece | null = board[makeSquare(file, rank)]
      if (!p) {
        empty++
      } else {
        if (empty) row += empty
        empty = 0
        row += pieceToChar(p)
      }
    }
    if (empty) row += empty
    rows.push(row)
  }
  return rows.join('/')
}

function castlingFen(pos: Position): string {
  let out = ''
  for (const color of ['w', 'b'] as Color[]) {
    const kingSq = pos.kingSquare(color)
    for (const side of ['k', 'q'] as CastleSide[]) {
      const rookSq = pos.castling[color][side]
      if (rookSq === null) continue
      // X-FEN: KQkq, если ладья — крайняя с этой стороны; иначе буква вертикали
      let outermost = true
      const kf = fileOf(kingSq)
      const rf = fileOf(rookSq)
      for (let f = side === 'k' ? rf + 1 : 0; f < (side === 'k' ? 8 : rf); f++) {
        if ((side === 'k' && f <= kf) || (side === 'q' && f >= kf)) continue
        const p = pos.board[makeSquare(f, backRank(color))]
        if (p && p.color === color && p.role === 'r') outermost = false
      }
      let ch = outermost ? side : FILE_NAMES[rf]
      if (color === 'w') ch = ch.toUpperCase()
      out += ch
    }
  }
  // порядок как в стандарте: K Q k q
  return out ? [...out].sort((a, b) => order(a) - order(b)).join('') : '-'
}

function order(ch: string): number {
  const base = ch === ch.toUpperCase() ? 0 : 10
  const l = ch.toLowerCase()
  return base + (l === 'k' ? 0 : l === 'q' ? 1 : 2 + FILE_NAMES.indexOf(l))
}

export interface MakeFenOptions {
  /** Всегда писать клетку взятия на проходе (по умолчанию — только если взятие легально). */
  alwaysEp?: boolean
}

export function makeFen(pos: Position, opts: MakeFenOptions = {}): string {
  const ep = opts.alwaysEp ? pos.epSquare : pos.legalEpSquare()
  return [
    boardFen(pos.board),
    pos.turn,
    castlingFen(pos),
    ep === null ? '-' : squareName(ep),
    pos.halfmoves,
    pos.fullmoves,
  ].join(' ')
}
