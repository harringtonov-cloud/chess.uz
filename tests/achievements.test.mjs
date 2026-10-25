import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG,
  EMPTY_PROGRESS,
  afterGame,
  afterPuzzle,
  dayKey,
  familyViews,
  liveDayStreak,
  metricsOf,
  newlyEarned,
  normalizeEarned,
  normalizeProgress,
  recentlyEarned,
  touchDay,
} from '../src/lib/achievements.ts';

const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 20, 12, 0, 0); // 20.10.2026 12:00 UTC

test('нормализация счётчиков: мусор превращается в нули, рекорд не меньше текущей серии', () => {
  assert.deepEqual(normalizeProgress(null), EMPTY_PROGRESS);
  assert.deepEqual(normalizeProgress('x'), EMPTY_PROGRESS);
  const p = normalizeProgress({ winStreak: 5, bestWinStreak: 2, dayStreak: -3, lastDay: 'вчера', upsets: 2.9 });
  assert.equal(p.bestWinStreak, 5);
  assert.equal(p.dayStreak, 0);
  assert.equal(p.lastDay, '');
  assert.equal(p.upsets, 2);
});

test('день считается по часовому поясу игрока', () => {
  const late = Date.UTC(2026, 9, 20, 22, 0, 0); // 22:00 UTC
  assert.equal(dayKey(late, 0), '2026-10-20');
  assert.equal(dayKey(late, 300), '2026-10-21'); // Ташкент, UTC+5: уже следующий день
  assert.equal(dayKey(late, -480), '2026-10-20');
});

test('серия дней: тот же день не меняет, вчера продолжает, пропуск сбрасывает', () => {
  let p = touchDay(EMPTY_PROGRESS, T, 0);
  assert.equal(p.dayStreak, 1);
  assert.equal(touchDay(p, T + 3600_000, 0), p);
  p = touchDay(p, T + DAY, 0);
  assert.equal(p.dayStreak, 2);
  p = touchDay(p, T + 2 * DAY, 0);
  assert.equal(p.dayStreak, 3);
  assert.equal(p.bestDayStreak, 3);
  p = touchDay(p, T + 5 * DAY, 0); // пропустили два дня
  assert.equal(p.dayStreak, 1);
  assert.equal(p.bestDayStreak, 3);
});

test('переход через границу месяца и года', () => {
  const dec31 = Date.UTC(2026, 11, 31, 10);
  let p = touchDay(EMPTY_PROGRESS, dec31, 0);
  p = touchDay(p, dec31 + DAY, 0);
  assert.equal(p.lastDay, '2027-01-01');
  assert.equal(p.dayStreak, 2);
});

test('показываемая серия обрывается, если не играл вчера и сегодня', () => {
  const p = { ...EMPTY_PROGRESS, dayStreak: 5, bestDayStreak: 5, lastDay: dayKey(T, 0) };
  assert.equal(liveDayStreak(p, T, 0), 5);
  assert.equal(liveDayStreak(p, T + DAY, 0), 5); // вчера играл, сегодня ещё можно продолжить
  assert.equal(liveDayStreak(p, T + 2 * DAY, 0), 0);
});

test('серия побед: победа растит, ничья и поражение обнуляют, рекорд сохраняется', () => {
  const win = { score: 1, ownRating: 1500, oppRating: 1500 };
  let p = EMPTY_PROGRESS;
  p = afterGame(p, win, T, 0);
  p = afterGame(p, win, T, 0);
  p = afterGame(p, win, T, 0);
  assert.equal(p.winStreak, 3);
  p = afterGame(p, { ...win, score: 0.5 }, T, 0);
  assert.equal(p.winStreak, 0);
  assert.equal(p.bestWinStreak, 3);
  p = afterGame(p, win, T, 0);
  assert.equal(p.winStreak, 1);
});

test('сенсация: победа над игроком на 200+ рейтинга сильнее; поражение не считается', () => {
  const base = { ownRating: 1400, oppRating: 1600 };
  assert.equal(afterGame(EMPTY_PROGRESS, { ...base, score: 1 }, T, 0).upsets, 1);
  assert.equal(afterGame(EMPTY_PROGRESS, { ...base, oppRating: 1599, score: 1 }, T, 0).upsets, 0);
  assert.equal(afterGame(EMPTY_PROGRESS, { ...base, score: 0 }, T, 0).upsets, 0);
});

test('задачи: решённая считается, нерешённая нет, обе продлевают серию дней', () => {
  let p = afterPuzzle(EMPTY_PROGRESS, true, T, 0);
  assert.equal(p.puzzlesSolved, 1);
  p = afterPuzzle(p, false, T + DAY, 0);
  assert.equal(p.puzzlesSolved, 1);
  assert.equal(p.dayStreak, 2);
});

test('каталог: идентификаторы уникальны и стабильны', () => {
  const ids = CATALOG.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('games-1') && ids.includes('bestDayStreak-7') && ids.includes('topRating-1800'));
  assert.ok(CATALOG.length >= 40);
  assert.equal(CATALOG.find((a) => a.id === 'puzzlesSolved-1000').title, 'Задачи: 1k');
});

test('метрики из профиля, в том числе у старых профилей без progress', () => {
  const m = metricsOf({
    stats: { games: 60, wins: 25 },
    ratings: { bullet: 1300, blitz: 1650, rapid: 1200, classical: 1200, puzzle: 1420 },
  });
  assert.equal(m.games, 60);
  assert.equal(m.topRating, 1650);
  assert.equal(m.puzzleRating, 1420);
  assert.equal(m.bestWinStreak, 0);
  assert.equal(metricsOf({}).topRating, 0);
});

test('новые достижения: по счётчикам, без повторов уже полученных', () => {
  const m = metricsOf({ stats: { games: 12, wins: 3 }, ratings: { blitz: 1450, puzzle: 1200 } });
  const ids = newlyEarned(m, {}).map((a) => a.id).sort();
  assert.deepEqual(ids, ['games-1', 'games-10', 'topRating-1400', 'wins-1'].sort());
  const again = newlyEarned(m, { 'games-1': 1, 'games-10': 2 }).map((a) => a.id).sort();
  assert.deepEqual(again, ['topRating-1400', 'wins-1']);
  assert.equal(newlyEarned(m, null).length, 4);
});

test('полученные достижения: неизвестные id и плохие значения отбрасываются', () => {
  assert.deepEqual(normalizeEarned({ 'games-1': 5, 'nope-1': 3, 'wins-1': 'x', 'games-10': -1 }), { 'games-1': 5 });
  assert.deepEqual(normalizeEarned(null), {});
});

test('прогресс до следующего уровня', () => {
  const m = metricsOf({ stats: { games: 30, wins: 0 }, ratings: {} });
  const games = familyViews(m).find((v) => v.family.metric === 'games');
  assert.equal(games.done, 2); // 1 и 10
  assert.equal(games.next, 50);
  assert.equal(Math.round(games.progress * 100), 50); // 30 между 10 и 50
  const wins = familyViews(m).find((v) => v.family.metric === 'wins');
  assert.equal(wins.done, 0);
  assert.equal(wins.progress, 0);
  const maxed = familyViews(metricsOf({ stats: { games: 5000, wins: 0 }, ratings: {} })).find((v) => v.family.metric === 'games');
  assert.equal(maxed.next, null);
  assert.equal(maxed.progress, 1);
});

test('«новое»: только полученные за последние сутки', () => {
  const have = { 'games-1': T - 3600_000, 'wins-1': T - 3 * DAY, 'games-10': 0 };
  assert.deepEqual(recentlyEarned(have, T), ['games-1']);
});
