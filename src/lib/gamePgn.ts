import { buildPgn, buildPgnBundle, pgnFileName } from './pgn';
import type { PgnGame } from './pgn';
import type { GameDoc } from './types';

export function toPgnGame(g: GameDoc, id: string): PgnGame {
  return {
    moves: g.moves,
    white: g.whiteName,
    black: g.blackName,
    whiteRating: g.whiteRating || undefined,
    blackRating: g.blackRating || undefined,
    result: g.status === 'finished' ? g.result : null,
    reason: g.status === 'finished' ? g.reason : null,
    base: g.base,
    inc: g.inc,
    rated: g.rated,
    daily: g.daily,
    category: g.category,
    createdAt: g.createdAt ? g.createdAt.toMillis() : undefined,
    url: typeof window !== 'undefined' ? `${window.location.origin}/game/${id}` : undefined,
  };
}

export const gamePgn = (g: GameDoc, id: string) => buildPgn(toPgnGame(g, id));
export const gamesPgn = (rows: { id: string; g: GameDoc }[]) => buildPgnBundle(rows.map((r) => toPgnGame(r.g, r.id)));
export const gamePgnFile = (g: GameDoc) =>
  pgnFileName(g.whiteName, g.blackName, g.createdAt ? g.createdAt.toMillis() : undefined);
