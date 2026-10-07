/**
 * PGN: разбор (теги, комментарии, NAG, вариации, [%clk]/[%eval]) и экспорт.
 *
 * parsePgn() возвращает дерево (основная линия + вариации) — оно понадобится для Studies.
 * gameFromPgn() воспроизводит основную линию в Game с проверкой легальности каждого хода.
 */
import { makeFen, parseFen } from './fen.ts'
import { Game } from './game.ts'
import type { GameOptions } from './game.ts'
import { Position } from './position.ts'
import { parseSan } from './san.ts'
import type { GameResult, Outcome, VariantId } from './types.ts'

export class PgnError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PgnError'
  }
}

export interface PgnNode {
  san: string
  nags: number[]
  /** Комментарий в начале вариации, альтернативной этому ходу. */
  commentBefore?: string
  /** Комментарий после хода. */
  comment?: string
  /** Остаток времени после хода, мс ([%clk]). */
  clockMs?: number
  /** Оценка ([%eval]) — строка как в PGN (например «0.35» или «#3»). */
  eval?: string
  /** Альтернативные линии вместо этого хода. */
  variations: PgnNode[][]
}

export interface PgnGameData {
  headers: Record<string, string>
  /** Комментарий перед первым ходом. */
  comment?: string
  moves: PgnNode[]
  result: GameResult | '*'
}

// ───────────── Разбор ─────────────

const NAG_GLYPHS: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 }
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*'])

function extractCommands(raw: string, node: PgnNode | null): string {
  let text = raw
  const clk = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(text)
  if (clk && node) node.clockMs = Math.round((Number(clk[1]) * 3600 + Number(clk[2]) * 60 + Number(clk[3])) * 1000)
  const ev = /\[%eval\s+([^\]\s]+)[^\]]*\]/.exec(text)
  if (ev && node) node.eval = ev[1]
  text = text.replace(/\[%[a-z]+\s+[^\]]*\]/gi, '')
  return text.trim()
}

/** Разбирает текст с одной или несколькими партиями. */
export function parsePgn(text: string): PgnGameData[] {
  const games: PgnGameData[] = []
  let i = 0
  const n = text.length

  let cur: PgnGameData | null = null
  let line: PgnNode[] = []
  let stack: { line: PgnNode[]; parent: PgnNode }[] = []
  let started = false // встретилась ли хоть одна строка движка/ход в текущей партии

  const startGame = () => {
    cur = { headers: {}, moves: [], result: '*' }
    line = cur.moves
    stack = []
    started = false
  }
  const finishGame = (result?: string) => {
    if (cur && (started || Object.keys(cur.headers).length)) {
      if (result && RESULTS.has(result)) cur.result = result as GameResult | '*'
      else if (cur.headers.Result && RESULTS.has(cur.headers.Result)) cur.result = cur.headers.Result as GameResult | '*'
      games.push(cur)
    }
    cur = null
  }
  const atLineStart = (pos: number) => {
    let k = pos - 1
    while (k >= 0 && (text[k] === ' ' || text[k] === '\t')) k--
    return k < 0 || text[k] === '\n' || text[k] === '\r'
  }

  while (i < n) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\uFEFF') {
      i++
      continue
    }
    // теги
    if (ch === '[' && atLineStart(i)) {
      const m = /^\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/.exec(text.slice(i, i + 2000))
      if (m) {
        if (cur && started) finishGame()
        if (!cur) startGame()
        cur!.headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1')
        i += m[0].length
        continue
      }
    }
    if (ch === '%' && atLineStart(i)) {
      while (i < n && text[i] !== '\n') i++
      continue
    }
    if (!cur) startGame()
    if (ch === ';') {
      const start = i + 1
      while (i < n && text[i] !== '\n') i++
      attachComment(text.slice(start, i))
      continue
    }
    if (ch === '{') {
      const end = text.indexOf('}', i)
      const stop = end < 0 ? n : end
      attachComment(text.slice(i + 1, stop))
      i = stop + 1
      continue
    }
    if (ch === '(') {
      const parent = line[line.length - 1]
      if (!parent) throw new PgnError('Вариация без предшествующего хода')
      const variation: PgnNode[] = []
      parent.variations.push(variation)
      stack.push({ line, parent })
      line = variation
      i++
      continue
    }
    if (ch === ')') {
      const top = stack.pop()
      if (!top) throw new PgnError('Лишняя закрывающая скобка вариации')
      line = top.line
      i++
      continue
    }
    if (ch === '$') {
      let j = i + 1
      while (j < n && text[j] >= '0' && text[j] <= '9') j++
      const last = line[line.length - 1]
      if (last) last.nags.push(Number(text.slice(i + 1, j)))
      i = j
      continue
    }
    // слово: ход, номер хода, результат, глиф
    let j = i
    while (j < n && !' \t\n\r{}();$'.includes(text[j])) j++
    let word = text.slice(i, j)
    i = j
    if (RESULTS.has(word)) {
      started = true
      finishGame(word)
      continue
    }
    started = true
    // номер хода: «12.» «12...» (возможно слитно с ходом: «12.e4»)
    word = word.replace(/^\d+\.*/, '')
    if (!word || word === '..' || word === '...') continue
    let glyph = ''
    const g = /[!?]+$/.exec(word)
    if (g) {
      glyph = g[0]
      word = word.slice(0, word.length - glyph.length)
    }
    if (!word) continue
    if (word === '--' || word === 'Z0') throw new PgnError('Нулевые ходы не поддерживаются')
    const node: PgnNode = { san: word, nags: [], variations: [] }
    if (glyph && NAG_GLYPHS[glyph]) node.nags.push(NAG_GLYPHS[glyph])
    line.push(node)
  }
  if (cur) finishGame()
  return games

  function attachComment(raw: string): void {
    const last = line[line.length - 1]
    if (last) {
      const t = extractCommands(raw, last)
      if (t) last.comment = last.comment ? last.comment + ' ' + t : t
    } else if (stack.length) {
      // комментарий в самом начале вариации: сохраняем на родительском ходе
      const t = extractCommands(raw, null)
      const parent = stack[stack.length - 1].parent
      if (t) parent.commentBefore = parent.commentBefore ? parent.commentBefore + ' ' + t : t
    } else if (cur) {
      const t = extractCommands(raw, null)
      if (t) cur.comment = cur.comment ? cur.comment + ' ' + t : t
    }
  }
}

// ───────────── Воспроизведение партии ─────────────

function variantFromHeaders(h: Record<string, string>): VariantId {
  const v = (h.Variant ?? '').toLowerCase().replace(/\s+/g, '')
  if (v === 'chess960' || v === 'fischerandom') return 'chess960'
  return 'standard'
}

function outcomeFromResult(result: string, headers: Record<string, string>): Outcome | null {
  if (result === '1-0') return { result: '1-0', winner: 'w', reason: reasonFromTermination(headers) }
  if (result === '0-1') return { result: '0-1', winner: 'b', reason: reasonFromTermination(headers) }
  if (result === '1/2-1/2') return { result: '1/2-1/2', winner: null, reason: 'agreement' }
  return null
}

function reasonFromTermination(h: Record<string, string>): Outcome['reason'] {
  const t = (h.Termination ?? '').toLowerCase()
  if (t.includes('time')) return 'timeout'
  if (t.includes('resign') || t.includes('abandon')) return 'resignation'
  return 'checkmate'
}

export interface FromPgnOptions extends GameOptions {
  /** Индекс партии, если в тексте их несколько (по умолчанию 0). */
  index?: number
}

/** Создаёт Game из PGN (основная линия). Бросает PgnError при нелегальном/нечитаемом ходе. */
export function gameFromPgn(text: string, opts: FromPgnOptions = {}): Game {
  const games = parsePgn(text)
  const data = games[opts.index ?? 0]
  if (!data) throw new PgnError('В тексте не найдено ни одной партии')
  return gameFromPgnData(data, opts)
}

export function gameFromPgnData(data: PgnGameData, opts: GameOptions = {}): Game {
  const variant = variantFromHeaders(data.headers)
  let start: Position
  try {
    start = data.headers.FEN ? parseFen(data.headers.FEN, { variant }) : Position.initial()
  } catch (e) {
    throw new PgnError(`Некорректный FEN в заголовке: ${(e as Error).message}`)
  }
  const game = new Game(start, opts)
  game.headers = { ...data.headers }
  data.moves.forEach((node, idx) => {
    const move = parseSan(game.position, node.san)
    if (!move) {
      const num = Math.floor((game.ply + (start.turn === 'b' ? 1 : 0)) / 2) + start.fullmoves
      throw new PgnError(`Нелегальный или неоднозначный ход «${node.san}» (ход ${num}, полуход ${idx + 1})`)
    }
    const rec = game.play(move)
    if (rec) {
      if (node.clockMs !== undefined) rec.clockMs = node.clockMs
      if (node.comment) rec.comment = node.comment
      if (node.nags.length) rec.nags = [...node.nags]
    }
  })
  if (!game.isOver) {
    const out = outcomeFromResult(data.result, data.headers)
    if (out) game.end(out)
  }
  return game
}

// ───────────── Экспорт ─────────────

export interface ToPgnOptions {
  headers?: Record<string, string>
  /** Писать комментарии ходов (по умолчанию да). */
  comments?: boolean
  /** Писать [%clk] для ходов, у которых известен остаток времени (по умолчанию да). */
  clocks?: boolean
  /** Ширина строки движка (по умолчанию 80, 0 — одной строкой). */
  width?: number
}

const SEVEN_TAG_ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100) / 10)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const sec = Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(1).padStart(4, '0')
  return `${h}:${String(m).padStart(2, '0')}:${sec}`
}

const escapeTag = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export function toPgn(game: Game, opts: ToPgnOptions = {}): string {
  const result = game.result
  const base: Record<string, string> = {
    Event: '?',
    Site: '?',
    Date: '????.??.??',
    Round: '?',
    White: '?',
    Black: '?',
    ...game.headers,
    ...opts.headers,
    Result: result,
  }
  const startFen = makeFen(game.initial)
  if (game.initial.chess960) base.Variant = 'Chess960'
  if (startFen !== makeFen(Position.initial()) || game.initial.chess960) {
    base.SetUp = '1'
    base.FEN = startFen
  }
  const tagOrder = [...SEVEN_TAG_ROSTER, ...Object.keys(base).filter((k) => !SEVEN_TAG_ROSTER.includes(k))]
  const head = tagOrder.map((k) => `[${k} "${escapeTag(base[k])}"]`).join('\n')

  const tokens: string[] = []
  let moveNo = game.initial.fullmoves
  let needNumber = true
  game.history.forEach((rec, idx) => {
    if (rec.color === 'w') {
      tokens.push(`${moveNo}.`)
    } else if (needNumber || idx === 0) {
      tokens.push(`${moveNo}...`)
    }
    needNumber = false
    let san = rec.san
    for (const nag of rec.nags ?? []) {
      const glyph = Object.entries(NAG_GLYPHS).find(([, v]) => v === nag)?.[0]
      if (glyph) san += glyph
      else san += ` $${nag}`
    }
    tokens.push(san)
    const parts: string[] = []
    if (opts.comments !== false && rec.comment) parts.push(rec.comment)
    if (opts.clocks !== false && rec.clockMs !== undefined) parts.push(`[%clk ${formatClock(rec.clockMs)}]`)
    if (parts.length) {
      tokens.push(`{ ${parts.join(' ')} }`)
      needNumber = rec.color === 'w' // после комментария у чёрных снова ставим номер
    }
    if (rec.color === 'b') moveNo++
  })
  tokens.push(result)

  const width = opts.width ?? 80
  let body: string
  if (!width) body = tokens.join(' ')
  else {
    const lines: string[] = []
    let line = ''
    for (const t of tokens) {
      if (line && line.length + 1 + t.length > width) {
        lines.push(line)
        line = t
      } else line = line ? line + ' ' + t : t
    }
    if (line) lines.push(line)
    body = lines.join('\n')
  }
  return `${head}\n\n${body}\n`
}
