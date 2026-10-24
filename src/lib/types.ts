export type Color = 'white' | 'black';
export type Category = 'bullet' | 'blitz' | 'rapid' | 'classical';

export interface Ratings {
  bullet: number;
  blitz: number;
  rapid: number;
  classical: number;
  puzzle: number;
}

export interface Stats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface Profile {
  uid: string;
  name: string;
  bio: string;
  country: string;
  ratings: Ratings;
  stats: Stats;
}

export interface GameDoc {
  white: string | null;
  black: string | null;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  participants: string[];
  moves: string[]; // SAN
  fen: string;
  lastMove: { from: string; to: string } | null;
  status: 'waiting' | 'active' | 'finished';
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  reason: string | null;
  base: number; // секунды
  inc: number; // секунды
  category: Category;
  rated: boolean;
  private: boolean;
  whiteTime: number; // мс, остаток на момент lastMoveAt
  blackTime: number;
  lastMoveAt: { toMillis: () => number } | null;
  drawOffer: Color | null;
  /** Кто просит вернуть ход (у старых партий поля может не быть). */
  takebackOffer?: Color | null;
  /** Ежедневная партия: base — это лимит на ход в секундах (дни × 86400), без добавки */
  daily?: boolean;
  /** Партия сыграна в арена-турнире с этим id */
  arenaId?: string;
  rematchOffer: Color | null;
  rematch: string | null;
  ratingApplied: Record<string, boolean>;
  ratingDelta: Record<string, number>;
  heartbeat: number;
  createdAt: { toMillis: () => number } | null;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
