// Премувы: ход, который игрок задаёт заранее, пока думает соперник.
// Чистые функции без chess.js: проверяют только геометрию хода фигуры
// (фигуры «видят сквозь» чужие фигуры, шахи не учитываются), потому что
// позиция к моменту исполнения изменится. Настоящую легальность проверяет
// доска, когда очередь доходит до игрока.

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface PieceLike {
  type: PieceType;
  color: PieceColor;
}

export type PieceAt = (square: string) => PieceLike | null;

const FILES = 'abcdefgh';

function parse(sq: string): { f: number; r: number } | null {
  if (sq.length !== 2) return null;
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  if (f < 0 || !Number.isInteger(r) || r < 0 || r > 7) return null;
  return { f, r };
}

/** Можно ли задать ход from → to как премув. */
export function isPremovePossible(pieceAt: PieceAt, from: string, to: string): boolean {
  if (from === to) return false;
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return false;
  const piece = pieceAt(from);
  if (!piece) return false;
  const target = pieceAt(to);
  if (target && target.color === piece.color) return false;

  const df = b.f - a.f;
  const dr = b.r - a.r;
  const adf = Math.abs(df);
  const adr = Math.abs(dr);

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      const startRank = piece.color === 'w' ? 1 : 6;
      if (df === 0 && dr === dir) return true;
      if (df === 0 && dr === 2 * dir && a.r === startRank) return true;
      return adf === 1 && dr === dir; // взятие (в том числе «на проходе»)
    }
    case 'n':
      return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
    case 'b':
      return adf === adr && adf > 0;
    case 'r':
      return (df === 0 || dr === 0) && adf + adr > 0;
    case 'q':
      return (adf === adr && adf > 0) || ((df === 0 || dr === 0) && adf + adr > 0);
    case 'k': {
      if (Math.max(adf, adr) === 1) return true;
      // рокировка: король с исходного поля на два шага по горизонтали
      const home = piece.color === 'w' ? 0 : 7;
      return dr === 0 && adf === 2 && a.r === home && a.f === 4;
    }
    default:
      return false;
  }
}

/** Дойдёт ли пешка до последней горизонтали этим ходом (нужно превращение). */
export function needsPromotion(pieceAt: PieceAt, from: string, to: string): boolean {
  const piece = pieceAt(from);
  const b = parse(to);
  if (!piece || piece.type !== 'p' || !b) return false;
  return piece.color === 'w' ? b.r === 7 : b.r === 0;
}
