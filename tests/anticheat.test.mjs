import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_CONSIDERED,
  expectedAcpl,
  expectedTop1,
  levelOf,
  moverCp,
  parseGameId,
  shouldCountBlur,
  sideStats,
  spentMs,
  suspicion,
} from '../src/lib/anticheat.ts';

/** Партия на n полуходов: чётные — белые, нечётные — чёрные. */
function game(n, make) {
  return Array.from({ length: n }, (_, i) => {
    const color = i % 2 === 0 ? 'w' : 'b';
    return { color, uci: `m${i}`, before: { cp: 0, best: `m${i}` }, after: { cp: 0, best: null }, legalMoves: 30, timeMs: 5000, ...make?.(i, color) };
  });
}

test('moverCp: оценка с точки зрения ходящего', () => {
  assert.equal(moverCp(120, 'w'), 120);
  assert.equal(moverCp(120, 'b'), -120);
});

test('sideStats: считает только значимые ходы (не дебют, не вынужденные, не решённые позиции)', () => {
  const plies = game(40, (i) => {
    if (i === 10) return { legalMoves: 1 }; // вынужденный
    if (i === 12) return { before: { cp: 900, best: 'm12' } }; // позиция уже решена
    return {};
  });
  const w = sideStats(plies, 'w', 6);
  assert.equal(w.moves, 20);
  // белые: полуходы 0..38 чётные; исключены дебют 0,2,4, вынужденный 10 и решённый 12
  assert.equal(w.considered, 20 - 3 - 2);
  assert.equal(w.top1, 1);
  assert.equal(w.acpl, 0);
});

test('sideStats: совпадение с движком и потеря за ход', () => {
  const plies = game(40, (i, color) => {
    if (color !== 'w') return {};
    const k = i / 2;
    // у каждого четвёртого хода белых играется не лучший ход и теряется 50 сотых пешки
    return k % 4 === 0 ? { uci: 'other', after: { cp: -50, best: null } } : {};
  });
  const w = sideStats(plies, 'w', 0);
  assert.equal(w.considered, 20);
  assert.equal(w.top1, 15 / 20);
  assert.equal(w.acpl, (5 * 50) / 20);
  const b = sideStats(plies, 'b', 0);
  assert.equal(b.top1, 1);
});

test('sideStats: потеря за один ход ограничена, чтобы одна ошибка не искажала среднее', () => {
  const plies = game(20, (i, color) => (i === 4 ? { uci: 'x', after: { cp: -5000, best: null } } : {}));
  const w = sideStats(plies, 'w', 0);
  assert.equal(w.acpl, 300 / w.considered);
});

test('sideStats: разброс времени и быстрые ходы', () => {
  const even = sideStats(game(40, () => ({ timeMs: 4000 })), 'w', 0);
  assert.equal(even.timeMean, 4000);
  assert.equal(even.timeCv, 0);
  assert.equal(even.fastShare, 0);
  const varied = sideStats(game(40, (i) => ({ timeMs: i % 4 === 0 ? 500 : i % 4 === 2 ? 20_000 : 3000 })), 'w', 0);
  assert.ok(varied.timeCv > 0.8);
  assert.ok(varied.fastShare > 0);
  const none = sideStats(game(40, () => ({ timeMs: null })), 'w', 0);
  assert.equal(none.timeMean, null);
  assert.equal(none.timed, 0);
});

test('suspicion: обычная игра не вызывает подозрений', () => {
  // совпадение 45%, потеря как ожидается, время разное
  const plies = game(60, (i, color) => ({
    uci: i % 20 < 9 ? `m${i}` : 'other',
    after: { cp: i % 20 < 9 ? 0 : -70, best: null },
    timeMs: 1000 + ((i * 7919) % 15) * 1500,
  }));
  const s = suspicion(sideStats(plies, 'w', 4), 1500);
  assert.equal(s.level, 'ok');
  assert.ok(s.score < 20);
});

test('suspicion: идеальные ходы и ровное время у слабого рейтинга — очень подозрительно', () => {
  const plies = game(70, () => ({ timeMs: 6000 }));
  const s = suspicion(sideStats(plies, 'w', 4, 0), 1100);
  assert.equal(s.level, 'high');
  assert.ok(s.score >= 70);
  assert.ok(s.reasons.length >= 3);
  assert.ok(s.reasons.some((r) => r.includes('движка')));
});

test('suspicion: одно и то же совпадение с движком подозрительнее у слабого рейтинга', () => {
  // белые играют лучший ход в 70% позиций, потеря на промахе небольшая, время разное
  const plies = game(80, (i) => {
    const hit = (i / 2) % 10 < 7;
    return {
      uci: hit ? `m${i}` : 'other',
      after: { cp: hit ? 0 : -60, best: null },
      timeMs: 1000 + ((i * 31) % 10) * 2500,
    };
  });
  const stats = sideStats(plies, 'w', 4);
  assert.ok(stats.top1 > 0.65 && stats.top1 < 0.75);
  const weak = suspicion(stats, 1100).score;
  const strong = suspicion(stats, 2000).score;
  assert.ok(strong < weak, `${strong} < ${weak}`);
});

test('suspicion: безупречная игра подозрительна при любом рейтинге', () => {
  const plies = game(80, () => ({ timeMs: 6000 }));
  assert.ok(suspicion(sideStats(plies, 'w', 4), 2800).score >= 45);
});

test('suspicion: уходы со вкладки добавляют баллы', () => {
  const plies = game(60, (i) => ({ uci: i % 2 ? 'x' : `m${i}`, timeMs: 1000 + ((i * 31) % 10) * 2500 }));
  const calm = suspicion(sideStats(plies, 'w', 4, 0), 1600);
  const away = suspicion(sideStats(plies, 'w', 4, 20), 1600);
  assert.ok(away.score >= calm.score + 20);
  assert.ok(away.reasons.some((r) => r.includes('вкладки')));
});

test('suspicion: короткая партия — мало данных, а не «чист»', () => {
  const s = suspicion(sideStats(game(14, () => ({})), 'w', 4), 1500);
  assert.equal(s.level, 'insufficient');
  assert.ok(sideStats(game(14, () => ({})), 'w', 4).considered < MIN_CONSIDERED);
});

test('ожидания по рейтингу растут и ограничены', () => {
  assert.ok(expectedTop1(2000) > expectedTop1(1200));
  assert.equal(expectedTop1(100), 0.35);
  assert.equal(expectedTop1(4000), 0.65);
  assert.ok(expectedAcpl(2000) < expectedAcpl(1000));
  assert.equal(expectedAcpl(100), 90);
  assert.equal(expectedAcpl(4000), 18);
});

test('levelOf: границы уровней', () => {
  assert.deepEqual([0, 19, 20, 44, 45, 69, 70, 100].map(levelOf), ['ok', 'ok', 'watch', 'watch', 'suspicious', 'suspicious', 'high', 'high']);
});

test('parseGameId: ссылка, id и мусор', () => {
  assert.equal(parseGameId('https://chess.uz/game/AbC123xyz9'), 'AbC123xyz9');
  assert.equal(parseGameId(' AbC123xyz9 '), 'AbC123xyz9');
  assert.equal(parseGameId('https://chess.uz/game/AbC123xyz9?x=1'), 'AbC123xyz9');
  assert.equal(parseGameId('a/b'), null);
  assert.equal(parseGameId(''), null);
  assert.equal(parseGameId('abc'), null);
});

test('shouldCountBlur: только на свой ход в идущей партии и не чаще раза в 3 секунды', () => {
  assert.equal(shouldCountBlur({ active: true, myTurn: true, lastCountedAt: null }, 1000), true);
  assert.equal(shouldCountBlur({ active: false, myTurn: true, lastCountedAt: null }, 1000), false);
  assert.equal(shouldCountBlur({ active: true, myTurn: false, lastCountedAt: null }, 1000), false);
  assert.equal(shouldCountBlur({ active: true, myTurn: true, lastCountedAt: 1000 }, 2500), false);
  assert.equal(shouldCountBlur({ active: true, myTurn: true, lastCountedAt: 1000 }, 4000), true);
});

test('spentMs: разница, не меньше нуля и не больше предела', () => {
  assert.equal(spentMs(1000, 4000), 3000);
  assert.equal(spentMs(5000, 4000), 0);
  assert.equal(spentMs(null, 4000), 0);
  assert.equal(spentMs(0, 10 ** 12, 1000), 1000);
});
