/**
 * Набор фигур в чёрно-белом «классическом» стиле (тёмный контур, белые и чёрные фигуры),
 * нарисованный как векторные SVG 45×45. Фигуры собираются из контуров кодом, поэтому
 * не требуют внешних файлов и одинаково чётко выглядят на любом размере доски.
 *
 * Чтобы заменить набор на другой (например, на файлы из Lichess), достаточно положить
 * SVG в public/pieces/<набор>/wK.svg … bP.svg и указать набор в pieceUrl() — см. ARCHITECTURE.md.
 */
import type { Color, Role } from '../chess/index.ts'

interface Shape {
  d: string
  /** SVG-transform для контура (нужен, чтобы пешка была крупнее). */
  transform?: string
  /** true — только линия (внутренняя деталь), без заливки. */
  line?: boolean
}

const PAWN_SCALE = 'translate(22.5 39) scale(1.14) translate(-22.5 -39)'
const PLINTH = 'M9 39.5h27v-3c0-1.7-1.3-3-3-3H12c-1.7 0-3 1.3-3 3z'

const SHAPES: Record<Role, Shape[]> = {
  p: [
    { transform: PAWN_SCALE, d: 'M22.5 9.5a4.7 4.7 0 0 0-2.7 8.6c-3.6 1.8-5.8 5.2-5.8 9.3 0 2 .7 3.2 1.6 4.2-2.6 1.3-4.1 3.6-4.1 6.4h22c0-2.8-1.5-5.1-4.1-6.4.9-1 1.6-2.2 1.6-4.2 0-4.100-2.200-7.500-5.800-9.300A4.700 4.700 0 0 0 22.500 9.500z' },
  ],
  r: [
    { d: PLINTH },
    { d: 'M12.5 33.5l1.2-5.500h17.600l1.200 5.500z' },
    { d: 'M13.700 28l.8-12.500h16l.8 12.500z' },
    { d: 'M11 15.500V9h4.700v2.600h4V9h5.600v2.600h4V9H34v6.500z' },
    { d: 'M14.500 15.500h16M13.700 28h17.600M12.500 33.500h20', line: true },
  ],
  n: [
    { d: PLINTH },
    {
      d: 'M13.500 33.500c0-5.500 4.500-7 6.500-11-2.800 1.200-5.400 2.700-8.700 2.300-2-1.500-2.300-4 .200-6.300 2.700-2.400 3.200-5.400 5.500-8.700l.4-4 2.800 2.800C25.200 8.400 27 8.500 29 10c5.500 4 7.800 11 7 23.500z',
    },
    { d: 'M17.200 17.200a1.100 1.100 0 1 1-2.200 0 1.100 1.100 0 0 1 2.200 0zM11.700 21.500l1.600-.7', line: true },
    { d: 'M21 13.500c4.500 1.500 8 5 8.500 12', line: true },
  ],
  b: [
    { d: PLINTH },
    { d: 'M15 33.500c0-3 1.500-4.700 3.300-6.300-2.400-3.200-3.300-7.500-1.300-11.700 1.300-2.700 3.300-4.700 5.500-6.500 2.200 1.800 4.200 3.800 5.500 6.500 2 4.200 1.100 8.500-1.300 11.700 1.800 1.600 3.300 3.300 3.300 6.300z' },
    { d: 'M22.500 4.500a2.600 2.600 0 1 1 0 5.200 2.600 2.600 0 0 1 0-5.200z' },
    { d: 'M19.500 20.500l5 5.200M17.500 29.500h10', line: true },
  ],
  q: [
    { d: PLINTH },
    { d: 'M10.500 33.500L7.800 14.500l7.200 11.200 1.800-14 5.700 13.300 5.700-13.300 1.800 14 7.200-11.200-2.700 19z' },
    { d: 'M7.800 11.800a2.300 2.300 0 1 1 0 4.600 2.300 2.300 0 0 1 0-4.600zM16.800 8.800a2.300 2.300 0 1 1 0 4.600 2.300 2.300 0 0 1 0-4.600zM22.500 7.200a2.300 2.300 0 1 1 0 4.600 2.300 2.300 0 0 1 0-4.600zM28.200 8.800a2.300 2.300 0 1 1 0 4.600 2.300 2.300 0 0 1 0-4.600zM37.200 11.800a2.300 2.300 0 1 1 0 4.600 2.300 2.300 0 0 1 0-4.600z' },
    { d: 'M11 29.500h23M12 33.500h21', line: true },
  ],
  k: [
    { d: PLINTH },
    { d: 'M22.500 14.500c-3.500 0-5.500 2.500-5.500 5 0 2 1 3 2 4-4.500 1.500-7.500 4.500-7.500 8.500v1.500h22V32c0-4-3-7-7.500-8.500 1-1 2-2 2-4 0-2.500-2-5-5.500-5z' },
    { d: 'M22.500 4.500v10M18.200 8.800h8.600', line: true },
    { d: 'M13.500 29.500c5.500-1.800 12.500-1.800 18 0M18.500 23.500h8', line: true },
  ],
}

function build(color: Color, role: Role): string {
  const fill = color === 'w' ? '#ffffff' : '#000000'
  const detail = color === 'w' ? '#000000' : '#e8e8e8'
  const body = SHAPES[role]
    .map((s) =>
      s.line
        ? `<path d="${s.d}" fill="none" stroke="${detail}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path ${s.transform ? `transform="${s.transform}" ` : ''}d="${s.d}" fill="${fill}" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>`,
    )
    .join('')
  // у короля крест рисуется контуром поверх, у чёрного — тоже тёмным
  const cross =
    role === 'k'
      ? `<path d="M22.500 4.500v10.500M18.200 8.800h8.600" fill="none" stroke="#000" stroke-width="2.200" stroke-linecap="round"/>`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${body}${cross}</svg>`
}

export const PIECE_SVG: Record<string, string> = {}
export const PIECE_URL: Record<string, string> = {}
for (const color of ['w', 'b'] as Color[]) {
  for (const role of ['p', 'n', 'b', 'r', 'q', 'k'] as Role[]) {
    const key = color + role.toUpperCase()
    PIECE_SVG[key] = build(color, role)
    PIECE_URL[key] = `data:image/svg+xml;utf8,${encodeURIComponent(PIECE_SVG[key])}`
  }
}

/** URL изображения фигуры, например pieceUrl('w','k'). */
export function pieceUrl(color: Color, role: Role): string {
  return PIECE_URL[color + role.toUpperCase()]
}
