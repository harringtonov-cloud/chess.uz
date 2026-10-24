import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import Board from '../components/Board';
import { uciToMove } from '../lib/chessUtil';
import { FALLBACK, fetchPuzzle } from '../lib/puzzleApi';
import type { Puzzle } from '../lib/puzzleApi';
import { expectedScore } from '../lib/elo';
import { THEME_CHOICES, pickFallback, sanitizeTheme, themeLabel } from '../lib/puzzleThemes';
import { playSound } from '../lib/sound';

export default function Puzzles() {
  const { profile, user } = useAuth();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [fen, setFen] = useState('');
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<'loading' | 'playing' | 'solved' | 'failed'>('loading');
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState('');
  const [offline, setOffline] = useState(false);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('puzzle_best') ?? 0));
  const [delta, setDelta] = useState<number | null>(null);
  const [isDaily, setIsDaily] = useState(false);
  // тема тренировки: пустая — любые задачи
  const [theme, setTheme] = useState(() => {
    try {
      return sanitizeTheme(localStorage.getItem('puzzle_theme'));
    } catch {
      return '';
    }
  });
  const [themeMiss, setThemeMiss] = useState(false);
  const rated = useRef(false);
  const fallbackIdx = useRef(0);
  const busy = useRef(false);

  const next = useCallback(async (daily = false, topic = theme) => {
    setIsDaily(daily);
    setStatus('loading');
    setMsg('');
    setHint(null);
    setLast(null);
    setDelta(null);
    setMistakes(0);
    setStep(0);
    rated.current = false;
    let p: Puzzle;
    setThemeMiss(false);
    try {
      p = await fetchPuzzle(daily ? 'daily' : 'next', topic);
      setOffline(false);
    } catch {
      const f = pickFallback(FALLBACK, daily ? '' : topic, fallbackIdx.current++);
      p = f.puzzle;
      setThemeMiss(!f.matched);
      setOffline(true);
    }
    setPuzzle(p);
    setFen(p.fen);
    setStatus('playing');
  }, [theme]);

  useEffect(() => {
    void next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseTheme(value: string) {
    const t = sanitizeTheme(value);
    setTheme(t);
    try {
      localStorage.setItem('puzzle_theme', t);
    } catch {
      /* localStorage может быть недоступен — тема просто не запомнится */
    }
    setStreak(0);
    void next(false, t);
  }

  async function applyRating(success: boolean) {
    if (rated.current || !puzzle) return;
    rated.current = true;
    if (!profile || !user || offline) return;
    const own = profile.ratings.puzzle ?? 1200;
    const d = Math.round(32 * ((success ? 1 : 0) - expectedScore(own, puzzle.rating)));
    setDelta(d);
    try {
      await updateDoc(doc(db, 'users', user.uid), { 'ratings.puzzle': own + d });
    } catch (e) {
      console.error(e);
    }
  }

  function finish(success: boolean) {
    setStatus(success ? 'solved' : 'failed');
    if (success) {
      playSound('correct');
      const s = streak + 1;
      setStreak(s);
      if (s > best) {
        setBest(s);
        localStorage.setItem('puzzle_best', String(s));
      }
    }
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (!puzzle || status !== 'playing' || busy.current) return;
    const c = new Chess(fen);
    let mv;
    try {
      mv = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const expected = puzzle.solution[step];
    if (uci !== expected && !c.isCheckmate()) {
      playSound('wrong');
      setMsg('Неверно, попробуйте другой ход');
      setStreak(0);
      if (mistakes === 0) void applyRating(false);
      setMistakes((m) => m + 1);
      return;
    }
    setHint(null);
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    setMsg('');
    playSound('move');
    if (c.isCheckmate() || step + 1 >= puzzle.solution.length) {
      if (mistakes === 0) void applyRating(true);
      finish(true);
      return;
    }
    // ответ соперника
    busy.current = true;
    const reply = puzzle.solution[step + 1];
    setTimeout(() => {
      const c2 = new Chess(c.fen());
      const om = c2.move(uciToMove(reply));
      setFen(c2.fen());
      setLast({ from: om.from, to: om.to });
      playSound('move');
      setStep(step + 2);
      busy.current = false;
      if (step + 2 >= puzzle.solution.length) {
        if (mistakes === 0) void applyRating(true);
        finish(true);
      }
    }, 500);
  }

  const turnColor = fen ? (new Chess(fen).turn() === 'w' ? 'white' : 'black') : 'white';
  const expectedMove = puzzle?.solution[step];

  return (
    <div className="game-layout">
      <div className="board-col">
        {fen ? (
          <Board
            fen={fen}
            orientation={puzzle ? (new Chess(puzzle.fen).turn() === 'w' ? 'white' : 'black') : 'white'}
            movable={status === 'playing' ? turnColor : null}
            lastMove={last}
            hint={hint}
            onMove={(f, t, p) => onMove(f, t, p)}
          />
        ) : (
          <div className="board-placeholder">Загрузка задачи…</div>
        )}
      </div>
      <div className="side-col">
        <div className="card">
          <h3>Головоломки</h3>
          <Link className="btn small" to="/rush">⚡ Puzzle Rush на время</Link>{' '}
          <Link className="btn small" to="/battle">⚔ Puzzle Battle</Link>{' '}
          <Link className="btn small" to="/vision">👁 Шахматное зрение</Link>
          <div className="row wrap">
            <label className="muted" htmlFor="puzzle-theme">Тема</label>
            <select id="puzzle-theme" value={theme} onChange={(e) => chooseTheme(e.target.value)}>
              {['Любые', 'Маты', 'Тактика', 'Стадии партии', 'Характер задачи'].map((g) => (
                <optgroup key={g} label={g === 'Любые' ? 'Все задачи' : g}>
                  {THEME_CHOICES.filter((c) => c.group === g).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value ? themeLabel(c.value) : 'Любые темы'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {profile && <div className="muted">Ваш рейтинг задач: <b>{profile.ratings.puzzle}</b></div>}
          {puzzle && (
            <div className="muted">
              {isDaily ? '📅 Задача дня · ' : ''}Задача #{puzzle.id} · сложность {puzzle.rating}
            </div>
          )}
          {offline && (
            <p className="notice">
              База задач Lichess недоступна, показаны запасные задачи. Рейтинг не меняется.
              {themeMiss ? ' Запасных задач на выбранную тему нет, показана другая.' : ''}
            </p>
          )}
          {status === 'playing' && (
            <p>
              Ваш ход: найдите лучшее продолжение за {turnColor === 'white' ? 'белых' : 'чёрных'}.
            </p>
          )}
          {status === 'solved' && (
            <p className="result-banner">
              {mistakes === 0 ? 'Решено! ✓' : 'Решено, но с ошибками'}
              {delta !== null && mistakes === 0 ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''}
            </p>
          )}
          {status === 'failed' && <p className="result-banner">Задача не решена{delta !== null ? ` (${delta})` : ''}</p>}
          {msg && <p className="error">{msg}</p>}
          <div className="muted">Серия: {streak} · рекорд: {best}</div>
          {puzzle && (
            <div className="tags">
              {puzzle.themes.slice(0, 6).map((t) => (
                <span key={t} className="tag">{themeLabel(t)}</span>
              ))}
            </div>
          )}
          <div className="row wrap actions">
            <button
              className="btn"
              disabled={status !== 'playing' || !expectedMove}
              onClick={() => expectedMove && setHint(uciToMove(expectedMove))}
            >
              💡 Подсказка
            </button>
            <button
              className="btn"
              disabled={status !== 'playing' || !expectedMove}
              onClick={() => {
                if (mistakes === 0) void applyRating(false);
                if (expectedMove) setHint(uciToMove(expectedMove));
                setStreak(0);
                setStatus('failed');
              }}
            >
              Показать решение
            </button>
            <button className="btn" disabled={status === 'loading'} onClick={() => void next(true)}>
              📅 Задача дня
            </button>
            <button className="btn primary" disabled={status === 'loading'} onClick={() => void next()}>
              Следующая →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
