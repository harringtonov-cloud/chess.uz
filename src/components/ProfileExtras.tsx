import { useMemo, useState } from 'react';
import {
  CATALOG,
  familyViews,
  isEarned,
  liveDayStreak,
  metricsOf,
  normalizeEarned,
  normalizeProgress,
  recentlyEarned,
} from '../lib/achievements';
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

      <AchievementsCard profile={profile} />
    </>
  );
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Серии, счётчики и достижения по уровням с прогрессом до следующего. */
function AchievementsCard({ profile }: { profile: Profile }) {
  const now = Date.now();
  const offset = -new Date().getTimezoneOffset();
  const m = metricsOf(profile);
  const progress = normalizeProgress(profile.progress);
  const have = normalizeEarned(profile.achievements);
  const views = familyViews(m);
  const earnedCount = CATALOG.filter((a) => isEarned(a, m)).length;
  const fresh = new Set(recentlyEarned(have, now));
  const days = liveDayStreak(progress, now, offset);

  const tiles: [string, string, string][] = [
    ['🔥', String(progress.winStreak), `серия побед (рекорд ${progress.bestWinStreak})`],
    ['📅', String(days), `дней подряд (рекорд ${progress.bestDayStreak})`],
    ['🧩', String(progress.puzzlesSolved), 'задач решено'],
    ['⚔️', String(progress.upsets), 'побед над сильнейшими'],
  ];

  return (
    <div className="card">
      <h3>
        Достижения{' '}
        <span className="muted">
          {earnedCount} из {CATALOG.length}
        </span>
      </h3>
      <div className="streak-tiles">
        {tiles.map(([icon, value, label]) => (
          <div key={label} className="rating-box">
            <span className="muted">
              {icon} {label}
            </span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <div className="ach-list">
        {views.map((v) => (
          <div key={v.family.metric} className="ach-row">
            <div className="ach-head">
              <span>
                {v.family.icon} <b>{v.family.name}</b>
              </span>
              <span className="muted">
                {v.done}/{v.total}
                {v.next !== null && ` · ${v.value} из ${v.next}`}
              </span>
            </div>
            <div className="ach-tiers">
              {CATALOG.filter((a) => a.metric === v.family.metric).map((a) => {
                const got = isEarned(a, m);
                const at = have[a.id];
                return (
                  <span
                    key={a.id}
                    className={`ach-tier${got ? ' earned' : ''}${fresh.has(a.id) ? ' fresh' : ''}`}
                    title={`${a.hint}${got && at ? ` — получено ${formatDate(at)}` : ''}`}
                  >
                    {a.threshold}
                  </span>
                );
              })}
            </div>
            {v.next !== null && (
              <div className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.round(v.progress * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
