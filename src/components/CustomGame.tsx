import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { createGame } from '../lib/games';
import {
  CATEGORY_LABEL,
  CUSTOM_LIMITS,
  DAILY_DAYS,
  categoryOf,
  tcLabel,
  validateTimeControl,
} from '../lib/timeControls';
import type { Color } from '../lib/types';

const PRESETS: { label: string; min: number; inc: number }[] = [
  { label: '1+0', min: 1, inc: 0 },
  { label: '3+2', min: 3, inc: 2 },
  { label: '5+3', min: 5, inc: 3 },
  { label: '10+5', min: 10, inc: 5 },
  { label: '15+10', min: 15, inc: 10 },
  { label: '30+0', min: 30, inc: 0 },
  { label: '60+0', min: 60, inc: 0 },
];

type Seat = Color | 'random';

/** Своя игра: игрок сам задаёт время, добавку, цвет, рейтинг и видимость партии. */
export default function CustomGame() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [daily, setDaily] = useState(false);
  const [days, setDays] = useState(3);
  const [minutes, setMinutes] = useState('10');
  const [inc, setInc] = useState('0');
  const [seat, setSeat] = useState<Seat>('random');
  const [rated, setRated] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // допускаем запятую как десятичный разделитель: «0,5» = полминуты
  const num = (v: string) => Number(v.replace(',', '.'));
  const tc = daily
    ? { base: days * 86400, inc: 0 }
    : { base: Math.round(num(minutes) * 60), inc: Math.round(num(inc)) };
  const problem = daily ? null : validateTimeControl(tc);

  async function create() {
    if (!profile) return nav('/login');
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      const id = await createGame(profile, tc, {
        private: !open,
        rated: !daily && open && rated,
        daily,
        color: seat === 'random' ? undefined : seat,
      });
      nav(`/game/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card custom-game">
      <h2>Своя игра</h2>
      <p className="muted">Задайте время сами и создайте партию: она появится в списке открытых или уйдёт по ссылке.</p>

      <div className="row wrap">
        <button className={`btn small ${!daily ? 'primary' : ''}`} onClick={() => setDaily(false)}>
          На время
        </button>
        <button className={`btn small ${daily ? 'primary' : ''}`} onClick={() => setDaily(true)}>
          📅 Ежедневная
        </button>
      </div>

      {daily && (
        <>
          <p className="muted">
            Ходите, когда удобно: на каждый ход даётся несколько суток. Можно закрыть сайт, партия ждёт. Если не успеть
            сделать ход, засчитывается поражение. Ежедневные партии не влияют на рейтинг.
          </p>
          <div className="row wrap">
            <span>Дней на ход:</span>
            {DAILY_DAYS.map((d) => (
              <button key={d} className={`btn small ${days === d ? 'primary' : ''}`} onClick={() => setDays(d)}>
                {d}
              </button>
            ))}
          </div>
        </>
      )}

      {!daily && (
      <div className="tc-row">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={`btn small ${num(minutes) === p.min && num(inc) === p.inc ? 'primary' : ''}`}
            onClick={() => {
              setMinutes(String(p.min));
              setInc(String(p.inc));
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      )}

      {!daily && (
      <div className="custom-fields">
        <label>
          <span className="muted">Минут на партию</span>
          <input
            type="number"
            inputMode="decimal"
            min={CUSTOM_LIMITS.minBase / 60}
            max={CUSTOM_LIMITS.maxBase / 60}
            step="0.25"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <label>
          <span className="muted">Добавка за ход, секунд</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={CUSTOM_LIMITS.maxInc}
            step="1"
            value={inc}
            onChange={(e) => setInc(e.target.value)}
          />
        </label>
      </div>
      )}

      <p>
        Контроль: <b>{problem ? '—' : tcLabel(tc)}</b>
        {!problem && <span className="muted"> · {daily ? 'Ежедневные' : CATEGORY_LABEL[categoryOf(tc)]}</span>}
      </p>

      <div className="row wrap">
        <span>Цвет:</span>
        {(['white', 'random', 'black'] as Seat[]).map((c) => (
          <button key={c} className={`btn small ${seat === c ? 'primary' : ''}`} onClick={() => setSeat(c)}>
            {c === 'white' ? '♔ Белые' : c === 'black' ? '♚ Чёрные' : '🎲 Любой'}
          </button>
        ))}
      </div>

      <div className="row wrap">
        <button className={`btn small ${open ? 'primary' : ''}`} onClick={() => setOpen(true)}>
          Открытая партия
        </button>
        <button className={`btn small ${!open ? 'primary' : ''}`} onClick={() => setOpen(false)}>
          Только по ссылке
        </button>
      </div>

      {open && !daily && (
        <label className="check-row">
          <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} />
          Рейтинговая партия
        </label>
      )}
      <p className="muted">
        {open
          ? 'Партию увидят все в списке открытых партий.'
          : 'Партия нерейтинговая. Отправьте ссылку тому, с кем хотите играть.'}
      </p>

      {(error || (problem && minutes !== '')) && <p className="error">{error || problem}</p>}
      <button className="btn primary big" disabled={!firebaseConfigured || busy || problem !== null} onClick={create}>
        {busy ? 'Создаём…' : 'Создать партию'}
      </button>
    </section>
  );
}
