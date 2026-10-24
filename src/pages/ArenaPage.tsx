import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import {
  joinArena,
  setArenaWaiting,
  touchArena,
  tryPair,
  useArenaPlayers,
  useArenaResults,
} from '../lib/arena';
import {
  arenaPhase,
  arenaStandings,
  clockText,
  isAvailable,
  pickOpponent,
  recentOpponents,
} from '../lib/arenaLogic';
import { CATEGORY_LABEL, tcLabel } from '../lib/timeControls';
import { useTournament } from '../lib/tournaments';

const PHASE_LABEL = { upcoming: 'скоро начнётся', running: 'идёт', finished: 'завершена' } as const;

export default function ArenaPage() {
  const { id = '' } = useParams();
  const { profile, user, loading: authLoading, clockOffset } = useAuth();
  const nav = useNavigate();
  const t = useTournament(id);
  const players = useArenaPlayers(id);
  const results = useArenaResults(id);
  const [now, setNow] = useState(Date.now() + clockOffset);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pairing = useRef(false);
  const prevGame = useRef<string | null | undefined>(undefined);
  // свежие данные для таймера подбора, чтобы не пересоздавать его на каждое обновление
  const live = useRef({ players, results, t });
  live.current = { players, results, t };

  const me = user ? players.find((p) => p.uid === user.uid) : undefined;
  const phase = t && t.startsAt !== undefined && t.endsAt !== undefined ? arenaPhase(t.startsAt, t.endsAt, now) : null;
  const running = phase === 'running';

  // часы на странице
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffset), 1000);
    return () => clearInterval(timer);
  }, [clockOffset]);

  // «я здесь»: без отметки игрок через 30 секунд пропадает из подбора
  useEffect(() => {
    if (!user || !me || !running) return;
    touchArena(id, user.uid).catch(() => undefined);
    const timer = setInterval(() => touchArena(id, user.uid).catch(() => undefined), 10_000);
    return () => clearInterval(timer);
  }, [id, user?.uid, Boolean(me), running]);

  // подбор пар: каждый ожидающий игрок ищет себе соперника; пару создаёт тот, у кого меньше uid
  useEffect(() => {
    if (!user || !me || !running) return;
    const uid = user.uid;
    const timer = setInterval(() => {
      const { players: list, results: res, t: tour } = live.current;
      const self = list.find((p) => p.uid === uid);
      if (!tour || !self || pairing.current) return;
      // seenAt пишется по часам игроков, поэтому и «свежесть» сверяем по местному времени
      const at = Date.now();
      if (tour.endsAt !== undefined && at + clockOffset >= tour.endsAt) return;
      if (!isAvailable(self, at)) return;
      const oppUid = pickOpponent(self, list, recentOpponents(res, uid), at);
      if (!oppUid) return;
      const opp = list.find((p) => p.uid === oppUid);
      if (!opp) return;
      // если соперник выберет не меня, пару создаю я сам, иначе её создаст игрок с меньшим uid
      if (uid > oppUid && pickOpponent(opp, list, recentOpponents(res, oppUid), at) === uid) return;
      pairing.current = true;
      tryPair(tour, uid, oppUid, res)
        .catch(() => undefined)
        .finally(() => {
          pairing.current = false;
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [user?.uid, Boolean(me), running, clockOffset]);

  // нашлась пара — идём в партию (но не прыгаем, если игрок открыл страницу уже во время партии)
  useEffect(() => {
    if (!me) return;
    if (prevGame.current === undefined) {
      prevGame.current = me.gameId;
      return;
    }
    if (prevGame.current === null && me.gameId) nav(`/game/${me.gameId}`);
    prevGame.current = me.gameId;
  }, [me?.gameId]);

  if (!firebaseConfigured) return <div className="card">Арены доступны после подключения Firebase.</div>;
  if (t === undefined) return <div className="card">Загрузка…</div>;
  if (t === null || t.type !== 'arena' || !phase || t.startsAt === undefined || t.endsAt === undefined) {
    return (
      <div className="card">
        Арена не найдена. <Link to="/tournaments">Ко всем турнирам</Link>
      </div>
    );
  }
  const arena = t;
  const table = arenaStandings(players, results);
  const myRow = user ? table.find((r) => r.uid === user.uid) : undefined;
  const leftMs = phase === 'upcoming' ? t.startsAt - now : t.endsAt - now;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="club-page">
      <section className="card">
        <div className="row spread">
          <h2>⚔ {arena.name}</h2>
          <Link className="btn small ghost" to="/tournaments">
            ← Все турниры
          </Link>
        </div>
        {arena.description && <p>{arena.description}</p>}
        <p className="muted">
          Арена {PHASE_LABEL[phase]} · {tcLabel({ base: arena.base, inc: arena.inc })} ({CATEGORY_LABEL[arena.category]}) ·
          участников {players.length} · организатор {arena.organizerName}
        </p>
        {phase !== 'finished' && (
          <p className="arena-timer">
            {phase === 'upcoming' ? 'До начала: ' : 'До конца: '}
            <b>{clockText(leftMs)}</b>
          </p>
        )}
        <p className="muted">
          Играйте сколько хотите: после каждой партии вас сразу ставят в пару заново. Победа — 2 очка, ничья — 1. Две
          победы подряд включают серию 🔥: очки удваиваются, пока вы не сделаете ничью или не проиграете.
        </p>

        <div className="row wrap">
          {!authLoading && !user && (
            <span className="muted">
              <Link to="/login">Войдите</Link>, чтобы участвовать.
            </span>
          )}
          {profile && !me && phase !== 'finished' && (
            <button className="btn primary" disabled={busy} onClick={() => run(() => joinArena(arena, profile))}>
              Участвовать
            </button>
          )}
          {user && me && phase !== 'finished' && !me.gameId && (
            me.waiting ? (
              <button className="btn" disabled={busy} onClick={() => run(() => setArenaWaiting(id, user.uid, false))}>
                ⏸ Пауза
              </button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => run(() => setArenaWaiting(id, user.uid, true))}>
                ▶ Играть
              </button>
            )
          )}
          {me?.gameId && (
            <Link className="btn primary" to={`/game/${me.gameId}`}>
              ↩ Вернуться в партию
            </Link>
          )}
          {me && running && me.waiting && !me.gameId && <span className="muted">Ищем соперника…</span>}
          {me && running && me.paused && <span className="muted">Вы на паузе — нажмите «Играть».</span>}
        </div>
        {myRow && (
          <p className="muted">
            Ваше место: <b>{myRow.rank}</b> · очки: <b>{myRow.score}</b>
            {myRow.onFire ? ' 🔥' : ''} · партий: {myRow.games}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {phase === 'finished' && table.length > 0 && table[0].games > 0 && (
        <section className="card">
          <h3>Победители</h3>
          <div className="row wrap">
            {table.slice(0, 3).map((r, i) => (
              <span key={r.uid}>
                {['🥇', '🥈', '🥉'][i]} <Link to={`/profile/${r.uid}`}>{r.name}</Link> — {r.score}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h3>{phase === 'finished' ? 'Итоговая таблица' : 'Таблица'}</h3>
        {table.length === 0 && <p className="muted">Пока никто не участвует.</p>}
        {table.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Рейтинг</th>
                <th>Очки</th>
                <th title="Победы / ничьи / поражения">П/Н/П</th>
                <th>Партий</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.uid} className={user && r.uid === user.uid ? 'me' : undefined}>
                  <td>{r.rank}</td>
                  <td>
                    <Link to={`/profile/${r.uid}`}>{r.name}</Link>
                    {r.onFire && ' 🔥'}
                    {r.playing && phase === 'running' && <span title="играет сейчас"> ●</span>}
                  </td>
                  <td>{r.rating}</td>
                  <td>
                    <b>{r.score}</b>
                  </td>
                  <td>
                    {r.wins}/{r.draws}/{r.losses}
                  </td>
                  <td>{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
