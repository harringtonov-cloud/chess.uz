/**
 * Наборы фигур, нарисованные как векторные SVG 45×45 (собственные рисунки, не набор Lichess).
 * Стиль: чёрный контур, белые и чёрные фигуры, внутренние линии-детали — как на Lichess.
 * Контур строится как внешняя обводка объединённого силуэта, поэтому внутри фигуры нет «швов».
 *
 * Дополнительно можно подключить набор из файлов: положить SVG в public/pieces/cburnett/
 * (wK.svg … bP.svg) — набор появится в настройках автоматически, см. probeFileSet().
 */
import type { Color, Role } from '../chess/index.ts'

export type PieceSetId = 'classic' | 'warm' | 'ocean' | 'cburnett'

interface Shape {
  /** Контур (только абсолютные команды M L H V C Z). */
  d?: string
  /** Круг [cx, cy, r]. */
  c?: [number, number, number]
  /** Только линия-деталь (рисуется поверх, цветом детали). */
  line?: boolean
}

const BASE = (w: number): Shape => ({ d: `M${22.5 - w} 38.5H${22.5 + w}V35H${22.5 - w}Z` })

export const PIECE_SHAPES: Record<Role, Shape[]> = {
  p: [
    { c: [22.5, 13, 4.6] },
    {
      d: 'M18.5 17C18.5 20 19.5 21.5 20.5 22.5C16 24 13 28.5 13 35H32C32 28.5 29 24 24.5 22.5C25.5 21.5 26.5 20 26.5 17Z',
    },
    { d: 'M11 38.5H34V34.5H11Z' },
  ],
  r: [
    BASE(12.5),
    { d: 'M12.5 35L14 31H31L32.5 35Z' },
    { d: 'M14.5 31V18.5H30.5V31Z' },
    { d: 'M10.5 18.5V8.5H15.5V11.5H19.5V8.5H25.5V11.5H29.5V8.5H34.5V18.5Z' },
    { d: 'M14.5 18.5H30.5', line: true },
    { d: 'M14 31H31', line: true },
    { d: 'M12.5 35H32.5', line: true },
  ],
  n: [
    { d: 'M11.5 38.5H33.5V35H11.5Z' },
    {
      d: 'M13 35C13 31 14 28.5 17.5 26C15 26.5 11.5 26.5 9.5 24.5C8 22.5 9 20.5 11 19C14 16.5 15 13.5 15.5 10L17.5 6.5L20.5 9C24 8.5 29 11 31.5 17C34.5 24 35 30 33 35Z',
    },
    { c: [17.6, 15.2, 1.2], line: true },
    { c: [10.8, 22.3, 0.8], line: true },
    { d: 'M21.5 12.5C25.5 14.5 28.5 19 29.5 26', line: true },
  ],
  b: [
    BASE(12),
    { d: 'M14 35C14 32.5 16.5 31.5 22.5 31.5C28.5 31.5 31 32.5 31 35Z' },
    {
      d: 'M16.5 31.5C15.5 27 18 24.5 19.5 23C16.5 20 16.5 14 22.5 10C28.5 14 28.5 20 25.5 23C27 24.5 29.5 27 28.5 31.5Z',
    },
    { c: [22.5, 7.6, 2.7] },
    { d: 'M22.5 14V20.5', line: true },
    { d: 'M19.5 17H25.5', line: true },
    { d: 'M14 35H31', line: true },
  ],
  q: [
    BASE(13),
    { d: 'M11.5 35L13.5 30H31.5L33.5 35Z' },
    { d: 'M13 30L8.5 13.5L15 23L16 11.5L20 22L22.5 9.5L25 22L29 11.5L30 23L36.5 13.5L32 30Z' },
    { c: [8.5, 12.5, 2.3] },
    { c: [16, 10.5, 2.3] },
    { c: [22.5, 8.2, 2.3] },
    { c: [29, 10.5, 2.3] },
    { c: [36.5, 12.5, 2.3] },
    { d: 'M13.5 30H31.5', line: true },
    { d: 'M11.5 35H33.5', line: true },
  ],
  k: [
    BASE(12.5),
    { d: 'M12 35C12 32.5 13 31.5 14 31H31C32 31.5 33 32.5 33 35Z' },
    {
      d: 'M14 31C9 29 7 22.5 10.5 19C14 15.5 20 17.5 22.5 22.5C25 17.5 31 15.5 34.5 19C38 22.5 36 29 31 31Z',
    },
    { d: 'M21 4H24V7H27.5V10H24V23H21V10H17.5V7H21Z' },
    { d: 'M14 31H31', line: true },
    { d: 'M22.5 22.5V28', line: true },
  ],
}

interface Palette {
  wFill: string
  bFill: string
  outline: string
  wDetail: string
  bDetail: string
}

const PALETTES: Record<Exclude<PieceSetId, 'cburnett'>, Palette> = {
  classic: { wFill: '#ffffff', bFill: '#000000', outline: '#000000', wDetail: '#000000', bDetail: '#e8e8e8' },
  warm: { wFill: '#f7ecd2', bFill: '#4a3222', outline: '#2a1a10', wDetail: '#2a1a10', bDetail: '#f1d9a8' },
  ocean: { wFill: '#e9f3ff', bFill: '#1c3556', outline: '#0b1b33', wDetail: '#0b1b33', bDetail: '#cfe4ff' },
}

function el(s: Shape, attrs: string): string {
  if (s.c) return `<circle cx="${s.c[0]}" cy="${s.c[1]}" r="${s.c[2]}" ${attrs}/>`
  return `<path d="${s.d}" ${attrs}/>`
}

function build(color: Color, role: Role, p: Palette): string {
  const fill = color === 'w' ? p.wFill : p.bFill
  const detail = color === 'w' ? p.wDetail : p.bDetail
  const isDetail = (s: Shape) => !!s.line
  const body = PIECE_SHAPES[role].filter((s) => !isDetail(s))
  // 1) жирная обводка под всем силуэтом, 2) заливка без обводки, 3) линии-детали сверху
  const under = body
    .map((s) => el(s, `fill="${p.outline}" stroke="${p.outline}" stroke-width="3" stroke-linejoin="round"`))
    .join('')
  const over = body.map((s) => el(s, `fill="${fill}"`)).join('')
  const lines = PIECE_SHAPES[role]
    .filter(isDetail)
    .map((s) =>
      s.c
        ? el(s, `fill="${detail}"`)
        : el(s, `fill="none" stroke="${detail}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"`),
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${under}${over}${lines}</svg>`
}

export const PIECE_SVG: Record<string, string> = {}
const URLS: Record<string, string> = {}
for (const set of Object.keys(PALETTES) as Array<keyof typeof PALETTES>) {
  for (const color of ['w', 'b'] as Color[]) {
    for (const role of ['p', 'n', 'b', 'r', 'q', 'k'] as Role[]) {
      const key = `${set}:${color}${role.toUpperCase()}`
      PIECE_SVG[key] = build(color, role, PALETTES[set])
      URLS[key] = `data:image/svg+xml;utf8,${encodeURIComponent(PIECE_SVG[key])}`
    }
  }
}

export const PIECE_SET_LABELS: Record<PieceSetId, string> = {
  classic: 'Классика',
  warm: 'Тёплый',
  ocean: 'Океан',
  cburnett: 'cburnett (из файлов)',
}

/** Набор из файлов доступен только если файлы лежат в public/pieces/cburnett/. */
let fileSetAvailable = false
export function isFileSetAvailable(): boolean {
  return fileSetAvailable
}
export function probeFileSet(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      fileSetAvailable = true
      resolve(true)
    }
    img.onerror = () => resolve(false)
    img.src = '/pieces/cburnett/wK.svg'
  })
}

/** URL изображения фигуры, например pieceUrl('w', 'k', 'classic'). */
export function pieceUrl(color: Color, role: Role, set: PieceSetId = 'classic'): string {
  const key = color + role.toUpperCase()
  if (set === 'cburnett') return fileSetAvailable ? `/pieces/cburnett/${key}.svg` : URLS[`classic:${key}`]
  return URLS[`${set}:${key}`]
}
