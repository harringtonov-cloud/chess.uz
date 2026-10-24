import assert from 'node:assert/strict';
import { test } from 'node:test';
import { THEME_CHOICES, THEME_RU, pickFallback, puzzleUrl, sanitizeTheme, themeLabel } from '../src/lib/puzzleThemes.ts';

test('у каждой темы из списка выбора есть русское название', () => {
  for (const c of THEME_CHOICES) {
    if (c.value) assert.ok(THEME_RU[c.value], `нет перевода для ${c.value}`);
  }
  assert.equal(themeLabel('fork'), 'Вилка');
  assert.equal(themeLabel('unknownTheme'), 'unknownTheme');
});

test('список выбора без повторов и начинается с «любых»', () => {
  const values = THEME_CHOICES.map((c) => c.value);
  assert.equal(values[0], '');
  assert.equal(new Set(values).size, values.length);
});

test('sanitizeTheme: неизвестное значение превращается в «любые»', () => {
  assert.equal(sanitizeTheme('pin'), 'pin');
  assert.equal(sanitizeTheme('<script>'), '');
  assert.equal(sanitizeTheme(null), '');
  assert.equal(sanitizeTheme(undefined), '');
});

test('puzzleUrl: тема только у «следующей» задачи, значение безопасно', () => {
  assert.equal(puzzleUrl('next'), 'https://lichess.org/api/puzzle/next');
  assert.equal(puzzleUrl('next', 'fork'), 'https://lichess.org/api/puzzle/next?angle=fork');
  assert.equal(puzzleUrl('daily', 'fork'), 'https://lichess.org/api/puzzle/daily');
  assert.equal(puzzleUrl('next', 'evil&x=1'), 'https://lichess.org/api/puzzle/next');
});

test('pickFallback: предпочитает задачи нужной темы, иначе любые и сообщает об этом', () => {
  const list = [
    { id: 'a', themes: ['mateIn1', 'backRankMate'] },
    { id: 'b', themes: ['fork'] },
    { id: 'c', themes: ['fork', 'short'] },
  ];
  assert.deepEqual(pickFallback(list, 'fork', 0), { puzzle: list[1], matched: true });
  assert.deepEqual(pickFallback(list, 'fork', 1), { puzzle: list[2], matched: true });
  assert.deepEqual(pickFallback(list, 'fork', 2), { puzzle: list[1], matched: true });
  assert.deepEqual(pickFallback(list, 'pin', 4), { puzzle: list[1], matched: false });
  assert.deepEqual(pickFallback(list, '', 3), { puzzle: list[0], matched: true });
});
