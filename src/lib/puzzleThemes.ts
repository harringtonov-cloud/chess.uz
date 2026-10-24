// Темы задач: русские названия, список для выбора и чистые помощники (проверяются тестами).

export const THEME_RU: Record<string, string> = {
  mateIn1: 'Мат в 1 ход',
  mateIn2: 'Мат в 2 хода',
  mateIn3: 'Мат в 3 хода',
  mateIn4: 'Мат в 4 хода',
  mateIn5: 'Мат в 5 ходов',
  mate: 'Мат',
  fork: 'Вилка',
  pin: 'Связка',
  skewer: 'Линейный удар',
  discoveredAttack: 'Открытое нападение',
  discoveredCheck: 'Вскрытый шах',
  doubleCheck: 'Двойной шах',
  deflection: 'Отвлечение',
  attraction: 'Завлечение',
  interference: 'Перекрытие',
  clearance: 'Освобождение поля',
  sacrifice: 'Жертва',
  exposedKing: 'Открытый король',
  backRankMate: 'Мат на последней горизонтали',
  smotheredMate: 'Спёртый мат',
  anastasiaMate: 'Мат Анастасии',
  arabianMate: 'Арабский мат',
  hookMate: 'Мат крюком',
  bodenMate: 'Мат Бодена',
  endgame: 'Эндшпиль',
  pawnEndgame: 'Пешечный эндшпиль',
  rookEndgame: 'Ладейный эндшпиль',
  bishopEndgame: 'Слоновый эндшпиль',
  knightEndgame: 'Коневой эндшпиль',
  queenEndgame: 'Ферзевый эндшпиль',
  middlegame: 'Миттельшпиль',
  opening: 'Дебют',
  short: 'Короткая',
  long: 'Длинная',
  veryLong: 'Очень длинная',
  oneMove: 'В один ход',
  advantage: 'Преимущество',
  crushing: 'Решающее преимущество',
  equality: 'Уравнять позицию',
  hangingPiece: 'Незащищённая фигура',
  capturingDefender: 'Взятие защитника',
  defensiveMove: 'Защита',
  quietMove: 'Тихий ход',
  intermezzo: 'Промежуточный ход',
  promotion: 'Превращение',
  underPromotion: 'Слабое превращение',
  trappedPiece: 'Пойманная фигура',
  zugzwang: 'Цугцванг',
  kingsideAttack: 'Атака на королевском фланге',
  queensideAttack: 'Атака на ферзевом фланге',
  castling: 'Рокировка',
  enPassant: 'Взятие на проходе',
  xRayAttack: 'Рентген',
  advancedPawn: 'Проходная пешка',
  master: 'Из партий мастеров',
  masterVsMaster: 'Партии мастеров',
  superGM: 'Партии супергроссмейстеров',
};

/** Темы для выбора: что именно тренировать. Первая — любые задачи. */
export const THEME_CHOICES: { value: string; group: string }[] = [
  { value: '', group: 'Любые' },
  ...[
    'mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate', 'anastasiaMate', 'arabianMate', 'hookMate',
  ].map((value) => ({ value, group: 'Маты' })),
  ...[
    'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'interference',
    'clearance', 'sacrifice', 'hangingPiece', 'trappedPiece', 'intermezzo', 'quietMove', 'zugzwang', 'xRayAttack',
    'exposedKing', 'kingsideAttack', 'queensideAttack',
  ].map((value) => ({ value, group: 'Тактика' })),
  ...[
    'opening', 'middlegame', 'endgame', 'pawnEndgame', 'rookEndgame', 'bishopEndgame', 'knightEndgame',
    'queenEndgame', 'promotion', 'advancedPawn',
  ].map((value) => ({ value, group: 'Стадии партии' })),
  ...['short', 'long', 'veryLong', 'crushing', 'advantage', 'equality', 'defensiveMove'].map((value) => ({
    value,
    group: 'Характер задачи',
  })),
];

export function themeLabel(theme: string): string {
  return THEME_RU[theme] ?? theme;
}

/** Допустимая тема: пустая (любая) или из списка. Неизвестное значение (например, из памяти браузера) отбрасывается. */
export function sanitizeTheme(theme: string | null | undefined): string {
  return theme && THEME_CHOICES.some((c) => c.value === theme) ? theme : '';
}

/** Адрес API Lichess для следующей задачи, задачи дня или задачи по теме. */
export function puzzleUrl(kind: 'next' | 'daily', theme = ''): string {
  const base = `https://lichess.org/api/puzzle/${kind}`;
  const t = sanitizeTheme(theme);
  return kind === 'next' && t ? `${base}?angle=${encodeURIComponent(t)}` : base;
}

/** Запасная задача: сначала подходящие по теме, иначе любые. n — счётчик показанных запасных. */
export function pickFallback<T extends { themes: string[] }>(list: T[], theme: string, n: number): { puzzle: T; matched: boolean } {
  const t = sanitizeTheme(theme);
  const same = t ? list.filter((p) => p.themes.includes(t)) : [];
  const pool = same.length > 0 ? same : list;
  return { puzzle: pool[n % pool.length], matched: same.length > 0 || !t };
}
