import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairRound, standings, suggestedRounds } from '../src/lib/swiss.ts';

function mk(n) {
  return Array.from({ length: n }, (_, i) => ({ uid: 'u' + i, name: 'P' + i, rating: 2000 - i * 37 }));
}
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

function simulate(n, rounds, seed) {
  const players = mk(n);
  const r = rng(seed);
  const all = [];
  for (let round = 1; round <= rounds; round++) {
    const pairs = pairRound(players, all);
    const seen = new Set();
    for (const p of pairs) {
      for (const u of [p.white, p.black]) if (u) { assert.ok(!seen.has(u), `дубль ${u} в туре ${round}`); seen.add(u); }
    }
    assert.equal(seen.size, n, `в туре ${round} играют не все (n=${n})`);
    for (const p of pairs) {
      const result = !p.black ? 'bye' : ['1-0', '0-1', '1/2-1/2'][Math.floor(r() * 3)];
      all.push({ round, white: p.white, black: p.black, result });
    }
  }
  return { players, all };
}

test('в рекомендуемом числе туров пары и bye не повторяются, все играют по разу за тур (n=2..40)', () => {
  for (let n = 2; n <= 40; n++) {
    const rounds = suggestedRounds(n);
    for (let seed = 1; seed <= 30; seed++) {
      const { all } = simulate(n, rounds, seed);
      const pairs = new Set();
      const byes = new Map();
      for (const p of all) {
        if (!p.black) { byes.set(p.white, (byes.get(p.white) ?? 0) + 1); continue; }
        const k = [p.white, p.black].sort().join('|');
        assert.ok(!pairs.has(k), `повтор пары ${k} (n=${n}, seed=${seed})`);
        pairs.add(k);
      }
      for (const [u, c] of byes) assert.ok(c <= 1, `${u} получил bye ${c} раз (n=${n})`);
    }
  }
});

test('очки: победа 1, ничья 0.5, bye 1; сортировка и бухгольц', () => {
  const players = mk(4);
  const pairings = [
    { round: 1, white: 'u0', black: 'u1', result: '1-0' },
    { round: 1, white: 'u2', black: 'u3', result: '1/2-1/2' },
    { round: 2, white: 'u0', black: 'u2', result: '1/2-1/2' },
    { round: 2, white: 'u3', black: 'u1', result: '0-1' },
  ];
  const t = standings(players, pairings);
  const by = Object.fromEntries(t.map((r) => [r.uid, r]));
  assert.equal(by.u0.score, 1.5);
  assert.equal(by.u1.score, 1);
  assert.equal(by.u2.score, 1);
  assert.equal(by.u3.score, 0.5);
  assert.equal(t[0].uid, 'u0');
  assert.deepEqual(t.map((r) => r.rank), [1, 2, 3, 4]);
  const withBye = standings(mk(3), [{ round: 1, white: 'u2', black: null, result: 'bye' }]);
  assert.equal(withBye.find((r) => r.uid === 'u2').score, 1);
  assert.equal(withBye.find((r) => r.uid === 'u2').played, 0);
});

test('сильные играют между собой: после 1 тура победители пара', () => {
  const players = mk(8);
  const r1 = pairRound(players, []);
  assert.equal(r1.length, 4);
  const results = r1.map((p) => ({ round: 1, white: p.white, black: p.black, result: '1-0' }));
  const r2 = pairRound(players, results);
  const winners = new Set(results.map((p) => p.white));
  for (const p of r2) assert.equal(winners.has(p.white), winners.has(p.black), 'победитель играет с победителем');
});

test('цвета: у кого было меньше белых, тот получает белые', () => {
  const players = mk(2);
  const r1 = [{ round: 1, white: 'u1', black: 'u0', result: '1-0' }];
  const r2 = pairRound(players, r1);
  assert.equal(r2[0].white, 'u0');
});

test('граничные случаи', () => {
  assert.deepEqual(pairRound(mk(1), []), []);
  assert.deepEqual(pairRound([], []), []);
  const three = pairRound(mk(3), []);
  assert.equal(three.filter((p) => !p.black).length, 1);
  assert.equal(three.find((p) => !p.black).white, 'u2');
  assert.equal(suggestedRounds(1), 1);
  assert.equal(suggestedRounds(8), 3);
  assert.equal(suggestedRounds(1000), 9);
});

test('сверх рекомендуемого числа туров жеребьёвка не падает и все играют по разу за тур', () => {
  for (let n = 2; n <= 12; n++) {
    for (let seed = 1; seed <= 10; seed++) simulate(n, n + 2, seed); // simulate сам проверяет инвариант тура
  }
});
