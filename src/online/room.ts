/**
 * Онлайн-партия: модель комнаты и чистая логика (без Firebase), чтобы её можно было тестировать.
 * Комната хранится в Firestore (коллекция rooms). Ходы — массив UCI-строк; позиция и конец партии
 * каждый раз восстанавливаются движком из src/chess, поэтому правила проверяются на клиенте.
 */
import { Game, opposite, type Color, type Outcome } from '../chess/index.ts'

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface Room {
  status: RoomStatus
  public: boolean
  /** Идентификатор пресета контроля времени (для подбора соперника). */
  tcId: string
  /** Начальное время, мс (0 — без часов). */
  baseMs: number
  incMs: number
  white: string | null
  black: string | null
  whiteName: string
  blackName: string
  /** Ходы в UCI, по порядку. */
  moves: string[]
  /** Остаток времени на момент последнего хода, мс. */
  whiteMs: number
  blackMs: number
  /** Время последнего хода по часам клиента (нужно только при перезагрузке страницы). */
  lastMoveAt: number
  result: '1-0' | '0-1' | '1/2-1/2' | null
  reason: string | null
  drawOfferBy: Color | null
  createdAt: number
  updatedAt: number
}

export interface NewRoomOptions {
  tcId: string
  baseMs: number
  incMs: number
  /** Цвет создателя. */
  color: Color
  uid: string
  name: string
  isPublic: boolean
  now?: number
}

export function newRoom(o: NewRoomOptions): Room {
  const now = o.now ?? Date.now()
  return {
    status: 'waiting',
    public: o.isPublic,
    tcId: o.tcId,
    baseMs: o.baseMs,
    incMs: o.incMs,
    white: o.color === 'w' ? o.uid : null,
    black: o.color === 'b' ? o.uid : null,
    whiteName: o.color === 'w' ? o.name : '',
    blackName: o.color === 'b' ? o.name : '',
    moves: [],
    whiteMs: o.baseMs,
    blackMs: o.baseMs,
    lastMoveAt: now,
    result: null,
    reason: null,
    drawOfferBy: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Чей ход по числу сделанных ходов. */
export function turnOf(room: Pick<Room, 'moves'>): Color {
  return room.moves.length % 2 === 0 ? 'w' : 'b'
}

export function colorOf(room: Pick<Room, 'white' | 'black'>, uid: string | null): Color | null {
  if (!uid) return null
  if (room.white === uid) return 'w'
  if (room.black === uid) return 'b'
  return null
}

/** Восстановить партию из списка ходов. null — если какой-то ход нелегален. */
export function gameFromMoves(moves: readonly string[]): Game | null {
  const g = new Game()
  for (const m of moves) if (!g.play(m)) return null
  return g
}

/** Часы идут, только когда партия идёт, время ограничено и оба игрока сделали по ходу. */
export function clocksRunning(room: Room): boolean {
  return room.status === 'playing' && room.baseMs > 0 && room.moves.length >= 2
}

/** Остаток времени игрока; elapsedMs — сколько прошло с последнего хода. */
export function remainingMs(room: Room, color: Color, elapsedMs: number): number {
  if (room.baseMs <= 0) return Infinity
  const stored = color === 'w' ? room.whiteMs : room.blackMs
  if (clocksRunning(room) && turnOf(room) === color) return stored - Math.max(0, elapsedMs)
  return stored
}

export type Patch = Partial<Room>

export type Plan = { ok: true; patch: Patch } | { ok: false; error: string }

function finishPatch(o: Outcome, now: number): Patch {
  return { status: 'finished', result: o.result, reason: o.reason, drawOfferBy: null, updatedAt: now }
}

/** Итог партии при падении флажка: правила FIDE (мат невозможен — ничья). */
function flagOutcome(room: Room, loser: Color): Outcome | null {
  const g = gameFromMoves(room.moves)
  if (!g) return null
  g.flag(loser)
  return g.outcome
}

/** Подготовить обновление комнаты для хода игрока `color` (UCI). Проверяет очередь, легальность и часы. */
export function planMove(room: Room, uci: string, color: Color, elapsedMs: number, now = Date.now()): Plan {
  if (room.status !== 'playing') return { ok: false, error: 'Партия не идёт.' }
  if (turnOf(room) !== color) return { ok: false, error: 'Сейчас не ваш ход.' }
  const g = gameFromMoves(room.moves)
  if (!g) return { ok: false, error: 'Повреждённая запись партии.' }

  let leftMs = Infinity
  if (room.baseMs > 0) {
    leftMs = remainingMs(room, color, elapsedMs)
    if (leftMs <= 0) {
      const o = flagOutcome(room, color)
      if (!o) return { ok: false, error: 'Повреждённая запись партии.' }
      return { ok: true, patch: { ...finishPatch(o, now), ...(color === 'w' ? { whiteMs: 0 } : { blackMs: 0 }) } }
    }
  }

  const rec = g.play(uci)
  if (!rec) return { ok: false, error: 'Недопустимый ход.' }

  // Прибавка начисляется, начиная со второго полухода каждого игрока (после первых двух ходов часы идут)
  const timed = room.baseMs > 0
  const counted = room.moves.length >= 2
  const nextMs = timed ? (counted ? leftMs + room.incMs : leftMs) : 0
  const patch: Patch = {
    moves: [...room.moves, rec.uci],
    lastMoveAt: now,
    updatedAt: now,
    drawOfferBy: null,
    ...(color === 'w' ? { whiteMs: nextMs } : { blackMs: nextMs }),
  }
  if (g.outcome) Object.assign(patch, finishPatch(g.outcome, now))
  return { ok: true, patch }
}

/** Проверка флажка: возвращает обновление, если время у игрока, чей ход, вышло. */
export function planFlag(room: Room, elapsedMs: number, now = Date.now()): Plan {
  if (!clocksRunning(room)) return { ok: false, error: 'Часы не идут.' }
  const loser = turnOf(room)
  if (remainingMs(room, loser, elapsedMs) > 0) return { ok: false, error: 'Время ещё не вышло.' }
  const o = flagOutcome(room, loser)
  if (!o) return { ok: false, error: 'Повреждённая запись партии.' }
  return { ok: true, patch: { ...finishPatch(o, now), ...(loser === 'w' ? { whiteMs: 0 } : { blackMs: 0 }) } }
}

export function planResign(room: Room, color: Color, now = Date.now()): Plan {
  if (room.status !== 'playing') return { ok: false, error: 'Партия не идёт.' }
  const winner = opposite(color)
  return {
    ok: true,
    patch: finishPatch({ result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'resignation' }, now),
  }
}

export function planDrawOffer(room: Room, color: Color, now = Date.now()): Plan {
  if (room.status !== 'playing') return { ok: false, error: 'Партия не идёт.' }
  if (room.moves.length < 2) return { ok: false, error: 'Предлагать ничью можно после первых ходов.' }
  if (room.drawOfferBy) return { ok: false, error: 'Предложение ничьей уже есть.' }
  return { ok: true, patch: { drawOfferBy: color, updatedAt: now } }
}

export function planDrawAccept(room: Room, color: Color, now = Date.now()): Plan {
  if (room.status !== 'playing') return { ok: false, error: 'Партия не идёт.' }
  if (room.drawOfferBy !== opposite(color)) return { ok: false, error: 'Нет предложения ничьей.' }
  return { ok: true, patch: finishPatch({ result: '1/2-1/2', winner: null, reason: 'agreement' }, now) }
}

export function planDrawDecline(room: Room, color: Color, now = Date.now()): Plan {
  if (room.drawOfferBy !== opposite(color)) return { ok: false, error: 'Нет предложения ничьей.' }
  return { ok: true, patch: { drawOfferBy: null, updatedAt: now } }
}

/** Требование ничьей (троекратное повторение / 50 ходов). */
export function planClaimDraw(room: Room, now = Date.now()): Plan {
  if (room.status !== 'playing') return { ok: false, error: 'Партия не идёт.' }
  const g = gameFromMoves(room.moves)
  if (!g || !g.claimDraw() || !g.outcome) return { ok: false, error: 'Ничью пока требовать нельзя.' }
  return { ok: true, patch: finishPatch(g.outcome, now) }
}

/** Отмена партии, пока соперник не пришёл. */
export function planAbandon(room: Room, now = Date.now()): Plan {
  if (room.status === 'finished') return { ok: false, error: 'Партия уже окончена.' }
  return { ok: true, patch: { status: 'finished', result: null, reason: 'abandoned', updatedAt: now } }
}

const REASON_RU: Record<string, string> = {
  checkmate: 'мат',
  stalemate: 'пат',
  'insufficient-material': 'недостаточно материала',
  'fivefold-repetition': 'пятикратное повторение',
  'seventyfive-moves': 'правило 75 ходов',
  'threefold-repetition': 'троекратное повторение',
  'fifty-moves': 'правило 50 ходов',
  agreement: 'по соглашению',
  resignation: 'сдача',
  timeout: 'время вышло',
  abandoned: 'партия отменена',
}

export function describeResult(room: Pick<Room, 'result' | 'reason'>): string {
  const why = room.reason ? (REASON_RU[room.reason] ?? room.reason) : ''
  if (room.reason === 'abandoned') return 'Партия отменена'
  const head = room.result === '1-0' ? 'Победили белые' : room.result === '0-1' ? 'Победили чёрные' : 'Ничья'
  return why ? `${head} — ${why}` : head
}
