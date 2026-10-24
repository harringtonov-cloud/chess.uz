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
 * Превращает ответ Lichess в задачу; null, если позицию не удалось восстановить. Формат ответа:
 * game.pgn — партия до задачи, puzzle.solution — ходы решения, начиная с первого хода решающего.
 * Если первый ход решения не подходит к позиции после всего PGN, пробуем позицию на полход раньше.
 */
function convertPuzzle(data: {
  game: { pgn: string };
  puzzle: { id: string; rating: number; solution: string[]; themes?: string[] };
}): Puzzle | null {
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
  return null;
}

/** Случайная задача из базы Lichess: следующая, задача дня или по теме. */
export async function fetchPuzzle(kind: 'next' | 'daily' = 'next', theme = ''): Promise<Puzzle> {
  const res = await fetch(puzzleUrl(kind, theme), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const p = convertPuzzle(await res.json());
  if (!p) throw new Error('Не удалось разобрать задачу');
  return p;
}

/**
 * Пачка разных задач для дуэли. Сначала один запрос к пакетному API Lichess;
 * если он недоступен — набираем по одной. Возвращает сколько получилось (может быть меньше nb).
 */
export async function fetchPuzzleBatch(nb: number): Promise<Puzzle[]> {
  try {
    const res = await fetch(`https://lichess.org/api/puzzle/batch/mix?nb=${Math.min(50, Math.max(1, nb))}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { puzzles?: Parameters<typeof convertPuzzle>[0][] };
      const list = (data.puzzles ?? []).map((d) => {
        try {
          return convertPuzzle(d);
        } catch {
          return null;
        }
      });
      const ok = list.filter((p): p is Puzzle => p !== null);
      if (ok.length > 0) return ok;
    }
  } catch {
    /* пакетный запрос не удался — пробуем по одной */
  }
  const seen = new Set<string>();
  const out: Puzzle[] = [];
  for (let i = 0; i < nb + 4 && out.length < Math.min(nb, 12); i++) {
    try {
      const p = await fetchPuzzle();
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    } catch {
      break;
    }
  }
  return out;
}
