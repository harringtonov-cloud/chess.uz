import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RD,
  MIN_RATING,
  glickoUpdate,
  inactivityRd,
  initialGlicko,
  isProvisional,
  rateGame,
  readStored,
} from '../src/lib/glicko2.ts';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} не близко к ${b}`);

test('контрольный пример из статьи Глика: 1464.06, RD 151.52, изменчивость 0.05999', () => {
  const r = glickoUpdate({ rating: 1500, rd: 200, vol: 0.06 }, [
    { rating: 1400, rd: 30, score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ]);
  near(r.rating, 1464.06, 0.02);
  near(r.rd, 151.52, 0.02);
  near(r.vol, 0.05999, 0.00002);
});

test('без партий рейтинг не меняется, неопределённость растёт, но не выше 350', () => {
  const r = glickoUpdate({ rating: 1500, rd: 100, vol: 0.06 }, []);
  assert.equal(r.rating, 1500);
  assert.ok(r.rd > 100 && r.rd < 101);
  assert.equal(glickoUpdate({ rating: 1500, rd: 350, vol: 0.06 }, []).rd, 350);
});

test('победа поднимает, поражение опускает, ничья при равных почти не меняет', () => {
  const p = { rating: 1500, rd: 120, vol: 0.06 };
  const o = { rating: 1500, rd: 120 };
  const win = glickoUpdate(p, [{ ...o, score: 1 }]);
  const loss = glickoUpdate(p, [{ ...o, score: 0 }]);
  const draw = glickoUpdate(p, [{ ...o, score: 0.5 }]);
  assert.ok(win.rating > 1500 && loss.rating < 1500);
  near(draw.rating, 1500, 0.01);
  near(win.rating - 1500, 1500 - loss.rating, 0.01); // симметрия
  assert.ok(win.rd < p.rd); // после партии игрок «уверенее» в рейтинге
});

test('новичок (большой RD) двигается быстрее опытного', () => {
  const o = { rating: 1500, rd: 80 };
  const rookie = glickoUpdate({ rating: 1500, rd: 350, vol: 0.06 }, [{ ...o, score: 1 }]);
  const vet = glickoUpdate({ rating: 1500, rd: 60, vol: 0.06 }, [{ ...o, score: 1 }]);
  assert.ok(rookie.rating - 1500 > 3 * (vet.rating - 1500));
});

test('победа над сильным даёт больше, чем над слабым', () => {
  const p = { rating: 1500, rd: 100, vol: 0.06 };
  const strong = glickoUpdate(p, [{ rating: 1800, rd: 80, score: 1 }]).rating;
  const weak = glickoUpdate(p, [{ rating: 1200, rd: 80, score: 1 }]).rating;
  assert.ok(strong - 1500 > weak - 1500);
});

test('соперник с большим RD влияет слабее', () => {
  const p = { rating: 1500, rd: 100, vol: 0.06 };
  const sure = glickoUpdate(p, [{ rating: 1500, rd: 50, score: 1 }]).rating;
  const unsure = glickoUpdate(p, [{ rating: 1500, rd: 350, score: 1 }]).rating;
  assert.ok(sure - 1500 > unsure - 1500);
});

test('простой: RD растёт со временем и упирается в 350', () => {
  const a = inactivityRd(60, 0.06, 0);
  const b = inactivityRd(60, 0.06, 30);
  const c = inactivityRd(60, 0.06, 3650);
  assert.equal(a, 60);
  assert.ok(b > 90 && b < 115, `за месяц: ${b}`);
  assert.ok(inactivityRd(60, 0.06, 540) > 330);
  assert.ok(b < c);
  assert.equal(c, DEFAULT_RD);
});

test('начальные значения зависят от числа партий и предварительность определяется по RD', () => {
  assert.equal(initialGlicko(1200, 0).rd, 350);
  assert.equal(initialGlicko(1200, 10).rd, 250);
  assert.equal(initialGlicko(1200, 500).rd, 80);
  assert.equal(initialGlicko(1200, -5).rd, 350);
  assert.equal(isProvisional(250), true);
  assert.equal(isProvisional(80), false);
});

test('сохранённые данные: мусор заменяется значениями по умолчанию', () => {
  assert.equal(readStored(null, 1300, 0).glicko.rd, 350);
  assert.equal(readStored({ rd: 9999, vol: -1, at: 'x' }, 1300, 20).glicko.rd, 150);
  assert.equal(readStored({ rd: 9999, vol: -1, at: 'x' }, 1300, 20).glicko.vol, 0.06);
  const ok = readStored({ rd: 90, vol: 0.05, at: 1000 }, 1400, 100);
  assert.deepEqual(ok, { glicko: { rating: 1400, rd: 90, vol: 0.05 }, at: 1000 });
});

test('rateGame: первая партия новичка даёт крупный сдвиг и сохраняет данные', () => {
  const now = 1_700_000_000_000;
  const win = rateGame({ rating: 1200, stored: null, gamesPlayed: 0 }, { rating: 1200, rd: 80 }, 1, now);
  assert.ok(win.delta > 40, `delta ${win.delta}`);
  assert.equal(win.rating, 1200 + win.delta);
  assert.equal(win.stored.at, now);
  assert.ok(win.stored.rd < 350 && win.stored.rd >= 45);
  const loss = rateGame({ rating: 1200, stored: null, gamesPlayed: 0 }, { rating: 1200, rd: 80 }, 0, now);
  assert.ok(loss.delta < -40);
});

test('rateGame: после долгого простоя сдвиг больше, чем при частой игре', () => {
  const day = 86_400_000;
  const now = 400 * day;
  const stored = { rd: 60, vol: 0.06, at: now - 1 * day };
  const rusty = { rd: 60, vol: 0.06, at: now - 365 * day };
  const opp = { rating: 1500, rd: 70 };
  const fresh = rateGame({ rating: 1500, stored, gamesPlayed: 200 }, opp, 1, now);
  const idle = rateGame({ rating: 1500, stored: rusty, gamesPlayed: 200 }, opp, 1, now);
  assert.ok(idle.delta > fresh.delta);
});

test('rateGame: рейтинг не падает ниже минимума', () => {
  const r = rateGame({ rating: 105, stored: null, gamesPlayed: 0 }, { rating: 2500, rd: 50 }, 0, 1);
  assert.ok(r.rating >= MIN_RATING);
});

import { ratingView } from '../src/lib/glicko2.ts';

test('ratingView: новичок помечается «?», опытный нет, сохранённый RD приоритетнее', () => {
  assert.deepEqual(ratingView(1200, null, 0), { rating: 1200, rd: 350, provisional: true });
  assert.equal(ratingView(1500, null, 100).provisional, false);
  assert.equal(ratingView(1500, { rd: 200, vol: 0.06, at: 5 }, 100).provisional, true);
  assert.equal(ratingView(1500, { rd: 70, vol: 0.06, at: 5 }, 0).provisional, false);
});
