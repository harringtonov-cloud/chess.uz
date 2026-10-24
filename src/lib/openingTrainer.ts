// Тренировка дебютов с интервальным повторением (упрощённый SM-2).
// Чистые функции без chess.js и браузера: состояние приходит и уходит как данные,
// поэтому всё проверяется тестами. Хранилище (localStorage) — в конце файла.

export type Side = 'white' | 'black';
export type Grade = 'again' | 'good' | 'easy';

export interface Card {
  id: string;
  /** Сколько раз подряд линия пройдена без ошибок */
  reps: number;
  /** Множитель интервала */
  ease: number;
  /** Текущий интервал, дней */
  interval: number;
  /** Когда повторить (мс с эпохи) */
  due: number;
  lapses: number;
  seen: number;
}

export interface TrainerState {
  cards: Record<string, Card>;
  /** Сколько новых линий уже взято сегодня */
  intro: { day: string; count: number };
}

export interface Line {
  id: string;
  name: string;
  side: Side;
  /** Ходы UCI */
  moves: string[];
}

export const DAY = 24 * 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const NEW_PER_DAY = 5;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

export function emptyState(): TrainerState {
  return { cards: {}, intro: { day: '', count: 0 } };
}

export function newCard(id: string, now: number): Card {
  return { id, reps: 0, ease: START_EASE, interval: 0, due: now, lapses: 0, seen: 0 };
}

/** Локальная дата вида 2026-10-21 — граница «сегодня» для лимита новых линий. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isPrefix(a: string[], b: string[]): boolean {
  return a.length < b.length && a.every((m, i) => b[i] === m);
}

/**
 * Линии для тренировки за сторону side: только «листья» справочника (линия не должна быть
 * началом другой, более длинной), не короче minPlies полуходов.
 */
export function trainableLines(
  openings: { name: string; moves: string }[],
  side: Side,
  minPlies = 4,
): Line[] {
  const parsed = openings.map((o) => ({ name: o.name, moves: o.moves.split(' ').filter(Boolean) }));
  const lines: Line[] = [];
  for (const o of parsed) {
    if (o.moves.length < minPlies) continue;
    if (parsed.some((p) => isPrefix(o.moves, p.moves))) continue;
    lines.push({ id: `${side}:${o.moves.join(' ')}`, name: o.name, side, moves: o.moves });
  }
  return lines;
}

/** Номера полуходов (с 0), которые за сторону side должен сыграть игрок. */
export function userPlies(line: Line): number[] {
  const first = line.side === 'white' ? 0 : 1;
  const out: number[] = [];
  for (let i = first; i < line.moves.length; i += 2) out.push(i);
  return out;
}

/** Обновить карточку после прохождения линии. */
export function schedule(card: Card, grade: Grade, now: number): Card {
  const next: Card = { ...card, seen: card.seen + 1 };
  if (grade === 'again') {
    next.reps = 0;
    next.lapses = card.lapses + 1;
    next.ease = Math.max(MIN_EASE, card.ease - 0.2);
    next.interval = 0;
    next.due = now + 10 * MINUTE; // скоро повторить в этой же сессии
    return next;
  }
  next.reps = card.reps + 1;
  if (grade === 'easy') next.ease = card.ease + 0.1;
  let interval: number;
  if (next.reps === 1) interval = grade === 'easy' ? 3 : 1;
  else if (next.reps === 2) interval = grade === 'easy' ? 6 : 3;
  else interval = Math.round(card.interval * next.ease * (grade === 'easy' ? 1.3 : 1));
  next.interval = Math.max(1, interval);
  next.due = now + next.interval * DAY;
  return next;
}

/** Записать оценку линии в состояние (создаёт карточку у новой линии и считает её в лимит дня). */
export function applyGrade(state: TrainerState, line: Line, grade: Grade, now: number): TrainerState {
  const existing = state.cards[line.id];
  const today = dayKey(now);
  const intro =
    state.intro.day === today ? { ...state.intro } : { day: today, count: 0 };
  if (!existing) intro.count += 1;
  const card = schedule(existing ?? newCard(line.id, now), grade, now);
  return { cards: { ...state.cards, [line.id]: card }, intro };
}

export interface Pick {
  line: Line;
  kind: 'due' | 'new';
}

/** Что учить дальше: сначала просроченные повторения, потом новые линии (до лимита за день). */
export function pickNext(
  state: TrainerState,
  lines: Line[],
  now: number,
  rng: () => number = Math.random,
  exclude: string | null = null,
): Pick | null {
  const due = lines
    .filter((l) => l.id !== exclude && state.cards[l.id] && state.cards[l.id].due <= now)
    .sort((a, b) => state.cards[a.id].due - state.cards[b.id].due);
  if (due.length > 0) return { line: due[0], kind: 'due' };

  const taken = state.intro.day === dayKey(now) ? state.intro.count : 0;
  if (taken >= NEW_PER_DAY) return null;
  const fresh = lines.filter((l) => l.id !== exclude && !state.cards[l.id]);
  if (fresh.length === 0) return null;
  return { line: fresh[Math.floor(rng() * fresh.length) % fresh.length], kind: 'new' };
}

export interface Summary {
  total: number;
  /** Повторений, срок которых наступил */
  due: number;
  /** Новых линий, которые ещё можно взять сегодня */
  fresh: number;
  /** Линий, выученных уверенно (3 прохода подряд и больше) */
  learned: number;
  /** Через сколько мс наступит ближайшее повторение (null — карточек нет или срок уже пришёл) */
  nextDueIn: number | null;
}

export function summary(state: TrainerState, lines: Line[], now: number): Summary {
  let due = 0;
  let learned = 0;
  let unseen = 0;
  let nextDue: number | null = null;
  for (const l of lines) {
    const c = state.cards[l.id];
    if (!c) {
      unseen += 1;
      continue;
    }
    if (c.reps >= 3) learned += 1;
    if (c.due <= now) due += 1;
    else if (nextDue === null || c.due < nextDue) nextDue = c.due;
  }
  const taken = state.intro.day === dayKey(now) ? state.intro.count : 0;
  return {
    total: lines.length,
    due,
    fresh: Math.max(0, Math.min(unseen, NEW_PER_DAY - taken)),
    learned,
    nextDueIn: nextDue === null ? null : nextDue - now,
  };
}

// ---- хранилище в браузере -------------------------------------------------

const KEY = 'chessuz.openingTrainer';

export function loadTrainerState(): TrainerState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const p = JSON.parse(raw) as Partial<TrainerState>;
    if (!p || typeof p !== 'object' || typeof p.cards !== 'object' || p.cards === null) return emptyState();
    return {
      cards: p.cards as Record<string, Card>,
      intro:
        p.intro && typeof p.intro.day === 'string' && typeof p.intro.count === 'number'
          ? p.intro
          : { day: '', count: 0 },
    };
  } catch {
    return emptyState();
  }
}

export function saveTrainerState(state: TrainerState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* localStorage может быть недоступен — прогресс просто не сохранится */
  }
}
