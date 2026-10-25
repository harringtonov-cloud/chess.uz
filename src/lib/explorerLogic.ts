// Чистая логика статистики дебютов: без Firebase и React, покрыта тестами (tests/explorer.test.mjs).

export interface StatRow {
  san: string;
  uci?: string;
  white: number;
  draws: number;
  black: number;
  total: number;
  whitePct: number;
  drawPct: number;
  blackPct: number;
  /** Средний рейтинг игроков, если источник его отдаёт */
  rating?: number;
}

export interface StatTable {
  total: number;
  white: number;
  draws: number;
  black: number;
  whitePct: number;
  drawPct: number;
  blackPct: number;
  rows: StatRow[];
  opening: string | null;
}

/** Партия для подсчёта по базе chess.uz: ходы в SAN и результат. */
export interface OwnGame {
  moves: string[];
  result: string | null;
  reason?: string | null;
}

/** Сколько ходов показываем в таблице. */
export const MAX_ROWS = 12;

/**
 * Доли побед белых, ничьих и побед чёрных в целых процентах, сумма всегда 100
 * (метод наибольшего остатка). Если партий нет, все нули.
 */
export function shares(white: number, draws: number, black: number): { whitePct: number; drawPct: number; blackPct: number } {
  const total = white + draws + black;
  if (total <= 0) return { whitePct: 0, drawPct: 0, blackPct: 0 };
  const raw = [white, draws, black].map((v) => (v / total) * 100);
  const base = raw.map(Math.floor);
  let left = 100 - base.reduce((a, b) => a + b, 0);
  const order = [0, 1, 2].sort((a, b) => raw[b] - base[b] - (raw[a] - base[a]) || a - b);
  for (const i of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return { whitePct: base[0], drawPct: base[1], blackPct: base[2] };
}

function row(san: string, white: number, draws: number, black: number, uci?: string, rating?: number): StatRow {
  const total = white + draws + black;
  const r: StatRow = { san, white, draws, black, total, ...shares(white, draws, black) };
  if (uci) r.uci = uci;
  if (rating !== undefined) r.rating = rating;
  return r;
}

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

function finish(white: number, draws: number, black: number, rows: StatRow[], opening: string | null): StatTable {
  // при равном числе партий порядок по записи хода (без учёта локали, чтобы он был одинаковым везде)
  rows.sort((a, b) => b.total - a.total || (a.san < b.san ? -1 : a.san > b.san ? 1 : 0));
  return {
    total: white + draws + black,
    white,
    draws,
    black,
    ...shares(white, draws, black),
    rows: rows.slice(0, MAX_ROWS),
    opening,
  };
}

/** Разбирает ответ explorer Lichess. Возвращает null, если данные не похожи на ответ. */
export function parseLichess(raw: unknown): StatTable | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const white = count(o.white);
  const draws = count(o.draws);
  const black = count(o.black);
  if (white === null || draws === null || black === null || !Array.isArray(o.moves)) return null;
  const rows: StatRow[] = [];
  for (const m of o.moves) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    const w = count(x.white);
    const d = count(x.draws);
    const b = count(x.black);
    if (typeof x.san !== 'string' || typeof x.uci !== 'string' || w === null || d === null || b === null) continue;
    const rating = count(x.averageRating) ?? count(x.averageOpponentRating) ?? undefined;
    rows.push(row(x.san, w, d, b, x.uci, rating));
  }
  const op = o.opening && typeof o.opening === 'object' ? (o.opening as Record<string, unknown>).name : null;
  return finish(white, draws, black, rows, typeof op === 'string' ? op : null);
}

/**
 * Статистика по партиям chess.uz: считаем завершённые партии, начавшиеся с этих ходов.
 * Сравнение по записи ходов (SAN), поэтому перестановки ходов считаются разными позициями.
 */
export function aggregateOwn(games: OwnGame[], prefix: string[]): StatTable {
  let white = 0;
  let draws = 0;
  let black = 0;
  const next = new Map<string, [number, number, number]>();
  for (const g of games) {
    if (g.reason === 'aborted') continue;
    const idx = g.result === '1-0' ? 0 : g.result === '1/2-1/2' ? 1 : g.result === '0-1' ? 2 : null;
    if (idx === null || g.moves.length < prefix.length) continue;
    if (!prefix.every((m, i) => g.moves[i] === m)) continue;
    if (idx === 0) white += 1;
    else if (idx === 1) draws += 1;
    else black += 1;
    if (g.moves.length > prefix.length) {
      const key = g.moves[prefix.length];
      const cur = next.get(key) ?? [0, 0, 0];
      cur[idx] += 1;
      next.set(key, cur);
    }
  }
  const rows = [...next.entries()].map(([san, [w, d, b]]) => row(san, w, d, b));
  return finish(white, draws, black, rows, null);
}

// ---------- Запрос к explorer Lichess (его строит серверная функция api/explorer.ts) ----------

export const EXPLORER_HOST = 'https://explorer.lichess.ovh';
export const EXPLORER_SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];
export const EXPLORER_RATINGS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];

const FEN_RE = /^[1-8pnbrqkPNBRQK/]{15,90} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/;

export interface ExplorerQuery {
  db?: string | null;
  fen?: string | null;
  speeds?: string | null;
  ratings?: string | null;
}

/**
 * Строит адрес запроса к explorer Lichess или возвращает null, если параметры не прошли проверку.
 * Серверная функция пропускает только такие запросы, чтобы её нельзя было использовать для чего-то другого.
 */
export function explorerUrl(q: ExplorerQuery): string | null {
  if (q.db !== 'lichess' && q.db !== 'masters') return null;
  if (!q.fen || !FEN_RE.test(q.fen)) return null;
  const p = new URLSearchParams({ variant: 'standard', fen: q.fen, moves: String(MAX_ROWS), topGames: '0', recentGames: '0' });
  if (q.db === 'lichess') {
    const speeds = (q.speeds ?? 'blitz,rapid,classical').split(',').filter(Boolean);
    if (speeds.length === 0 || !speeds.every((s) => EXPLORER_SPEEDS.includes(s))) return null;
    const ratings = (q.ratings ?? '1600,1800,2000').split(',').filter(Boolean);
    if (ratings.length === 0 || !ratings.every((r) => EXPLORER_RATINGS.includes(Number(r)) && /^\d+$/.test(r))) return null;
    p.set('speeds', speeds.join(','));
    p.set('ratings', ratings.join(','));
  }
  return `${EXPLORER_HOST}/${q.db}?${p.toString()}`;
}
