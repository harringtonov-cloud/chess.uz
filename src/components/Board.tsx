import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { Promo } from '../lib/chessUtil';

const GLYPH: Record<string, string> = {
  k: '♚︎',
  q: '♛︎',
  r: '♜︎',
  b: '♝︎',
  n: '♞︎',
  p: '♟︎',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export interface BoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  /** Какой стороной можно ходить. null — доска только для просмотра. */
  movable?: 'white' | 'black' | 'both' | null;
  lastMove?: { from: string; to: string } | null;
  /** Подсветка подсказки */
  hint?: { from: string; to: string } | null;
  onMove?: (from: Square, to: Square, promotion?: Promo) => void;
}

export default function Board({
  fen,
  orientation = 'white',
  movable = null,
  lastMove,
  hint,
  onMove,
}: BoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);

  const turn = chess.turn(); // 'w' | 'b'
  const canMove =
    movable !== null && (movable === 'both' || (movable === 'white') === (turn === 'w'));

  const board = chess.board(); // строки от 8-й горизонтали к 1-й
  const targets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (const m of chess.moves({ square: selected, verbose: true })) {
      map.set(m.to, Boolean(m.captured) || m.flags.includes('e'));
    }
    return map;
  }, [chess, selected]);

  let checkSquare: string | null = null;
  if (chess.inCheck()) {
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) checkSquare = cell.square;
      }
    }
  }

  function tryMove(from: Square, to: Square) {
    const legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (legal.length === 0) return false;
    if (legal.some((m) => m.promotion)) {
      setPendingPromo({ from, to });
    } else {
      onMove?.(from, to);
    }
    setSelected(null);
    return true;
  }

  function onSquareClick(sq: Square) {
    if (!canMove) return;
    if (selected && selected !== sq && tryMove(selected, sq)) return;
    const piece = chess.get(sq);
    if (piece && piece.color === turn && (movable === 'both' || (movable === 'white') === (piece.color === 'w'))) {
      setSelected(selected === sq ? null : sq);
    } else {
      setSelected(null);
    }
  }

  const ranks = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className="board" role="grid" aria-label="Шахматная доска">
      {ranks.map((r, ri) =>
        files.map((f, fi) => {
          const sq = `${FILES[f]}${8 - r}` as Square;
          const cell = board[r][f];
          const dark = (f + (7 - r)) % 2 === 0;
          const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
          const isHint = hint && (hint.from === sq || hint.to === sq);
          const target = targets.has(sq);
          const cls = [
            'sq',
            dark ? 'dark' : 'light',
            isLast ? 'last' : '',
            isHint ? 'hint' : '',
            selected === sq ? 'selected' : '',
            checkSquare === sq ? 'check' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={sq}
              className={cls}
              onClick={() => onSquareClick(sq)}
              onDragOver={(e) => canMove && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData('text/plain') as Square;
                if (from) tryMove(from, sq);
              }}
            >
              {fi === 0 && <span className="coord rank">{8 - r}</span>}
              {ri === 7 && <span className="coord file">{FILES[f]}</span>}
              {target && <span className={targets.get(sq) ? 'dot capture' : 'dot'} />}
              {cell && (
                <span
                  className={`piece ${cell.color === 'w' ? 'white' : 'black'}`}
                  draggable={canMove && cell.color === turn}
                  onDragStart={(e) => {
                    if (!canMove || cell.color !== turn) return;
                    e.dataTransfer.setData('text/plain', sq);
                    e.dataTransfer.effectAllowed = 'move';
                    setSelected(sq);
                  }}
                >
                  {GLYPH[cell.type]}
                </span>
              )}
            </div>
          );
        }),
      )}
      {pendingPromo && (
        <div className="promo-overlay" onClick={() => setPendingPromo(null)}>
          <div className="promo" onClick={(e) => e.stopPropagation()}>
            {(['q', 'r', 'b', 'n'] as Promo[]).map((p) => (
              <button
                key={p}
                className={`piece ${turn === 'w' ? 'white' : 'black'}`}
                onClick={() => {
                  onMove?.(pendingPromo.from, pendingPromo.to, p);
                  setPendingPromo(null);
                }}
              >
                {GLYPH[p]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
