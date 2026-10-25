import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAY,
  MIN_EASE,
  MINUTE,
  NEW_PER_DAY,
  applyGrade,
  dayKey,
  emptyState,
  newCard,
  pickNext,
  schedule,
  summary,
  trainableLines,
  userPlies,
} from '../src/lib/openingTrainer.ts';

const T0 = new Date(2026, 9, 21, 12, 0, 0).getTime();

const OPENINGS = [
  { name: 'e4', moves: 'e2e4' },
  { name: 'Открытая игра', moves: 'e2e4 e7e5' },
  { name: 'Итальянская', moves: 'e2e4 e7e5 g1f3 b8c6 f1c4' },
  { name: 'Шотландская', moves: 'e2e4 e7e5 g1f3 b8c6 d2d4' },
  { name: 'Французская', moves: 'e2e4 e7e6 d2d4 d7d5' },
  { name: 'Сицилианская', moves: 'e2e4 c7c5' },
];

test('trainableLines: только листья справочника не короче 4 полуходов', () => {
  const lines = trainableLines(OPENINGS, 'white');
  assert.deepEqual(
    lines.map((l) => l.name).sort(),
    ['Итальянская', 'Французская', 'Шотландская'].sort(),
  );
  assert.ok(lines.every((l) => l.id.startsWith('white:')));
  const black = trainableLines(OPENINGS, 'black');
  assert.ok(black.every((l) => l.id.startsWith('black:')));
  assert.equal(black.length, lines.length);
});

test('userPlies: белые ходят на чётных полуходах, чёрные на нечётных', () => {
  const [w] = trainableLines(OPENINGS, 'white').filter((l) => l.name === 'Итальянская');
  const [b] = trainableLines(OPENINGS, 'black').filter((l) => l.name === 'Итальянская');
  assert.deepEqual(userPlies(w), [0, 2, 4]);
  assert.deepEqual(userPlies(b), [1, 3]);
});

test('schedule: интервалы 1 → 3 → по множителю; again сбрасывает серию', () => {
  let c = newCard('x', T0);
  c = schedule(c, 'good', T0);
  assert.equal(c.reps, 1);
  assert.equal(c.interval, 1);
  assert.equal(c.due, T0 + DAY);
  c = schedule(c, 'good', T0 + DAY);
  assert.equal(c.interval, 3);
  c = schedule(c, 'good', T0 + 4 * DAY);
  assert.equal(c.interval, Math.round(3 * 2.5)); // 8
  assert.equal(c.reps, 3);
  const lapsed = schedule(c, 'again', T0 + 12 * DAY);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.lapses, 1);
  assert.equal(lapsed.due, T0 + 12 * DAY + 10 * MINUTE);
  assert.ok(lapsed.ease < c.ease);
});

test('schedule: лёгкая оценка растит интервал быстрее, множитель не падает ниже минимума', () => {
  const good = schedule(newCard('a', T0), 'good', T0);
  const easy = schedule(newCard('b', T0), 'easy', T0);
  assert.ok(easy.interval > good.interval);
  assert.ok(easy.ease > good.ease);
  let c = newCard('z', T0);
  for (let i = 0; i < 20; i++) c = schedule(c, 'again', T0);
  assert.equal(c.ease, MIN_EASE);
});

test('applyGrade: новая линия попадает в лимит дня, повтор — нет, на следующий день счёт обнуляется', () => {
  const [line] = trainableLines(OPENINGS, 'white');
  let s = applyGrade(emptyState(), line, 'good', T0);
  assert.equal(s.intro.count, 1);
  assert.equal(s.intro.day, dayKey(T0));
  assert.equal(s.cards[line.id].reps, 1);
  s = applyGrade(s, line, 'good', T0 + 2 * DAY);
  assert.equal(s.intro.count, 0); // новый день, повтор не считается новой линией
  assert.equal(s.intro.day, dayKey(T0 + 2 * DAY));
  assert.equal(s.cards[line.id].reps, 2);
});

test('pickNext: сначала просроченные, потом новые до дневного лимита', () => {
  const lines = trainableLines(
    Array.from({ length: 12 }, (_, i) => ({ name: 'L' + i, moves: `e2e4 e7e5 g1f3 b8c${i}` })),
    'white',
  );
  assert.equal(lines.length, 12);
  let s = emptyState();
  // ничего не учили: берём новую
  assert.equal(pickNext(s, lines, T0, () => 0)?.kind, 'new');
  // берём NEW_PER_DAY новых и «проваливаем» их
  for (let i = 0; i < NEW_PER_DAY; i++) s = applyGrade(s, lines[i], 'again', T0);
  // через 11 минут они просрочены: приоритет у повторений
  const later = T0 + 11 * MINUTE;
  const p = pickNext(s, lines, later, () => 0);
  assert.equal(p?.kind, 'due');
  assert.ok(s.cards[p.line.id].due <= later);
  // все повторения выучены на сутки, а лимит новых за день исчерпан → null
  for (let i = 0; i < NEW_PER_DAY; i++) s = applyGrade(s, lines[i], 'good', later);
  assert.equal(pickNext(s, lines, later, () => 0), null);
  // назавтра снова можно брать новые и повторять
  const next = pickNext(s, lines, T0 + 2 * DAY, () => 0);
  assert.equal(next?.kind, 'due');
});

test('pickNext: исключает только что пройденную линию', () => {
  const lines = trainableLines(OPENINGS, 'white');
  const only = pickNext(emptyState(), [lines[0]], T0, () => 0, lines[0].id);
  assert.equal(only, null);
});

test('summary: считает просроченные, новые на сегодня, выученные и ближайший срок', () => {
  const lines = trainableLines(
    Array.from({ length: 8 }, (_, i) => ({ name: 'L' + i, moves: `d2d4 d7d5 c2c4 e7e${i % 2 ? 6 : 5} g1f${i}` })),
    'white',
  );
  let s = emptyState();
  s = applyGrade(s, lines[0], 'again', T0); // due через 10 минут
  s = applyGrade(s, lines[1], 'good', T0); // due через сутки
  const a = summary(s, lines, T0 + 20 * MINUTE);
  assert.equal(a.total, lines.length);
  assert.equal(a.due, 1);
  assert.equal(a.learned, 0);
  assert.equal(a.fresh, NEW_PER_DAY - 2);
  assert.equal(a.nextDueIn, T0 + DAY - (T0 + 20 * MINUTE));
});
