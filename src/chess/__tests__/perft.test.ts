import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFen, perft, chess960Position, makeFen, INITIAL_FEN } from '../index.ts'

const cases: { name: string; fen: string; counts: number[] }[] = [
  { name: 'startpos', fen: INITIAL_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: 'kiwipete (рокировки, пины, взятия)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  { name: 'pos3 (взятие на проходе, шахи)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238] },
  {
    name: 'pos4 (превращения, рокировки под шахом)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467, 422333],
  },
  { name: 'pos5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379] },
  {
    name: 'pos6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890],
  },
]

for (const c of cases) {
  test(`perft: ${c.name}`, () => {
    const pos = parseFen(c.fen)
    c.counts.forEach((expected, i) => assert.equal(perft(pos, i + 1), expected, `depth ${i + 1}`))
  })
}

test('perft: Chess960 (позиция из набора Chess960 perft)', () => {
  const pos = parseFen('bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9')
  assert.equal(pos.chess960, true)
  const expected = [21, 528, 12189, 326672]
  expected.forEach((e, i) => assert.equal(perft(pos, i + 1), e, `depth ${i + 1}`))
})

test('Chess960: позиция №518 — обычная начальная', () => {
  assert.equal(makeFen(chess960Position(518)), INITIAL_FEN)
})
