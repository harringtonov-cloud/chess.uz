import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Game, parseFen, makeFen, parseSquare, squareName, parseSan, moveToSan, FenError, Position } from '../index.ts'

const sq = (n: string) => parseSquare(n)!

test('взятие на проходе: легально только сразу и убирает пешку', () => {
  const g = Game.fromFen('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3')
  const rec = g.play('dxe3')
  assert.ok(rec)
  assert.equal(rec.enPassant, true)
  assert.equal(rec.captured?.role, 'p')
  assert.equal(g.position.pieceAt(sq('e4')), null)
  assert.equal(squareName(rec.move.to), 'e3')
})

test('взятие на проходе: двойной ход выставляет клетку, через ход — пропадает', () => {
  const g = new Game()
  for (const m of ['e4', 'a6', 'e5', 'd5']) g.play(m)
  assert.equal(g.fen().split(' ')[3], 'd6')
  assert.ok(g.play('exd6'))
  const g2 = new Game()
  for (const m of ['e4', 'a6', 'e5', 'd5', 'a3', 'a5']) g2.play(m)
  assert.equal(g2.play('exd6'), null)
})

test('взятие на проходе: нельзя, если открывается шах по горизонтали', () => {
  // белый король a5, чёрная ладья h5: после exf6 обе пешки уходят с 5-й горизонтали → шах
  const pos = parseFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1')
  assert.equal(parseSan(pos, 'exd6'), null)
})

test('рокировка: короткая и длинная, права теряются', () => {
  const g = Game.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  const rec = g.play('O-O')!
  assert.equal(rec.castle, 'k')
  assert.equal(g.fen(), 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1')
  const rec2 = g.play('O-O-O')!
  assert.equal(rec2.castle, 'q')
  assert.equal(g.fen(), '2kr3r/8/8/8/8/8/8/R4RK1 w - - 2 2')
})

test('рокировка запрещена: под шахом, через битое поле, на битое поле, при потере прав', () => {
  assert.equal(parseSan(parseFen('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O'), null, 'под шахом')
  assert.equal(parseSan(parseFen('3k1r2/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O'), null, 'через битое поле f1')
  assert.equal(parseSan(parseFen('3k2r1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O'), null, 'на битое поле g1')
  assert.ok(parseSan(parseFen('1r1k4/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O-O'), 'ладья b1 может быть под боем')
  const g = Game.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  for (const m of ['Rb1', 'Rb8', 'Ra1', 'Ra8']) g.play(m)
  assert.equal(g.fen().split(' ')[2], 'Kk')
})

test('рокировка: захват ладьи убирает право соперника', () => {
  const g = Game.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  g.play('Rxa8+')
  assert.equal(g.fen().split(' ')[2], 'Kk')
})

test('превращение пешки: 4 варианта, SAN, взятием, шах/мат', () => {
  const g = Game.fromFen('1n5k/P7/8/8/8/8/8/K7 w - - 0 1')
  const moves = g.legalMoves().filter((m) => m.from === sq('a7'))
  assert.equal(moves.length, 8) // a8 ×4 и bxa8... (взятие коня на b8) ×4
  assert.equal(g.position.needsPromotion(sq('a7'), sq('a8')), true)
  const rec = g.playFromTo(sq('a7'), sq('b8'), 'n')!
  assert.equal(rec.san, 'axb8=N')
  assert.equal(rec.promotion, 'n')
  const g2 = Game.fromFen('7k/5P2/6K1/8/8/8/8/8 w - - 0 1')
  assert.equal(g2.play('f8=Q#')!.mate, true)
  assert.equal(g2.outcome?.reason, 'checkmate')
})

test('findMove без указания фигуры превращает в ферзя', () => {
  const pos = parseFen('7k/P7/8/8/8/8/8/K7 w - - 0 1')
  assert.equal(pos.findMove(sq('a7'), sq('a8'))?.promotion, 'q')
})

test('мат: детский мат и результат', () => {
  const g = new Game()
  for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) g.play(m)
  assert.equal(g.outcome?.reason, 'checkmate')
  assert.equal(g.result, '1-0')
  assert.equal(g.play('Ke7'), null, 'после конца партии ходы запрещены')
})

test('мат: мат дурака', () => {
  const g = new Game()
  for (const m of ['f3', 'e5', 'g4', 'Qh4#']) g.play(m)
  assert.equal(g.result, '0-1')
})

test('пат', () => {
  const g = Game.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
  assert.equal(g.outcome?.reason, 'stalemate')
  assert.equal(g.result, '1/2-1/2')
})

test('недостаток материала', () => {
  const dead = ['8/8/8/4k3/8/8/8/K7 w - - 0 1', '8/8/8/4k3/8/8/8/KN6 w - - 0 1', '8/8/8/4k3/8/8/8/KB6 w - - 0 1', '8/8/8/2b1k3/8/8/8/K1B5 w - - 0 1']
  // K+B vs K+B: слоны c1 и c5 — оба на тёмных клетках → мёртвая позиция
  for (const f of dead) assert.equal(parseFen(f).isInsufficientMaterial(), true, f)
  const alive = [
    '8/8/8/4k3/8/8/8/KNN5 w - - 0 1', // два коня — мат возможен при помощи
    '8/8/8/4k3/8/8/8/KR6 w - - 0 1',
    '8/8/8/4k3/8/8/4P3/K7 w - - 0 1',
    '8/8/8/3bk3/8/8/8/K1B5 w - - 0 1', // слоны разного цвета (c1 тёмное, d5 светлое)
    '8/8/8/3nk3/8/8/8/KB6 w - - 0 1', // слон против коня
  ]
  for (const f of alive) assert.equal(parseFen(f).isInsufficientMaterial(), false, f)
  assert.equal(Game.fromFen('8/8/8/4k3/8/8/8/K7 w - - 0 1').outcome?.reason, 'insufficient-material')
})

test('флажок: при недостатке материала у соперника — ничья', () => {
  const g1 = Game.fromFen('8/8/8/4k3/8/8/8/KR6 w - - 0 1')
  g1.flag('b') // у белых ладья → побеждают
  assert.equal(g1.result, '1-0')
  const g2 = Game.fromFen('8/8/8/4k3/8/8/4p3/KN6 w - - 0 1')
  g2.flag('w') // у чёрных король и пешка → матовать могут
  assert.equal(g2.result, '0-1')
  const g3 = Game.fromFen('4k3/8/8/8/8/8/8/K5q1 w - - 0 1')
  g3.flag('b') // у белых только король: мата поставить нельзя — ничья
  assert.equal(g3.outcome?.reason, 'timeout')
  assert.equal(g3.result, '1/2-1/2')
  const g4 = Game.fromFen('4k3/8/8/8/8/8/8/K5q1 w - - 0 1')
  g4.flag('w') // у чёрных ферзь → чёрные побеждают
  assert.equal(g4.result, '0-1')
})

test('троекратное повторение: можно потребовать, автоматически — пятикратное', () => {
  const g = new Game()
  const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8']
  for (let i = 0; i < 2; i++) for (const m of shuffle) g.play(m)
  assert.equal(g.repetitionCount(), 3)
  assert.equal(g.claimableDraw(), 'threefold-repetition')
  assert.equal(g.isOver, false)
  for (let i = 0; i < 2; i++) for (const m of shuffle) g.play(m)
  assert.equal(g.outcome?.reason, 'fivefold-repetition')
})

test('троекратное повторение: автозавершение по опции и claimDraw', () => {
  const g = new Game(Position.initial(), { autoThreefold: true })
  for (let i = 0; i < 2; i++) for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) g.play(m)
  assert.equal(g.outcome?.reason, 'threefold-repetition')
  const h = new Game()
  for (let i = 0; i < 2; i++) for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) h.play(m)
  assert.equal(h.claimDraw(), true)
  assert.equal(h.outcome?.reason, 'threefold-repetition')
})

test('повторение учитывает права рокировки и откат хода', () => {
  const g = Game.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  for (const m of ['Rb1', 'Rb8', 'Ra1', 'Ra8']) g.play(m)
  assert.equal(g.repetitionCount(), 1, 'после потери прав позиция другая')
  g.undo()
  g.undo()
  assert.equal(g.fen().split(' ')[2], 'Kk', 'после отката права остаются потерянными')
})

test('правило 50 ходов и 75 ходов', () => {
  const g = Game.fromFen('8/8/8/4k3/8/8/8/KR6 w - - 99 80')
  assert.equal(g.claimableDraw(), null)
  g.play('Rb2')
  assert.equal(g.position.halfmoves, 100)
  assert.equal(g.claimableDraw(), 'fifty-moves')
  assert.equal(g.claimDraw(), true)
  const auto = Game.fromFen('8/8/8/4k3/8/8/8/KR6 w - - 149 90')
  assert.equal(auto.isOver, false)
  auto.play('Rb2')
  assert.equal(auto.outcome?.reason, 'seventyfive-moves')
  const reset = Game.fromFen('8/8/4p3/4k3/8/8/4P3/KR6 w - - 99 80')
  reset.play('e3')
  assert.equal(reset.position.halfmoves, 0, 'ход пешки сбрасывает счётчик')
  // мат на 75-м ходу важнее ничьей
  const mate = Game.fromFen('7k/5Q2/6K1/8/8/8/8/8 w - - 149 90')
  mate.play('Qg7#')
  assert.equal(mate.outcome?.reason, 'checkmate')
})

test('сдача, ничья по соглашению, откат результата', () => {
  const g = new Game()
  g.play('e4')
  g.resign('b')
  assert.equal(g.result, '1-0')
  const h = new Game()
  h.agreeDraw()
  assert.equal(h.outcome?.reason, 'agreement')
})

test('SAN: уточнения, взятия, шах', () => {
  const pos = parseFen('3k4/8/8/8/8/8/K7/R6R w - - 0 1')
  assert.equal(moveToSan(pos, parseSan(pos, 'Rad1')!), 'Rad1+')
  assert.equal(moveToSan(pos, parseSan(pos, 'Rhd1+')!), 'Rhd1+')
  assert.equal(parseSan(pos, 'Rd1'), null, 'неоднозначный ход')
  const p2 = parseFen('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1')
  assert.equal(moveToSan(p2, parseSan(p2, 'R1a3')!), 'R1a3')
  assert.equal(moveToSan(p2, parseSan(p2, 'R4a3')!), 'R4a3')
})

test('FEN: round-trip и валидация', () => {
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 1 1',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2'.replace('c6', '-'),
    '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
  ]
  for (const f of fens) assert.equal(makeFen(parseFen(f)), f)
  // э.п. без возможности взятия не пишется
  assert.equal(makeFen(parseFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
  for (const bad of ['', 'x', '8/8/8/8/8/8/8/8 w - - 0 1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1', '4k3/8/8/8/8/8/8/4K2P w - - 0 1', '4k3/8/8/8/8/8/8/r3K3 w - - 0 1'.replace('w', 'b')]) {
    assert.throws(() => parseFen(bad), FenError, bad)
  }
})
