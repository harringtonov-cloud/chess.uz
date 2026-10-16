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
import { openingName } from '../lib/openings';
import type { GameDoc } from '../lib/types';

interface Ev {
  cp: number; // сантипешки, с точки зрения белых
  mate: number | null; // знак: + мат ставят белые
  best: string | null; // лучший ход в позиции (UCI)
}

type Quality = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const QUALITY_LABEL: Record<Quality, string> = {
  best: 'Лучший ход',
  excellent: 'Отличный ход',
  good: 'Хороший ход',
  inaccuracy: 'Неточность',
  mistake: 'Ошибка',
  blunder: 'Грубая ошибка',
};

function winProb(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function fmtEval(e: Ev | undefined): string {
  if (!e) return '…';
  if (e.mate !== null) return `${e.mate > 0 ? '+' : '-'}M${Math.abs(e.mate)}`;
  const v = e.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

function classify(loss: number, isBest: boolean): Quality {
  if (isBest || loss <= 0.5) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 6) return 'good';
  if (loss < 12) return 'inaccuracy';
  if (loss < 24) return 'mistake';
  return 'blunder';
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

  // качество каждого хода
  const quality = useMemo(() => {
    const result: { q: Quality; loss: number; acc: number }[] = [];
    for (let i = 0; i < moves.length; i++) {
      const before = evals[i];
      const after = evals[i + 1];
      if (!before || !after) break;
      const white = moves[i].color === 'w';
      const wpBefore = white ? winProb(before.cp) : 100 - winProb(before.cp);
      const wpAfter = white ? winProb(after.cp) : 100 - winProb(after.cp);
      const loss = Math.max(0, wpBefore - wpAfter);
      const uci = moves[i].from + moves[i].to + (moves[i].promotion ?? '');
      const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
      result.push({ q: classify(loss, before.best === uci), loss, acc });
    }
    return result;
  }, [moves, evals]);

  const opening = useMemo(
    () => openingName(moves.map((m) => m.from + m.to + (m.promotion ?? ''))),
    [moves],
  );

  const summary = useMemo(() => {
    const side = (color: 'w' | 'b') => {
      const idx = moves.map((m, i) => (m.color === color ? i : -1)).filter((i) => i >= 0 && quality[i]);
      const count = (q: Quality) => idx.filter((i) => quality[i].q === q).length;
      return {
        accuracy: idx.length ? idx.reduce((s, i) => s + quality[i].acc, 0) / idx.length : null,
        inaccuracy: count('inaccuracy'),
        mistake: count('mistake'),
        blunder: count('blunder'),
      };
    };
    return { white: side('w'), black: side('b') };
  }, [moves, quality]);

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
    sel > 0 && evals[sel - 1]?.best && selQuality && selQuality.q !== 'best'
      ? uciToSan(fens[sel - 1], evals[sel - 1].best as string)
      : null;

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
              <Board fen={fen} orientation={orientation} movable={null} lastMove={lastMove} />
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
                    ?! {summary.white.inaccuracy} · ? {summary.white.mistake} · ?? {summary.white.blunder}
                  </small>
                </div>
                <div>
                  <div className="muted">Чёрные</div>
                  <b className="acc">{summary.black.accuracy !== null ? `${summary.black.accuracy.toFixed(1)}%` : '—'}</b>
                  <small>
                    ?! {summary.black.inaccuracy} · ? {summary.black.mistake} · ?? {summary.black.blunder}
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
              {sel > 0 && moves[sel - 1] && (
                <div className="move-detail">
                  <b>
                    {Math.ceil(sel / 2)}
                    {moves[sel - 1].color === 'w' ? '.' : '...'} {moves[sel - 1].san}
                  </b>
                  {selQuality && <span className={`q q-${selQuality.q}`}> — {QUALITY_LABEL[selQuality.q]}</span>}
                  <div className="muted">Оценка: {fmtEval(curEval)}</div>
                  {bestSan && <div>Лучше было: <b>{bestSan}</b></div>}
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
