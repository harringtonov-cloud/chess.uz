import { Chess } from 'chess.js';
import { uciToMove } from './chessUtil';
import { puzzleUrl } from './puzzleThemes';

export interface Puzzle {
  id: string;
  rating: number;
  fen: string; // позиция, в которой ходит решающий
  solution: string[]; // UCI: ход решающего, ответ, ход решающего…
  themes: string[];
}

// Запасные задачи на случай, если загрузить базу Lichess не удалось
export const FALLBACK: Puzzle[] = [
  {
    id: 'local-backrank',
    rating: 600,
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['a1a8'],
    themes: ['mateIn1', 'backRankMate'],
  },
  {
    id: 'local-fools',
    rating: 400,
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    solution: ['d8h4'],
    themes: ['mateIn1'],
  },
];


/**
 * Случайная задача из базы Lichess. Формат ответа: game.pgn — партия до задачи,
 * puzzle.solution — ходы решения, начиная с первого хода решающего.
 * Если первый ход решения не подходит к позиции после всего PGN, пробуем позицию на полход раньше.
 */
export async function fetchPuzzle(kind: 'next' | 'daily' = 'next', theme = ''): Promise<Puzzle> {
  const res = await fetch(puzzleUrl(kind, theme), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const solution: string[] = data.puzzle.solution;
  const game = new Chess();
  game.loadPgn(data.game.pgn);
  const history = game.history();

  // кандидаты: позиция после всего PGN, затем на полход раньше
  const candidates = [history, history.slice(0, -1)];
  for (const moves of candidates) {
    const c = new Chess();
    for (const m of moves) c.move(m);
    try {
      new Chess(c.fen()).move(uciToMove(solution[0]));
    } catch {
      continue;
    }
    return {
      id: data.puzzle.id,
      rating: data.puzzle.rating,
      fen: c.fen(),
      solution,
      themes: data.puzzle.themes ?? [],
    };
  }
  throw new Error('Не удалось разобрать задачу');
}
