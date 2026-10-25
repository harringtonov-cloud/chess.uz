import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPremovePossible, needsPromotion } from '../src/lib/premove.ts';

/** Позиция из списка вида { e2: 'wp', g1: 'wn' } → функция pieceAt. */
function pos(map) {
  return (sq) => {
    const v = map[sq];
    return v ? { color: v[0], type: v[1] } : null;
  };
}

test('пешка: шаг, двойной шаг только с исходной горизонтали, взятие по диагонали', () => {
  const p = pos({ e2: 'wp', e4: 'wp', d7: 'bp' });
  assert.equal(isPremovePossible(p, 'e2', 'e3'), true);
  assert.equal(isPremovePossible(p, 'e2', 'e4'), false); // своя фигура на e4
  assert.equal(isPremovePossible(p, 'e4', 'e6'), false); // двойной шаг не с исходной
  assert.equal(isPremovePossible(p, 'e2', 'd3'), true); // возможное взятие / на проходе
  assert.equal(isPremovePossible(p, 'e2', 'e1'), false); // назад нельзя
  assert.equal(isPremovePossible(p, 'd7', 'd5'), true);
  assert.equal(isPremovePossible(p, 'd7', 'c6'), true);
  assert.equal(isPremovePossible(p, 'd7', 'd8'), false);
});

test('конь, слон, ладья, ферзь: только геометрия, чужие фигуры на пути не мешают', () => {
  const p = pos({ b1: 'wn', c1: 'wb', a1: 'wr', d1: 'wq', b2: 'bp', c2: 'bp' });
  assert.equal(isPremovePossible(p, 'b1', 'c3'), true);
  assert.equal(isPremovePossible(p, 'b1', 'b3'), false);
  assert.equal(isPremovePossible(p, 'c1', 'h6'), true); // сквозь b2/c2
  assert.equal(isPremovePossible(p, 'c1', 'c3'), false);
  assert.equal(isPremovePossible(p, 'a1', 'a8'), true);
  assert.equal(isPremovePossible(p, 'a1', 'b2'), false);
  assert.equal(isPremovePossible(p, 'd1', 'h5'), true);
  assert.equal(isPremovePossible(p, 'd1', 'e3'), false);
});

test('нельзя на поле со своей фигурой, с пустого поля и на себя', () => {
  const p = pos({ a1: 'wr', a4: 'wp', h1: 'bn' });
  assert.equal(isPremovePossible(p, 'a1', 'a4'), false);
  assert.equal(isPremovePossible(p, 'a1', 'h1'), true); // чужая — можно (взятие)
  assert.equal(isPremovePossible(p, 'c3', 'c4'), false);
  assert.equal(isPremovePossible(p, 'a1', 'a1'), false);
  assert.equal(isPremovePossible(p, 'a1', 'z9'), false);
});

test('король: шаг и рокировка с e1/e8', () => {
  const p = pos({ e1: 'wk', e8: 'bk', d4: 'wk' });
  assert.equal(isPremovePossible(p, 'e1', 'f1'), true);
  assert.equal(isPremovePossible(p, 'e1', 'g1'), true);
  assert.equal(isPremovePossible(p, 'e1', 'c1'), true);
  assert.equal(isPremovePossible(p, 'e8', 'g8'), true);
  assert.equal(isPremovePossible(p, 'e1', 'g8'), false);
  assert.equal(isPremovePossible(p, 'd4', 'f4'), false); // два шага не с исходного поля
});

test('needsPromotion: только пешка на последней горизонтали', () => {
  const p = pos({ a7: 'wp', a2: 'bp', b7: 'wr', c2: 'wp' });
  assert.equal(needsPromotion(p, 'a7', 'a8'), true);
  assert.equal(needsPromotion(p, 'a2', 'a1'), true);
  assert.equal(needsPromotion(p, 'c2', 'c3'), false);
  assert.equal(needsPromotion(p, 'b7', 'b8'), false);
  assert.equal(needsPromotion(p, 'h1', 'h2'), false);
});
