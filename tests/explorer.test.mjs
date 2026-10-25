import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ROWS, aggregateOwn, parseLichess, shares } from '../src/lib/explorerLogic.ts';

test('shares: сумма всегда 100, пустая позиция даёт нули', () => {
  assert.deepEqual(shares(0, 0, 0), { whitePct: 0, drawPct: 0, blackPct: 0 });
  assert.deepEqual(shares(50, 0, 50), { whitePct: 50, drawPct: 0, blackPct: 50 });
  assert.deepEqual(shares(1, 1, 1), { whitePct: 34, drawPct: 33, blackPct: 33 });
  assert.deepEqual(shares(2, 1, 0), { whitePct: 67, drawPct: 33, blackPct: 0 });
  for (const [w, d, b] of [[7, 3, 11], [1, 0, 2], [999, 1, 1], [13, 13, 13]]) {
    const s = shares(w, d, b);
    assert.equal(s.whitePct + s.drawPct + s.blackPct, 100);
  }
});

const sample = {
  white: 600,
  draws: 100,
  black: 300,
  opening: { eco: 'B20', name: 'Sicilian Defense' },
  moves: [
    { uci: 'g1f3', san: 'Nf3', white: 100, draws: 50, black: 50, averageRating: 1800 },
    { uci: 'e2e4', san: 'e4', white: 400, draws: 40, black: 160, averageOpponentRating: 1700 },
    { uci: 'd2d4', san: 'd4', white: 100, draws: 10, black: 90 },
  ],
};

test('parseLichess: итоги, сортировка по числу партий, рейтинг и название', () => {
  const t = parseLichess(sample);
  assert.equal(t.total, 1000);
  assert.equal(t.whitePct, 60);
  assert.equal(t.drawPct, 10);
  assert.equal(t.blackPct, 30);
  assert.equal(t.opening, 'Sicilian Defense');
  assert.deepEqual(t.rows.map((r) => r.san), ['e4', 'Nf3', 'd4']);
  assert.equal(t.rows[0].total, 600);
  assert.equal(t.rows[0].uci, 'e2e4');
  assert.equal(t.rows[0].rating, 1700);
  assert.equal(t.rows[1].rating, 1800);
  assert.equal(t.rows[2].rating, undefined);
});

test('parseLichess: мусор и неполные данные отклоняются, плохие ходы пропускаются', () => {
  assert.equal(parseLichess(null), null);
  assert.equal(parseLichess('x'), null);
  assert.equal(parseLichess({ white: 1, draws: 1, black: 1 }), null);
  assert.equal(parseLichess({ white: -1, draws: 0, black: 0, moves: [] }), null);
  assert.equal(parseLichess({ white: 'a', draws: 0, black: 0, moves: [] }), null);
  const t = parseLichess({
    white: 2,
    draws: 0,
    black: 0,
    moves: [{ san: 'e4' }, null, { uci: 'e2e4', san: 'e4', white: 2, draws: 0, black: 0 }],
  });
  assert.equal(t.rows.length, 1);
  assert.equal(t.opening, null);
});

test('parseLichess: в таблице не больше MAX_ROWS ходов', () => {
  const moves = Array.from({ length: 30 }, (_, i) => ({ uci: `a${i}`, san: `m${i}`, white: i, draws: 0, black: 0 }));
  const t = parseLichess({ white: 100, draws: 0, black: 0, moves });
  assert.equal(t.rows.length, MAX_ROWS);
  assert.equal(t.rows[0].san, 'm29');
});

const games = [
  { moves: ['e4', 'e5', 'Nf3'], result: '1-0' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], result: '0-1' },
  { moves: ['e4', 'c5'], result: '1/2-1/2' },
  { moves: ['d4', 'd5'], result: '1-0' },
  { moves: ['e4', 'e5'], result: null },
  { moves: ['e4', 'e5', 'Bc4'], result: '1-0', reason: 'aborted' },
  { moves: ['e4'], result: '0-1' },
];

test('aggregateOwn: начальная позиция считает все завершённые партии без прерванных', () => {
  const t = aggregateOwn(games, []);
  assert.equal(t.total, 5);
  assert.equal(t.white, 2);
  assert.equal(t.draws, 1);
  assert.equal(t.black, 2);
  assert.deepEqual(t.rows.map((r) => r.san), ['e4', 'd4']);
  assert.equal(t.rows[0].total, 4);
  assert.equal(t.rows[0].black, 2);
});

test('aggregateOwn: позиция после 1.e4 e5, партия, закончившаяся тут, входит в итог без хода', () => {
  const t = aggregateOwn(games, ['e4', 'e5']);
  assert.equal(t.total, 2);
  assert.equal(t.white, 1);
  assert.equal(t.black, 1);
  assert.deepEqual(t.rows.map((r) => r.san), ['Nf3']);
  assert.equal(t.rows[0].total, 2);
});

test('aggregateOwn: неизвестная позиция даёт пустую таблицу', () => {
  const t = aggregateOwn(games, ['c4']);
  assert.equal(t.total, 0);
  assert.deepEqual(t.rows, []);
  assert.equal(t.whitePct + t.drawPct + t.blackPct, 0);
});

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

test('explorerUrl: корректные запросы к lichess и masters', async () => {
  const { explorerUrl } = await import('../src/lib/explorerLogic.ts');
  const u = new URL(explorerUrl({ db: 'lichess', fen: AFTER_E4 }));
  assert.equal(u.origin, 'https://explorer.lichess.ovh');
  assert.equal(u.pathname, '/lichess');
  assert.equal(u.searchParams.get('fen'), AFTER_E4);
  assert.equal(u.searchParams.get('speeds'), 'blitz,rapid,classical');
  assert.equal(u.searchParams.get('ratings'), '1600,1800,2000');
  assert.equal(u.searchParams.get('variant'), 'standard');
  const m = new URL(explorerUrl({ db: 'masters', fen: START, speeds: 'bullet', ratings: '1' }));
  assert.equal(m.pathname, '/masters');
  assert.equal(m.searchParams.get('speeds'), null);
  assert.equal(m.searchParams.get('ratings'), null);
  const c = new URL(explorerUrl({ db: 'lichess', fen: START, speeds: 'bullet,blitz', ratings: '0,2500' }));
  assert.equal(c.searchParams.get('speeds'), 'bullet,blitz');
  assert.equal(c.searchParams.get('ratings'), '0,2500');
});

test('explorerUrl: чужие базы, плохой FEN, скорости и рейтинги отклоняются', async () => {
  const { explorerUrl } = await import('../src/lib/explorerLogic.ts');
  assert.equal(explorerUrl({ db: 'player', fen: START }), null);
  assert.equal(explorerUrl({ db: '../x', fen: START }), null);
  assert.equal(explorerUrl({ db: 'lichess' }), null);
  assert.equal(explorerUrl({ db: 'lichess', fen: 'x' }), null);
  assert.equal(explorerUrl({ db: 'lichess', fen: START + '&token=1' }), null);
  assert.equal(explorerUrl({ db: 'lichess', fen: START, speeds: 'blitz,evil' }), null);
  assert.equal(explorerUrl({ db: 'lichess', fen: START, ratings: '1500' }), null);
  assert.equal(explorerUrl({ db: 'lichess', fen: START, ratings: '1600,abc' }), null);
  assert.equal(explorerUrl({ db: 'lichess', fen: START, speeds: ',' }), null);
});

test('копия проверки в api/explorer.ts ведёт себя так же, как src/lib/explorerLogic.ts', async () => {
  const lib = await import('../src/lib/explorerLogic.ts');
  const api = await import('../api/explorer.ts');
  const cases = [
    { db: 'lichess', fen: AFTER_E4 },
    { db: 'lichess', fen: START, speeds: 'bullet,blitz', ratings: '0,2500' },
    { db: 'masters', fen: START, speeds: 'bullet' },
    { db: 'player', fen: START },
    { db: 'lichess' },
    { db: 'lichess', fen: 'x' },
    { db: 'lichess', fen: START + '&token=1' },
    { db: 'lichess', fen: START, speeds: 'blitz,evil' },
    { db: 'lichess', fen: START, ratings: '1500' },
    { db: 'lichess', fen: START, ratings: '1600,abc' },
    { db: 'lichess', fen: START, speeds: ',' },
    { db: null, fen: null },
  ];
  for (const c of cases) assert.equal(api.explorerUrl(c), lib.explorerUrl(c), JSON.stringify(c));
});
