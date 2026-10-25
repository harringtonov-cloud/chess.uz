// Запуск проверки партии: Stockfish оценивает позиции, затем статистика и подозрительность по каждой стороне.
// Работает в браузере модератора. Чистая математика — в anticheat.ts.

import { Chess } from 'chess.js';
import { suspicion, sideStats } from './anticheat';
import type { EvalPoint, PlyInput, SideStats, Suspicion } from './anticheat';
import { getEngine } from './engine';
import { OPENINGS } from './openings';
import { bookDepth } from './review';
import type { GameDoc } from './types';

export interface SideReport {
  color: 'white' | 'black';
  uid: string | null;
  name: string;
  rating: number;
  stats: SideStats;
  verdict: Suspicion;
}

export interface GameReport {
  gameId: string;
  plies: number;
  hasTimes: boolean;
  white: SideReport;
  black: SideReport;
}

/** Оценка позиции с точки зрения белых (мат → большое значение). */
async function evaluate(fen: string, depth: number, movetime: number): Promise<EvalPoint> {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000, best: null };
  if (c.isDraw() || c.isStalemate()) return { cp: 0, best: null };
  const res = await getEngine().search(fen, { depth, movetime });
  const line = res.lines[0];
  const sign = c.turn() === 'w' ? 1 : -1;
  if (!line) return { cp: 0, best: res.bestMove };
  if (line.mate !== null) {
    const m = line.mate * sign;
    return { cp: Math.sign(m) * (10000 - 10 * Math.abs(m)), best: res.bestMove };
  }
  return { cp: (line.cp ?? 0) * sign, best: res.bestMove };
}

export async function checkGame(
  gameId: string,
  game: GameDoc,
  onProgress: (done: number, total: number) => void,
  control: { cancel: boolean },
): Promise<GameReport | null> {
  const chess = new Chess();
  const fens = [chess.fen()];
  const ucis: string[] = [];
  const legal: number[] = [];
  for (const san of game.moves) {
    legal.push(chess.moves().length);
    const m = chess.move(san);
    ucis.push(m.from + m.to + (m.promotion ?? ''));
    fens.push(chess.fen());
  }
  const evals: EvalPoint[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (control.cancel) return null;
    evals.push(await evaluate(fens[i], 12, 500));
    onProgress(i + 1, fens.length);
  }
  const hasTimes = Boolean(game.times && game.times.length === game.moves.length);
  const plies: PlyInput[] = ucis.map((uci, i) => ({
    color: i % 2 === 0 ? 'w' : 'b',
    uci,
    before: evals[i],
    after: evals[i + 1],
    legalMoves: legal[i],
    timeMs: hasTimes ? (game.times as number[])[i] : null,
  }));
  const book = bookDepth(ucis, OPENINGS);
  const side = (color: 'white' | 'black'): SideReport => {
    const c = color === 'white' ? 'w' : 'b';
    const rating = color === 'white' ? game.whiteRating : game.blackRating;
    const stats = sideStats(plies, c, book, game.blurs?.[color] ?? 0);
    return {
      color,
      uid: game[color],
      name: color === 'white' ? game.whiteName : game.blackName,
      rating,
      stats,
      verdict: suspicion(stats, rating),
    };
  };
  return { gameId, plies: ucis.length, hasTimes, white: side('white'), black: side('black') };
}
