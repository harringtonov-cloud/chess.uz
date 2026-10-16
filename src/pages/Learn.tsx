import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import { uciToMove } from '../lib/chessUtil';
import { LESSONS } from '../lib/lessons';
import type { Lesson } from '../lib/lessons';
import { playSound } from '../lib/sound';

const KEY = 'lessons_done';

function loadDone(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export default function Learn() {
  const [done, setDone] = useState<Record<string, number>>(loadDone);
  const [active, setActive] = useState<Lesson | null>(null);

  function finish(id: string) {
    const next = { ...done, [id]: Date.now() };
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* прогресс хранится только пока доступен localStorage */
    }
  }

  if (active) {
    return <LessonRunner lesson={active} onExit={() => setActive(null)} onFinish={() => finish(active.id)} />;
  }

  const completed = LESSONS.filter((l) => done[l.id]).length;
  return (
    <div className="card">
      <h2>Учиться шахматам</h2>
      <p className="muted">
        Интерактивные уроки: читайте объяснение и выполняйте задание прямо на доске. Пройдено {completed} из{' '}
        {LESSONS.length}.
      </p>
      <div className="lesson-grid">
        {LESSONS.map((l) => (
          <button key={l.id} className="lesson-card" onClick={() => setActive(l)}>
            <span className="muted">
              {l.level} · {l.steps.length} шагов
            </span>
            <b>
              {done[l.id] ? '✅ ' : ''}
              {l.title}
            </b>
            <span>{l.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LessonRunner({
  lesson,
  onExit,
  onFinish,
}: {
  lesson: Lesson;
  onExit: () => void;
  onFinish: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const step = lesson.steps[idx];
  const [fen, setFen] = useState(step.fen);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [progress, setProgress] = useState(0); // сколько ходов решения выполнено
  const [solved, setSolved] = useState(!step.solution);
  const [msg, setMsg] = useState('');
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    busy.current = false;
    setFen(step.fen);
    setLast(null);
    setHint(null);
    setProgress(0);
    setSolved(!step.solution);
    setMsg('');
    return () => clearTimeout(timer.current);
  }, [idx, step]);

  const turn = useMemo(() => (new Chess(step.fen).turn() === 'w' ? 'white' : 'black'), [step.fen]);
  const expected = step.solution?.[progress];
  const isLastStep = idx === lesson.steps.length - 1;

  function onMove(from: string, to: string, promotion?: string) {
    if (solved || busy.current || !step.solution) return;
    const uci = from + to + (promotion ?? '');
    const accepted = progress === 0 ? [expected, ...(step.alt ?? [])] : [expected];
    // превращение: засчитываем только выбранную фигуру из решения, остальное — ошибка
    if (!accepted.includes(uci)) {
      playSound('wrong');
      setMsg('Не то. Попробуйте ещё раз или нажмите «Подсказка».');
      return;
    }
    setMsg('');
    setHint(null);
    const c = new Chess(fen);
    const mv = c.move(uciToMove(uci));
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    playSound('move');
    const solution = step.solution;
    // если принят запасной ход, а не основной, на этом шаге просто завершаем задание
    const usedAlt = uci !== expected;
    let next = progress + 1;
    if (usedAlt || next >= solution.length) {
      setProgress(solution.length);
      setSolved(true);
      playSound('correct');
      return;
    }
    // ответ соперника по сценарию
    busy.current = true;
    timer.current = setTimeout(() => {
      const c2 = new Chess(c.fen());
      const om = c2.move(uciToMove(solution[next]));
      setFen(c2.fen());
      setLast({ from: om.from, to: om.to });
      playSound('move');
      next += 1;
      busy.current = false;
      if (next >= solution.length) {
        setProgress(solution.length);
        setSolved(true);
        playSound('correct');
      } else {
        setProgress(next);
      }
    }, 500);
    setProgress(next);
  }

  function goNext() {
    if (isLastStep) {
      onFinish();
      onExit();
    } else {
      setIdx(idx + 1);
    }
  }

  return (
    <div className="game-layout">
      <div className="board-col">
        <Board
          fen={fen}
          orientation={turn}
          movable={!solved && step.solution ? turn : null}
          lastMove={last}
          hint={hint}
          onMove={(f, t, p) => onMove(f, t, p)}
        />
      </div>
      <div className="side-col">
        <div className="card">
          <div className="muted">
            {lesson.title} · шаг {idx + 1} из {lesson.steps.length}
          </div>
          <div className="progress">
            <div style={{ width: `${((idx + (solved ? 1 : 0)) / lesson.steps.length) * 100}%` }} />
          </div>
          <p className="lesson-text">{step.text}</p>
          {msg && <p className="error">{msg}</p>}
          {solved && step.solution && <p className="result-banner">{step.success ?? 'Верно!'}</p>}
          <div className="row wrap actions">
            {step.solution && !solved && (
              <button
                className="btn"
                onClick={() => expected && setHint(uciToMove(expected))}
                disabled={!expected || busy.current}
              >
                💡 Подсказка
              </button>
            )}
            {step.solution && !solved && step.hint && <span className="muted">{step.hint}</span>}
          </div>
          <div className="row wrap actions">
            <button className="btn" onClick={onExit}>← К урокам</button>
            <button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Назад</button>
            <button className="btn primary" disabled={!solved} onClick={goNext}>
              {isLastStep ? 'Завершить урок ✓' : 'Дальше →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
