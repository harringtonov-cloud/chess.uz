import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { Promo } from '../lib/chessUtil';
import { useSettings } from '../lib/settings';
import PieceIcon from './PieceIcon';

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
  const settings = useSettings();
  const useSvg = settings.pieceSet === 'svg';
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);
  // стрелки и пометки: рисуются правой кнопкой мыши, исчезают при ходе или левом клике
  const [arrows, setArrows] = useState<{ from: string; to: string }[]>([]);
  const [marks, setMarks] = useState<string[]>([]);
  const [drawFrom, setDrawFrom] = useState<string | null>(null);

  useEffect(() => {
    setArrows([]);
    setMarks([]);
  }, [fen]);

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
    if (arrows.length || marks.length) {
      setArrows([]);
      setMarks([]);
    }
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
    <div
      className="board"
      role="grid"
      aria-label="Шахматная доска"
      onContextMenu={(e) => e.preventDefault()}
    >
      {ranks.map((r, ri) =>
        files.map((f, fi) => {
          const sq = `${FILES[f]}${8 - r}` as Square;
          const cell = board[r][f];
          const dark = (f + (7 - r)) % 2 === 0;
          const isLast = settings.highlights && lastMove && (lastMove.from === sq || lastMove.to === sq);
          const isHint = hint && (hint.from === sq || hint.to === sq);
          const target = targets.has(sq);
          const cls = [
            'sq',
            dark ? 'dark' : 'light',
            isLast ? 'last' : '',
            isHint ? 'hint' : '',
            settings.highlights && selected === sq ? 'selected' : '',
            checkSquare === sq ? 'check' : '',
            marks.includes(sq) ? 'mark' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={sq}
              className={cls}
              onClick={() => onSquareClick(sq)}
              onMouseDown={(e) => {
                if (e.button === 2) setDrawFrom(sq);
              }}
              onMouseUp={(e) => {
                if (e.button !== 2 || !drawFrom) return;
                const from = drawFrom;
                setDrawFrom(null);
                if (from === sq) {
                  setMarks((m) => (m.includes(sq) ? m.filter((x) => x !== sq) : [...m, sq]));
                } else {
                  setArrows((a) =>
                    a.some((x) => x.from === from && x.to === sq)
                      ? a.filter((x) => !(x.from === from && x.to === sq))
                      : [...a, { from, to: sq }],
                  );
                }
              }}
              onDragOver={(e) => canMove && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData('text/plain') as Square;
                if (from) tryMove(from, sq);
              }}
            >
              {settings.coords && fi === 0 && <span className="coord rank">{8 - r}</span>}
              {settings.coords && ri === 7 && <span className="coord file">{FILES[f]}</span>}
              {target && <span className={targets.get(sq) ? 'dot capture' : 'dot'} />}
              {cell && (
                <span
                  className={`piece ${cell.color === 'w' ? 'white' : 'black'}${useSvg ? ' svg' : ''}`}
                  draggable={canMove && cell.color === turn}
                  onDragStart={(e) => {
                    if (!canMove || cell.color !== turn) return;
                    e.dataTransfer.setData('text/plain', sq);
                    e.dataTransfer.effectAllowed = 'move';
                    setSelected(sq);
                  }}
                >
                  {useSvg ? <PieceIcon type={cell.type} color={cell.color} /> : GLYPH[cell.type]}
                </span>
              )}
            </div>
          );
        }),
      )}
      {arrows.length > 0 && (
        <svg className="board-arrows" viewBox="0 0 8 8" aria-hidden="true">
          {arrows.map((a) => {
            const c = (sq: string): [number, number] => [
              files.indexOf(FILES.indexOf(sq[0])) + 0.5,
              ranks.indexOf(8 - Number(sq[1])) + 0.5,
            ];
            const [x1, y1] = c(a.from);
            const [x2, y2] = c(a.to);
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const ux = (x2 - x1) / len;
            const uy = (y2 - y1) / len;
            const head = 0.4;
            const bx = x2 - ux * head;
            const by = y2 - uy * head;
            const px = -uy * 0.22;
            const py = ux * 0.22;
            return (
              <g key={a.from + a.to}>
                <line x1={x1} y1={y1} x2={bx} y2={by} className="arrow-line" />
                <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} className="arrow-head" />
              </g>
            );
          })}
        </svg>
      )}
      {pendingPromo && (
        <div className="promo-overlay" onClick={() => setPendingPromo(null)}>
          <div className="promo" onClick={(e) => e.stopPropagation()}>
            {(['q', 'r', 'b', 'n'] as Promo[]).map((p) => (
              <button
                key={p}
                className={`piece ${turn === 'w' ? 'white' : 'black'}${useSvg ? ' svg' : ''}`}
                onClick={() => {
                  onMove?.(pendingPromo.from, pendingPromo.to, p);
                  setPendingPromo(null);
                }}
              >
                {useSvg ? <PieceIcon type={p} color={turn} /> : GLYPH[p]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
