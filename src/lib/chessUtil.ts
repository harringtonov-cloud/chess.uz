import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

export type Promo = 'q' | 'r' | 'b' | 'n';

/** Воспроизводит партию из списка ходов в SAN (с историей, чтобы работали повторения). */
export function replay(moves: string[]): Chess {
  const chess = new Chess();
  for (const m of moves) chess.move(m);
  return chess;
}

export function gameOverInfo(chess: Chess): { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null {
  if (chess.isCheckmate()) {
    // ходит проигравший
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'repetition' };
  if (chess.isDraw()) return { result: '1/2-1/2', reason: 'fifty-move' };
  return null;
}

export const REASON_LABEL: Record<string, string> = {
  checkmate: 'мат',
  stalemate: 'пат',
  insufficient: 'недостаточно материала',
  repetition: 'троекратное повторение',
  'fifty-move': 'правило 50 ходов',
  resignation: 'сдача',
  timeout: 'время вышло',
  agreement: 'ничья по согласию',
  aborted: 'партия отменена',
  abandoned: 'соперник не пришёл',
};

export function resultText(result: string | null, reason: string | null): string {
  const why = reason ? REASON_LABEL[reason] ?? reason : '';
  if (result === '1-0') return `Белые победили${why ? ` · ${why}` : ''}`;
  if (result === '0-1') return `Чёрные победили${why ? ` · ${why}` : ''}`;
  if (result === '1/2-1/2') return `Ничья${why ? ` · ${why}` : ''}`;
  return why || 'Партия отменена';
}

export function uciToMove(uci: string): { from: Square; to: Square; promotion?: Promo } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? (uci[4] as Promo) : undefined,
  };
}

/** Перевод хода из UCI в SAN для заданной позиции. */
export function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    return chess.move(uciToMove(uci)).san;
  } catch {
    return null;
  }
}
