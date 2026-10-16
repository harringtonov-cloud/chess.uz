// Файл сгенерирован из проверенных данных: все ходы прогнаны через проверку на легальность.
export interface Opening {
  name: string;
  /** Ходы UCI через пробел */
  moves: string;
}

export const OPENINGS: Opening[] = [
  {
    "name": "Королевская пешка (1.e4)",
    "moves": "e2e4"
  },
  {
    "name": "Ферзевая пешка (1.d4)",
    "moves": "d2d4"
  },
  {
    "name": "Английское начало (1.c4)",
    "moves": "c2c4"
  },
  {
    "name": "Дебют Рети (1.Кf3)",
    "moves": "g1f3"
  },
  {
    "name": "Дебют Бёрда (1.f4)",
    "moves": "f2f4"
  },
  {
    "name": "Дебют Ларсена (1.b3)",
    "moves": "b2b3"
  },
  {
    "name": "Венгерское начало (1.g3)",
    "moves": "g2g3"
  },
  {
    "name": "Польское начало (1.b4)",
    "moves": "b2b4"
  },
  {
    "name": "Атака Гроба (1.g4)",
    "moves": "g2g4"
  },
  {
    "name": "Открытая игра (1.e4 e5)",
    "moves": "e2e4 e7e5"
  },
  {
    "name": "Сицилианская защита",
    "moves": "e2e4 c7c5"
  },
  {
    "name": "Французская защита",
    "moves": "e2e4 e7e6"
  },
  {
    "name": "Защита Каро-Канн",
    "moves": "e2e4 c7c6"
  },
  {
    "name": "Скандинавская защита",
    "moves": "e2e4 d7d5"
  },
  {
    "name": "Скандинавская защита: 2...Фxd5",
    "moves": "e2e4 d7d5 e4d5 d8d5"
  },
  {
    "name": "Защита Пирца–Уфимцева",
    "moves": "e2e4 d7d6"
  },
  {
    "name": "Современная защита",
    "moves": "e2e4 g7g6"
  },
  {
    "name": "Современная защита: 2.d4 Сg7",
    "moves": "e2e4 g7g6 d2d4 f8g7"
  },
  {
    "name": "Защита Алехина",
    "moves": "e2e4 g8f6"
  },
  {
    "name": "Защита Алехина: 2.e5",
    "moves": "e2e4 g8f6 e4e5 f6d5"
  },
  {
    "name": "Защита Пирца: классическая система",
    "moves": "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6"
  },
  {
    "name": "Открытая игра: 2.Кf3 Кc6",
    "moves": "e2e4 e7e5 g1f3 b8c6"
  },
  {
    "name": "Испанская партия (Рюи Лопес)",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1b5"
  },
  {
    "name": "Испанская партия: защита Морфи",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6"
  },
  {
    "name": "Испанская партия: Берлинская защита",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1b5 g8f6"
  },
  {
    "name": "Итальянская партия",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1c4"
  },
  {
    "name": "Итальянская партия: Джуоко Пьяно",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5"
  },
  {
    "name": "Гамбит Эванса",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4"
  },
  {
    "name": "Итальянская партия: Джуоко Пианиссимо",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3"
  },
  {
    "name": "Защита двух коней",
    "moves": "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6"
  },
  {
    "name": "Шотландская партия",
    "moves": "e2e4 e7e5 g1f3 b8c6 d2d4"
  },
  {
    "name": "Шотландская партия: 3...exd4 4.Кxd4",
    "moves": "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4"
  },
  {
    "name": "Дебют четырёх коней",
    "moves": "e2e4 e7e5 g1f3 b8c6 b1c3 g8f6"
  },
  {
    "name": "Русская партия (защита Петрова)",
    "moves": "e2e4 e7e5 g1f3 g8f6"
  },
  {
    "name": "Русская партия: классическая атака",
    "moves": "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4"
  },
  {
    "name": "Защита Филидора",
    "moves": "e2e4 e7e5 g1f3 d7d6"
  },
  {
    "name": "Латвийский гамбит",
    "moves": "e2e4 e7e5 g1f3 f7f5"
  },
  {
    "name": "Королевский гамбит",
    "moves": "e2e4 e7e5 f2f4"
  },
  {
    "name": "Королевский гамбит принятый",
    "moves": "e2e4 e7e5 f2f4 e5f4"
  },
  {
    "name": "Венская партия",
    "moves": "e2e4 e7e5 b1c3"
  },
  {
    "name": "Слоновый дебют",
    "moves": "e2e4 e7e5 f1c4"
  },
  {
    "name": "Центральная партия",
    "moves": "e2e4 e7e5 d2d4"
  },
  {
    "name": "Датский гамбит",
    "moves": "e2e4 e7e5 d2d4 e5d4 c2c3"
  },
  {
    "name": "Сицилианская: 2...Кc6",
    "moves": "e2e4 c7c5 g1f3 b8c6"
  },
  {
    "name": "Сицилианская: 2...e6",
    "moves": "e2e4 c7c5 g1f3 e7e6"
  },
  {
    "name": "Сицилианская: 2...d6",
    "moves": "e2e4 c7c5 g1f3 d7d6"
  },
  {
    "name": "Сицилианская: вариант Кан",
    "moves": "e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6"
  },
  {
    "name": "Сицилианская: вариант Тайманова",
    "moves": "e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6"
  },
  {
    "name": "Сицилианская: Найдорф",
    "moves": "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6"
  },
  {
    "name": "Сицилианская: Дракон",
    "moves": "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6"
  },
  {
    "name": "Сицилианская: Схевенинген",
    "moves": "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e6"
  },
  {
    "name": "Сицилианская: Свешников",
    "moves": "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5"
  },
  {
    "name": "Сицилианская: Алапин",
    "moves": "e2e4 c7c5 c2c3"
  },
  {
    "name": "Закрытая сицилианская",
    "moves": "e2e4 c7c5 b1c3"
  },
  {
    "name": "Сицилианская: гамбит Смита–Морры",
    "moves": "e2e4 c7c5 d2d4 c5d4 c2c3"
  },
  {
    "name": "Французская: продвинутый вариант",
    "moves": "e2e4 e7e6 d2d4 d7d5 e4e5"
  },
  {
    "name": "Французская: вариант Винавера",
    "moves": "e2e4 e7e6 d2d4 d7d5 b1c3 f8b4"
  },
  {
    "name": "Французская: классический вариант",
    "moves": "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6"
  },
  {
    "name": "Французская: вариант Тарраша",
    "moves": "e2e4 e7e6 d2d4 d7d5 b1d2"
  },
  {
    "name": "Французская: вариант с разменом",
    "moves": "e2e4 e7e6 d2d4 d7d5 e4d5"
  },
  {
    "name": "Каро-Канн: продвинутый вариант",
    "moves": "e2e4 c7c6 d2d4 d7d5 e4e5"
  },
  {
    "name": "Каро-Канн: классический вариант",
    "moves": "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5"
  },
  {
    "name": "Каро-Канн: атака Панова",
    "moves": "e2e4 c7c6 d2d4 d7d5 e4d5 c6d5 c2c4"
  },
  {
    "name": "Закрытая игра (1.d4 d5)",
    "moves": "d2d4 d7d5"
  },
  {
    "name": "Лондонская система",
    "moves": "d2d4 d7d5 c1f4"
  },
  {
    "name": "Ферзевый гамбит",
    "moves": "d2d4 d7d5 c2c4"
  },
  {
    "name": "Ферзевый гамбит принятый",
    "moves": "d2d4 d7d5 c2c4 d5c4"
  },
  {
    "name": "Ферзевый гамбит отказанный",
    "moves": "d2d4 d7d5 c2c4 e7e6"
  },
  {
    "name": "Славянская защита",
    "moves": "d2d4 d7d5 c2c4 c7c6"
  },
  {
    "name": "Индийская защита",
    "moves": "d2d4 g8f6"
  },
  {
    "name": "Атака Тромповского",
    "moves": "d2d4 g8f6 c1g5"
  },
  {
    "name": "Староиндийская защита",
    "moves": "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6"
  },
  {
    "name": "Защита Грюнфельда",
    "moves": "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5"
  },
  {
    "name": "Защита Нимцовича",
    "moves": "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4"
  },
  {
    "name": "Ферзевоиндийская защита",
    "moves": "d2d4 g8f6 c2c4 e7e6 g1f3 b7b6"
  },
  {
    "name": "Богоиндийская защита",
    "moves": "d2d4 g8f6 c2c4 e7e6 g1f3 f8b4"
  },
  {
    "name": "Каталонское начало",
    "moves": "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5"
  },
  {
    "name": "Защита Бенони",
    "moves": "d2d4 g8f6 c2c4 c7c5 d4d5"
  },
  {
    "name": "Венгерский гамбит (Будапештский)",
    "moves": "d2d4 g8f6 c2c4 e7e5"
  },
  {
    "name": "Голландская защита",
    "moves": "d2d4 f7f5"
  },
  {
    "name": "Английское начало: симметричный вариант",
    "moves": "c2c4 c7c5"
  },
  {
    "name": "Английское начало: 1...e5",
    "moves": "c2c4 e7e5"
  },
  {
    "name": "Дебют Рети: 2.c4",
    "moves": "g1f3 d7d5 c2c4"
  },
  {
    "name": "Староиндийская атака",
    "moves": "g1f3 d7d5 g2g3"
  },
  {
    "name": "Дебют Бёрда: 1...d5",
    "moves": "f2f4 d7d5"
  },
  {
    "name": "Дебют Ларсена: 1...e5",
    "moves": "b2b3 e7e5"
  }
];

const PARSED = OPENINGS.map((o) => ({ name: o.name, moves: o.moves.split(' ') }));

function startsWith(line: string[], prefix: string[]): boolean {
  return prefix.length <= line.length && prefix.every((m, i) => line[i] === m);
}

/** Название дебюта: самая длинная известная линия, с которой начинается партия. */
export function openingName(ucis: string[]): string | null {
  let best: { name: string; len: number } | null = null;
  for (const o of PARSED) {
    if (startsWith(ucis, o.moves) && (!best || o.moves.length > best.len)) {
      best = { name: o.name, len: o.moves.length };
    }
  }
  return best ? best.name : null;
}

export interface Continuation {
  uci: string;
  /** Название, если линия с этим ходом уже имеет имя */
  name: string | null;
  /** Сколько известных вариантов лежит в этом направлении */
  lines: number;
}

/** Известные продолжения из позиции после данных ходов. */
export function continuations(ucis: string[]): Continuation[] {
  const map = new Map<string, Continuation>();
  for (const o of PARSED) {
    if (o.moves.length > ucis.length && startsWith(o.moves, ucis)) {
      const uci = o.moves[ucis.length];
      const entry = map.get(uci) ?? { uci, name: null, lines: 0 };
      entry.lines += 1;
      if (o.moves.length === ucis.length + 1) entry.name = o.name;
      map.set(uci, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.lines - a.lines);
}
