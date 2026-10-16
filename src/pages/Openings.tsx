import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import MoveList from '../components/MoveList';
import { replay, uciToMove } from '../lib/chessUtil';
import { OPENINGS, continuations, openingName } from '../lib/openings';
import { playSound } from '../lib/sound';

function toUci(moves: string[]): string[] {
  return replay(moves)
    .history({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ''));
}

export default function Openings() {
  const nav = useNavigate();
  const [moves, setMoves] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [search, setSearch] = useState('');

  const chess = useMemo(() => replay(moves), [moves]);
  const ucis = useMemo(() => toUci(moves), [moves]);
  const name = useMemo(() => openingName(ucis), [ucis]);
  const next = useMemo(() => continuations(ucis), [ucis]);
  const last = useMemo(() => {
    const h = chess.history({ verbose: true });
    return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  }, [chess]);

  function play(from: string, to: string, promotion?: string) {
    try {
      const c = replay(moves);
      const mv = c.move({ from, to, promotion });
      setMoves([...moves, mv.san]);
      playSound(mv.san.includes('x') ? 'capture' : 'move');
    } catch {
      /* нелегальный ход игнорируем */
    }
  }

  function playUci(uci: string) {
    const m = uciToMove(uci);
    play(m.from, m.to, m.promotion);
  }

  function open(line: string) {
    const c = new Chess();
    const sans: string[] = [];
    for (const u of line.split(' ')) sans.push(c.move(uciToMove(u)).san);
    setMoves(sans);
  }

  const found = search.trim()
    ? OPENINGS.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="game-layout">
      <div className="board-col">
        <Board
          fen={chess.fen()}
          orientation={flipped ? 'black' : 'white'}
          movable="both"
          lastMove={last}
          onMove={(f, t, p) => play(f, t, p)}
        />
        <div className="row nav-row">
          <button className="btn small" onClick={() => setMoves([])}>⏮</button>
          <button className="btn small" disabled={moves.length === 0} onClick={() => setMoves(moves.slice(0, -1))}>◀ Назад</button>
          <button className="btn small" onClick={() => setFlipped((f) => !f)}>🔄</button>
          <button
            className="btn small"
            disabled={moves.length === 0}
            onClick={() => {
              sessionStorage.setItem('analysis_pgn', chess.pgn());
              nav('/analysis');
            }}
          >
            📈 В анализ
          </button>
        </div>
      </div>
      <div className="side-col">
        <div className="card">
          <h2>Дебютный справочник</h2>
          <div className="opening-name">{name ?? (moves.length ? 'Позиция вне справочника' : 'Начальная позиция')}</div>
          <MoveList moves={moves} current={moves.length} onSelect={(p) => setMoves(moves.slice(0, p))} />
          <h4>Известные продолжения</h4>
          {next.length === 0 && <p className="muted">Из этой позиции в справочнике продолжений нет, но вы можете ходить сами.</p>}
          <div className="continuations">
            {next.map((c) => {
              const san = (() => {
                try {
                  return new Chess(chess.fen()).move(uciToMove(c.uci)).san;
                } catch {
                  return c.uci;
                }
              })();
              return (
                <button key={c.uci} className="continuation" onClick={() => playUci(c.uci)}>
                  <b>{san}</b>
                  <span className="muted">
                    {c.name ?? ''}
                    {c.name ? ' · ' : ''}
                    {c.lines} {c.lines === 1 ? 'линия' : 'линий'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="card">
          <h4>Найти дебют по названию</h4>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Например: сицилианская, Найдорф" />
          <div className="continuations">
            {found.map((o) => (
              <button key={o.moves} className="continuation" onClick={() => { open(o.moves); setSearch(''); }}>
                <b>{o.name}</b>
              </button>
            ))}
          </div>
          <p className="muted">Справочник содержит {OPENINGS.length} основных дебютных систем и вариантов. Статистики побед пока нет.</p>
        </div>
      </div>
    </div>
  );
}
