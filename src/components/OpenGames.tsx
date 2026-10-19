import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { cancelWaiting, joinGame } from '../lib/games';
import { useOpenGames } from '../lib/lobby';
import { gameCategoryLabel, tcLabel } from '../lib/timeControls';

/** Список открытых партий: любую можно принять одним нажатием. */
export default function OpenGames() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const games = useOpenGames();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  if (!firebaseConfigured) return null;

  async function join(id: string) {
    if (!profile) return nav('/login');
    setBusy(id);
    setError('');
    try {
      await joinGame(id, profile);
      nav(`/game/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  return (
    <section className="card">
      <h2>Открытые партии</h2>
      {games.length === 0 && <p className="muted">Сейчас никто не ждёт соперника. Создайте свою партию!</p>}
      <table className="table">
        <tbody>
          {games.map(({ id, g }) => {
            const mine = profile ? g.participants.includes(profile.uid) : false;
            const creator = g.white ? g.whiteName : g.blackName;
            const rating = g.white ? g.whiteRating : g.blackRating;
            const youPlay = g.white ? 'чёрными' : 'белыми';
            return (
              <tr key={id}>
                <td>
                  <b>{creator}</b> <span className="muted">({rating})</span>
                </td>
                <td>
                  {tcLabel({ base: g.base, inc: g.inc })}{' '}
                  <span className="muted">{gameCategoryLabel(g)}</span>
                </td>
                <td>{g.rated ? 'рейтинговая' : 'обычная'}</td>
                <td className="muted">{mine ? '' : `вы ${youPlay}`}</td>
                <td>
                  {mine ? (
                    <>
                      <button className="btn small" onClick={() => nav(`/game/${id}`)}>Открыть</button>{' '}
                      <button className="btn small" onClick={() => cancelWaiting(id).catch(() => undefined)}>Отмена</button>
                    </>
                  ) : (
                    <button className="btn small primary" disabled={busy !== ''} onClick={() => join(id)}>
                      {busy === id ? '…' : 'Играть'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
