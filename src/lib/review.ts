// Обзор партии: классификация ходов по оценкам движка, книжные дебютные ходы,
// ключевые моменты. Чистые функции без chess.js и браузера (проверяются тестами).

export type Quality = 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const QUALITY_ORDER: Quality[] = ['book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

export const QUALITY_LABEL: Record<Quality, string> = {
  book: 'Дебютный ход',
  best: 'Лучший ход',
  excellent: 'Отличный ход',
  good: 'Хороший ход',
  inaccuracy: 'Неточность',
  mistake: 'Ошибка',
  blunder: 'Грубая ошибка',
};

export interface MoveQuality {
  q: Quality;
  /** Потеря шансов на победу, в процентных пунктах */
  loss: number;
  /** Точность хода, 0..100 */
  acc: number;
}

export interface EvalLike {
  /** Сантипешки с точки зрения белых */
  cp: number;
  /** Лучший ход в позиции (UCI) */
  best: string | null;
}

/** Вероятность выигрыша белых (0..100) по оценке в сантипешках. */
export function winProb(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function classify(loss: number, isBest: boolean): Exclude<Quality, 'book'> {
  if (isBest || loss <= 0.5) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 6) return 'good';
  if (loss < 12) return 'inaccuracy';
  if (loss < 24) return 'mistake';
  return 'blunder';
}

export function accuracyOf(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

/** Сколько первых полуходов партии лежат в справочнике дебютов (по самой подходящей линии). */
export function bookDepth(ucis: string[], openings: { moves: string }[]): number {
  let best = 0;
  for (const o of openings) {
    const line = o.moves.split(' ');
    let k = 0;
    while (k < line.length && k < ucis.length && line[k] === ucis[k]) k++;
    if (k > best) best = k;
  }
  return best;
}

export interface QualityInput {
  /** Кто сделал ход: 'w' или 'b' */
  colors: ('w' | 'b')[];
  /** Сыгранные ходы в UCI */
  ucis: string[];
  /** Оценки позиций: evals[i] — позиция перед ходом i, evals[i + 1] — после него */
  evals: EvalLike[];
  /** Первые bookPlies полуходов считаются дебютными */
  bookPlies?: number;
}

/** Качество каждого хода, для которого уже есть обе оценки (останавливается на первой недостающей). */
export function moveQualities(input: QualityInput): MoveQuality[] {
  const out: MoveQuality[] = [];
  const book = input.bookPlies ?? 0;
  for (let i = 0; i < input.ucis.length; i++) {
    const before = input.evals[i];
    const after = input.evals[i + 1];
    if (!before || !after) break;
    const white = input.colors[i] === 'w';
    const wpBefore = white ? winProb(before.cp) : 100 - winProb(before.cp);
    const wpAfter = white ? winProb(after.cp) : 100 - winProb(after.cp);
    const loss = Math.max(0, wpBefore - wpAfter);
    const isBest = before.best === input.ucis[i];
    const q: Quality = i < book && loss < 12 ? 'book' : classify(loss, isBest);
    out.push({ q, loss, acc: q === 'book' ? Math.max(accuracyOf(loss), 95) : accuracyOf(loss) });
  }
  return out;
}

export interface SideSummary {
  accuracy: number | null;
  counts: Record<Quality, number>;
}

export function sideSummary(
  quality: MoveQuality[],
  colors: ('w' | 'b')[],
  color: 'w' | 'b',
): SideSummary {
  const counts = Object.fromEntries(QUALITY_ORDER.map((q) => [q, 0])) as Record<Quality, number>;
  let sum = 0;
  let n = 0;
  quality.forEach((m, i) => {
    if (colors[i] !== color) return;
    counts[m.q] += 1;
    sum += m.acc;
    n += 1;
  });
  return { accuracy: n ? sum / n : null, counts };
}

export interface KeyMoment {
  /** Номер хода (с 0) */
  move: number;
  q: Quality;
  loss: number;
}

/** Ключевые моменты — ошибки и грубые ошибки в порядке партии. */
export function keyMoments(
  quality: MoveQuality[],
  include: Quality[] = ['mistake', 'blunder'],
): KeyMoment[] {
  const out: KeyMoment[] = [];
  quality.forEach((m, i) => {
    if (include.includes(m.q)) out.push({ move: i, q: m.q, loss: m.loss });
  });
  return out;
}

/** Ближайший ключевой момент после (dir = 1) или до (dir = -1) хода `from`; null, если нет. */
export function neighborMoment(moments: KeyMoment[], from: number, dir: 1 | -1): KeyMoment | null {
  if (dir === 1) return moments.find((m) => m.move > from) ?? null;
  for (let i = moments.length - 1; i >= 0; i--) if (moments[i].move < from) return moments[i];
  return null;
}
