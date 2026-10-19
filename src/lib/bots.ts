export interface Bot {
  id: string;
  name: string;
  avatar: string;
  elo: number;
  skill: number; // Skill Level Stockfish 0..20
  depth: number;
  movetime: number; // мс
  blurb: string;
}

export const BOTS: Bot[] = [
  { id: 'niko', name: 'Нико', avatar: '🐣', elo: 400, skill: 0, depth: 1, movetime: 50, blurb: 'Только учится двигать фигуры.' },
  { id: 'aydana', name: 'Айдана', avatar: '🌸', elo: 800, skill: 3, depth: 2, movetime: 100, blurb: 'Играет бодро, но часто зевает.' },
  { id: 'timur', name: 'Тимур', avatar: '🦊', elo: 1200, skill: 6, depth: 4, movetime: 200, blurb: 'Знает тактику, ошибается в планах.' },
  { id: 'lola', name: 'Лола', avatar: '🦋', elo: 1600, skill: 10, depth: 6, movetime: 400, blurb: 'Сильный клубный игрок.' },
  { id: 'farhod', name: 'Фарход', avatar: '🐺', elo: 2000, skill: 14, depth: 9, movetime: 700, blurb: 'Редко оставляет фигуры без защиты.' },
  { id: 'kamila', name: 'Камила', avatar: '🦅', elo: 2400, skill: 18, depth: 12, movetime: 1000, blurb: 'Уровень мастера.' },
  { id: 'ulugbek', name: 'Улугбек', avatar: '🔭', elo: 2800, skill: 20, depth: 16, movetime: 1500, blurb: 'Почти полная сила движка.' },
];

export type Odds = 'none' | 'pawn' | 'knight' | 'rook' | 'queen' | 'queen-rook';

export const ODDS_LABEL: Record<Odds, string> = {
  none: 'Без форы',
  pawn: 'Бот без пешки f',
  knight: 'Бот без коня',
  rook: 'Бот без ладьи',
  queen: 'Бот без ферзя',
  'queen-rook': 'Бот без ферзя и ладьи',
};

/** Начальная позиция, в которой боту (его цвет — botColor) не хватает фигур. Ход белых. */
export function oddsFen(botColor: 'white' | 'black', odds: Odds): string {
  const rows: string[][] = [
    'rnbqkbnr'.split(''),
    'pppppppp'.split(''),
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    'PPPPPPPP'.split(''),
    'RNBQKBNR'.split(''),
  ];
  const back = botColor === 'black' ? 0 : 7;
  const pawns = botColor === 'black' ? 1 : 6;
  let castling = 'KQkq';
  const dropRook = () => {
    rows[back][0] = '';
    castling = castling.replace(botColor === 'black' ? 'q' : 'Q', '');
  };
  if (odds === 'pawn') rows[pawns][5] = '';
  if (odds === 'knight') rows[back][1] = '';
  if (odds === 'rook' || odds === 'queen-rook') dropRook();
  if (odds === 'queen' || odds === 'queen-rook') rows[back][3] = '';
  const placement = rows
    .map((row) => {
      let out = '';
      let empty = 0;
      for (const cell of row) {
        if (cell === '') {
          empty += 1;
        } else {
          if (empty) out += String(empty);
          empty = 0;
          out += cell;
        }
      }
      return out + (empty ? String(empty) : '');
    })
    .join('/');
  return `${placement} w ${castling || '-'} - 0 1`;
}
