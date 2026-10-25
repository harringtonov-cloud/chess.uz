// Достижения и серии: чистая логика без Firebase и React (проверяется тестами, npm test).
// Счётчики лежат в users/{uid}.progress, полученные достижения в users/{uid}.achievements.

export interface Progress {
  /** Текущая серия побед подряд (ничья и поражение обнуляют). */
  winStreak: number;
  bestWinStreak: number;
  /** Сколько дней подряд игрок что-то решал или играл. */
  dayStreak: number;
  bestDayStreak: number;
  /** Последний активный день, «ГГГГ-ММ-ДД» по местному времени игрока. */
  lastDay: string;
  puzzlesSolved: number;
  /** Победы над соперником, чей рейтинг выше на 200 и более. */
  upsets: number;
}

export const EMPTY_PROGRESS: Progress = {
  winStreak: 0,
  bestWinStreak: 0,
  dayStreak: 0,
  bestDayStreak: 0,
  lastDay: '',
  puzzlesSolved: 0,
  upsets: 0,
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Читает сохранённые счётчики; пропуски и мусор заменяются нулями. */
export function normalizeProgress(raw: unknown): Progress {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p: Progress = {
    winStreak: num(r.winStreak),
    bestWinStreak: num(r.bestWinStreak),
    dayStreak: num(r.dayStreak),
    bestDayStreak: num(r.bestDayStreak),
    lastDay: typeof r.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDay) ? r.lastDay : '',
    puzzlesSolved: num(r.puzzlesSolved),
    upsets: num(r.upsets),
  };
  p.bestWinStreak = Math.max(p.bestWinStreak, p.winStreak);
  p.bestDayStreak = Math.max(p.bestDayStreak, p.dayStreak);
  return p;
}

/** День «ГГГГ-ММ-ДД» для момента времени с поправкой на часовой пояс (минуты к востоку от UTC). */
export function dayKey(ms: number, offsetMinutes: number): string {
  return new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function prevDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Засчитывает активность сегодня: тот же день ничего не меняет, вчера продолжает серию, иначе серия с единицы. */
export function touchDay(p: Progress, now: number, offsetMinutes: number): Progress {
  const today = dayKey(now, offsetMinutes);
  if (p.lastDay === today) return p;
  const dayStreak = p.lastDay === prevDay(today) ? p.dayStreak + 1 : 1;
  return { ...p, lastDay: today, dayStreak, bestDayStreak: Math.max(p.bestDayStreak, dayStreak) };
}

/** Разница рейтингов, с которой победа считается «сенсацией». */
export const UPSET_GAP = 200;

export interface GameOutcome {
  /** 1 победа, 0.5 ничья, 0 поражение */
  score: number;
  ownRating: number;
  oppRating: number;
}

export function afterGame(p: Progress, o: GameOutcome, now: number, offsetMinutes: number): Progress {
  const won = o.score === 1;
  const winStreak = won ? p.winStreak + 1 : 0;
  const next: Progress = {
    ...p,
    winStreak,
    bestWinStreak: Math.max(p.bestWinStreak, winStreak),
    upsets: p.upsets + (won && o.oppRating - o.ownRating >= UPSET_GAP ? 1 : 0),
  };
  return touchDay(next, now, offsetMinutes);
}

export function afterPuzzle(p: Progress, solved: boolean, now: number, offsetMinutes: number): Progress {
  const next = solved ? { ...p, puzzlesSolved: p.puzzlesSolved + 1 } : p;
  return touchDay(next, now, offsetMinutes);
}

/** Если игрок не заходил вчера или сегодня, показываемая серия уже прервалась. */
export function liveDayStreak(p: Progress, now: number, offsetMinutes: number): number {
  const today = dayKey(now, offsetMinutes);
  return p.lastDay === today || p.lastDay === prevDay(today) ? p.dayStreak : 0;
}

// ---------- Каталог достижений ----------

export type MetricKey =
  | 'games'
  | 'wins'
  | 'bestWinStreak'
  | 'bestDayStreak'
  | 'puzzlesSolved'
  | 'upsets'
  | 'topRating'
  | 'puzzleRating';

export interface Metrics {
  games: number;
  wins: number;
  bestWinStreak: number;
  bestDayStreak: number;
  puzzlesSolved: number;
  upsets: number;
  topRating: number;
  puzzleRating: number;
}

export interface Family {
  metric: MetricKey;
  icon: string;
  name: string;
  /** Шаблон подсказки; {n} заменяется на порог. */
  hint: string;
  tiers: number[];
}

export const FAMILIES: Family[] = [
  { metric: 'games', icon: '♟', name: 'Партии', hint: 'Сыграть {n} рейтинговых партий', tiers: [1, 10, 50, 100, 500, 1000] },
  { metric: 'wins', icon: '🏅', name: 'Победы', hint: 'Выиграть {n} партий', tiers: [1, 10, 50, 100, 250, 500] },
  { metric: 'bestWinStreak', icon: '🔥', name: 'Серия побед', hint: 'Выиграть {n} партий подряд', tiers: [3, 5, 10, 20] },
  { metric: 'bestDayStreak', icon: '📅', name: 'Дни подряд', hint: 'Играть или решать задачи {n} дней подряд', tiers: [3, 7, 30, 100, 365] },
  { metric: 'puzzlesSolved', icon: '🧩', name: 'Задачи', hint: 'Решить {n} задач', tiers: [10, 50, 250, 1000, 5000] },
  { metric: 'upsets', icon: '⚔️', name: 'Сенсации', hint: 'Победить игрока, рейтинг которого выше на 200+, {n} раз', tiers: [1, 5, 25, 100] },
  { metric: 'topRating', icon: '📈', name: 'Рейтинг', hint: 'Достичь рейтинга {n} в любом контроле', tiers: [1400, 1600, 1800, 2000, 2200, 2500] },
  { metric: 'puzzleRating', icon: '🧠', name: 'Рейтинг задач', hint: 'Достичь рейтинга задач {n}', tiers: [1400, 1800, 2200, 2600] },
];

export interface Achievement {
  /** Например «games-50»: стабильный идентификатор для хранения. */
  id: string;
  metric: MetricKey;
  icon: string;
  title: string;
  hint: string;
  threshold: number;
  tier: number;
}

const fmt = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n));

export const CATALOG: Achievement[] = FAMILIES.flatMap((f) =>
  f.tiers.map((n, i) => ({
    id: `${f.metric}-${n}`,
    metric: f.metric,
    icon: f.icon,
    title: `${f.name}: ${fmt(n)}`,
    hint: f.hint.replace('{n}', String(n)),
    threshold: n,
    tier: i + 1,
  })),
);

export function metricsOf(p: {
  stats?: { games?: number; wins?: number };
  ratings?: Partial<Record<'bullet' | 'blitz' | 'rapid' | 'classical' | 'puzzle', number>>;
  progress?: unknown;
}): Metrics {
  const pr = normalizeProgress(p.progress);
  const r = p.ratings ?? {};
  return {
    games: num(p.stats?.games),
    wins: num(p.stats?.wins),
    bestWinStreak: pr.bestWinStreak,
    bestDayStreak: pr.bestDayStreak,
    puzzlesSolved: pr.puzzlesSolved,
    upsets: pr.upsets,
    topRating: Math.max(0, r.bullet ?? 0, r.blitz ?? 0, r.rapid ?? 0, r.classical ?? 0),
    puzzleRating: Math.max(0, r.puzzle ?? 0),
  };
}

export function isEarned(a: Achievement, m: Metrics): boolean {
  return m[a.metric] >= a.threshold;
}

/** Достижения, которые игрок заработал по счётчикам, но которых ещё нет в его списке. */
export function newlyEarned(m: Metrics, have: Record<string, number> | null | undefined): Achievement[] {
  const got = have ?? {};
  return CATALOG.filter((a) => isEarned(a, m) && !(a.id in got));
}

export function normalizeEarned(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  const ids = new Set(CATALOG.map((a) => a.id));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ids.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export interface FamilyView {
  family: Family;
  value: number;
  /** Получено уровней и всего. */
  done: number;
  total: number;
  /** Следующий недостигнутый порог (null, если все получены). */
  next: number | null;
  /** Доля пути до следующего порога, 0..1. */
  progress: number;
}

export function familyViews(m: Metrics): FamilyView[] {
  return FAMILIES.map((family) => {
    const value = m[family.metric];
    const done = family.tiers.filter((t) => value >= t).length;
    const next = family.tiers.find((t) => value < t) ?? null;
    const prev = done > 0 ? family.tiers[done - 1] : 0;
    const progress = next === null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
    return { family, value, done, total: family.tiers.length, next, progress };
  });
}

/** Достижения, полученные за последние сутки (для пометки «новое»). */
export function recentlyEarned(have: Record<string, number>, now: number, windowMs = 86_400_000): string[] {
  return Object.entries(have)
    .filter(([, at]) => at > 0 && now - at <= windowMs)
    .map(([id]) => id);
}
