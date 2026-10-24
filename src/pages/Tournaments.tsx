import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { createArena } from '../lib/arena';
import { arenaPhase } from '../lib/arenaLogic';
import { STATUS_LABEL, createTournament, useTournaments } from '../lib/tournaments';
import { CATEGORY_LABEL, TIME_CONTROLS, tcLabel } from '../lib/timeControls';

const FLAT_TC = TIME_CONTROLS.flatMap((g) => g.items);

export default function Tournaments() {
  const { profile, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const { tournaments, loading, error } = useTournaments();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tc, setTc] = useState('300+0');
  const [rounds, setRounds] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [kind, setKind] = useState<'swiss' | 'arena'>('swiss');
  const [startIn, setStartIn] = useState(10); // минут до начала арены
  const [duration, setDuration] = useState(60); // длительность арены, минут
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!firebaseConfigured) return <div className="card">Турниры доступны после подключения Firebase.</div>;

  async function create() {
    if (!profile) return nav('/login');
    const [base, inc] = tc.split('+').map(Number);
    setBusy(true);
    setFormError('');
    try {
      if (kind === 'arena') {
        const aid = await createArena(profile, {
          name,
          description,
          base,
          inc,
          startsAt: Date.now() + startIn * 60_000,
          durationMin: duration,
        });
        nav(`/arena/${aid}`);
        return;
      }
      const id = await createTournament(profile, {
        name,
        description,
        base,
        inc,
        rounds: Math.round(rounds),
        maxPlayers: Math.round(maxPlayers),
      });
      nav(`/tournament/${id}`);
    } catch (e) {
      setFormError((e as Error).message);
      setBusy(false);
    }
  }

  const order = { registration: 0, running: 1, finished: 2 } as const;
  const sorted = [...tournaments].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="clubs-page">
      <section className="card">
        <div className="row spread">
          <h2>Турниры</h2>
          {!showForm && (
            <button className="btn primary" onClick={() => (profile ? setShowForm(true) : nav('/login'))}>
              + Создать турнир
            </button>
          )}
        </div>
        <p className="muted">
          Швейцарская система: каждый тур участников разбивают на пары по набранным очкам. Победа — 1 очко, ничья —
          ½, пропуск тура при нечётном числе игроков — 1 очко.
        </p>
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input
              placeholder="Название турнира (3–50 символов)"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              placeholder="Описание (необязательно)"
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="row wrap">
              <label className="muted">Вид турнира</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as 'swiss' | 'arena')}>
                <option value="swiss">Швейцарская система (по турам)</option>
                <option value="arena">Арена (играйте сколько хотите за время)</option>
              </select>
            </div>
            <div className="row wrap">
              <label className="muted">Контроль времени</label>
              <select value={tc} onChange={(e) => setTc(e.target.value)}>
                {FLAT_TC.map((t) => (
                  <option key={tcLabel(t)} value={`${t.base}+${t.inc}`}>
                    {tcLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            {kind === 'arena' ? (
              <div className="row wrap">
                <label className="muted">Начало через</label>
                <select value={startIn} onChange={(e) => setStartIn(Number(e.target.value))}>
                  {[1, 5, 10, 30, 60, 180].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} мин` : `${m / 60} ч`}</option>
                  ))}
                </select>
                <label className="muted">Длительность</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} мин` : `${m / 60} ч`}</option>
                  ))}
                </select>
              </div>
            ) : (
            <div className="row wrap">
              <label className="muted">Туров (1–9)</label>
              <input
                type="number"
                min={1}
                max={9}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                required
              />
              <label className="muted">Максимум игроков (2–64)</label>
              <input
                type="number"
                min={2}
                max={64}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                required
              />
            </div>
            )}
            <div className="row">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Создаю…' : 'Создать'}
              </button>
              <button className="btn" type="button" onClick={() => setShowForm(false)}>
                Отмена
              </button>
            </div>
            {formError && <p className="error">{formError}</p>}
          </form>
        )}
        {!authLoading && !profile && (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы создавать турниры и участвовать.
          </p>
        )}
      </section>

      <section className="card">
        {loading && <p className="muted">Загрузка…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && sorted.length === 0 && <p className="muted">Турниров пока нет — создайте первый.</p>}
        {sorted.map((t) => {
          const arena = t.type === 'arena' && t.startsAt !== undefined && t.endsAt !== undefined;
          const link = arena ? `/arena/${t.id}` : `/tournament/${t.id}`;
          const phase = arena ? arenaPhase(t.startsAt as number, t.endsAt as number, Date.now()) : null;
          return (
          <div key={t.id} className="club-row">
            <div>
              <Link to={link}>
                <b>{arena ? '⚔ ' : ''}{t.name}</b>
              </Link>{' '}
              <span className="muted">
                {arena
                  ? `арена · ${phase === 'upcoming' ? 'скоро начнётся' : phase === 'running' ? 'идёт' : 'завершена'}`
                  : STATUS_LABEL[t.status]} · {tcLabel({ base: t.base, inc: t.inc })} ({CATEGORY_LABEL[t.category]})
                {arena ? '' : ` · ${t.rounds} тур.`} · организатор {t.organizerName}
              </span>
              {t.description && <div className="muted club-desc">{t.description}</div>}
            </div>
            <Link className="btn small" to={link}>
              Открыть
            </Link>
          </div>
          );
        })}
      </section>
    </div>
  );
}
