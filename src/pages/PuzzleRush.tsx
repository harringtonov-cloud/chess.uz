import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import { uciToMove } from '../lib/chessUtil';
import { fetchPuzzle } from '../lib/puzzleApi';
import type { Puzzle } from '../lib/puzzleApi';
import { playSound } from '../lib/sound';

const MAX_STRIKES = 3;
type Phase = 'menu' | 'loading' | 'running' | 'over';

function loadBest(minutes: number): number {
  try {
    return Number(localStorage.getItem(`rush_best_${minutes}`) ?? 0);
  } catch {
    return 0;
  }
}

/** Puzzle Rush: решайте как можно больше задач за отведённое время. Три ошибки — конец. */
export default function PuzzleRush() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [minutes, setMinutes] = useState(3);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [fen, setFen] = useState('');
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [msLeft, setMsLeft] = useState(0);
  const [error, setError] = useState('');
  const [best, setBest] = useState(() => loadBest(3));
  const [newRecord, setNewRecord] = useState(false);

  const deadline = useRef(0);
  const nextPuzzle = useRef<Promise<Puzzle> | null>(null);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  const scoreRef = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const finish = useCallback(
    (final: number) => {
      timers.current.forEach(clearTimeout);
      busy.current = false;
      setPhase('over');
      playSound('end');
      const prev = loadBest(minutes);
      if (final > prev) {
        setNewRecord(true);
        setBest(final);
        try {
          localStorage.setItem(`rush_best_${minutes}`, String(final));
        } catch {
          /* рекорд не сохранится без localStorage */
        }
      } else {
        setNewRecord(false);
      }
    },
    [minutes],
  );

  const show = useCallback((p: Puzzle) => {
    setPuzzle(p);
    setFen(p.fen);
    setLast(null);
    setStep(0);
    busy.current = false;
  }, []);

  const loadNext = useCallback(async () => {
    const p = await (nextPuzzle.current ?? fetchPuzzle());
    nextPuzzle.current = fetchPuzzle().catch(() => Promise.reject(new Error('prefetch')));
    nextPuzzle.current.catch(() => undefined); // чтобы не было необработанной ошибки
    if (alive.current) show(p);
  }, [show]);

  async function start() {
    setError('');
    setPhase('loading');
    setScore(0);
    scoreRef.current = 0;
    setStrikes(0);
    setNewRecord(false);
    setBest(loadBest(minutes));
    nextPuzzle.current = null;
    try {
      await loadNext();
    } catch {
      setPhase('menu');
      setError('База задач Lichess недоступна. Проверьте интернет и попробуйте позже.');
      return;
    }
    deadline.current = Date.now() + minutes * 60 * 1000;
    setMsLeft(minutes * 60 * 1000);
    setPhase('running');
  }

  // таймер
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) {
        setMsLeft(0);
        finish(scoreRef.current);
      } else {
        setMsLeft(left);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, finish]);

  async function advance(solvedOk: boolean) {
    busy.current = true;
    if (solvedOk) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      playSound('correct');
    }
    try {
      await loadNext();
    } catch {
      if (alive.current) {
        setError('Не удалось загрузить следующую задачу.');
        finish(scoreRef.current);
      }
    }
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (phase !== 'running' || busy.current || !puzzle) return;
    const c = new Chess(fen);
    let mv;
    try {
      mv = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    if (uci !== puzzle.solution[step] && !c.isCheckmate()) {
      playSound('wrong');
      const s = strikes + 1;
      setStrikes(s);
      if (s >= MAX_STRIKES) {
        finish(scoreRef.current);
      } else {
        busy.current = true;
        later(() => void advance(false), 400);
      }
      return;
    }
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    playSound('move');
    if (c.isCheckmate() || step + 1 >= puzzle.solution.length) {
      void advance(true);
      return;
    }
    busy.current = true;
    const reply = puzzle.solution[step + 1];
    later(() => {
      const c2 = new Chess(c.fen());
      const om = c2.move(uciToMove(reply));
      setFen(c2.fen());
      setLast({ from: om.from, to: om.to });
      playSound('move');
      if (step + 2 >= puzzle.solution.length) {
        void advance(true);
      } else {
        setStep(step + 2);
        busy.current = false;
      }
    }, 450);
  }

  const secs = Math.ceil(msLeft / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const turn = fen ? (new Chess(fen).turn() === 'w' ? 'white' : 'black') : 'white';
  const orientation = puzzle ? (new Chess(puzzle.fen).turn() === 'w' ? 'white' : 'black') : 'white';

  if (phase === 'menu' || phase === 'loading' || phase === 'over') {
    return (
      <div className="card narrow">
        <h2>⚡ Puzzle Rush</h2>
        {phase === 'over' ? (
          <>
            <p className="result-banner">
              Время вышло или кончились попытки. Решено задач: <b>{score}</b>
              {newRecord && ' — новый рекорд! 🏆'}
            </p>
            <p className="muted">Рекорд на {minutes} мин: {best}</p>
          </>
        ) : (
          <p className="muted">
            Решайте задачи одну за другой на время. Ошибка — это «страйк», после {MAX_STRIKES} забег закончится.
          </p>
        )}
        <div className="row wrap">
          <span>Время:</span>
          {[3, 5].map((m) => (
            <button
              key={m}
              className={`btn ${minutes === m ? 'primary' : ''}`}
              onClick={() => {
                setMinutes(m);
                setBest(loadBest(m));
              }}
            >
              {m} мин
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary big" disabled={phase === 'loading'} onClick={() => void start()}>
          {phase === 'loading' ? 'Загрузка…' : phase === 'over' ? 'Ещё раз' : 'Старт'}
        </button>
        <p className="muted">
          Рекорд на {minutes} мин: {best} · <Link to="/puzzles">обычные задачи</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="game-layout">
      <div className="board-col">
        <Board
          fen={fen}
          orientation={orientation}
          movable={phase === 'running' ? turn : null}
          lastMove={last}
          onMove={(f, t, p) => onMove(f, t, p)}
        />
      </div>
      <div className="side-col">
        <div className="card">
          <div className="clock rush-clock">{clock}</div>
          <div className="rush-score">Решено: <b>{score}</b></div>
          <div className="strikes">
            {Array.from({ length: MAX_STRIKES }, (_, i) => (
              <span key={i} className={i < strikes ? 'strike on' : 'strike'}>✕</span>
            ))}
          </div>
          <p className="muted">Ваш ход за {orientation === 'white' ? 'белых' : 'чёрных'}. Рекорд: {best}</p>
          <button className="btn" onClick={() => finish(scoreRef.current)}>Закончить</button>
        </div>
      </div>
    </div>
  );
}
