// Швейцарская система: таблица результатов и жеребьёвка тура. Чистые функции без Firebase.

export type PairResult = '1-0' | '0-1' | '1/2-1/2' | 'bye';

export interface SwissPlayer {
  uid: string;
  name: string;
  rating: number;
}

export interface SwissPairing {
  round: number;
  white: string;
  black: string | null; // null — «пропуск тура» (bye)
  result: PairResult | null;
}

export interface NewPairing {
  white: string;
  black: string | null;
}

export interface Standing extends SwissPlayer {
  score: number;
  buchholz: number; // сумма очков соперников
  wins: number;
  played: number;
  rank: number;
}

/** Очки игрока за одну пару. */
function pointsFor(p: SwissPairing, uid: string): number {
  if (p.result === null) return 0;
  if (p.result === 'bye') return p.white === uid ? 1 : 0;
  if (p.result === '1/2-1/2') return 0.5;
  const whiteWon = p.result === '1-0';
  return (p.white === uid) === whiteWon ? 1 : 0;
}

export function standings(players: SwissPlayer[], pairings: SwissPairing[]): Standing[] {
  const score = new Map<string, number>();
  const wins = new Map<string, number>();
  const played = new Map<string, number>();
  for (const pl of players) {
    score.set(pl.uid, 0);
    wins.set(pl.uid, 0);
    played.set(pl.uid, 0);
  }
  for (const p of pairings) {
    if (p.result === null) continue;
    for (const uid of [p.white, p.black]) {
      if (!uid || !score.has(uid)) continue;
      const pts = pointsFor(p, uid);
      score.set(uid, score.get(uid)! + pts);
      if (pts === 1) wins.set(uid, wins.get(uid)! + 1);
      if (p.result !== 'bye') played.set(uid, played.get(uid)! + 1);
    }
  }
  const buch = new Map<string, number>();
  for (const pl of players) buch.set(pl.uid, 0);
  for (const p of pairings) {
    if (p.result === null || p.result === 'bye' || !p.black) continue;
    if (buch.has(p.white)) buch.set(p.white, buch.get(p.white)! + (score.get(p.black) ?? 0));
    if (buch.has(p.black)) buch.set(p.black, buch.get(p.black)! + (score.get(p.white) ?? 0));
  }
  const rows = players.map((pl) => ({
    ...pl,
    score: score.get(pl.uid)!,
    buchholz: buch.get(pl.uid)!,
    wins: wins.get(pl.uid)!,
    played: played.get(pl.uid)!,
    rank: 0,
  }));
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.buchholz - a.buchholz ||
      b.wins - a.wins ||
      b.rating - a.rating ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function key(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Жеребьёвка следующего тура.
 * Правила: игроки сортируются по очкам (потом по рейтингу); пары стараются не повторяться;
 * при нечётном числе игроков пропуск тура получает самый слабый из тех, у кого его ещё не было;
 * цвета чередуются (тот, у кого белых было меньше, играет белыми).
 */
export function pairRound(players: SwissPlayer[], previous: SwissPairing[]): NewPairing[] {
  if (players.length < 2) return [];
  const table = standings(players, previous);
  const order = table.map((r) => r.uid);

  const played = new Set<string>();
  const hadBye = new Set<string>();
  const balance = new Map<string, number>(); // белые минус чёрные
  for (const uid of order) balance.set(uid, 0);
  for (const p of previous) {
    if (!p.black) {
      hadBye.add(p.white);
      continue;
    }
    played.add(key(p.white, p.black));
    balance.set(p.white, (balance.get(p.white) ?? 0) + 1);
    balance.set(p.black, (balance.get(p.black) ?? 0) - 1);
  }

  // Подбор пар с возвратом: первому по таблице ищем ближайшего соперника, с которым он ещё не играл.
  function solve(rest: string[], allowRepeat: boolean): [string, string][] | null {
    if (rest.length === 0) return [];
    const [first, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      const second = others[i];
      if (!allowRepeat && played.has(key(first, second))) continue;
      const tail = solve(others.filter((_, j) => j !== i), allowRepeat);
      if (tail) return [[first, second], ...tail];
    }
    return null;
  }

  let bye: string | null = null;
  let pairs: [string, string][] = [];
  if (order.length % 2 === 0) {
    pairs = solve(order, false) ?? solve(order, true) ?? [];
  } else {
    // Пропуск тура: сначала самые слабые из тех, у кого его ещё не было; берём первого,
    // при котором остальных можно разбить на пары без повторов. Иначе — с повторами.
    const fresh = order.filter((u) => !hadBye.has(u)).reverse();
    const used = order.filter((u) => hadBye.has(u)).reverse();
    const candidates = [...fresh, ...used];
    let found = false;
    for (const c of candidates) {
      const rest = solve(order.filter((u) => u !== c), false);
      if (rest) {
        bye = c;
        pairs = rest;
        found = true;
        break;
      }
    }
    if (!found) {
      bye = candidates[0];
      pairs = solve(order.filter((u) => u !== bye), true) ?? [];
    }
  }

  const result: NewPairing[] = pairs.map(([a, b]) => {
    const ba = balance.get(a) ?? 0;
    const bb = balance.get(b) ?? 0;
    // меньше белых — получает белые; при равенстве белыми играет тот, кто выше в таблице
    const aWhite = ba < bb ? true : ba > bb ? false : order.indexOf(a) < order.indexOf(b);
    return aWhite ? { white: a, black: b } : { white: b, black: a };
  });
  if (bye) result.push({ white: bye, black: null });
  return result;
}

/** Сколько туров разумно играть при n участниках (чтобы пары почти не повторялись). */
export function suggestedRounds(n: number): number {
  if (n < 2) return 1;
  return Math.min(9, Math.max(1, Math.ceil(Math.log2(n))));
}
