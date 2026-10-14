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
