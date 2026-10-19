import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { clocks } from '../lib/games';
import { isMyTurn, useMyDailyGames } from '../lib/lobby';
import { formatClock, tcLabel } from '../lib/timeControls';

/** Мои ежедневные партии: сверху те, где сейчас ваш ход. */
export default function MyDailyGames() {
  const { profile, clockOffset } = useAuth();
  const games = useMyDailyGames(profile?.uid);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!profile || games.length === 0) return null;

  const sorted = [...games].sort(
    (a, b) => Number(isMyTurn(b.g, profile.uid)) - Number(isMyTurn(a.g, profile.uid)),
  );

  return (
    <section className="card">
      <h2>📅 Мои ежедневные партии</h2>
      <table className="table">
        <tbody>
          {sorted.map(({ id, g }) => {
            const mine = isMyTurn(g, profile.uid);
            const opponent = g.white === profile.uid ? g.blackName : g.whiteName;
            const c = clocks(g, now + clockOffset);
            const left = g.moves.length % 2 === 0 ? c.white : c.black;
            return (
              <tr key={id} className={mine ? 'my-turn' : ''}>
                <td>
                  <b>{g.status === 'waiting' ? 'Ждём соперника' : opponent || '—'}</b>
                </td>
                <td>{tcLabel({ base: g.base, inc: g.inc })}</td>
                <td>
                  {g.status === 'waiting' ? (
                    <span className="muted">партия открыта</span>
                  ) : mine ? (
                    <b className="accent">Ваш ход · осталось {formatClock(left)}</b>
                  ) : (
                    <span className="muted">ход соперника · {formatClock(left)}</span>
                  )}
                </td>
                <td>
                  <Link className={`btn small ${mine ? 'primary' : ''}`} to={`/game/${id}`}>
                    Открыть
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
