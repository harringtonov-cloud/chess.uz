import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENDGAMES, fenProblems, findEndgame } from '../src/lib/endgames.ts';
import { BOTS } from '../src/lib/bots.ts';

test('все позиции тренировки записаны корректно', () => {
  for (const e of ENDGAMES) assert.deepEqual(fenProblems(e.fen), [], e.id);
});

test('id уникальны, боты существуют, у каждой позиции есть цель и совет', () => {
  assert.equal(new Set(ENDGAMES.map((e) => e.id)).size, ENDGAMES.length);
  for (const e of ENDGAMES) {
    assert.ok(BOTS.some((b) => b.id === e.bot), `бот ${e.bot}`);
    assert.ok(e.goal.length > 0 && e.tip.length > 0 && e.title.length > 0);
    assert.ok([1, 2, 3].includes(e.level));
  }
});

test('цвет пользователя совпадает со стороной, которая должна выигрывать (в базовых матах — белые с ходом)', () => {
  const mate = findEndgame('kq-k');
  assert.equal(mate.color, 'white');
  assert.ok(mate.fen.split(' ')[1] === 'w');
});

test('findEndgame: известный и неизвестный id', () => {
  assert.equal(findEndgame('lucena')?.title, 'Позиция Лусены');
  assert.equal(findEndgame('нет'), null);
  assert.equal(findEndgame(null), null);
});

test('fenProblems: находит типичные ошибки', () => {
  assert.ok(fenProblems('4k3/8/8/8/8/8/8/Q3K3').length > 0); // нет полей
  assert.ok(fenProblems('4k3/8/8/8/8/8/8/Q4K3 w - - 0 1').length > 0); // 9 клеток
  assert.ok(fenProblems('8/8/8/8/8/8/8/Q3K3 w - - 0 1').length > 0); // нет чёрного короля
  assert.ok(fenProblems('4k3/8/8/8/8/8/8/P3K3 w - - 0 1').length > 0); // пешка на 1-й
  assert.deepEqual(fenProblems('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), []);
});
