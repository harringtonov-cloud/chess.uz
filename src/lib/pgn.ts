// Экспорт партий в PGN. Чистые функции без chess.js и браузера (проверяются тестами).

export interface PgnGame {
  moves: string[]; // SAN
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  reason?: string | null;
  base?: number;
  inc?: number;
  rated?: boolean;
  daily?: boolean;
  category?: string;
  /** Время создания, мс с эпохи (0 — неизвестно) */
  createdAt?: number;
  /** Адрес партии на сайте */
  url?: string;
}

const CATEGORY_RU: Record<string, string> = { bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', classical: 'Классика' };

/** Значение тега PGN: кавычки и обратная косая черта экранируются, переводы строк убираются. */
export function tagValue(v: string): string {
  return v.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Дата по UTC в формате PGN (2026.10.24); неизвестная — «????.??.??». */
export function pgnDate(ms: number | undefined): string {
  if (!ms) return '????.??.??';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

const TERMINATION: Record<string, string> = {
  checkmate: 'Мат',
  stalemate: 'Пат',
  insufficient: 'Недостаточно материала',
  repetition: 'Троекратное повторение',
  'fifty-move': 'Правило 50 ходов',
  resignation: 'Сдача',
  timeout: 'Время вышло',
  agreement: 'Ничья по согласию',
  aborted: 'Партия отменена',
  abandoned: 'Соперник не пришёл',
};

/** Ходы с номерами, строки не длиннее 80 знаков. */
export function movetext(moves: string[], result: string): string {
  const tokens: string[] = [];
  moves.forEach((m, i) => {
    if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
    tokens.push(m);
  });
  tokens.push(result);
  const lines: string[] = [];
  let line = '';
  for (const t of tokens) {
    if (line && line.length + 1 + t.length > 80) {
      lines.push(line);
      line = t;
    } else {
      line = line ? `${line} ${t}` : t;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Полный PGN партии с тегами. */
export function buildPgn(g: PgnGame): string {
  const result = g.result ?? '*';
  const tags: [string, string][] = [
    [
      'Event',
      `chess.uz: ${g.daily ? 'ежедневные' : (CATEGORY_RU[g.category ?? ''] ?? 'партия').toLowerCase()}, ${
        g.rated ? 'рейтинговая' : 'нерейтинговая'
      }`,
    ],
    ['Site', g.url ?? 'chess.uz'],
    ['Date', pgnDate(g.createdAt)],
    ['Round', '-'],
    ['White', g.white || '?'],
    ['Black', g.black || '?'],
    ['Result', result],
  ];
  if (g.whiteRating) tags.push(['WhiteElo', String(g.whiteRating)]);
  if (g.blackRating) tags.push(['BlackElo', String(g.blackRating)]);
  if (g.base !== undefined) {
    tags.push(['TimeControl', g.daily ? `1/${g.base}` : g.inc ? `${g.base}+${g.inc}` : String(g.base)]);
  }
  if (g.reason) tags.push(['Termination', TERMINATION[g.reason] ?? g.reason]);
  const head = tags.map(([k, v]) => `[${k} "${tagValue(v)}"]`).join('\n');
  return `${head}\n\n${movetext(g.moves, result)}\n`;
}

/** Несколько партий подряд (между партиями пустая строка). */
export function buildPgnBundle(games: PgnGame[]): string {
  return games.map(buildPgn).join('\n');
}

/** Имя файла для скачивания: только латиница, цифры и дефисы. */
export function pgnFileName(white: string, black: string, ms: number | undefined): string {
  const clean = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'player';
  const date = ms ? pgnDate(ms).replace(/\./g, '-') : 'no-date';
  return `${clean(white)}_vs_${clean(black)}_${date}.pgn`;
}
