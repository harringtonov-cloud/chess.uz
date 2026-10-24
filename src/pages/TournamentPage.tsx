import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { standings } from '../lib/swiss';
import type { PairResult } from '../lib/swiss';
import {
  STATUS_LABEL,
  createPairingGame,
  finishTournament,
  joinTournament,
  leaveTournament,
  recordPairingResult,
  setPairingResult,
  startRound,
  useTournament,
  useTournamentPairings,
  useTournamentPlayers,
  watchFinishedGame,
} from '../lib/tournaments';
import type { Pairing, Tournament } from '../lib/tournaments';
import { CATEGORY_LABEL, tcLabel } from '../lib/timeControls';
import type { Profile } from '../lib/types';

function resultLabel(r: PairResult | null): string {
  if (r === null) return 'идёт';
  if (r === 'bye') return 'пропуск тура (+1)';
  return r === '1/2-1/2' ? '½ – ½' : r === '1-0' ? '1 – 0' : '0 – 1';
}

function PairingRow({
  t,
  p,
  me,
  organizer,
  onError,
}: {
  t: Tournament;
  p: Pairing;
  me: Profile | null;
  organizer: boolean;
  onError: (m: string) => void;
}) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const mine = Boolean(me && (me.uid === p.white || me.uid === p.black));

  // Когда партия закончилась, участник (или организатор) переносит результат в таблицу
  useEffect(() => {
    if (!p.gameId || p.result !== null || !(mine || organizer)) return;
    return watchFinishedGame(p.gameId, (result) => {
      recordPairingResult(t.id, p.id, result).catch(() => undefined);
    });
  }, [p.gameId, p.result, p.id, t.id, mine, organizer]);

  async function play() {
    if (!me) return;
    setBusy(true);
    try {
      nav(`/game/${await createPairingGame(t, p, me)}`);
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="row spread pairing-row">
      <span>
        <span className="muted">Доска {p.board}:</span>{' '}
        <Link to={`/profile/${p.white}`}>{p.whiteName}</Link>
        {p.black ? (
          <>
            {' — '}
            <Link to={`/profile/${p.black}`}>{p.blackName}</Link>
          </>
        ) : (
          <span className="muted"> — пропуск тура</span>
        )}
      </span>
      <span className="row">
        <b>{resultLabel(p.result)}</b>
        {p.black && p.result === null && p.gameId && (
          <Link className="btn small primary" to={`/game/${p.gameId}`}>
            {mine ? 'Играть' : 'Смотреть'}
          </Link>
        )}
        {p.black && p.result === null && !p.gameId && me?.uid === p.white && t.status === 'running' && (
          <button className="btn small primary" disabled={busy} onClick={play}>
            {busy ? 'Создаю…' : 'Начать партию'}
          </button>
        )}
        {p.black && p.result === null && !p.gameId && me?.uid === p.black && (
          <span className="muted">ждём, пока белые начнут партию</span>
        )}
        {organizer && p.black && p.result === null && (
          <select
            className="result-select"
            value=""
            title="Проставить результат вручную (неявка, зависшая партия)"
            onChange={(e) => {
              const v = e.target.value as PairResult | '';
              if (v && window.confirm(`Записать результат ${resultLabel(v)} без игры?`)) {
                setPairingResult(t.id, p.id, v).catch((err: Error) => onError(err.message));
              }
            }}
          >
            <option value="">результат…</option>
            <option value="1-0">1 – 0 (белые)</option>
            <option value="1/2-1/2">½ – ½</option>
            <option value="0-1">0 – 1 (чёрные)</option>
          </select>
        )}
      </span>
    </div>
  );
}

export default function TournamentPage() {
  const { id = '' } = useParams();
  const { profile, user, loading: authLoading } = useAuth();
  const t = useTournament(id);
  const players = useTournamentPlayers(id);
  const pairings = useTournamentPairings(id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!firebaseConfigured) return <div className="card">Турниры доступны после подключения Firebase.</div>;
  if (t === undefined) return <div className="card">Загрузка…</div>;
  if (t === null) {
    return (
      <div className="card">
        Турнир не найден. <Link to="/tournaments">Ко всем турнирам</Link>
      </div>
    );
  }
  if (t.type === 'arena') return <Navigate to={`/arena/${t.id}`} replace />;
  const tour = t;
  const organizer = Boolean(user && user.uid === tour.organizerId);
  const joined = Boolean(user && players.some((p) => p.uid === user.uid));
  const table = standings(players, pairings);
  const current = pairings.filter((p) => p.round === tour.currentRound);
  const roundDone = current.length > 0 && current.every((p) => p.result !== null);
  const rounds = [...new Set(pairings.map((p) => p.round))].sort((a, b) => b - a);

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
          <h2>{tour.name}</h2>
          <Link className="btn small ghost" to="/tournaments">
            ← Все турниры
          </Link>
        </div>
        {tour.description && <p>{tour.description}</p>}
        <p className="muted">
          {STATUS_LABEL[tour.status]} · {tcLabel({ base: tour.base, inc: tour.inc })} ({CATEGORY_LABEL[tour.category]}) ·
          швейцарская система, тур {tour.currentRound} из {tour.rounds} · участников {players.length} из{' '}
          {tour.maxPlayers} · организатор {tour.organizerName}
        </p>

        <div className="row wrap">
          {!authLoading && !user && (
            <span className="muted">
              <Link to="/login">Войдите</Link>, чтобы участвовать.
            </span>
          )}
          {profile && tour.status === 'registration' && !joined && (
            <button
              className="btn primary"
              disabled={busy || players.length >= tour.maxPlayers}
              onClick={() => run(() => joinTournament(tour, profile))}
            >
              {players.length >= tour.maxPlayers ? 'Мест нет' : 'Записаться'}
            </button>
          )}
          {user && tour.status === 'registration' && joined && (
            <button className="btn" disabled={busy} onClick={() => run(() => leaveTournament(tour.id, user.uid))}>
              Отказаться от участия
            </button>
          )}
          {organizer && tour.status === 'registration' && (
            <button
              className="btn primary"
              disabled={busy || players.length < 2}
              title={players.length < 2 ? 'Нужно минимум 2 участника' : ''}
              onClick={() => run(() => startRound(tour, players, pairings))}
            >
              ▶ Начать турнир
            </button>
          )}
          {organizer && tour.status === 'running' && roundDone && tour.currentRound < tour.rounds && (
            <button className="btn primary" disabled={busy} onClick={() => run(() => startRound(tour, players, pairings))}>
              ▶ Тур {tour.currentRound + 1}
            </button>
          )}
          {organizer && tour.status === 'running' && roundDone && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => window.confirm('Завершить турнир?') && run(() => finishTournament(tour.id))}
            >
              Завершить турнир
            </button>
          )}
        </div>
        {organizer && tour.status === 'running' && !roundDone && (
          <p className="muted">Следующий тур можно начать, когда во всех парах текущего тура будет результат.</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h3>{tour.status === 'finished' ? 'Итоговая таблица' : 'Таблица'}</h3>
        {players.length === 0 && <p className="muted">Пока никто не записался.</p>}
        {players.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Рейтинг</th>
                <th>Очки</th>
                <th title="Сумма очков соперников">Бухг.</th>
                <th>Партий</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.uid}>
                  <td>{r.rank}</td>
                  <td>
                    <Link to={`/profile/${r.uid}`}>{r.name}</Link>
                  </td>
                  <td>{r.rating}</td>
                  <td>
                    <b>{r.score}</b>
                  </td>
                  <td>{r.buchholz}</td>
                  <td>{r.played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rounds.map((r) => (
        <section key={r} className="card">
          <h3>Тур {r}</h3>
          {pairings
            .filter((p) => p.round === r)
            .map((p) => (
              <PairingRow key={p.id} t={tour} p={p} me={profile} organizer={organizer} onError={setError} />
            ))}
        </section>
      ))}
    </div>
  );
}
