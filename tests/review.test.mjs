import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accuracyOf,
  bookDepth,
  classify,
  keyMoments,
  moveQualities,
  neighborMoment,
  sideSummary,
  winProb,
} from '../src/lib/review.ts';

test('winProb: симметрична и монотонна', () => {
  assert.ok(Math.abs(winProb(0) - 50) < 1e-9);
  assert.ok(Math.abs(winProb(300) + winProb(-300) - 100) < 1e-9);
  assert.ok(winProb(500) > winProb(100));
  assert.ok(winProb(10000) > 99);
});

test('classify: границы классов', () => {
  assert.equal(classify(0, false), 'best');
  assert.equal(classify(30, true), 'best'); // лучший ход движка всегда «лучший»
  assert.equal(classify(1, false), 'excellent');
  assert.equal(classify(5, false), 'good');
  assert.equal(classify(8, false), 'inaccuracy');
  assert.equal(classify(15, false), 'mistake');
  assert.equal(classify(40, false), 'blunder');
});

test('accuracyOf: 100 при нулевой потере и убывает', () => {
  assert.ok(accuracyOf(0) > 99.9 && accuracyOf(0) <= 100);
  assert.ok(accuracyOf(10) < accuracyOf(5));
  assert.ok(accuracyOf(100) >= 0);
});

test('bookDepth: длина самого длинного совпадения с линиями справочника', () => {
  const lines = [{ moves: 'e2e4 e7e5 g1f3 b8c6 f1c4' }, { moves: 'e2e4 e7e5 g1f3 b8c6 f1b5' }, { moves: 'd2d4 d7d5' }];
  assert.equal(bookDepth('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'.split(' '), lines), 5);
  assert.equal(bookDepth('e2e4 c7c5'.split(' '), lines), 1);
  assert.equal(bookDepth(['h2h4'], lines), 0);
  assert.equal(bookDepth([], lines), 0);
});

// Партия из 4 ходов: белые, чёрные, белые, чёрные. evals — 5 позиций.
function sample() {
  return {
    colors: ['w', 'b', 'w', 'b'],
    ucis: ['e2e4', 'e7e5', 'g1f3', 'd8h4'],
    evals: [
      { cp: 20, best: 'e2e4' },
      { cp: 20, best: 'e7e5' },
      { cp: 20, best: 'g1f3' },
      { cp: 20, best: 'b8c6' },
      { cp: 700, best: 'f3e5' }, // после d8h4 чёрные сильно ошиблись
    ],
  };
}

test('moveQualities: лучшие ходы и грубая ошибка', () => {
  const q = moveQualities(sample());
  assert.equal(q.length, 4);
  assert.deepEqual(q.slice(0, 3).map((m) => m.q), ['best', 'best', 'best']);
  assert.equal(q[3].q, 'blunder');
  assert.ok(q[3].loss > 24);
});

test('moveQualities: книжные ходы не штрафуются, но реальная ошибка в «книге» не скрывается', () => {
  const q = moveQualities({ ...sample(), bookPlies: 2 });
  assert.deepEqual(q.slice(0, 2).map((m) => m.q), ['book', 'book']);
  assert.equal(q[2].q, 'best');
  const bad = moveQualities({ ...sample(), bookPlies: 4 });
  assert.equal(bad[3].q, 'blunder'); // потеря ≥ 12 пунктов — это не книга
});

test('moveQualities: останавливается, когда оценок ещё не хватает', () => {
  const s = sample();
  const q = moveQualities({ ...s, evals: s.evals.slice(0, 3) });
  assert.equal(q.length, 2);
});

test('sideSummary: точность и счётчики по каждой стороне', () => {
  const s = sample();
  const q = moveQualities({ ...s, bookPlies: 2 });
  const w = sideSummary(q, s.colors, 'w');
  const b = sideSummary(q, s.colors, 'b');
  assert.equal(w.counts.book, 1);
  assert.equal(w.counts.best, 1);
  assert.equal(b.counts.book, 1);
  assert.equal(b.counts.blunder, 1);
  assert.ok(w.accuracy > b.accuracy);
  assert.equal(sideSummary([], [], 'w').accuracy, null);
});

test('keyMoments и neighborMoment: ошибки по порядку и переходы вперёд/назад', () => {
  const q = [
    { q: 'best', loss: 0, acc: 100 },
    { q: 'mistake', loss: 15, acc: 60 },
    { q: 'good', loss: 3, acc: 90 },
    { q: 'blunder', loss: 40, acc: 10 },
    { q: 'inaccuracy', loss: 8, acc: 70 },
    { q: 'mistake', loss: 20, acc: 50 },
  ];
  const km = keyMoments(q);
  assert.deepEqual(km.map((m) => m.move), [1, 3, 5]);
  assert.equal(neighborMoment(km, -1, 1)?.move, 1);
  assert.equal(neighborMoment(km, 1, 1)?.move, 3);
  assert.equal(neighborMoment(km, 5, 1), null);
  assert.equal(neighborMoment(km, 5, -1)?.move, 3);
  assert.equal(neighborMoment(km, 1, -1), null);
  assert.deepEqual(keyMoments(q, ['inaccuracy']).map((m) => m.move), [4]);
});
