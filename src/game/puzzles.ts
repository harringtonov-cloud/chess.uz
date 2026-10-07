export type Puzzle = {
  id: string
  title: string
  rating: number
  fen: string
  /** Full line in SAN, starting with the side to move in the FEN. */
  solution: string[]
  hint: string
}

/** Hand-checked short tactical lines for CHESS.UZ. */
export const STARTER_PUZZLES: Puzzle[] = [
  {
    id: 'p1',
    title: 'Мат ладьёй',
    rating: 600,
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: ['Re8#'],
    hint: 'Ладья на e8',
  },
  {
    id: 'p2',
    title: 'Детский мат',
    rating: 500,
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    solution: ['Qxf7#'],
    hint: 'Ферзь бьёт f7',
  },
  {
    id: 'p3',
    title: 'Свободная пешка',
    rating: 450,
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    solution: ['exd5'],
    hint: 'Бери на d5',
  },
  {
    id: 'p4',
    title: 'Мат ферзём',
    rating: 700,
    fen: '6k1/5ppp/8/8/8/5Q2/5PPP/6K1 w - - 0 1',
    solution: ['Qf8#'],
    hint: 'Ферзь на f8',
  },
  {
    id: 'p5',
    title: 'Рокировка',
    rating: 550,
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 4',
    solution: ['O-O'],
    hint: 'Короткая рокировка',
  },
  {
    id: 'p6',
    title: 'Линейный удар',
    rating: 1000,
    fen: '4k3/8/8/4q3/8/8/8/4R1K1 w - - 0 1',
    solution: ['Re8+'],
    hint: 'Шах ладьёй — король и ферзь на одной линии',
  },
  {
    id: 'p7',
    title: 'Мат на краю',
    rating: 850,
    fen: '6k1/5ppp/8/8/8/5N2/5PPP/4Q1K1 w - - 0 1',
    solution: ['Qe8#'],
    hint: 'Ферзь на e8',
  },
  {
    id: 'p8',
    title: 'Шах слоном',
    rating: 900,
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5',
    solution: ['Bxf7+'],
    hint: 'Слон бьёт f7 с шахом',
  },
  {
    id: 'p9',
    title: 'Завлечение',
    rating: 950,
    fen: '2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1',
    solution: ['Rc8+'],
    hint: 'Ладья на c8',
  },
  {
    id: 'p10',
    title: 'Ход конём',
    rating: 800,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    solution: ['Nf3'],
    hint: 'Классическое развитие коня',
  },
]
