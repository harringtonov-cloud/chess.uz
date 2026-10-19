import { Link } from 'react-router-dom';
import { firebaseConfigured } from '../firebase';
import { useLiveGames } from '../lib/lobby';
import { gameCategoryLabel, tcLabel } from '../lib/timeControls';

/** Партии, которые идут прямо сейчас: любую можно смотреть. Первая в списке — самая сильная. */
export default function LiveGames() {
  const games = useLiveGames();
  if (!firebaseConfigured) return null;

  return (
    <section className="card">
      <h2>Смотреть партии</h2>
      {games.length === 0 && <p className="muted">Сейчас публичных партий нет.</p>}
      <table className="table">
        <tbody>
          {games.slice(0, 10).map(({ id, g }, i) => (
            <tr key={id}>
              <td>
                {i === 0 && '⭐ '}
                <b>{g.whiteName}</b> <span className="muted">({g.whiteRating})</span> —{' '}
                <b>{g.blackName}</b> <span className="muted">({g.blackRating})</span>
              </td>
              <td>
                {tcLabel({ base: g.base, inc: g.inc })} <span className="muted">{gameCategoryLabel(g)}</span>
              </td>
              <td className="muted">ход {Math.floor(g.moves.length / 2) + 1}</td>
              <td>
                <Link className="btn small" to={`/game/${id}`}>Смотреть</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
