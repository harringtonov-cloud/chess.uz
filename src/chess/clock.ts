/**
 * Шахматные часы. Чистая логика без таймеров: время берётся из функции now(),
 * поэтому одни и те же часы работают в браузере (UI опрашивает time()),
 * на сервере (авторитетные часы) и в тестах (поддельное время).
 *
 * Режимы:
 *  • fischer  — прибавка после каждого хода (Фишер, «3+2»);
 *  • delay    — простая задержка: первые delayMs хода время не идёт;
 *  • bronstein — после хода возвращается потраченное время, но не больше delayMs.
 *
 * Как на Lichess, часы начинают идти только после того, как оба игрока сделали по ходу;
 * за первые ходы время не списывается и прибавка не начисляется (startAfterPly = 2).
 */
import type { Color } from './types.ts'
import { opposite } from './types.ts'

export type TimeCategory = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical'
export type ClockMode = 'fischer' | 'delay' | 'bronstein'

export interface TimeControl {
  initialMs: number
  /** Прибавка (Фишер) в мс; для delay/bronstein — это задержка. */
  incrementMs: number
  mode?: ClockMode
}

/** TimeControl из «минут + секунд прибавки», например timeControl(3, 2) → 3+2. */
export function timeControl(minutes: number, incrementSec = 0, mode: ClockMode = 'fischer'): TimeControl {
  return { initialMs: Math.round(minutes * 60_000), incrementMs: Math.round(incrementSec * 1000), mode }
}

/** Разбор строки «3+2», «0.5+0», «10» (минуты + секунды прибавки). */
export function parseTimeControl(text: string): TimeControl | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:\+\s*(\d+))?\s*$/.exec(text)
  return m ? timeControl(Number(m[1]), m[2] ? Number(m[2]) : 0) : null
}

/** Разбор тега PGN TimeControl: «180+2» (секунды), «300», «-» (без часов). */
export function parsePgnTimeControl(tag: string): TimeControl | null {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tag.trim())
  return m ? { initialMs: Number(m[1]) * 1000, incrementMs: m[2] ? Number(m[2]) * 1000 : 0, mode: 'fischer' } : null
}

export function toPgnTimeControl(tc: TimeControl): string {
  return `${Math.round(tc.initialMs / 1000)}+${Math.round(tc.incrementMs / 1000)}`
}

/** Расчётная длительность партии в секундах: начальное время + 40 × прибавка (формула Lichess). */
export function estimatedDurationSec(tc: TimeControl): number {
  return tc.initialMs / 1000 + (40 * tc.incrementMs) / 1000
}

export function categorize(tc: TimeControl): TimeCategory {
  const t = estimatedDurationSec(tc)
  if (t < 30) return 'ultrabullet'
  if (t < 180) return 'bullet'
  if (t < 480) return 'blitz'
  if (t < 1500) return 'rapid'
  return 'classical'
}

/** Короткая подпись: «3+2», «½+0», «¼+0», «15+10». */
export function formatTimeControl(tc: TimeControl): string {
  const min = tc.initialMs / 60_000
  const label = min === 0.25 ? '¼' : min === 0.5 ? '½' : min === 0.75 ? '¾' : String(Math.round(min * 100) / 100)
  return `${label}+${Math.round(tc.incrementMs / 1000)}`
}

export interface ClockSnapshot {
  remaining: Record<Color, number>
  turn: Color
  moves: number
  running: boolean
  flagged: Color | null
}

export interface ClockOptions {
  /** Источник времени в мс. По умолчанию performance.now() / Date.now(). */
  now?: () => number
  /** Сколько полуходов должно быть сделано до запуска часов (по умолчанию 2). */
  startAfterPly?: number
}

const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class ChessClock {
  readonly tc: TimeControl
  private now: () => number
  private startAfterPly: number
  private left: Record<Color, number>
  private turn: Color
  private moves = 0
  private paused = false
  private stopped = false
  private flaggedColor: Color | null = null
  /** Время, накопленное в текущем ходу до паузы. */
  private banked = 0
  /** Момент последнего запуска отсчёта (null — часы не идут). */
  private since: number | null = null

  constructor(tc: TimeControl, opts: ClockOptions = {}) {
    this.tc = tc
    this.now = opts.now ?? defaultNow
    this.startAfterPly = opts.startAfterPly ?? 2
    this.left = { w: tc.initialMs, b: tc.initialMs }
    this.turn = 'w'
    // startAfterPly = 0 — часы белых идут сразу (например, для серверной партии без «стартовых» ходов)
    if (this.enabled && this.startAfterPly === 0) this.since = this.now()
  }

  /** Часы реально заданы (initialMs > 0). */
  get enabled(): boolean {
    return this.tc.initialMs > 0
  }
  get activeColor(): Color {
    return this.turn
  }
  get movesMade(): number {
    return this.moves
  }
  /** Идёт ли сейчас отсчёт времени. */
  get running(): boolean {
    return this.enabled && !this.paused && !this.stopped && this.moves >= this.startAfterPly && this.since !== null
  }
  get flagged(): Color | null {
    return this.flaggedColor
  }

  private delayMs(): number {
    return this.tc.mode === 'delay' || this.tc.mode === 'bronstein' ? this.tc.incrementMs : 0
  }

  private rawElapsed(): number {
    return this.banked + (this.since === null ? 0 : this.now() - this.since)
  }

  /** Потрачено в текущем ходу с учётом задержки (delay). */
  private consumed(): number {
    return Math.max(0, this.rawElapsed() - (this.tc.mode === 'delay' ? this.delayMs() : 0))
  }

  /** Остаток времени игрока в мс (живое значение). */
  time(color: Color): number {
    if (!this.enabled) return Infinity
    const counting = !this.stopped && this.moves >= this.startAfterPly && !this.flaggedColor && color === this.turn
    return Math.max(0, counting ? this.left[color] - this.consumed() : this.left[color])
  }

  /**
   * Вызывать сразу после хода игрока `mover`. Списывает использованное время,
   * начисляет прибавку и передаёт ход. lagMs — компенсация задержки сети (сервер).
   * Возвращает остаток времени mover (для записи в PGN [%clk]).
   */
  press(mover: Color, lagMs = 0): number {
    if (!this.enabled) {
      this.turn = opposite(mover)
      this.moves++
      return Infinity
    }
    const wasRunning = this.moves >= this.startAfterPly && this.since !== null && !this.paused && !this.stopped
    if (wasRunning) {
      if (lagMs > 0) this.banked = Math.max(0, this.banked - lagMs)
      const raw = this.rawElapsed()
      const spent = Math.max(0, raw - (this.tc.mode === 'delay' ? this.delayMs() : 0))
      let remaining = this.left[mover] - spent
      if (remaining <= 0) {
        this.left[mover] = 0
        this.flaggedColor = mover
        this.stopped = true
        this.since = null
        this.moves++
        return 0
      }
      if (this.tc.mode === 'fischer' || this.tc.mode === undefined) remaining += this.tc.incrementMs
      else if (this.tc.mode === 'bronstein') remaining += Math.min(raw, this.delayMs())
      this.left[mover] = remaining
    }
    this.moves++
    this.turn = opposite(mover)
    this.banked = 0
    this.since = this.moves >= this.startAfterPly && !this.paused && !this.stopped ? this.now() : null
    return this.left[mover]
  }

  /** Проверка флажка: возвращает цвет, у которого вышло время (и останавливает часы). */
  check(): Color | null {
    if (this.flaggedColor) return this.flaggedColor
    if (!this.running) return null
    if (this.time(this.turn) <= 0) {
      this.left[this.turn] = 0
      this.flaggedColor = this.turn
      this.stop()
    }
    return this.flaggedColor
  }

  pause(): void {
    if (this.stopped || this.paused) return
    this.banked = this.rawElapsed()
    this.since = null
    this.paused = true
  }

  resume(): void {
    if (this.stopped || !this.paused) return
    this.paused = false
    if (this.moves >= this.startAfterPly) this.since = this.now()
  }

  /** Окончательная остановка (партия завершена). */
  stop(): void {
    if (this.stopped) return
    if (this.running) this.left[this.turn] = this.time(this.turn)
    this.stopped = true
    this.since = null
  }

  /** Состояние для передачи по сети. */
  snapshot(): ClockSnapshot {
    return {
      remaining: { w: this.time('w'), b: this.time('b') },
      turn: this.turn,
      moves: this.moves,
      running: this.running,
      flagged: this.flaggedColor,
    }
  }

  /** Принять авторитетное состояние сервера (клиентские часы только отображают его). */
  sync(s: ClockSnapshot): void {
    this.left = { ...s.remaining }
    this.turn = s.turn
    this.moves = s.moves
    this.flaggedColor = s.flagged
    this.banked = 0
    this.paused = false
    this.stopped = s.flagged !== null
    this.since = s.running && !this.stopped ? this.now() : null
  }
}
