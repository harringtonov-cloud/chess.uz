// Серверная функция Vercel: прокси к explorer Lichess (статистика дебютов).
//
// GET /api/explorer?db=lichess|masters&fen=<FEN>[&speeds=blitz,rapid][&ratings=1600,1800]
//
// Анонимные запросы к explorer Lichess теперь отклоняются (401), нужен личный токен Lichess.
// Токен хранится только здесь, в переменной окружения (Vercel → Project Settings → Environment Variables):
//   LICHESS_TOKEN — личный токен без прав (lichess.org/account/oauth/token, ни одной галочки), см. README
//
// Проверка параметров продублирована из src/lib/explorerLogic.ts (функции Vercel в режиме ESM
// не подхватывают импорты без расширения); tests/explorer.test.mjs проверяет, что обе копии ведут себя одинаково.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const HOST = 'https://explorer.lichess.ovh';
const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];
const RATINGS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
const FEN_RE = /^[1-8pnbrqkPNBRQK/]{15,90} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/;

export function explorerUrl(q: { db?: string | null; fen?: string | null; speeds?: string | null; ratings?: string | null }): string | null {
  if (q.db !== 'lichess' && q.db !== 'masters') return null;
  if (!q.fen || !FEN_RE.test(q.fen)) return null;
  const p = new URLSearchParams({ variant: 'standard', fen: q.fen, moves: '12', topGames: '0', recentGames: '0' });
  if (q.db === 'lichess') {
    const speeds = (q.speeds ?? 'blitz,rapid,classical').split(',').filter(Boolean);
    if (speeds.length === 0 || !speeds.every((s) => SPEEDS.includes(s))) return null;
    const ratings = (q.ratings ?? '1600,1800,2000').split(',').filter(Boolean);
    if (ratings.length === 0 || !ratings.every((r) => RATINGS.includes(Number(r)) && /^\d+$/.test(r))) return null;
    p.set('speeds', speeds.join(','));
    p.set('ratings', ratings.join(','));
  }
  return `${HOST}/${q.db}?${p.toString()}`;
}

const one = (v: string | string[] | undefined): string | null => (typeof v === 'string' ? v : null);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method' });
    return;
  }
  const token = process.env.LICHESS_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }
  const url = explorerUrl({
    db: one(req.query.db),
    fen: one(req.query.fen),
    speeds: one(req.query.speeds),
    ratings: one(req.query.ratings),
  });
  if (!url) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const up = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'chess.uz' },
      signal: ctl.signal,
    });
    if (up.status === 401 || up.status === 403) {
      res.status(502).json({ error: 'upstream_auth' });
      return;
    }
    if (up.status === 429) {
      res.status(503).json({ error: 'rate_limited' });
      return;
    }
    if (!up.ok) {
      res.status(502).json({ error: 'upstream', status: up.status });
      return;
    }
    const data = await up.json();
    // Статистика меняется медленно: час держим в кэше Vercel, чтобы не упираться в лимиты Lichess.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch {
    res.status(504).json({ error: 'timeout' });
  } finally {
    clearTimeout(timer);
  }
}
