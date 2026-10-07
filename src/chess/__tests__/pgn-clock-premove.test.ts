import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  Game, gameFromPgn, parsePgn, toPgn, PgnError, ChessClock, timeControl, categorize, parseTimeControl,
  formatTimeControl, parsePgnTimeControl, PremoveController, premoveDests, parseFen, parseSquare, moveToUci, parseUci,
  chess960Position, makeFen, formatClock,
} from '../index.ts'

const sq = (n: string) => parseSquare(n)!

const SAMPLE = `[Event "Casual game"]
[Site "lichess.org"]
[Date "2024.05.01"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Nf3 $1 Nc6 3. Bb5 (3. Bc4 Bc5 { italian }) 3... a6 4. Ba4 Nf6 5. O-O Be7
6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8?! 10. d4 Nbd7 ; конец строки
11. Qe2 Bb7 12. Bc2 Re8 1-0

[Event "Second"]
[Result "*"]

1. d4 d5 *
`

test('PGN: разбор тегов, комментариев, NAG, вариаций, нескольких партий', () => {
  const games = parsePgn(SAMPLE)
  assert.equal(games.length, 2)
  const g = games[0]
  assert.equal(g.headers.White, 'Alice')
  assert.equal(g.result, '1-0')
  assert.equal(g.moves[0].clockMs, 180000)
  assert.deepEqual(g.moves[2].nags, [1])
  const bb5 = g.moves.find((m) => m.san === 'Bb5')!
  assert.equal(bb5.variations.length, 1)
  assert.deepEqual(bb5.variations[0].map((m) => m.san), ['Bc4', 'Bc5'])
  assert.equal(bb5.variations[0][1].comment, 'italian')
  assert.deepEqual(g.moves.find((m) => m.san === 'Nb8')!.nags, [6])
  assert.equal(games[1].moves.length, 2)
  assert.equal(games[1].result, '*')
})

test('PGN: воспроизведение, результат, экспорт и повторный импорт', () => {
  const g = gameFromPgn(SAMPLE)
  assert.equal(g.ply, 24)
  assert.equal(g.result, '1-0')
  assert.equal(g.history[0].clockMs, 180000)
  const text = toPgn(g)
  assert.match(text, /\[White "Alice"\]/)
  assert.match(text, /\[%clk 0:03:00\]/)
  assert.match(text, /1-0\n$/)
  const again = gameFromPgn(text)
  assert.equal(again.fen(), g.fen())
  assert.deepEqual(again.sans, g.sans)
})

test('PGN: нелегальный ход даёт понятную ошибку', () => {
  assert.throws(() => gameFromPgn('1. e4 e5 2. Ke3 *'), (e: Error) => e instanceof PgnError && /Ke3/.test(e.message))
})

test('PGN: старт из FEN и Chess960 сохраняются', () => {
  const g = Game.fromFen('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1')
  g.play('Kd7')
  const text = toPgn(g)
  assert.match(text, /\[FEN "4k3\/8\/8\/8\/8\/8\/4P3\/4K3 b - - 0 1"\]/)
  assert.match(text, /1\.\.\. Kd7/)
  assert.equal(gameFromPgn(text).fen(), g.fen())

  const g960 = new Game(chess960Position(100))
  g960.play(g960.legalMoves()[0])
  const t960 = toPgn(g960)
  assert.match(t960, /\[Variant "Chess960"\]/)
  assert.equal(gameFromPgn(t960).fen(), g960.fen())
})

test('PGN: результат сдачи/мата берётся из тега', () => {
  const g = gameFromPgn('[Result "0-1"]\n\n1. e4 e5 0-1')
  assert.equal(g.result, '0-1')
  assert.equal(g.isOver, true)
})

test('UCI: рокировка в обычных шахматах и Chess960', () => {
  const pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  const m = parseUci(pos, 'e1g1')!
  assert.equal(pos.isCastle(m), true)
  assert.equal(moveToUci(pos, m), 'e1g1')
  assert.equal(parseUci(pos, 'e1h1')!.to, sq('h1'))
  const p960 = parseFen('bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9')
  const castle = p960.legalMoves().find((x) => p960.isCastle(x))
  assert.equal(castle, undefined, 'в этой позиции ладьи закрыты — рокировки нет')
  // 960: король f1, ладья h1 — рокировка g1/f1 различима от шага королём
  const p = parseFen('4k3/8/8/8/8/8/8/5K1R w H - 0 1', { variant: 'chess960' })
  const rook = parseUci(p, 'f1h1')!
  assert.equal(p.isCastle(rook), true)
  const step = parseUci(p, 'f1g1')!
  assert.equal(p.isCastle(step), false)
  const after = p.play(rook)
  assert.equal(makeFen(after), '4k3/8/8/8/8/8/8/5RK1 b - - 1 1')
})

// ───────────── Часы ─────────────

function fakeClock(tc = timeControl(3, 2), startAfterPly?: number) {
  let t = 0
  const clock = new ChessClock(tc, { now: () => t, startAfterPly })
  return { clock, advance: (ms: number) => (t += ms) }
}

test('категории по расчётной длительности (Lichess)', () => {
  assert.equal(categorize(timeControl(0.25, 0)), 'ultrabullet')
  assert.equal(categorize(timeControl(1, 0)), 'bullet')
  assert.equal(categorize(timeControl(2, 1)), 'bullet') // 120+40 = 160 < 180
  assert.equal(categorize(timeControl(3, 0)), 'blitz')
  assert.equal(categorize(timeControl(5, 3)), 'blitz') // 300+120 = 420
  assert.equal(categorize(timeControl(10, 0)), 'rapid')
  assert.equal(categorize(timeControl(15, 10)), 'rapid') // 900+400 = 1300
  assert.equal(categorize(timeControl(30, 0)), 'classical')
  assert.equal(formatTimeControl(timeControl(0.5, 0)), '½+0')
  assert.equal(formatTimeControl(timeControl(3, 2)), '3+2')
  assert.deepEqual(parseTimeControl('5+3'), timeControl(5, 3))
  assert.equal(parseTimeControl('abc'), null)
  assert.deepEqual(parsePgnTimeControl('180+2'), timeControl(3, 2))
  assert.equal(formatClock(3_725_000), '1:02:05')
})

test('часы: до двух ходов время не идёт и прибавка не начисляется', () => {
  const { clock, advance } = fakeClock()
  advance(5000)
  clock.press('w')
  advance(5000)
  clock.press('b')
  assert.equal(clock.time('w'), 180000)
  assert.equal(clock.time('b'), 180000)
  assert.equal(clock.running, true)
})

test('часы: Фишер — списание и прибавка', () => {
  const { clock, advance } = fakeClock()
  clock.press('w')
  clock.press('b')
  advance(10_000)
  assert.equal(clock.time('w'), 170_000)
  const left = clock.press('w')
  assert.equal(left, 172_000) // 180 − 10 + 2
  advance(4_000)
  assert.equal(clock.time('b'), 176_000)
  assert.equal(clock.time('w'), 172_000)
})

test('часы: флажок, пауза/возобновление', () => {
  const { clock, advance } = fakeClock(timeControl(1, 0))
  clock.press('w')
  clock.press('b')
  advance(30_000)
  clock.pause()
  advance(100_000)
  assert.equal(clock.time('w'), 30_000)
  clock.resume()
  advance(29_999)
  assert.equal(clock.check(), null)
  advance(1)
  assert.equal(clock.check(), 'w')
  assert.equal(clock.time('w'), 0)
  assert.equal(clock.running, false)
})

test('часы: ход после истечения времени — флажок, а не прибавка', () => {
  const { clock, advance } = fakeClock(timeControl(1, 5), 0)
  advance(61_000)
  const left = clock.press('w')
  assert.equal(left, 0)
  assert.equal(clock.flagged, 'w')
})

test('часы: delay и Bronstein', () => {
  const d = fakeClock({ initialMs: 60_000, incrementMs: 5_000, mode: 'delay' }, 0)
  d.advance(3_000)
  assert.equal(d.clock.time('w'), 60_000)
  d.advance(4_000) // 7с с начала хода, из них 2с «в счёт»
  assert.equal(d.clock.time('w'), 58_000)
  assert.equal(d.clock.press('w'), 58_000) // прибавки нет
  const b = fakeClock({ initialMs: 60_000, incrementMs: 5_000, mode: 'bronstein' }, 0)
  b.advance(3_000)
  assert.equal(b.clock.press('w'), 60_000) // вернули 3с
  b.advance(8_000)
  assert.equal(b.clock.press('b'), 57_000) // 60 − 8 + min(8, 5)
})

test('часы: снимок и синхронизация с сервером', () => {
  const a = fakeClock()
  a.clock.press('w')
  a.clock.press('b')
  a.advance(1_000)
  const snap = a.clock.snapshot()
  const b = fakeClock()
  b.clock.sync(snap)
  assert.equal(b.clock.time('w'), 179_000)
  b.advance(2_000)
  assert.equal(b.clock.time('w'), 177_000)
})

test('часы: без ограничения времени', () => {
  const { clock } = fakeClock(timeControl(0, 0))
  assert.equal(clock.enabled, false)
  assert.equal(clock.time('w'), Infinity)
  clock.press('w')
  assert.equal(clock.check(), null)
})

// ───────────── Пре-мувы ─────────────

test('пре-мув: геометрия без учёта блокировок', () => {
  const pos = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')
  const rook = premoveDests(pos, sq('a8')) // чёрная ладья: свои пешки не мешают геометрии
  assert.ok(rook.includes(sq('a1')) && !rook.includes(sq('a7')))
  const bishop = premoveDests(pos, sq('c8'))
  assert.ok(bishop.includes(sq('h3')), 'слон видит сквозь блокировки (кроме своих фигур на клетке назначения)')
  assert.ok(!bishop.includes(sq('b7')), 'на своей фигуре нельзя')
  const pawn = premoveDests(pos, sq('e7'))
  assert.deepEqual([...pawn].sort(), [sq('d6'), sq('e5'), sq('e6'), sq('f6')].sort())
  const king = premoveDests(parseFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'), sq('e1'))
  for (const s of ['g1', 'c1', 'h1', 'a1']) assert.ok(king.includes(sq(s)), s)
})

test('пре-мув: исполняется, когда легален, иначе отменяется', () => {
  const g = new Game()
  g.play('e4')
  const pm = new PremoveController()
  assert.equal(pm.set(g.position, { from: sq('e7'), to: sq('e5') }), true)
  assert.equal(pm.set(g.position, { from: sq('e7'), to: sq('e3') }), false)
  const m = pm.resolve(g.position)
  assert.ok(m)
  assert.ok(g.play(m!))
  assert.equal(pm.premove, null)
  // ход d4 соперника мешает: пре-мув Qd8-d2? ферзь чёрных не может — проверим нелегальный
  const h = Game.fromFen('4k3/8/8/8/8/8/4q3/R3K3 w - - 0 1')
  h.play('Rb1')
  const pm2 = new PremoveController()
  pm2.set(h.position, { from: sq('e2'), to: sq('e1') })
  assert.equal(pm2.resolve(h.position), null)
  // превращение в пре-муве по умолчанию в ферзя
  const p = parseFen('7k/4P3/8/8/8/8/8/K7 b - - 0 1')
  const pm3 = new PremoveController()
  assert.equal(pm3.set(p, { from: sq('e7'), to: sq('e8') }), true)
  const after = p.play(p.legalMoves()[0])
  assert.equal(pm3.resolve(after)?.promotion, 'q')
})
