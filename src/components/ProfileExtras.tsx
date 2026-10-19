import { useMemo, useState } from 'react';
import { CATEGORY_LABEL } from '../lib/timeControls';
import type { Category, GameDoc, Profile } from '../lib/types';

interface Props {
  profile: Profile;
  games: { id: string; g: GameDoc }[];
}

const CATS: Category[] = ['bullet', 'blitz', 'rapid', 'classical'];

type Outcome = 'win' | 'draw' | 'loss';

function outcomeFor(g: GameDoc, uid: string): { color: 'white' | 'black'; outcome: Outcome } | null {
  if (g.status !== 'finished' || !g.result || g.reason === 'aborted') return null;
  const color = g.white === uid ? 'white' : g.black === uid ? 'black' : null;
  if (!color) return null;
  if (g.result === '1/2-1/2') return { color, outcome: 'draw' };
  const whiteWon = g.result === '1-0';
  return { color, outcome: whiteWon === (color === 'white') ? 'win' : 'loss' };
}

interface Badge {
  id: string;
  icon: string;
  title: string;
  hint: string;
  earned: boolean;
}

function badgesFor(p: Profile): Badge[] {
  const games = p.stats?.games ?? 0;
  const wins = p.stats?.wins ?? 0;
  const top = Math.max(p.ratings?.bullet ?? 0, p.ratings?.blitz ?? 0, p.ratings?.rapid ?? 0, p.ratings?.classical ?? 0);
  const puzzle = p.ratings?.puzzle ?? 0;
  return [
    { id: 'first', icon: '♟', title: 'Первая партия', hint: 'Сыграть одну рейтинговую партию', earned: games >= 1 },
    { id: 'win1', icon: '🏅', title: 'Первая победа', hint: 'Выиграть рейтинговую партию', earned: wins >= 1 },
    { id: 'g10', icon: '🔟', title: '10 партий', hint: 'Сыграть 10 рейтинговых партий', earned: games >= 10 },
    { id: 'g50', icon: '🎖', title: '50 партий', hint: 'Сыграть 50 рейтинговых партий', earned: games >= 50 },
    { id: 'w10', icon: '🔥', title: '10 побед', hint: 'Выиграть 10 партий', earned: wins >= 10 },
    { id: 'r1400', icon: '📈', title: 'Рейтинг 1400', hint: 'Достичь 1400 в любом контроле', earned: top >= 1400 },
    { id: 'r1600', icon: '🚀', title: 'Рейтинг 1600', hint: 'Достичь 1600 в любом контроле', earned: top >= 1600 },
    { id: 'r1800', icon: '👑', title: 'Рейтинг 1800', hint: 'Достичь 1800 в любом контроле', earned: top >= 1800 },
    { id: 'r2000', icon: '💎', title: 'Рейтинг 2000', hint: 'Достичь 2000 в любом контроле', earned: top >= 2000 },
    { id: 'p1400', icon: '🧩', title: 'Решатель задач', hint: 'Рейтинг задач 1400', earned: puzzle >= 1400 },
    { id: 'p1800', icon: '🧠', title: 'Мастер тактики', hint: 'Рейтинг задач 1800', earned: puzzle >= 1800 },
  ];
}

export default function ProfileExtras({ profile, games }: Props) {
  const [cat, setCat] = useState<Category>('blitz');
  const uid = profile.uid;

  const stats = useMemo(() => {
    const zero = () => ({ win: 0, draw: 0, loss: 0 });
    const s = { white: zero(), black: zero() };
    for (const { g } of games) {
      const o = outcomeFor(g, uid);
      if (o) s[o.color][o.outcome] += 1;
    }
    return s;
  }, [games, uid]);

  const series = useMemo(() => {
    const rated = games
      .map(({ g }) => g)
      .filter((g) => g.rated && g.category === cat && g.status === 'finished' && g.ratingDelta?.[uid] != null)
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
    if (rated.length === 0) return [];
    // Идём от текущего рейтинга назад, вычитая изменения за каждую партию
    const after: number[] = new Array(rated.length);
    let value = profile.ratings?.[cat] ?? 1200;
    for (let i = rated.length - 1; i >= 0; i--) {
      after[i] = value;
      value -= rated[i].ratingDelta[uid];
    }
    return [value, ...after];
  }, [games, cat, uid, profile.ratings]);

  const total = (x: { win: number; draw: number; loss: number }) => x.win + x.draw + x.loss;
  const all = total(stats.white) + total(stats.black);
  const wins = stats.white.win + stats.black.win;
  const badges = badgesFor(profile);
  const earned = badges.filter((b) => b.earned).length;

  const chart = (() => {
    if (series.length < 2) return null;
    const W = 400;
    const H = 120;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = Math.max(1, max - min);
    const pts = series.map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - 8 - ((v - min) / span) * (H - 16);
      return [x, y] as const;
    });
    return { W, H, min, max, line: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), last: pts[pts.length - 1] };
  })();

  return (
    <>
      <div className="card">
        <h3>График рейтинга</h3>
        <div className="row wrap">
          {CATS.map((c) => (
            <button key={c} className={`btn small ${cat === c ? 'primary' : ''}`} onClick={() => setCat(c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        {chart ? (
          <>
            <svg className="graph rating-graph" viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none">
              <polyline points={chart.line} className="graph-line" />
              <circle cx={chart.last[0]} cy={chart.last[1]} r="3" className="graph-dot" />
            </svg>
            <div className="muted">
              Минимум {chart.min} · максимум {chart.max} · сейчас {series[series.length - 1]} (по последним партиям)
            </div>
          </>
        ) : (
          <p className="muted">Пока мало рейтинговых партий в этом контроле для графика.</p>
        )}
      </div>

      <div className="card">
        <h3>Статистика</h3>
        {all === 0 ? (
          <p className="muted">Нет завершённых партий.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Победы</th>
                <th>Ничьи</th>
                <th>Поражения</th>
              </tr>
            </thead>
            <tbody>
              {(['white', 'black'] as const).map((c) => (
                <tr key={c}>
                  <td>{c === 'white' ? '♔ Белыми' : '♚ Чёрными'}</td>
                  <td>{stats[c].win}</td>
                  <td>{stats[c].draw}</td>
                  <td>{stats[c].loss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {all > 0 && (
          <p className="muted">
            Процент побед по последним {all} партиям: <b>{Math.round((wins / all) * 100)}%</b>
          </p>
        )}
      </div>

      <div className="card">
        <h3>
          Достижения <span className="muted">{earned} из {badges.length}</span>
        </h3>
        <div className="badges">
          {badges.map((b) => (
            <div key={b.id} className={`badge-item ${b.earned ? 'earned' : ''}`} title={b.hint}>
              <span className="badge-icon">{b.icon}</span>
              <span>{b.title}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
