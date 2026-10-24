// Арена-турнир: очки с сериями побед, таблица, подбор соперника и цветов.
// Чистые функции без Firebase и браузера (проверяются тестами).
//
// Правила очков, как на Lichess: победа — 2, ничья — 1, поражение — 0.
// После двух побед подряд включается серия: пока игрок не сделал ничью или не проиграл,
// очки удваиваются (победа — 4, ничья — 2). Ничья или поражение сбрасывают серию.

export type Outcome = 'win' | 'draw' | 'loss';
export type ArenaColor = 'white' | 'black';
export type ArenaPhase = 'upcoming' | 'running' | 'finished';

/** Игрок арены (документ tournaments/{id}/players/{uid}). */
export interface ArenaPlayer {
  uid: string;
  name: string;
  rating: number;
  /** Ищет соперника прямо сейчас */
  waiting: boolean;
  /** Когда игрок последний раз «отметился» на странице арены (мс) */
  seenAt: number;
  /** Текущая партия арены */
  gameId: string | null;
  /** Пауза: игрок не ищет партии */
  paused: boolean;
}

/** Итог одной партии для одного игрока (документ tournaments/{id}/results/{gameId_uid}). */
export interface ArenaResult {
  uid: string;
  gameId: string;
  result: Outcome;
  opponent: string;
  color: ArenaColor;
  /** Время записи, мс */
  at: number;
}

export interface ArenaRow {
  uid: string;
  name: string;
  rating: number;
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Идёт серия: следующая победа даст двойные очки */
  onFire: boolean;
  /** Играет прямо сейчас */
  playing: boolean;
  rank: number;
}

/** Игрок считается «на связи», если отмечался не раньше этого срока назад. */
export const SEEN_TTL = 30_000;
/** Сколько побед подряд включают серию. */
export const STREAK_WINS = 2;
/** Сколько последних соперников стараемся не повторять. */
export const RECENT_AVOID = 2;

export function arenaPhase(startsAt: number, endsAt: number, now: number): ArenaPhase {
  if (now < startsAt) return 'upcoming';
  if (now < endsAt) return 'running';
  return 'finished';
}

/** Результат партии для игрока uid; null — партия не закончена или отменена. */
export function outcomeFor(
  result: string | null,
  whiteUid: string | null,
  blackUid: string | null,
  uid: string,
): Outcome | null {
  if (result === '1/2-1/2') return uid === whiteUid || uid === blackUid ? 'draw' : null;
  if (result === '1-0') return uid === whiteUid ? 'win' : uid === blackUid ? 'loss' : null;
  if (result === '0-1') return uid === blackUid ? 'win' : uid === whiteUid ? 'loss' : null;
  return null;
}

export interface PointsInfo {
  total: number;
  perGame: number[];
  /** Идёт серия после последней партии */
  onFire: boolean;
}

/** Очки за последовательность результатов одного игрока (по порядку партий). */
export function arenaPoints(results: Outcome[]): PointsInfo {
  let wins = 0; // побед подряд
  let total = 0;
  const perGame: number[] = [];
  for (const r of results) {
    const fire = wins >= STREAK_WINS;
    let pts = 0;
    if (r === 'win') {
      pts = fire ? 4 : 2;
      wins += 1;
    } else if (r === 'draw') {
      pts = fire ? 2 : 1;
      wins = 0;
    } else {
      wins = 0;
    }
    perGame.push(pts);
    total += pts;
  }
  return { total, perGame, onFire: wins >= STREAK_WINS };
}

/** Результаты игрока в порядке времени. */
function ordered(results: ArenaResult[], uid: string): ArenaResult[] {
  return results
    .filter((r) => r.uid === uid)
    .sort((a, b) => a.at - b.at || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
}

/** Таблица арены: очки, затем победы, затем меньше партий, затем имя. Равные места делят номер. */
export function arenaStandings(players: ArenaPlayer[], results: ArenaResult[]): ArenaRow[] {
  const rows: ArenaRow[] = players.map((p) => {
    const mine = ordered(results, p.uid);
    const info = arenaPoints(mine.map((r) => r.result));
    return {
      uid: p.uid,
      name: p.name,
      rating: p.rating,
      score: info.total,
      games: mine.length,
      wins: mine.filter((r) => r.result === 'win').length,
      draws: mine.filter((r) => r.result === 'draw').length,
      losses: mine.filter((r) => r.result === 'loss').length,
      onFire: info.onFire,
      playing: p.gameId !== null,
      rank: 0,
    };
  });
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.wins - a.wins ||
      a.games - b.games ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score === r.score && prev.wins === r.wins && prev.games === r.games ? prev.rank : i + 1;
  });
  return rows;
}

/** Кого стараемся не ставить против игрока: последних соперников. */
export function recentOpponents(results: ArenaResult[], uid: string, n = RECENT_AVOID): string[] {
  return ordered(results, uid)
    .slice(-n)
    .map((r) => r.opponent);
}

/** Может ли игрок прямо сейчас играть партию. */
export function isAvailable(p: ArenaPlayer, now: number): boolean {
  return p.waiting && !p.paused && p.gameId === null && now - p.seenAt <= SEEN_TTL;
}

/**
 * Подбор соперника для me среди ожидающих: ближайший по рейтингу, не из последних соперников
 * (если других нет — берём и их, чтобы вдвоём можно было играть дальше). Если рейтинги равны,
 * побеждает меньший uid — выбор не зависит от случая.
 */
export function pickOpponent(
  me: ArenaPlayer,
  players: ArenaPlayer[],
  recent: string[],
  now: number,
): string | null {
  const free = players.filter((p) => p.uid !== me.uid && isAvailable(p, now));
  if (free.length === 0) return null;
  const fresh = free.filter((p) => !recent.includes(p.uid));
  const pool = fresh.length > 0 ? fresh : free;
  let best = pool[0];
  for (const p of pool) {
    const d = Math.abs(p.rating - me.rating);
    const bd = Math.abs(best.rating - me.rating);
    if (d < bd || (d === bd && p.uid < best.uid)) best = p;
  }
  return best.uid;
}

/** Баланс цветов: положительный — у игрока больше белых, чем чёрных. */
export function colorBalance(results: ArenaResult[], uid: string): number {
  return ordered(results, uid).reduce((s, r) => s + (r.color === 'white' ? 1 : -1), 0);
}

/** Кто играет белыми: тот, у кого меньше белых; при равенстве решает rng (0..1). */
export function chooseWhite(
  aUid: string,
  bUid: string,
  results: ArenaResult[],
  rng: () => number = Math.random,
): { white: string; black: string } {
  const a = colorBalance(results, aUid);
  const b = colorBalance(results, bUid);
  const aWhite = a < b ? true : a > b ? false : rng() < 0.5;
  return aWhite ? { white: aUid, black: bUid } : { white: bUid, black: aUid };
}

/** Время до конца в виде 12:34 (или 1:02:03 для часа и больше). */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
