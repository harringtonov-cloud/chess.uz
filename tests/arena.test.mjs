import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SEEN_TTL,
  arenaPhase,
  arenaPoints,
  arenaStandings,
  chooseWhite,
  clockText,
  colorBalance,
  isAvailable,
  outcomeFor,
  pickOpponent,
  recentOpponents,
} from '../src/lib/arenaLogic.ts';

const NOW = 1_000_000;

function player(uid, rating, over = {}) {
  return { uid, name: uid.toUpperCase(), rating, waiting: true, seenAt: NOW - 1000, gameId: null, paused: false, ...over };
}
function res(uid, gameId, result, opponent, at, color = 'white') {
  return { uid, gameId, result, opponent, color, at };
}

test('arenaPhase: до начала, во время и после', () => {
  assert.equal(arenaPhase(100, 200, 50), 'upcoming');
  assert.equal(arenaPhase(100, 200, 100), 'running');
  assert.equal(arenaPhase(100, 200, 199), 'running');
  assert.equal(arenaPhase(100, 200, 200), 'finished');
});

test('outcomeFor: победа, поражение и ничья по результату партии', () => {
  assert.equal(outcomeFor('1-0', 'a', 'b', 'a'), 'win');
  assert.equal(outcomeFor('1-0', 'a', 'b', 'b'), 'loss');
  assert.equal(outcomeFor('0-1', 'a', 'b', 'b'), 'win');
  assert.equal(outcomeFor('1/2-1/2', 'a', 'b', 'a'), 'draw');
  assert.equal(outcomeFor(null, 'a', 'b', 'a'), null); // отменена или не закончена
  assert.equal(outcomeFor('1-0', 'a', 'b', 'c'), null); // посторонний
});

test('arenaPoints: победа 2, ничья 1, поражение 0', () => {
  assert.deepEqual(arenaPoints(['win', 'loss', 'draw']).perGame, [2, 0, 1]);
  assert.equal(arenaPoints(['win', 'loss', 'draw']).total, 3);
  assert.equal(arenaPoints([]).total, 0);
});

test('arenaPoints: после двух побед подряд очки удваиваются до первой не-победы', () => {
  const r = arenaPoints(['win', 'win', 'win', 'win', 'draw', 'win']);
  // 2, 2, 4 (серия), 4, ничья в серии = 2 и серия сбрасывается, затем снова обычная победа 2
  assert.deepEqual(r.perGame, [2, 2, 4, 4, 2, 2]);
  assert.equal(r.total, 16);
  assert.equal(r.onFire, false);
  assert.equal(arenaPoints(['win', 'win']).onFire, true);
  assert.equal(arenaPoints(['win', 'win', 'loss']).onFire, false);
  assert.deepEqual(arenaPoints(['win', 'win', 'loss', 'win', 'win', 'win']).perGame, [2, 2, 0, 2, 2, 4]);
});

test('arenaStandings: очки, победы, меньше партий, общие места', () => {
  const players = [player('a', 1500), player('b', 1400), player('c', 1300), player('d', 1200)];
  const results = [
    res('a', 'g1', 'win', 'b', 1), res('b', 'g1', 'loss', 'a', 1),
    res('c', 'g2', 'win', 'd', 2), res('d', 'g2', 'loss', 'c', 2),
    res('a', 'g3', 'loss', 'c', 3), res('c', 'g3', 'win', 'a', 3),
  ];
  const t = arenaStandings(players, results);
  // c: 2 победы (4 очка, серия не включилась: победа, победа), a: win, loss = 2 очка, b/d по 0
  assert.deepEqual(t.map((r) => r.uid), ['c', 'a', 'b', 'd']);
  assert.equal(t[0].score, 4);
  assert.equal(t[1].score, 2);
  assert.deepEqual(t.map((r) => r.rank), [1, 2, 3, 3]); // b и d: 0 очков, 0 побед, 1 партия
  assert.equal(t[0].wins, 2);
  assert.equal(t[1].losses, 1);
});

test('arenaStandings: порядок партий берётся по времени, а не по порядку в списке', () => {
  const players = [player('a', 1500)];
  const shuffled = [
    res('a', 'g3', 'win', 'x', 30),
    res('a', 'g1', 'win', 'x', 10),
    res('a', 'g2', 'win', 'x', 20),
  ];
  const [row] = arenaStandings(players, shuffled);
  assert.equal(row.score, 2 + 2 + 4);
  assert.equal(row.onFire, true);
});

test('arenaStandings: отмечает играющих сейчас', () => {
  const [row] = arenaStandings([player('a', 1500, { gameId: 'g9', waiting: false })], []);
  assert.equal(row.playing, true);
  assert.equal(row.score, 0);
});

test('isAvailable: ждёт, на связи, не на паузе и не в партии', () => {
  assert.equal(isAvailable(player('a', 1500), NOW), true);
  assert.equal(isAvailable(player('a', 1500, { waiting: false }), NOW), false);
  assert.equal(isAvailable(player('a', 1500, { paused: true }), NOW), false);
  assert.equal(isAvailable(player('a', 1500, { gameId: 'g1' }), NOW), false);
  assert.equal(isAvailable(player('a', 1500, { seenAt: NOW - SEEN_TTL - 1 }), NOW), false);
  assert.equal(isAvailable(player('a', 1500, { seenAt: NOW - SEEN_TTL }), NOW), true);
});

test('pickOpponent: ближайший по рейтингу, без недоступных и без себя', () => {
  const me = player('me', 1500);
  const list = [
    me,
    player('far', 1900),
    player('near', 1510),
    player('away', 1500, { seenAt: NOW - 60_000 }),
    player('busy', 1500, { gameId: 'g1' }),
  ];
  assert.equal(pickOpponent(me, list, [], NOW), 'near');
  assert.equal(pickOpponent(me, [me], [], NOW), null);
});

test('pickOpponent: избегает недавних соперников, но играет с ними, если выбора нет', () => {
  const me = player('me', 1500);
  const near = player('near', 1500);
  const other = player('other', 1700);
  assert.equal(pickOpponent(me, [me, near, other], ['near'], NOW), 'other');
  assert.equal(pickOpponent(me, [me, near], ['near'], NOW), 'near');
});

test('pickOpponent: при равных рейтингах выбор стабилен (меньший uid)', () => {
  const me = player('me', 1500);
  const list = [me, player('z', 1500), player('b', 1500), player('m', 1500)];
  assert.equal(pickOpponent(me, list, [], NOW), 'b');
  assert.equal(pickOpponent(me, [...list].reverse(), [], NOW), 'b');
});

test('recentOpponents: последние n соперников по времени', () => {
  const r = [res('a', 'g1', 'win', 'x', 1), res('a', 'g2', 'win', 'y', 2), res('a', 'g3', 'win', 'z', 3), res('b', 'g4', 'win', 'q', 4)];
  assert.deepEqual(recentOpponents(r, 'a'), ['y', 'z']);
  assert.deepEqual(recentOpponents(r, 'a', 1), ['z']);
  assert.deepEqual(recentOpponents(r, 'nobody'), []);
});

test('chooseWhite: белыми играет тот, у кого их меньше; при равенстве решает rng', () => {
  const results = [
    res('a', 'g1', 'win', 'x', 1, 'white'),
    res('a', 'g2', 'win', 'y', 2, 'white'),
    res('b', 'g3', 'win', 'x', 3, 'black'),
  ];
  assert.equal(colorBalance(results, 'a'), 2);
  assert.equal(colorBalance(results, 'b'), -1);
  assert.deepEqual(chooseWhite('a', 'b', results), { white: 'b', black: 'a' });
  assert.deepEqual(chooseWhite('b', 'a', results), { white: 'b', black: 'a' });
  assert.deepEqual(chooseWhite('p', 'q', [], () => 0.1), { white: 'p', black: 'q' });
  assert.deepEqual(chooseWhite('p', 'q', [], () => 0.9), { white: 'q', black: 'p' });
});

test('clockText: минуты:секунды и часы', () => {
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(61_000), '1:01');
  assert.equal(clockText(59_001), '1:00');
  assert.equal(clockText(3_723_000), '1:02:03');
  assert.equal(clockText(-5), '0:00');
});
