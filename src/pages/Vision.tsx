import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '../lib/sound';

const FILES = 'abcdefgh';
const DURATION = 30; // секунд на забег
type Phase = 'idle' | 'running' | 'over';
type Side = 'white' | 'black' | 'random';

function randomSquare(except?: string): string {
  for (;;) {
    const sq = FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));
    if (sq !== except) return sq;
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('vision_best') ?? 0);
  } catch {
    return 0;
  }
}

/** Тренажёр шахматного зрения: найдите на пустой доске поле по его названию. */
export default function Vision() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [side, setSide] = useState<Side>('white');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [target, setTarget] = useState('e4');
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [msLeft, setMsLeft] = useState(DURATION * 1000);
  const [flash, setFlash] = useState<{ sq: string; ok: boolean } | null>(null);
  const [best, setBest] = useState(loadBest);
  const [record, setRecord] = useState(false);
  const deadline = useRef(0);
  const scoreRef = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const finish = useCallback(() => {
    setPhase('over');
    playSound('end');
    const final = scoreRef.current;
    if (final > loadBest()) {
      setRecord(true);
      setBest(final);
      try {
        localStorage.setItem('vision_best', String(final));
      } catch {
        /* рекорд не сохранится без localStorage */
      }
    } else {
      setRecord(false);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) {
        setMsLeft(0);
        finish();
      } else {
        setMsLeft(left);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, finish]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  function start() {
    setOrientation(side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : side);
    setScore(0);
    setWrong(0);
    scoreRef.current = 0;
    setTarget(randomSquare());
    setRecord(false);
    deadline.current = Date.now() + DURATION * 1000;
    setMsLeft(DURATION * 1000);
    setPhase('running');
  }

  function click(sq: string) {
    if (phase !== 'running') return;
    clearTimeout(flashTimer.current);
    if (sq === target) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      setFlash({ sq, ok: true });
      playSound('correct');
      setTarget(randomSquare(target));
    } else {
      setWrong((w) => w + 1);
      setFlash({ sq, ok: false });
      playSound('wrong');
    }
    flashTimer.current = setTimeout(() => setFlash(null), 300);
  }

  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const secs = Math.ceil(msLeft / 1000);

  return (
    <div className="game-layout">
      <div className="board-col">
        <div className="board vision-board">
          {ranks.map((r) =>
            files.map((f) => {
              const sq = `${FILES[f]}${r}`;
              const dark = (f + r) % 2 === 1;
              const cls = [
                'sq',
                dark ? 'dark' : 'light',
                flash?.sq === sq ? (flash.ok ? 'vision-ok' : 'vision-bad') : '',
              ]
                .filter(Boolean)
                .join(' ');
              return <div key={sq} className={cls} onClick={() => click(sq)} />;
            }),
          )}
        </div>
      </div>
      <div className="side-col">
        <div className="card">
          <h2>👁 Шахматное зрение</h2>
          {phase === 'running' ? (
            <>
              <div className="vision-target">{target}</div>
              <div className="clock rush-clock">0:{String(secs).padStart(2, '0')}</div>
              <div className="rush-score">
                Верно: <b>{score}</b> · ошибок: {wrong}
              </div>
            </>
          ) : (
            <>
              {phase === 'over' ? (
                <p className="result-banner">
                  Время вышло. Найдено полей: <b>{score}</b>, ошибок: {wrong}
                  {record && ' — новый рекорд! 🏆'}
                </p>
              ) : (
                <p className="muted">
                  На доске нет ни фигур, ни букв с цифрами. Найдите и нажмите поле, которое назовёт тренажёр. За{' '}
                  {DURATION} секунд нужно найти как можно больше полей.
                </p>
              )}
              <div className="row wrap">
                <span>Смотреть со стороны:</span>
                {(['white', 'random', 'black'] as Side[]).map((s) => (
                  <button key={s} className={`btn small ${side === s ? 'primary' : ''}`} onClick={() => setSide(s)}>
                    {s === 'white' ? '♔ Белых' : s === 'black' ? '♚ Чёрных' : '🎲 Любой'}
                  </button>
                ))}
              </div>
              <button className="btn primary big" onClick={start}>
                {phase === 'over' ? 'Ещё раз' : 'Старт'}
              </button>
              <p className="muted">Рекорд: {best}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
