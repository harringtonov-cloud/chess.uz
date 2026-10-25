import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { aggregateOwn, parseLichess } from './explorerLogic';
import type { OwnGame, StatTable } from './explorerLogic';

export type StatSource = 'lichess' | 'masters' | 'own';

/** Сколько завершённых партий chess.uz читаем для статистики. */
const OWN_READ = 500;
const OWN_TTL_MS = 5 * 60 * 1000;

let ownCache: { at: number; games: OwnGame[] } | null = null;

async function ownGames(): Promise<OwnGame[]> {
  if (ownCache && Date.now() - ownCache.at < OWN_TTL_MS) return ownCache.games;
  // Один фильтр по равенству: составной индекс Firestore не нужен.
  const snap = await getDocs(query(collection(db, 'games'), where('status', '==', 'finished'), limit(OWN_READ)));
  const games = snap.docs.map((d) => {
    const g = d.data() as { moves?: string[]; result?: string | null; reason?: string | null };
    return { moves: g.moves ?? [], result: g.result ?? null, reason: g.reason ?? null };
  });
  ownCache = { at: Date.now(), games };
  return games;
}

/** Статистика по партиям chess.uz для позиции после этих ходов (SAN). */
export async function fetchOwnStats(moves: string[]): Promise<StatTable> {
  return aggregateOwn(await ownGames(), moves);
}

/**
 * Статистика из explorer Lichess через нашу серверную функцию.
 * Бросает Error с кодом: not_configured (нет токена на сервере), upstream_auth, rate_limited, timeout, offline, bad_data.
 */
export async function fetchLichessStats(fen: string, source: 'lichess' | 'masters'): Promise<StatTable> {
  let res: Response;
  try {
    res = await fetch(`/api/explorer?db=${source}&fen=${encodeURIComponent(fen)}`);
  } catch {
    throw new Error('offline');
  }
  if (!res.ok) {
    let code = 'upstream';
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      /* ответ не JSON: например, на сайте нет серверных функций */
      if (res.status === 404) code = 'not_configured';
    }
    throw new Error(code);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('not_configured');
  }
  const table = parseLichess(data);
  if (!table) throw new Error('bad_data');
  return table;
}

export const ERROR_TEXT: Record<string, string> = {
  not_configured: 'Статистика Lichess пока не подключена (на сервере нет токена).',
  upstream_auth: 'Lichess отклонил токен сервера.',
  rate_limited: 'Lichess просит подождать, попробуйте через минуту.',
  timeout: 'Lichess не ответил вовремя.',
  offline: 'Нет связи с сервером.',
};
