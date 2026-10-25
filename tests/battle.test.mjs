import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BATTLE_MS,
  COUNTDOWN_MS,
  MIN_SOLVE_MS,
  addResult,
  battlePhase,
  compareScores,
  joinable,
  maxPlausibleSolved,
  mmss,
  outcomeOf,
  puzzleIndex,
  readScore,
} from '../src/lib/battleLogic.ts';

test('battlePhase: ожидание, отсчёт, бой, конец', () => {
  assert.equal(battlePhase({ status: 'waiting', startAt: null, endsAt: null }, 0), 'waiting');
  const b = { status: 'active', startAt: 10_000, endsAt: 10_000 + BATTLE_MS };
  assert.equal(battlePhase(b, 9_999), 'countdown');
  assert.equal(battlePhase(b, 10_000), 'running');
  assert.equal(battlePhase(b, 10_000 + BATTLE_MS - 1), 'running');
  assert.equal(battlePhase(b, 10_000 + BATTLE_MS), 'finished');
  assert.equal(battlePhase({ status: 'active', startAt: null, endsAt: null }, 5), 'waiting');
  assert.ok(COUNTDOWN_MS > 0);
});

test('readScore: пустое и повреждённое значение превращается в ноль', () => {
  assert.deepEqual(readScore(undefined), { solved: 0, mistakes: 0, lastAt: 0 });
  assert.deepEqual(readScore({ solved: 3, mistakes: 1, lastAt: 99 }), { solved: 3, mistakes: 1, lastAt: 99 });
  assert.deepEqual(readScore({ solved: -2, mistakes: 'x', lastAt: NaN }), { solved: 0, mistakes: 0, lastAt: 0 });
  assert.deepEqual(readScore({ solved: 2.9 }), { solved: 2, mistakes: 0, lastAt: 0 });
});

test('addResult и puzzleIndex: задача всегда закрывается ровно одним результатом', () => {
  let s = readScore(null);
  s = addResult(s, true, 100);
  s = addResult(s, false, 200);
  s = addResult(s, true, 300);
  assert.deepEqual(s, { solved: 2, mistakes: 1, lastAt: 300 });
  assert.equal(puzzleIndex(s), 3);
});

test('compareScores и outcomeOf: больше решено — лучше, при равенстве меньше ошибок, иначе ничья', () => {
  const a = { solved: 5, mistakes: 2, lastAt: 1 };
  const b = { solved: 4, mistakes: 0, lastAt: 1 };
  assert.ok(compareScores(a, b) > 0);
  assert.equal(outcomeOf(a, b), 'win');
  assert.equal(outcomeOf(b, a), 'loss');
  assert.equal(outcomeOf({ solved: 4, mistakes: 1, lastAt: 9 }, { solved: 4, mistakes: 2, lastAt: 1 }), 'win');
  assert.equal(outcomeOf({ solved: 4, mistakes: 1, lastAt: 9 }, { solved: 4, mistakes: 1, lastAt: 1 }), 'draw');
});

test('maxPlausibleSolved: нельзя решать быстрее задачи в полторы секунды', () => {
  assert.equal(maxPlausibleSolved(1000, 1000), 1); // в первый миг допускаем одну (запас на разницу часов)
  assert.equal(maxPlausibleSolved(1000, 1000 + MIN_SOLVE_MS), 2);
  assert.equal(maxPlausibleSolved(1000, 1000 + 60_000), 41);
  assert.equal(maxPlausibleSolved(5000, 1000), 0);
});

test('mmss: минуты и секунды', () => {
  assert.equal(mmss(180_000), '3:00');
  assert.equal(mmss(59_001), '1:00');
  assert.equal(mmss(5_000), '0:05');
  assert.equal(mmss(-1), '0:00');
});

test('joinable: чужая ожидающая партия с живым создателем', () => {
  const now = 100_000;
  const ok = { players: ['a'], status: 'waiting', heartbeat: now - 5000 };
  assert.equal(joinable(ok, 'me', now), true);
  assert.equal(joinable(ok, 'a', now), false); // моя
  assert.equal(joinable({ ...ok, heartbeat: now - 40_000 }, 'me', now), false); // создатель ушёл
  assert.equal(joinable({ ...ok, status: 'active' }, 'me', now), false);
  assert.equal(joinable({ ...ok, players: ['a', 'b'] }, 'me', now), false);
});
