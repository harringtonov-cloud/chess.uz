import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import { uciToMove, uciToSan } from '../lib/chessUtil';
import { OPENINGS } from '../lib/openings';
import {
  DAY,
  MINUTE,
  applyGrade,
  loadTrainerState,
  pickNext,
  saveTrainerState,
  summary,
  trainableLines,
  userPlies,
} from '../lib/openingTrainer';
import type { Grade, Line } from '../lib/openingTrainer';
import { playSound } from '../lib/sound';

type SideChoice = 'white' | 'black' | 'both';

interface Session {
  line: Line;
  kind: 'due' | 'new';
  /** Сколько полуходов линии уже сыграно на доске */
  ply: number;
  mistakes: number;
  /** Полуходы, на которых показана подсказка */
  hintPlies: number[];
  status: 'playing' | 'done';
  message: string;
  grade: Grade | null;
}

function waitText(ms: number): string {
  if (ms < MINUTE) return 'меньше минуты';
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)} мин`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))} ч`;
  return `${Math.round(ms / DAY)} дн`;
}

export default function OpeningTrainer() {
  const [side, setSide] = useState<SideChoice>('white');
  const [trainer, setTrainer] = useState(loadTrainerState);
  const trainerRef = useRef(trainer);
  trainerRef.current = trainer;
  const [session, setSession] = useState<Session | null>(null);
  const [allDone, setAllDone] = useState(false);

  const lines = useMemo(() => {
    const w = side !== 'black' ? trainableLines(OPENINGS, 'white') : [];
    const b = side !== 'white' ? trainableLines(OPENINGS, 'black') : [];
    return [...w, ...b];
  }, [side]);

  const stats = summary(trainer, lines, Date.now());

  // позиция на доске: линия, сыгранная до текущего полухода
  const pos = useMemo(() => {
    const c = new Chess();
    let last: { from: string; to: string } | null = null;
    if (session) {
      for (const u of session.line.moves.slice(0, session.ply)) {
        const m = c.move(uciToMove(u));
        last = { from: m.from, to: m.to };
      }
    }
    return { fen: c.fen(), last };
  }, [session?.line.id, session?.ply]);

  function startNext(exclude: string | null) {
    const pick = pickNext(trainerRef.current, lines, Date.now(), Math.random, exclude);
    if (!pick) {
      setSession(null);
      setAllDone(true);
      return;
    }
    setAllDone(false);
    setSession({
      line: pick.line,
      kind: pick.kind,
      ply: 0,
      mistakes: 0,
      hintPlies: [],
      status: 'playing',
      message: '',
      grade: null,
    });
  }

  function finish(s: Session) {
    const grade: Grade = s.mistakes === 0 ? 'good' : 'again';
    const next = applyGrade(trainerRef.current, s.line, grade, Date.now());
    trainerRef.current = next;
    setTrainer(next);
    saveTrainerState(next);
    playSound(grade === 'good' ? 'correct' : 'wrong');
    setSession((prev) => (prev && prev.line.id === s.line.id ? { ...prev, status: 'done', grade } : prev));
  }

  // ходы соперника играются сами; в конце линии записываем результат
  useEffect(() => {
    if (!session || session.status !== 'playing') return;
    const { line, ply } = session;
    if (ply >= line.moves.length) {
      finish(session);
      return;
    }
    if (userPlies(line).includes(ply)) return;
    const t = setTimeout(() => {
      playSound('move');
      setSession((s) => (s && s.line.id === line.id && s.ply === ply ? { ...s, ply: ply + 1 } : s));
    }, ply === 0 ? 300 : 650);
    return () => clearTimeout(t);
  }, [session?.line.id, session?.ply, session?.status]);

  // смена стороны обнуляет текущую линию
  useEffect(() => {
    setSession(null);
    setAllDone(false);
  }, [side]);

  function onMove(from: string, to: string, promotion?: string) {
    if (!session || session.status !== 'playing') return;
    const { line, ply } = session;
    if (!userPlies(line).includes(ply)) return;
    const expected = line.moves[ply];
    const uci = from + to + (promotion ?? '');
    if (uci === expected) {
      const san = uciToSan(pos.fen, expected) ?? '';
      playSound(san.includes('x') ? 'capture' : 'move');
      setSession({ ...session, ply: ply + 1, message: '' });
      return;
    }
    const san = uciToSan(pos.fen, expected) ?? expected;
    setSession({
      ...session,
      mistakes: session.mistakes + 1,
      hintPlies: session.hintPlies.includes(ply) ? session.hintPlies : [...session.hintPlies, ply],
      message: `Не тот ход. В этой линии играют ${san}.`,
    });
    playSound('wrong');
  }

  function showHint() {
    if (!session || session.status !== 'playing' || session.hintPlies.includes(session.ply)) return;
    setSession({
      ...session,
      mistakes: session.mistakes + 1,
      hintPlies: [...session.hintPlies, session.ply],
    });
  }

  const hint =
    session &&
    session.status === 'playing' &&
    session.hintPlies.includes(session.ply) &&
    session.ply < session.line.moves.length
      ? (() => {
          const m = uciToMove(session.line.moves[session.ply]);
          return { from: m.from, to: m.to };
        })()
      : null;

  const myTurn = Boolean(session && session.status === 'playing' && userPlies(session.line).includes(session.ply));

  return (
    <div className="game-layout">
      <div className="board-col">
        {session ? (
          <Board
            fen={pos.fen}
            orientation={session.line.side}
            movable={session.status === 'playing' ? session.line.side : null}
            lastMove={pos.last}
            hint={hint}
            onMove={(f, t, p) => onMove(f, t, p)}
          />
        ) : (
          <div className="board-placeholder">
            {allDone ? 'На сегодня всё 🎉' : 'Нажмите «Начать»'}
          </div>
        )}
      </div>

      <div className="side-col">
        <div className="card">
          <h2>Тренировка дебютов</h2>
          <p className="muted">
            Вам показывают дебютную линию, а вы по памяти играете за свою сторону. Линии, в которых вы ошиблись,
            возвращаются скоро, выученные — всё реже: через день, три, неделю и дальше.
          </p>

          <h4>Играть за</h4>
          <div className="row wrap">
            {(['white', 'black', 'both'] as SideChoice[]).map((s) => (
              <button key={s} className={`btn${side === s ? ' primary' : ''}`} onClick={() => setSide(s)}>
                {s === 'white' ? 'Белых' : s === 'black' ? 'Чёрных' : 'Обе стороны'}
              </button>
            ))}
          </div>

          <div className="row wrap trainer-stats">
            <span>🔁 К повторению: <b>{stats.due}</b></span>
            <span>🆕 Новых сегодня: <b>{stats.fresh}</b></span>
            <span>✅ Выучено: <b>{stats.learned}</b> из {stats.total}</span>
          </div>
        </div>

        <div className="card">
          {!session && (
            <>
              {allDone && (
                <p>
                  Всё, что было на сегодня, пройдено.{' '}
                  {stats.nextDueIn !== null
                    ? `Следующее повторение через ${waitText(stats.nextDueIn)}.`
                    : 'Новые линии появятся завтра.'}
                </p>
              )}
              <div className="row wrap">
                <button className="btn primary" onClick={() => startNext(null)}>
                  {allDone ? 'Проверить ещё раз' : 'Начать'}
                </button>
                <Link className="btn" to="/openings">
                  Справочник дебютов
                </Link>
              </div>
            </>
          )}

          {session && (
            <>
              <div className="muted">
                {session.kind === 'new' ? '🆕 Новая линия' : '🔁 Повторение'} · вы играете{' '}
                {session.line.side === 'white' ? 'белыми' : 'чёрными'}
              </div>
              {session.status === 'done' ? (
                <>
                  <div className="opening-name">{session.line.name}</div>
                  <div className="result-banner">
                    {session.grade === 'good'
                      ? 'Линия пройдена без ошибок ✓'
                      : 'Были ошибки или подсказки — линия вернётся скоро'}
                  </div>
                  <div className="row wrap">
                    <button className="btn primary" onClick={() => startNext(session.line.id)}>
                      Дальше
                    </button>
                    <button className="btn" onClick={() => setSession(null)}>
                      Остановиться
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Ход {Math.floor(session.ply / 2) + 1}
                    {myTurn ? ': ваш ход.' : ': отвечает соперник…'}
                  </p>
                  {session.message && <p className="error">{session.message}</p>}
                  <div className="row wrap">
                    <button className="btn" disabled={!myTurn} onClick={showHint}>
                      💡 Подсказка
                    </button>
                    <button className="btn" onClick={() => setSession(null)}>
                      Прервать
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
