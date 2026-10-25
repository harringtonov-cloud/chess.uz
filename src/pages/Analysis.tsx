import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import { doc, getDoc } from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import Board from '../components/Board';
import MoveList from '../components/MoveList';
import { replay, uciToSan } from '../lib/chessUtil';
import { getEngine } from '../lib/engine';
import { OPENINGS, openingName } from '../lib/openings';
import {
  QUALITY_LABEL,
  QUALITY_ORDER,
  bookDepth,
  keyMoments,
  moveQualities,
  neighborMoment,
  sideSummary,
  winProb,
} from '../lib/review';
import type { Quality } from '../lib/review';
import type { GameDoc } from '../lib/types';

interface Ev {
  cp: number; // сантипешки, с точки зрения белых
  mate: number | null; // знак: + мат ставят белые
  best: string | null; // лучший ход в позиции (UCI)
}

function fmtEval(e: Ev | undefined): string {
  if (!e) return '…';
  if (e.mate !== null) return `${e.mate > 0 ? '+' : '-'}M${Math.abs(e.mate)}`;
  const v = e.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

function parseInput(text: string): { fens: string[]; moves: Move[]; pgn: string } {
  const t = text.trim();
  if (!t) throw new Error('Вставьте PGN или FEN');
  // FEN: 6 полей через пробел и косые черты
  if (t.includes('/') && !t.includes('[') && t.split(/\s+/).length >= 4 && !/\d\./.test(t)) {
    const c = new Chess(t);
    return { fens: [c.fen()], moves: [], pgn: '' };
  }
  const c = new Chess();
  c.loadPgn(t);
  const moves = c.history({ verbose: true });
  if (moves.length === 0) throw new Error('В партии нет ходов');
  return { fens: [moves[0].before, ...moves.map((m) => m.after)], moves, pgn: c.pgn() };
}

export default function Analysis() {
  const [params] = useSearchParams();
  const [text, setText] = useState('');
  const [fens, setFens] = useState<string[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [pgn, setPgn] = useState('');
  const [evals, setEvals] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [sel, setSel] = useState(0);
  const [error, setError] = useState('');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [showBest, setShowBest] = useState(false);
  // режим «исправь ошибку»: игрок ищет лучший ход в позиции перед своей ошибкой
  const [retry, setRetry] = useState<{ move: number; result: 'pending' | 'wrong' | 'correct' | 'shown' } | null>(null);
  const cancel = useRef(false);

  const runAnalysis = useCallback(async (list: string[]) => {
    cancel.current = false;
    setRunning(true);
    setEvals([]);
    setError('');
    const engine = getEngine();
    const out: Ev[] = [];
    try {
      for (const fen of list) {
        if (cancel.current) break;
        const c = new Chess(fen);
        const whiteToMove = c.turn() === 'w';
        let ev: Ev;
        if (c.isCheckmate()) {
          ev = { cp: whiteToMove ? -10000 : 10000, mate: 0, best: null };
        } else if (c.isDraw() || c.isStalemate()) {
          ev = { cp: 0, mate: null, best: null };
        } else {
          const res = await engine.search(fen, { depth: 12, movetime: 700 });
          const line = res.lines[0];
          const sign = whiteToMove ? 1 : -1;
          if (!line) {
            ev = { cp: 0, mate: null, best: res.bestMove };
          } else if (line.mate !== null) {
            const m = line.mate * sign;
            ev = { cp: Math.sign(m) * (10000 - 10 * Math.abs(m)), mate: m, best: res.bestMove };
          } else {
            ev = { cp: (line.cp ?? 0) * sign, mate: null, best: res.bestMove };
          }
        }
        out.push(ev);
        setEvals([...out]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  const load = useCallback(
    (source: string, auto = true) => {
      try {
        const parsed = parseInput(source);
        setFens(parsed.fens);
        setMoves(parsed.moves);
        setPgn(parsed.pgn);
        setSel(parsed.fens.length - 1);
        setError('');
        if (auto) void runAnalysis(parsed.fens);
      } catch (e) {
        setError((e as Error).message || 'Не удалось прочитать PGN/FEN');
      }
    },
    [runAnalysis],
  );

  // источники: ?game=ID или партия с ботом из sessionStorage
  useEffect(() => {
    const gameId = params.get('game');
    if (gameId && firebaseConfigured) {
      getDoc(doc(db, 'games', gameId))
        .then((snap) => {
          if (!snap.exists()) return setError('Партия не найдена');
          const g = snap.data() as GameDoc;
          const pgnText = replay(g.moves).pgn();
          setText(pgnText);
          load(pgnText);
        })
        .catch((e: Error) => setError(e.message));
      return;
    }
    const stored = sessionStorage.getItem('analysis_pgn');
    if (stored) {
      sessionStorage.removeItem('analysis_pgn');
      setText(stored);
      load(stored);
    }
    return () => {
      cancel.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ушли из позиции перед ошибкой — режим исправления закрывается
  useEffect(() => {
    if (retry && sel !== retry.move) setRetry(null);
  }, [sel]);

  // навигация стрелками
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setSel((s) => Math.max(0, s - 1));
      if (e.key === 'ArrowRight') setSel((s) => Math.min(fens.length - 1, s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fens.length]);

  const ucis = useMemo(() => moves.map((m) => m.from + m.to + (m.promotion ?? '')), [moves]);
  const colors = useMemo(() => moves.map((m) => m.color), [moves]);

  // качество каждого хода (первые ходы по справочнику дебютов — «дебютные»)
  const quality = useMemo(
    () => moveQualities({ colors, ucis, evals, bookPlies: bookDepth(ucis, OPENINGS) }),
    [colors, ucis, evals],
  );

  const opening = useMemo(() => openingName(ucis), [ucis]);

  const summary = useMemo(
    () => ({ white: sideSummary(quality, colors, 'w'), black: sideSummary(quality, colors, 'b') }),
    [quality, colors],
  );
  // ключевые моменты: ошибки и грубые ошибки обеих сторон
  const moments = useMemo(() => keyMoments(quality), [quality]);

  const marks = useMemo(() => {
    const m: Record<number, { label: string; cls: string }> = {};
    quality.forEach((q, i) => {
      if (q.q === 'inaccuracy') m[i] = { label: '?!', cls: 'inacc' };
      if (q.q === 'mistake') m[i] = { label: '?', cls: 'mist' };
      if (q.q === 'blunder') m[i] = { label: '??', cls: 'blun' };
    });
    return m;
  }, [quality]);

  const fen = fens[sel];
  const lastMove = sel > 0 && moves[sel - 1] ? { from: moves[sel - 1].from, to: moves[sel - 1].to } : null;
  const curEval = evals[sel];
  const barWhite = curEval ? winProb(curEval.cp) : 50;
  const selQuality = sel > 0 ? quality[sel - 1] : undefined;
  const bestSan =
    sel > 0 && evals[sel - 1]?.best && selQuality && selQuality.q !== 'best' && selQuality.q !== 'book'
      ? uciToSan(fens[sel - 1], evals[sel - 1].best as string)
      : null;

  // подсказка на доске: лучший ход движка из текущей позиции
  const hintUci =
    showBest || (retry && retry.move === sel && (retry.result === 'shown' || retry.result === 'correct'))
      ? (evals[sel]?.best ?? null)
      : null;
  const hintMove = hintUci ? { from: hintUci.slice(0, 2), to: hintUci.slice(2, 4) } : null;
  const retryColor =
    retry && retry.move === sel && retry.result !== 'correct' && retry.result !== 'shown' && moves[retry.move]
      ? moves[retry.move].color === 'w'
        ? 'white'
        : 'black'
      : null;

  /** Перейти к предыдущей / следующей ошибке и показать позицию после неё. */
  function gotoMoment(dir: 1 | -1) {
    const m = neighborMoment(moments, sel > 0 ? sel - 1 : -1, dir);
    if (m) setSel(m.move + 1);
  }

  function startRetry(moveIdx: number) {
    setRetry({ move: moveIdx, result: 'pending' });
    setSel(moveIdx);
    setOrientation(moves[moveIdx].color === 'w' ? 'white' : 'black');
  }

  function onRetryMove(from: string, to: string, promotion?: string) {
    if (!retry) return;
    const uci = from + to + (promotion ?? '');
    setRetry({ ...retry, result: uci === evals[retry.move]?.best ? 'correct' : 'wrong' });
  }

  const graph = (() => {
    if (evals.length < 2) return null;
    const W = 400;
    const H = 80;
    const pts = evals.map((e, i) => {
      const x = (i / Math.max(1, fens.length - 1)) * W;
      const y = H / 2 - (Math.max(-800, Math.min(800, e.cp)) / 800) * (H / 2 - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { W, H, line: pts.join(' '), area: `0,${H / 2} ${pts.join(' ')} ${((evals.length - 1) / Math.max(1, fens.length - 1)) * W},${H / 2}` };
  })();

  return (
    <div className="analysis">
      <div className="game-layout">
        <div className="board-col">
          <div className="board-with-bar">
            <div className="eval-bar" title={fmtEval(curEval)}>
              <div className="eval-white" style={{ height: `${barWhite}%` }} />
              <span>{fmtEval(curEval)}</span>
            </div>
            {fen ? (
              <Board
                fen={fen}
                orientation={orientation}
                movable={retryColor}
                lastMove={lastMove}
                hint={hintMove}
                onMove={(f, t, p) => onRetryMove(f, t, p)}
              />
            ) : (
              <div className="board-placeholder">Вставьте партию справа</div>
            )}
          </div>
          {fen && (
            <div className="row nav-row">
              <button className="btn small" onClick={() => setSel(0)}>⏮</button>
              <button className="btn small" onClick={() => setSel((s) => Math.max(0, s - 1))}>◀</button>
              <button className="btn small" onClick={() => setSel((s) => Math.min(fens.length - 1, s + 1))}>▶</button>
              <button className="btn small" onClick={() => setSel(fens.length - 1)}>⏭</button>
              <button className="btn small" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>🔄</button>
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(fen)}>Копировать FEN</button>
            </div>
          )}
          {fen && (
            <label className="check-row">
              <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} />
              Показывать лучший ход движка на доске
            </label>
          )}
        </div>

        <div className="side-col">
          <div className="card">
            <h3>Анализ партии</h3>
            <textarea
              rows={4}
              placeholder="Вставьте PGN партии или позицию в формате FEN"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row wrap">
              <button className="btn primary" disabled={running} onClick={() => load(text)}>Анализировать</button>
              {running && (
                <button
                  className="btn"
                  onClick={() => {
                    cancel.current = true;
                    getEngine().stop();
                  }}
                >
                  Остановить
                </button>
              )}
              {pgn && (
                <button className="btn" onClick={() => navigator.clipboard?.writeText(pgn)}>Копировать PGN</button>
              )}
            </div>
            {running && (
              <div className="progress">
                <div style={{ width: `${(evals.length / Math.max(1, fens.length)) * 100}%` }} />
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>

          {moves.length > 0 && (
            <div className="card">
              {opening && (
                <div className="muted">
                  Дебют: <b>{opening}</b>
                </div>
              )}
              <div className="summary">
                <div>
                  <div className="muted">Белые</div>
                  <b className="acc">{summary.white.accuracy !== null ? `${summary.white.accuracy.toFixed(1)}%` : '—'}</b>
                  <small>
                    ?! {summary.white.counts.inaccuracy} · ? {summary.white.counts.mistake} · ?? {summary.white.counts.blunder}
                  </small>
                </div>
                <div>
                  <div className="muted">Чёрные</div>
                  <b className="acc">{summary.black.accuracy !== null ? `${summary.black.accuracy.toFixed(1)}%` : '—'}</b>
                  <small>
                    ?! {summary.black.counts.inaccuracy} · ? {summary.black.counts.mistake} · ?? {summary.black.counts.blunder}
                  </small>
                </div>
              </div>
              {graph && (
                <svg
                  className="graph"
                  viewBox={`0 0 ${graph.W} ${graph.H}`}
                  preserveAspectRatio="none"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const ply = Math.round(((e.clientX - r.left) / r.width) * (fens.length - 1));
                    setSel(Math.max(0, Math.min(fens.length - 1, ply)));
                  }}
                >
                  <polygon points={graph.area} className="graph-area" />
                  <line x1="0" x2={graph.W} y1={graph.H / 2} y2={graph.H / 2} className="graph-zero" />
                  <polyline points={graph.line} className="graph-line" />
                  <line
                    x1={(sel / Math.max(1, fens.length - 1)) * graph.W}
                    x2={(sel / Math.max(1, fens.length - 1)) * graph.W}
                    y1="0"
                    y2={graph.H}
                    className="graph-cursor"
                  />
                </svg>
              )}
              {quality.length > 0 && (
                <table className="review-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Белые</th>
                      <th>Чёрные</th>
                    </tr>
                  </thead>
                  <tbody>
                    {QUALITY_ORDER.filter((q) => summary.white.counts[q] + summary.black.counts[q] > 0).map((q) => (
                      <tr key={q}>
                        <td className={`q q-${q}`}>{QUALITY_LABEL[q]}</td>
                        <td>{summary.white.counts[q]}</td>
                        <td>{summary.black.counts[q]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {moments.length > 0 && (
                <div className="row wrap review-moments">
                  <button className="btn small" onClick={() => gotoMoment(-1)}>◀ Прошлая ошибка</button>
                  <span className="muted">Ключевых моментов: {moments.length}</span>
                  <button className="btn small" onClick={() => gotoMoment(1)}>Следующая ошибка ▶</button>
                </div>
              )}
              {retry && moves[retry.move] && (
                <div className="move-detail retry">
                  <b>Найдите лучший ход за {moves[retry.move].color === 'w' ? 'белых' : 'чёрных'}</b>
                  {retry.result === 'wrong' && <div className="error">Это не лучший ход, попробуйте ещё раз.</div>}
                  {retry.result === 'correct' && <div className="q q-best">Верно! Это ход движка.</div>}
                  {retry.result === 'shown' && (
                    <div>
                      Лучший ход: <b>{uciToSan(fens[retry.move], evals[retry.move]?.best ?? '') ?? '—'}</b>
                    </div>
                  )}
                  <div className="row wrap">
                    {retry.result !== 'correct' && retry.result !== 'shown' && (
                      <button className="btn small" onClick={() => setRetry({ ...retry, result: 'shown' })}>
                        Показать решение
                      </button>
                    )}
                    <button
                      className="btn small"
                      onClick={() => {
                        const idx = retry.move;
                        setRetry(null);
                        setSel(idx + 1);
                      }}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              )}
              {sel > 0 && moves[sel - 1] && (
                <div className="move-detail">
                  <b>
                    {Math.ceil(sel / 2)}
                    {moves[sel - 1].color === 'w' ? '.' : '...'} {moves[sel - 1].san}
                  </b>
                  {selQuality && <span className={`q q-${selQuality.q}`}> — {QUALITY_LABEL[selQuality.q]}</span>}
                  <div className="muted">Оценка: {fmtEval(curEval)}</div>
                  {bestSan && <div>Лучше было: <b>{bestSan}</b></div>}
                  {selQuality && ['inaccuracy', 'mistake', 'blunder'].includes(selQuality.q) && (
                    <button className="btn small" onClick={() => startRetry(sel - 1)}>
                      🧩 Исправить ошибку
                    </button>
                  )}
                </div>
              )}
              <MoveList moves={moves.map((m) => m.san)} current={sel} onSelect={setSel} marks={marks} />
            </div>
          )}
          {moves.length === 0 && fens.length === 1 && (
            <div className="card">
              <div>Оценка позиции: <b>{fmtEval(evals[0])}</b></div>
              {evals[0]?.best && fens[0] && <div>Лучший ход: <b>{uciToSan(fens[0], evals[0].best) ?? evals[0].best}</b></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
