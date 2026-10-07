/**
 * Game — партия: история ходов, определение конца партии (мат, пат, повторения,
 * правила 50/75 ходов, недостаток материала), сдача, ничья по соглашению, флаг.
 *
 * Правила автоматических ничьих следуют FIDE / Lichess:
 *  • пятикратное повторение и 75 ходов — ничья автоматически;
 *  • троекратное повторение и 50 ходов — ничью можно потребовать (claimDraw),
 *    либо включить автоматическое завершение опциями autoThreefold / autoFifty.
 */
import { INITIAL_FEN, makeFen, parseFen } from './fen.ts'
import { Position } from './position.ts'
import { moveToSan, moveToUci, parseMove } from './san.ts'
import type { CastleSide, Color, EndReason, GameResult, Move, Outcome, Piece, Role, VariantId } from './types.ts'
import { opposite } from './types.ts'

export interface MoveRecord {
  move: Move
  san: string
  uci: string
  color: Color
  piece: Piece
  captured: Piece | null
  castle: CastleSide | null
  enPassant: boolean
  promotion: Role | null
  check: boolean
  mate: boolean
  /** Остаток времени игрока после хода, мс (если ведутся часы). */
  clockMs?: number
  comment?: string
  nags?: number[]
}

export interface GameOptions {
  /** Завершать партию автоматически при троекратном повторении (по умолчанию — нет, можно потребовать). */
  autoThreefold?: boolean
  /** Завершать партию автоматически по правилу 50 ходов (по умолчанию — нет). */
  autoFifty?: boolean
}

export type DrawClaim = 'threefold-repetition' | 'fifty-moves'

export class Game {
  readonly initial: Position
  readonly options: GameOptions
  /** positions[i] — позиция после i полуходов (positions[0] — начальная). */
  private positions: Position[]
  private keys: string[]
  private records: MoveRecord[] = []
  private _outcome: Outcome | null = null
  headers: Record<string, string> = {}

  constructor(initial: Position = Position.initial(), options: GameOptions = {}) {
    this.initial = initial
    this.options = options
    this.positions = [initial]
    this.keys = [initial.repetitionKey()]
    this._outcome = this.detectAutomatic()
  }

  static fromFen(fen: string, options?: GameOptions, variant?: VariantId): Game {
    return new Game(parseFen(fen, { variant }), options)
  }

  // ───────────── Состояние ─────────────

  get position(): Position {
    return this.positions[this.positions.length - 1]
  }
  get turn(): Color {
    return this.position.turn
  }
  /** Число сыгранных полуходов. */
  get ply(): number {
    return this.records.length
  }
  get history(): readonly MoveRecord[] {
    return this.records
  }
  get sans(): string[] {
    return this.records.map((r) => r.san)
  }
  get lastMove(): MoveRecord | null {
    return this.records[this.records.length - 1] ?? null
  }
  get isOver(): boolean {
    return this._outcome !== null
  }
  get outcome(): Outcome | null {
    return this._outcome
  }
  /** Строка результата PGN: 1-0, 0-1, 1/2-1/2 или * */
  get result(): GameResult | '*' {
    return this._outcome?.result ?? '*'
  }
  positionAt(ply: number): Position {
    return this.positions[ply]
  }
  fen(): string {
    return makeFen(this.position)
  }
  legalMoves(): Move[] {
    return this._outcome ? [] : this.position.legalMoves()
  }

  // ───────────── Ходы ─────────────

  /**
   * Сделать ход. Принимает Move, SAN или UCI. Возвращает запись хода либо null,
   * если ход нелегален или партия окончена.
   */
  play(input: Move | string): MoveRecord | null {
    if (this._outcome) return null
    const pos = this.position
    const move = typeof input === 'string' ? parseMove(pos, input) : pos.isLegal(input) ? input : null
    if (!move) return null

    const info = pos.describe(move)
    const san = moveToSan(pos, move)
    const uci = moveToUci(pos, move)
    const next = pos.playUnchecked(move)
    const check = next.inCheck()
    const record: MoveRecord = {
      move,
      san,
      uci,
      color: pos.turn,
      piece: info.piece,
      captured: info.captured,
      castle: info.castle,
      enPassant: info.enPassant,
      promotion: move.promotion ?? null,
      check,
      mate: check && !next.hasLegalMoves(),
    }
    this.records.push(record)
    this.positions.push(next)
    this.keys.push(next.repetitionKey())
    this._outcome = this.detectAutomatic()
    return record
  }

  /** Сыграть ход из клеток интерфейса (from → to [+ превращение]). */
  playFromTo(from: number, to: number, promotion?: Role): MoveRecord | null {
    const m = this.position.findMove(from, to, promotion)
    return m ? this.play(m) : null
  }

  /** Откатить последний ход. Возвращает его запись. Результат (в т.ч. сдача) сбрасывается. */
  undo(): MoveRecord | null {
    const rec = this.records.pop()
    if (!rec) return null
    this.positions.pop()
    this.keys.pop()
    this._outcome = this.detectAutomatic()
    return rec
  }

  // ───────────── Конец партии ─────────────

  /** Сколько раз текущая позиция встретилась в партии. */
  repetitionCount(): number {
    const key = this.keys[this.keys.length - 1]
    let n = 0
    for (const k of this.keys) if (k === key) n++
    return n
  }

  private detectAutomatic(): Outcome | null {
    const pos = this.position
    const hasMoves = pos.hasLegalMoves()
    if (!hasMoves) {
      if (pos.inCheck()) {
        const winner = opposite(pos.turn)
        return { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'checkmate' }
      }
      return draw('stalemate')
    }
    if (pos.isInsufficientMaterial()) return draw('insufficient-material')
    const reps = this.repetitionCount()
    if (reps >= 5) return draw('fivefold-repetition')
    if (pos.halfmoves >= 150) return draw('seventyfive-moves')
    if (this.options.autoThreefold && reps >= 3) return draw('threefold-repetition')
    if (this.options.autoFifty && pos.halfmoves >= 100) return draw('fifty-moves')
    return null
  }

  /** Какую ничью сейчас можно потребовать (троекратное повторение / 50 ходов). */
  claimableDraw(): DrawClaim | null {
    if (this._outcome) return null
    if (this.repetitionCount() >= 3) return 'threefold-repetition'
    if (this.position.halfmoves >= 100) return 'fifty-moves'
    return null
  }

  /** Потребовать ничью. Возвращает false, если требование не обосновано. */
  claimDraw(): boolean {
    const claim = this.claimableDraw()
    if (!claim) return false
    this._outcome = draw(claim)
    return true
  }

  /** Ничья по соглашению. */
  agreeDraw(): void {
    if (!this._outcome) this._outcome = draw('agreement')
  }

  resign(color: Color): void {
    if (this._outcome) return
    const winner = opposite(color)
    this._outcome = { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'resignation' }
  }

  /**
   * Падение флажка. Если у соперника недостаточно материала для мата — ничья
   * (правило FIDE/Lichess), иначе победа соперника.
   */
  flag(color: Color): void {
    if (this._outcome) return
    const winner = opposite(color)
    if (this.position.hasInsufficientMaterial(winner)) {
      this._outcome = draw('timeout')
    } else {
      this._outcome = { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'timeout' }
    }
  }

  /** Завершить партию с заданным исходом (например, по решению сервера). */
  end(outcome: Outcome): void {
    this._outcome = outcome
  }
}

function draw(reason: EndReason): Outcome {
  return { result: '1/2-1/2', winner: null, reason }
}

export { INITIAL_FEN }
