// Рейтинговая система Glicko-2 (Марк Глик). Чистая математика: без Firebase и React,
// поэтому проверяется обычными тестами (npm test). Формулы взяты из описания Глика
// (glicko.net/glicko/glicko2.pdf), в тестах повторён его контрольный пример.

const SCALE = 173.7178;
const TAU = 0.5; // ограничение изменчивости: чем меньше, тем спокойнее рейтинг
const EPS = 1e-6;

export const DEFAULT_RATING = 1200;
export const DEFAULT_RD = 350;
export const DEFAULT_VOL = 0.06;
export const MIN_RD = 45; // даже у самых активных игроков остаётся небольшая неопределённость
export const MIN_RATING = 100;
/** Рейтинг с RD выше этого значения считается «предварительным» (отмечается знаком «?»). */
export const PROVISIONAL_RD = 110;
/**
 * Условный «рейтинговый период» в днях для роста неопределённости при простое.
 * Подобран так, что у активного игрока (RD 60) за месяц без партий RD вырастает до ~100,
 * а после полутора лет простоя рейтинг снова становится почти «новичковым».
 */
const PERIOD_DAYS = 0.5;

export interface Glicko {
  rating: number;
  rd: number;
  vol: number;
}

export interface GlickoGame {
  rating: number;
  rd: number;
  /** 1 победа, 0.5 ничья, 0 поражение */
  score: number;
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Один пересчёт по списку партий (рейтинговый период). Пустой список только увеличивает
 * неопределённость. Результат не округлён.
 */
export function glickoUpdate(p: Glicko, games: GlickoGame[]): Glicko {
  const mu = (p.rating - 1500) / SCALE;
  const phi = p.rd / SCALE;
  const sigma = p.vol;

  if (games.length === 0) {
    const phiNew = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: p.rating, rd: Math.min(DEFAULT_RD, phiNew * SCALE), vol: sigma };
  }

  let vInv = 0;
  let sum = 0;
  for (const o of games) {
    const muJ = (o.rating - 1500) / SCALE;
    const phiJ = o.rd / SCALE;
    const gj = g(phiJ);
    const e = E(mu, muJ, phiJ);
    vInv += gj * gj * e * (1 - e);
    sum += gj * (o.score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  // новая изменчивость (алгоритм Illinois из статьи Глика)
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d2 = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d2 * d2) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPS && guard++ < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaNew = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return {
    rating: muNew * SCALE + 1500,
    rd: Math.max(MIN_RD, phiNew * SCALE),
    vol: sigmaNew,
  };
}

/** Рост неопределённости за время без рейтинговых партий (не выше стартового RD). */
export function inactivityRd(rd: number, vol: number, days: number): number {
  if (days <= 0) return rd;
  const phi = rd / SCALE;
  const t = days / PERIOD_DAYS;
  return Math.min(DEFAULT_RD, Math.sqrt(phi * phi + vol * vol * t) * SCALE);
}

/** Начальные RD и изменчивость для игрока, у которого их ещё нет (по числу сыгранных партий). */
export function initialGlicko(rating: number, gamesPlayed: number): Glicko {
  const rd = Math.max(80, Math.min(DEFAULT_RD, DEFAULT_RD - 10 * Math.max(0, gamesPlayed)));
  return { rating, rd, vol: DEFAULT_VOL };
}

export function isProvisional(rd: number): boolean {
  return rd > PROVISIONAL_RD;
}

export interface StoredGlicko {
  rd: number;
  vol: number;
  /** Время последней рейтинговой партии, мс. */
  at: number;
}

/** Читает сохранённые RD и изменчивость; некорректное заменяет значениями по умолчанию. */
export function readStored(
  raw: Partial<StoredGlicko> | null | undefined,
  rating: number,
  gamesPlayed: number,
): { glicko: Glicko; at: number } {
  const init = initialGlicko(rating, gamesPlayed);
  if (!raw || typeof raw !== 'object') return { glicko: init, at: 0 };
  const rd = typeof raw.rd === 'number' && raw.rd >= MIN_RD && raw.rd <= DEFAULT_RD ? raw.rd : init.rd;
  const vol = typeof raw.vol === 'number' && raw.vol > 0 && raw.vol < 0.2 ? raw.vol : init.vol;
  const at = typeof raw.at === 'number' && raw.at > 0 ? raw.at : 0;
  return { glicko: { rating, rd, vol }, at };
}

export interface RatedGameResult {
  rating: number;
  /** Разница с прежним рейтингом (округлённая). */
  delta: number;
  stored: StoredGlicko;
}

/**
 * Итог одной рейтинговой партии для одного игрока.
 * own — его сохранённые данные, opp — соперник (рейтинг на начало партии и его текущий RD).
 */
export function rateGame(
  own: { rating: number; stored?: Partial<StoredGlicko> | null; gamesPlayed: number },
  opp: { rating: number; rd: number },
  score: number,
  now: number,
): RatedGameResult {
  const { glicko, at } = readStored(own.stored, own.rating, own.gamesPlayed);
  const idleDays = at > 0 ? (now - at) / 86_400_000 : 0;
  const before: Glicko = { ...glicko, rd: inactivityRd(glicko.rd, glicko.vol, idleDays) };
  const next = glickoUpdate(before, [{ rating: opp.rating, rd: opp.rd, score }]);
  const rating = Math.max(MIN_RATING, Math.round(next.rating));
  return {
    rating,
    delta: rating - own.rating,
    stored: { rd: Math.round(next.rd * 10) / 10, vol: Math.round(next.vol * 1e6) / 1e6, at: now },
  };
}

export interface RatingView {
  rating: number;
  /** Неопределённость, округлённая (показывается как «±»). */
  rd: number;
  provisional: boolean;
}

/** Всё нужное для показа рейтинга: число, ± и признак «?». Для старых профилей без RD оценивается по числу партий. */
export function ratingView(
  rating: number,
  stored: Partial<StoredGlicko> | null | undefined,
  gamesPlayed: number,
): RatingView {
  const rd = readStored(stored, rating, gamesPlayed).glicko.rd;
  return { rating, rd: Math.round(rd), provisional: isProvisional(rd) };
}
