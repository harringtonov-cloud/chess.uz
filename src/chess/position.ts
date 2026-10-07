/**
 * Position — неизменяемая шахматная позиция и вся логика правил:
 * генерация легальных ходов, рокировки (включая Chess960), взятие на проходе,
 * превращение пешки, шах/мат/пат, недостаток материала.
 *
 * Позиция иммутабельна: play() возвращает новую позицию. Это упрощает историю,
 * анализ, откат ходов и использование в Web Worker / на сервере.
 */
import type { CastleSide, CastlingRights, Color, Move, Piece, Role, Square, VariantId } from './types.ts'
import { opposite } from './types.ts'
import { backRank, fileOf, isLightSquare, makeSquare, rankOf } from './util.ts'

// ───────────────────────── Таблицы ходов ─────────────────────────

const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING_D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const ROOK_D = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function jumps(deltas: number[][]): Square[][] {
  const table: Square[][] = []
  for (let s = 0; s < 64; s++) {
    const out: Square[] = []
    for (const [df, dr] of deltas) {
      const f = fileOf(s) + df
      const r = rankOf(s) + dr
      if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(makeSquare(f, r))
    }
    table.push(out)
  }
  return table
}

function rays(deltas: number[][]): Square[][][] {
  const table: Square[][][] = []
  for (let s = 0; s < 64; s++) {
    const list: Square[][] = []
    for (const [df, dr] of deltas) {
      const ray: Square[] = []
      let f = fileOf(s) + df
      let r = rankOf(s) + dr
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        ray.push(makeSquare(f, r))
        f += df
        r += dr
      }
      list.push(ray)
    }
    table.push(list)
  }
  return table
}

export const KNIGHT_MOVES = jumps(KNIGHT_D)
export const KING_MOVES = jumps(KING_D)
export const ROOK_RAYS = rays(ROOK_D)
export const BISHOP_RAYS = rays(BISHOP_D)

const PROMOTION_ROLES: Role[] = ['q', 'r', 'b', 'n']

// ───────────────────────── Вспомогательные типы ─────────────────────────

export interface MoveInfo {
  piece: Piece
  captured: Piece | null
  castle: CastleSide | null
  enPassant: boolean
}

export type Board = (Piece | null)[]

const cloneRights = (c: CastlingRights): CastlingRights => ({
  w: { ...c.w },
  b: { ...c.b },
})

export interface PositionInit {
  board: Board
  turn: Color
  castling: CastlingRights
  epSquare: Square | null
  halfmoves: number
  fullmoves: number
  variant?: VariantId
}

// ───────────────────────── Position ─────────────────────────

export class Position {
  readonly board: Board
  readonly turn: Color
  readonly castling: CastlingRights
  /** Клетка «через которую прошла пешка» после двойного хода (может быть неиспользуемой). */
  readonly epSquare: Square | null
  readonly halfmoves: number
  readonly fullmoves: number
  readonly variant: VariantId

  private _legal: Move[] | null = null
  private _kings: { w: Square; b: Square } | null = null

  constructor(init: PositionInit) {
    this.board = init.board
    this.turn = init.turn
    this.castling = init.castling
    this.epSquare = init.epSquare
    this.halfmoves = init.halfmoves
    this.fullmoves = init.fullmoves
    this.variant = init.variant ?? 'standard'
  }

  /** Обычная начальная позиция. */
  static initial(): Position {
    return Position.fromBackRank(['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], 'standard')
  }

  /**
   * Позиция из расстановки фигур первой горизонтали (одинаковой для обеих сторон).
   * Используется для обычных шахмат и Chess960. Рокировочные ладьи — крайние ладьи
   * по обе стороны от короля.
   */
  static fromBackRank(row: Role[], variant: VariantId = 'chess960'): Position {
    const board: Board = new Array(64).fill(null)
    const kingFile = row.indexOf('k')
    let qRook: number | null = null
    let kRook: number | null = null
    row.forEach((role, f) => {
      if (role !== 'r') return
      if (f < kingFile && qRook === null) qRook = f
      if (f > kingFile) kRook = f
    })
    for (let f = 0; f < 8; f++) {
      board[makeSquare(f, 0)] = { color: 'w', role: row[f] }
      board[makeSquare(f, 1)] = { color: 'w', role: 'p' }
      board[makeSquare(f, 6)] = { color: 'b', role: 'p' }
      board[makeSquare(f, 7)] = { color: 'b', role: row[f] }
    }
    return new Position({
      board,
      turn: 'w',
      castling: {
        w: { k: kRook === null ? null : makeSquare(kRook, 0), q: qRook === null ? null : makeSquare(qRook, 0) },
        b: { k: kRook === null ? null : makeSquare(kRook, 7), q: qRook === null ? null : makeSquare(qRook, 7) },
      },
      epSquare: null,
      halfmoves: 0,
      fullmoves: 1,
      variant,
    })
  }

  get chess960(): boolean {
    return this.variant === 'chess960'
  }

  pieceAt(s: Square): Piece | null {
    return this.board[s]
  }

  kingSquare(color: Color): Square {
    if (!this._kings) {
      const kings = { w: -1, b: -1 }
      for (let s = 0; s < 64; s++) {
        const p = this.board[s]
        if (p && p.role === 'k') kings[p.color] = s
      }
      this._kings = kings
    }
    return this._kings[color]
  }

  // ───────────── Атаки ─────────────

  /** Атакует ли сторона `by` клетку `sq` на доске `board`. */
  static isAttacked(board: Board, sq: Square, by: Color): boolean {
    const f = fileOf(sq)
    const r = rankOf(sq)
    // пешки: атакующая пешка стоит на ряд «позади» клетки с точки зрения её цвета
    const pr = by === 'w' ? r - 1 : r + 1
    if (pr >= 0 && pr < 8) {
      if (f > 0) {
        const p = board[makeSquare(f - 1, pr)]
        if (p && p.color === by && p.role === 'p') return true
      }
      if (f < 7) {
        const p = board[makeSquare(f + 1, pr)]
        if (p && p.color === by && p.role === 'p') return true
      }
    }
    for (const t of KNIGHT_MOVES[sq]) {
      const p = board[t]
      if (p && p.color === by && p.role === 'n') return true
    }
    for (const t of KING_MOVES[sq]) {
      const p = board[t]
      if (p && p.color === by && p.role === 'k') return true
    }
    for (const ray of ROOK_RAYS[sq]) {
      for (const t of ray) {
        const p = board[t]
        if (p) {
          if (p.color === by && (p.role === 'r' || p.role === 'q')) return true
          break
        }
      }
    }
    for (const ray of BISHOP_RAYS[sq]) {
      for (const t of ray) {
        const p = board[t]
        if (p) {
          if (p.color === by && (p.role === 'b' || p.role === 'q')) return true
          break
        }
      }
    }
    return false
  }

  isAttackedBy(sq: Square, by: Color): boolean {
    return Position.isAttacked(this.board, sq, by)
  }

  inCheck(): boolean {
    return Position.isAttacked(this.board, this.kingSquare(this.turn), opposite(this.turn))
  }

  /** Клетки фигур, дающих шах стороне, чей ход. */
  checkers(): Square[] {
    const king = this.kingSquare(this.turn)
    const them = opposite(this.turn)
    const out: Square[] = []
    for (let s = 0; s < 64; s++) {
      const p = this.board[s]
      if (!p || p.color !== them) continue
      if (this.pieceAttacks(s, king)) out.push(s)
    }
    return out
  }

  /** Бьёт ли фигура на `from` клетку `to` (по геометрии, с учётом блокировки). */
  private pieceAttacks(from: Square, to: Square): boolean {
    const p = this.board[from]!
    switch (p.role) {
      case 'p': {
        const dir = p.color === 'w' ? 1 : -1
        return rankOf(to) === rankOf(from) + dir && Math.abs(fileOf(to) - fileOf(from)) === 1
      }
      case 'n':
        return KNIGHT_MOVES[from].includes(to)
      case 'k':
        return KING_MOVES[from].includes(to)
      default: {
        const lists: Square[][][] =
          p.role === 'r' ? [ROOK_RAYS[from]] : p.role === 'b' ? [BISHOP_RAYS[from]] : [ROOK_RAYS[from], BISHOP_RAYS[from]]
        for (const list of lists) {
          for (const ray of list) {
            for (const t of ray) {
              if (t === to) return true
              if (this.board[t]) break
            }
          }
        }
        return false
      }
    }
  }

  // ───────────── Генерация ходов ─────────────

  private genPawn(from: Square, out: Move[]): void {
    const b = this.board
    const us = this.turn
    const them = opposite(us)
    const dir = us === 'w' ? 8 : -8
    const startRank = us === 'w' ? 1 : 6
    const promoRank = us === 'w' ? 7 : 0
    const one = from + dir
    const push = (to: Square) => {
      if (rankOf(to) === promoRank) for (const promotion of PROMOTION_ROLES) out.push({ from, to, promotion })
      else out.push({ from, to })
    }
    if (b[one] === null) {
      push(one)
      if (rankOf(from) === startRank && b[one + dir] === null) out.push({ from, to: one + dir })
    }
    const f = fileOf(from)
    for (const df of [-1, 1]) {
      const nf = f + df
      if (nf < 0 || nf > 7) continue
      const to = one + df
      const q = b[to]
      if (q && q.color === them) push(to)
      else if (to === this.epSquare && q === null) out.push({ from, to })
    }
  }

  /** Псевдолегальные ходы (без рокировки и без проверки шаха своему королю). */
  pseudoLegalMoves(): Move[] {
    const out: Move[] = []
    const us = this.turn
    const b = this.board
    for (let from = 0; from < 64; from++) {
      const p = b[from]
      if (!p || p.color !== us) continue
      switch (p.role) {
        case 'p':
          this.genPawn(from, out)
          break
        case 'n':
        case 'k': {
          const targets = p.role === 'n' ? KNIGHT_MOVES[from] : KING_MOVES[from]
          for (const to of targets) {
            const q = b[to]
            if (!q || q.color !== us) out.push({ from, to })
          }
          break
        }
        default: {
          const lists: Square[][][] =
            p.role === 'r' ? [ROOK_RAYS[from]] : p.role === 'b' ? [BISHOP_RAYS[from]] : [ROOK_RAYS[from], BISHOP_RAYS[from]]
          for (const list of lists) {
            for (const ray of list) {
              for (const to of ray) {
                const q = b[to]
                if (!q) out.push({ from, to })
                else {
                  if (q.color !== us) out.push({ from, to })
                  break
                }
              }
            }
          }
        }
      }
    }
    return out
  }

  /** Не остаётся ли свой король под шахом после хода (ход временно делается на доске). */
  private isSafeAfter(m: Move): boolean {
    const b = this.board as Board
    const us = this.turn
    const piece = b[m.from]!
    const capturedAtTo = b[m.to]
    b[m.to] = piece
    b[m.from] = null
    let epSq = -1
    let epPiece: Piece | null = null
    if (piece.role === 'p' && m.to === this.epSquare && fileOf(m.from) !== fileOf(m.to) && capturedAtTo === null) {
      epSq = m.to + (us === 'w' ? -8 : 8)
      epPiece = b[epSq]
      b[epSq] = null
    }
    const kingSq = piece.role === 'k' ? m.to : this.kingSquare(us)
    const safe = !Position.isAttacked(b, kingSq, opposite(us))
    b[m.from] = piece
    b[m.to] = capturedAtTo
    if (epSq >= 0) b[epSq] = epPiece
    return safe
  }

  /** Рокировки (в кодировке «король берёт ладью»). Реализовано по общим правилам Chess960. */
  private castlingMoves(): Move[] {
    const out: Move[] = []
    const us = this.turn
    const them = opposite(us)
    const b = this.board as Board
    const rank = backRank(us)
    const kingSq = this.kingSquare(us)
    if (rankOf(kingSq) !== rank) return out
    const kf = fileOf(kingSq)
    for (const side of ['q', 'k'] as CastleSide[]) {
      const rookSq = this.castling[us][side]
      if (rookSq === null) continue
      const rook = b[rookSq]
      if (!rook || rook.color !== us || rook.role !== 'r' || rankOf(rookSq) !== rank) continue
      const rf = fileOf(rookSq)
      if ((side === 'k' && rf < kf) || (side === 'q' && rf > kf)) continue
      const kingTo = side === 'k' ? 6 : 2
      const rookTo = side === 'k' ? 5 : 3
      // все клетки, которые заняты королём/ладьёй при рокировке, должны быть пусты (кроме них самих)
      const lo = Math.min(kf, rf, kingTo, rookTo)
      const hi = Math.max(kf, rf, kingTo, rookTo)
      let free = true
      for (let f = lo; f <= hi; f++) {
        const s = makeSquare(f, rank)
        if (s !== kingSq && s !== rookSq && b[s]) {
          free = false
          break
        }
      }
      if (!free) continue
      // король не должен стоять под шахом, проходить через битые клетки или попадать под шах
      const king = b[kingSq]
      b[kingSq] = null
      let safe = true
      const step = kingTo >= kf ? 1 : -1
      for (let f = kf; ; f += step) {
        if (Position.isAttacked(b, makeSquare(f, rank), them)) {
          safe = false
          break
        }
        if (f === kingTo) break
      }
      // итоговая позиция: ладья уходит со своей клетки и может открыть линию на короля (Chess960)
      if (safe) {
        const rookPiece = b[rookSq]
        b[rookSq] = null
        const savedKingTo = b[makeSquare(kingTo, rank)]
        const savedRookTo = b[makeSquare(rookTo, rank)]
        b[makeSquare(kingTo, rank)] = king
        b[makeSquare(rookTo, rank)] = rookPiece
        if (Position.isAttacked(b, makeSquare(kingTo, rank), them)) safe = false
        b[makeSquare(kingTo, rank)] = savedKingTo
        b[makeSquare(rookTo, rank)] = savedRookTo
        b[rookSq] = rookPiece
      }
      b[kingSq] = king
      if (safe) out.push({ from: kingSq, to: rookSq })
    }
    return out
  }

  /** Все легальные ходы (кешируются: позиция неизменяема). */
  legalMoves(): Move[] {
    if (!this._legal) {
      const moves = this.pseudoLegalMoves().filter((m) => this.isSafeAfter(m))
      for (const c of this.castlingMoves()) moves.push(c)
      this._legal = moves
    }
    return this._legal
  }

  legalMovesFrom(from: Square): Move[] {
    return this.legalMoves().filter((m) => m.from === from)
  }

  hasLegalMoves(): boolean {
    return this.legalMoves().length > 0
  }

  // ───────────── Ходы ─────────────

  /** Является ли ход рокировкой (король берёт свою ладью). */
  isCastle(m: Move): boolean {
    const p = this.board[m.from]
    const t = this.board[m.to]
    return !!p && !!t && p.role === 'k' && t.role === 'r' && t.color === p.color
  }

  /** Подробности хода: фигура, съеденная фигура, рокировка, взятие на проходе. */
  describe(m: Move): MoveInfo {
    const piece = this.board[m.from]!
    if (this.isCastle(m)) {
      return { piece, captured: null, castle: m.to > m.from ? 'k' : 'q', enPassant: false }
    }
    const target = this.board[m.to]
    const enPassant = piece.role === 'p' && m.to === this.epSquare && fileOf(m.from) !== fileOf(m.to) && target === null
    return {
      piece,
      captured: enPassant ? { color: opposite(piece.color), role: 'p' } : target,
      castle: null,
      enPassant,
    }
  }

  /** Легален ли ход (точное совпадение from/to/promotion). */
  isLegal(m: Move): boolean {
    return this.legalMoves().some(
      (l) => l.from === m.from && l.to === m.to && (l.promotion ?? null) === (m.promotion ?? null),
    )
  }

  /** Сделать ход с проверкой легальности. Бросает Error для нелегального хода. */
  play(m: Move): Position {
    if (!this.isLegal(m)) throw new Error(`Illegal move ${m.from}-${m.to}${m.promotion ?? ''}`)
    return this.playUnchecked(m)
  }

  /** Сделать ход без проверки (ход должен быть легальным, иначе позиция будет неверной). */
  playUnchecked(m: Move): Position {
    const board = this.board.slice()
    const us = this.turn
    const them = opposite(us)
    const castling = cloneRights(this.castling)
    const piece = board[m.from]!
    const info = this.describe(m)
    let epSquare: Square | null = null

    if (info.castle) {
      const rank = backRank(us)
      const rook = board[m.to]!
      const kingTo = makeSquare(info.castle === 'k' ? 6 : 2, rank)
      const rookTo = makeSquare(info.castle === 'k' ? 5 : 3, rank)
      board[m.from] = null
      board[m.to] = null
      board[kingTo] = piece
      board[rookTo] = rook
      castling[us] = { k: null, q: null }
    } else {
      board[m.from] = null
      board[m.to] = m.promotion ? { color: us, role: m.promotion } : piece
      if (info.enPassant) board[m.to + (us === 'w' ? -8 : 8)] = null
      if (piece.role === 'p' && Math.abs(m.to - m.from) === 16) epSquare = (m.from + m.to) / 2
      if (piece.role === 'k') castling[us] = { k: null, q: null }
      for (const side of ['k', 'q'] as CastleSide[]) {
        if (castling[us][side] === m.from) castling[us][side] = null
        if (castling[them][side] === m.to) castling[them][side] = null
      }
    }

    const reset = piece.role === 'p' || info.captured !== null
    return new Position({
      board,
      turn: them,
      castling,
      epSquare,
      halfmoves: reset ? 0 : this.halfmoves + 1,
      fullmoves: this.fullmoves + (us === 'b' ? 1 : 0),
      variant: this.variant,
    })
  }

  /** Пропуск хода (нужен для анализа/null-move). Не является легальным ходом. */
  passTurn(): Position {
    return new Position({
      board: this.board.slice(),
      turn: opposite(this.turn),
      castling: cloneRights(this.castling),
      epSquare: null,
      halfmoves: this.halfmoves + 1,
      fullmoves: this.fullmoves + (this.turn === 'b' ? 1 : 0),
      variant: this.variant,
    })
  }

  // ───────────── Соответствие пользовательскому вводу ─────────────

  /** Клетка назначения короля при рокировке (g/c-вертикаль) в стандартной нотации. */
  castleKingTarget(m: Move): Square {
    const rank = rankOf(m.from)
    return makeSquare(m.to > m.from ? 6 : 2, rank)
  }

  /**
   * Находит легальный ход по вводу from → to. Принимает рокировку и как «король на две клетки»,
   * и как «король на свою ладью». Для превращения без указания фигуры возвращает ход в ферзя.
   */
  findMove(from: Square, to: Square, promotion?: Role): Move | null {
    const legal = this.legalMoves()
    let candidates = legal.filter((m) => m.from === from && m.to === to)
    if (!candidates.length) {
      candidates = legal.filter((m) => m.from === from && this.isCastle(m) && this.castleKingTarget(m) === to)
    }
    if (!candidates.length) return null
    if (candidates.some((m) => m.promotion)) {
      const want = promotion ?? 'q'
      return candidates.find((m) => m.promotion === want) ?? null
    }
    return candidates[0]
  }

  /** Требует ли ввод from → to выбора фигуры превращения. */
  needsPromotion(from: Square, to: Square): boolean {
    return this.legalMoves().some((m) => m.from === from && m.to === to && !!m.promotion)
  }

  /**
   * Карта «откуда → куда» для интерфейса. Рокировка показывается и на клетку короля (g1/c1),
   * и на клетку ладьи — как у Lichess (в Chess960 доступны оба варианта, если нет неоднозначности).
   */
  uiDests(): Map<Square, Square[]> {
    const dests = new Map<Square, Square[]>()
    for (const m of this.legalMoves()) {
      const list = dests.get(m.from) ?? []
      if (!list.includes(m.to)) list.push(m.to)
      if (this.isCastle(m)) {
        const kt = this.castleKingTarget(m)
        if (kt !== m.from && !list.includes(kt) && !this.legalMoves().some((o) => o.from === m.from && o.to === kt)) {
          list.push(kt)
        }
      }
      dests.set(m.from, list)
    }
    return dests
  }

  // ───────────── Конец партии ─────────────

  isCheckmate(): boolean {
    return this.inCheck() && !this.hasLegalMoves()
  }

  isStalemate(): boolean {
    return !this.inCheck() && !this.hasLegalMoves()
  }

  /**
   * Может ли сторона `color` в принципе поставить мат (хотя бы при «помощи» соперника).
   * Возвращает true, если матующего материала НЕТ. Реализация консервативна:
   * любая пешка/ладья/ферзь — достаточный материал; конь или слон — недостаточный
   * только если у соперника нет фигур, позволяющих «помощный мат».
   */
  hasInsufficientMaterial(color: Color): boolean {
    const mine: { role: Role; sq: Square }[] = []
    const theirs: { role: Role; sq: Square }[] = []
    for (let s = 0; s < 64; s++) {
      const p = this.board[s]
      if (!p || p.role === 'k') continue
      ;(p.color === color ? mine : theirs).push({ role: p.role, sq: s })
    }
    if (mine.some((p) => p.role === 'p' || p.role === 'r' || p.role === 'q')) return false
    if (mine.length === 0) return true
    if (mine.length === 1 && mine[0].role === 'n') return theirs.length === 0
    // только слоны своего цвета клеток
    if (mine.every((p) => p.role === 'b')) {
      const light = isLightSquare(mine[0].sq)
      if (!mine.every((p) => isLightSquare(p.sq) === light)) return false
      // у соперника допустимы только слоны того же цвета клеток (иначе возможен помощный мат)
      return theirs.every((p) => p.role === 'b' && isLightSquare(p.sq) === light)
    }
    return false
  }

  /** Мёртвая позиция (автоматическая ничья): ни одна сторона не может поставить мат. */
  isInsufficientMaterial(): boolean {
    return this.hasInsufficientMaterial('w') && this.hasInsufficientMaterial('b')
  }

  /** Ключ для подсчёта повторений: фигуры, очередь хода, права рокировки, легальное э.п. */
  repetitionKey(): string {
    let s = ''
    let empty = 0
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        const p = this.board[makeSquare(file, rank)]
        if (!p) {
          empty++
          continue
        }
        if (empty) {
          s += empty
          empty = 0
        }
        s += p.color === 'w' ? p.role.toUpperCase() : p.role
      }
      if (empty) {
        s += empty
        empty = 0
      }
      s += '/'
    }
    const c = this.castling
    s += ` ${this.turn} ${c.w.k ?? '-'}.${c.w.q ?? '-'}.${c.b.k ?? '-'}.${c.b.q ?? '-'} ${this.legalEpSquare() ?? '-'}`
    return s
  }

  /** Клетка взятия на проходе, только если такое взятие реально легально. */
  legalEpSquare(): Square | null {
    if (this.epSquare === null) return null
    const has = this.legalMoves().some((m) => m.to === this.epSquare && this.board[m.from]?.role === 'p' && this.describe(m).enPassant)
    return has ? this.epSquare : null
  }
}

/** Количество листовых узлов на глубине depth — стандартный тест корректности генератора ходов. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = pos.legalMoves()
  if (depth === 1) return moves.length
  let n = 0
  for (const m of moves) n += perft(pos.playUnchecked(m), depth - 1)
  return n
}
