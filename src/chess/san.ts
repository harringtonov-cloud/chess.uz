/**
 * Нотации ходов: SAN (e4, Nbd7, exd6, O-O, e8=Q+) и UCI (e2e4, e7e8q, e1g1).
 */
import type { Position } from './position.ts'
import type { Move, Role } from './types.ts'
import { FILE_NAMES, fileOf, parseSquare, rankOf, squareName } from './util.ts'

// ───────────── UCI ─────────────

/**
 * UCI-запись хода. Рокировка: в обычных шахматах e1g1, в Chess960 — «король берёт ладью» (e1h1),
 * как принято у Lichess и Stockfish (UCI_Chess960).
 */
export function moveToUci(pos: Position, m: Move): string {
  let to = m.to
  if (pos.isCastle(m) && !pos.chess960) to = pos.castleKingTarget(m)
  return squareName(m.from) + squareName(to) + (m.promotion ?? '')
}

export function parseUci(pos: Position, uci: string): Move | null {
  const text = uci.trim()
  if (text.length < 4 || text.length > 5) return null
  const from = parseSquare(text.slice(0, 2))
  const to = parseSquare(text.slice(2, 4))
  if (from === null || to === null) return null
  let promotion: Role | undefined
  if (text.length === 5) {
    const ch = text[4].toLowerCase()
    if (!'qrbn'.includes(ch)) return null
    promotion = ch as Role
  }
  const m = pos.findMove(from, to, promotion)
  // если превращение не указано, а ход требует его, UCI считается некорректным
  if (m && m.promotion && !promotion) return null
  return m
}

// ───────────── SAN ─────────────

const ROLE_LETTER: Record<Role, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }

export function moveToSan(pos: Position, m: Move, opts: { suffix?: boolean } = {}): string {
  const info = pos.describe(m)
  let san: string
  if (info.castle) {
    san = info.castle === 'k' ? 'O-O' : 'O-O-O'
  } else if (info.piece.role === 'p') {
    san = info.captured ? FILE_NAMES[fileOf(m.from)] + 'x' + squareName(m.to) : squareName(m.to)
    if (m.promotion) san += '=' + m.promotion.toUpperCase()
  } else {
    // уточнение: другая такая же фигура, способная пойти на ту же клетку
    const others = pos
      .legalMoves()
      .filter((o) => o.to === m.to && o.from !== m.from && pos.board[o.from]!.role === info.piece.role && !pos.isCastle(o))
    let disamb = ''
    if (others.length) {
      const sameFile = others.some((o) => fileOf(o.from) === fileOf(m.from))
      const sameRank = others.some((o) => rankOf(o.from) === rankOf(m.from))
      if (!sameFile) disamb = FILE_NAMES[fileOf(m.from)]
      else if (!sameRank) disamb = String(rankOf(m.from) + 1)
      else disamb = squareName(m.from)
    }
    san = ROLE_LETTER[info.piece.role] + disamb + (info.captured ? 'x' : '') + squareName(m.to)
  }
  if (opts.suffix !== false) {
    const next = pos.playUnchecked(m)
    if (next.inCheck()) san += next.hasLegalMoves() ? '+' : '#'
  }
  return san
}

/** Разбор SAN (допускаются 0-0, e8Q, лишние +#!?). Неоднозначный или нелегальный ход → null. */
export function parseSan(pos: Position, input: string): Move | null {
  const san = input.trim().replace(/[+#!?]+$/g, '').replace(/0/g, 'O').replace(/e\.p\./i, '').trim()
  const legal = pos.legalMoves()

  if (san === 'O-O' || san === 'O-O-O') {
    const side = san === 'O-O' ? 'k' : 'q'
    return legal.find((m) => pos.isCastle(m) && (m.to > m.from ? 'k' : 'q') === side) ?? null
  }

  const pawn = /^(?:([a-h])x)?([a-h][1-8])(?:=?([QRBNqrbn]))?$/.exec(san)
  if (pawn) {
    const [, fromFile, dest, promo] = pawn
    const to = parseSquare(dest)!
    const promotion = promo ? (promo.toLowerCase() as Role) : undefined
    const found = legal.filter(
      (m) =>
        pos.board[m.from]!.role === 'p' &&
        m.to === to &&
        (m.promotion ?? undefined) === promotion &&
        (fromFile ? FILE_NAMES[fileOf(m.from)] === fromFile : fileOf(m.from) === fileOf(m.to)),
    )
    return found.length === 1 ? found[0] : null
  }

  const piece = /^([NBRQK])([a-h])?([1-8])?x?([a-h][1-8])$/.exec(san)
  if (piece) {
    const [, letter, fFile, fRank, dest] = piece
    const role = letter.toLowerCase() as Role
    const to = parseSquare(dest)!
    const found = legal.filter(
      (m) =>
        m.to === to &&
        !pos.isCastle(m) &&
        pos.board[m.from]!.role === role &&
        (!fFile || FILE_NAMES[fileOf(m.from)] === fFile) &&
        (!fRank || String(rankOf(m.from) + 1) === fRank),
    )
    return found.length === 1 ? found[0] : null
  }
  return null
}

/** Принимает SAN или UCI (удобно для ввода и сетевого протокола). */
export function parseMove(pos: Position, text: string): Move | null {
  return parseSan(pos, text) ?? parseUci(pos, text)
}
