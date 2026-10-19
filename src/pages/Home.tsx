import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomGame from '../components/CustomGame';
import LiveGames from '../components/LiveGames';
import OpenGames from '../components/OpenGames';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { createGame, seekGame } from '../lib/games';
import { CATEGORY_LABEL, TIME_CONTROLS, categoryOf, tcLabel } from '../lib/timeControls';
import type { TimeControl } from '../lib/timeControls';

export default function Home() {
  const { profile, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [friendTc, setFriendTc] = useState('300+0');

  async function play(tc: TimeControl) {
    if (!profile) return nav('/login');
    setBusy(tcLabel(tc));
    setError('');
    try {
      nav(`/game/${await seekGame(profile, tc)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  async function playFriend() {
    if (!profile) return nav('/login');
    const [b, i] = friendTc.split('+').map(Number);
    setBusy('friend');
    try {
      nav(`/game/${await createGame(profile, { base: b, inc: i }, { private: true })}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  const friendOptions = TIME_CONTROLS.flatMap((g) => g.items);

  return (
    <div className="home">
      <section className="card">
        <h2>Играть онлайн</h2>
        {!firebaseConfigured && (
          <p className="notice">
            Онлайн-игра пока не включена: не заданы ключи Firebase (см. README). Боты, анализ и головоломки
            работают без них.
          </p>
        )}
        {firebaseConfigured && !loading && !profile && (
          <p className="notice">
            <Link to="/login">Войдите</Link>, чтобы играть с людьми и получить рейтинг.
          </p>
        )}
        {profile && (
          <p className="muted">
            Ваши рейтинги: пуля {profile.ratings.bullet} · блиц {profile.ratings.blitz} · рапид{' '}
            {profile.ratings.rapid} · классика {profile.ratings.classical}
          </p>
        )}
        {TIME_CONTROLS.map((g) => (
          <div key={g.group} className="tc-group">
            <h4>{CATEGORY_LABEL[g.group]}</h4>
            <div className="tc-row">
              {g.items.map((tc) => (
                <button
                  key={tcLabel(tc)}
                  className="btn tc"
                  disabled={!firebaseConfigured || busy !== ''}
                  onClick={() => play(tc)}
                >
                  {busy === tcLabel(tc) ? 'Поиск…' : tcLabel(tc)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
      </section>

      <CustomGame />
      <OpenGames />
      <LiveGames />

      <section className="card">
        <h2>Игра с другом</h2>
        <p className="muted">Создайте партию и отправьте ссылку. Партия нерейтинговая.</p>
        <div className="row">
          <select value={friendTc} onChange={(e) => setFriendTc(e.target.value)}>
            {friendOptions.map((tc) => (
              <option key={tcLabel(tc)} value={`${tc.base}+${tc.inc}`}>
                {tcLabel(tc)} ({CATEGORY_LABEL[categoryOf(tc)]})
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!firebaseConfigured || busy !== ''} onClick={playFriend}>
            Создать ссылку
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Тренировка</h2>
        <div className="row wrap">
          <Link className="btn" to="/bots">🤖 Играть с ботом</Link>
          <Link className="btn" to="/puzzles">🧩 Головоломки</Link>
          <Link className="btn" to="/analysis">📈 Анализ партии</Link>
        </div>
      </section>
    </div>
  );
}
