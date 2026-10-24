// Античит: статистика партии по оценкам движка, времени на ход и уходам со вкладки.
// Чистые функции без Firebase, браузера и chess.js (проверяются тестами).
//
// ВАЖНО: это сигналы для модератора, а не доказательство. Сильный игрок, хорошо знающий дебют
// или игравший по подсказке на уроке, тоже даёт высокое совпадение с движком. Санкции ставит человек,
// а не программа: поэтому решение здесь только «обратить внимание», без автоматических банов.

export type Level = 'insufficient' | 'ok' | 'watch' | 'suspicious' | 'high';

export const LEVEL_LABEL: Record<Level, string> = {
  insufficient: 'мало данных',
  ok: 'без подозрений',
  watch: 'стоит присмотреться',
  suspicious: 'подозрительно',
  high: 'очень подозрительно',
};

/** Сколько «значимых» ходов нужно для вывода. */
export const MIN_CONSIDERED = 15;
/** Позиция уже решена: ход движка очевиден, поэтому её ходы не считаем. */
export const DECIDED_CP = 700;
/** Потеря одного хода в статистике не больше этого значения (сантипешек). */
export const MAX_LOSS_CP = 300;

export interface EvalPoint {
  /** Сантипешки с точки зрения белых */
  cp: number;
  /** Лучший ход в позиции (UCI) */
  best: string | null;
}

export interface PlyInput {
  color: 'w' | 'b';
  /** Сыгранный ход (UCI) */
  uci: string;
  /** Оценка позиции перед ходом и после него */
  before: EvalPoint;
  after: EvalPoint;
  /** Сколько легальных ходов было в позиции */
  legalMoves: number;
  /** Время на ход, мс (null — не записано) */
  timeMs: number | null;
}

export interface SideStats {
  color: 'w' | 'b';
  /** Все ходы стороны */
  moves: number;
  /** Ходы, по которым считается статистика (не дебют, не вынужденные, не в решённой позиции) */
  considered: number;
  /** Доля совпадений с лучшим ходом движка, 0..1 */
  top1: number | null;
  /** Средняя потеря за ход, сантипешки */
  acpl: number | null;
  /** Среднее время на значимый ход, мс, и разброс (стандартное отклонение / среднее) */
  timeMean: number | null;
  timeCv: number | null;
  /** Сколько значимых ходов с записанным временем */
  timed: number;
  /** Доля значимых ходов быстрее секунды */
  fastShare: number | null;
  /** Сколько раз игрок уходил со вкладки во время своего хода */
  blurs: number;
  blurRate: number | null;
}

/** Оценка с точки зрения стороны, которая ходит. */
export function moverCp(cp: number, color: 'w' | 'b'): number {
  return color === 'w' ? cp : -cp;
}

export function sideStats(plies: PlyInput[], color: 'w' | 'b', bookPlies: number, blurs = 0): SideStats {
  let moves = 0;
  let considered = 0;
  let match = 0;
  let lossSum = 0;
  const times: number[] = [];
  plies.forEach((p, i) => {
    if (p.color !== color) return;
    moves += 1;
    if (i < bookPlies || p.legalMoves <= 1) return;
    if (Math.abs(moverCp(p.before.cp, color)) > DECIDED_CP) return;
    considered += 1;
    if (p.before.best !== null && p.before.best === p.uci) match += 1;
    const loss = Math.max(0, moverCp(p.before.cp, color) - moverCp(p.after.cp, color));
    lossSum += Math.min(loss, MAX_LOSS_CP);
    if (p.timeMs !== null && p.timeMs >= 0) times.push(p.timeMs);
  });
  const mean = times.length ? times.reduce((s, t) => s + t, 0) / times.length : null;
  let cv: number | null = null;
  if (mean !== null && mean > 0 && times.length >= 2) {
    const variance = times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length;
    cv = Math.sqrt(variance) / mean;
  }
  return {
    color,
    moves,
    considered,
    top1: considered ? match / considered : null,
    acpl: considered ? lossSum / considered : null,
    timeMean: mean,
    timeCv: cv,
    timed: times.length,
    fastShare: times.length ? times.filter((t) => t < 1000).length / times.length : null,
    blurs,
    blurRate: moves ? blurs / moves : null,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Какое совпадение с движком обычно у игрока такого рейтинга. */
export function expectedTop1(rating: number): number {
  return clamp(0.4 + (rating - 1200) * 0.0002, 0.35, 0.65);
}

/** Какая средняя потеря за ход обычна для такого рейтинга. */
export function expectedAcpl(rating: number): number {
  return clamp(85 - (rating - 800) * 0.045, 18, 90);
}

export interface Suspicion {
  score: number;
  level: Level;
  reasons: string[];
}

export function levelOf(score: number): Level {
  if (score >= 70) return 'high';
  if (score >= 45) return 'suspicious';
  if (score >= 20) return 'watch';
  return 'ok';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Оценка подозрительности стороны: баллы 0–100 и причины по-русски. */
export function suspicion(s: SideStats, rating: number): Suspicion {
  const reasons: string[] = [];
  let score = 0;
  let engineSignals = 0;

  if (s.considered >= MIN_CONSIDERED && s.top1 !== null && s.acpl !== null) {
    const exp = expectedTop1(rating);
    const excess = s.top1 - exp;
    if (excess >= 0.3) {
      score += 40;
      engineSignals += 1;
    } else if (excess >= 0.2) {
      score += 25;
      engineSignals += 1;
    } else if (excess >= 0.12) {
      score += 10;
    }
    if (excess >= 0.12) {
      reasons.push(`Совпадение с лучшим ходом движка ${pct(s.top1)} при обычных для рейтинга ${rating} около ${pct(exp)}`);
    }

    const ratio = s.acpl / expectedAcpl(rating);
    if (ratio <= 0.35) {
      score += 30;
      engineSignals += 1;
    } else if (ratio <= 0.5) {
      score += 15;
      engineSignals += 1;
    } else if (ratio <= 0.65) {
      score += 5;
    }
    if (ratio <= 0.65) {
      reasons.push(
        `Средняя потеря за ход ${Math.round(s.acpl)} сотых пешки при обычных около ${Math.round(expectedAcpl(rating))}`,
      );
    }
    if (engineSignals >= 2) {
      score += 10;
      reasons.push('Высокая точность и высокое совпадение с движком одновременно');
    }
  } else {
    reasons.push(`Мало значимых ходов для вывода (${s.considered} из нужных ${MIN_CONSIDERED})`);
  }

  if (s.timed >= MIN_CONSIDERED && s.timeCv !== null && s.timeMean !== null && s.timeMean >= 1500) {
    if (s.timeCv < 0.3) {
      score += 15;
      reasons.push('Время на ход почти одинаковое: игрок тратит равное время и на простые, и на сложные позиции');
    } else if (s.timeCv < 0.45) {
      score += 7;
      reasons.push('Время на ход подозрительно ровное');
    }
  }

  if (s.moves >= 10 && s.blurRate !== null) {
    if (s.blurRate >= 0.4) {
      score += 20;
      reasons.push(`Уходил со вкладки на ${s.blurs} из ${s.moves} ходов`);
    } else if (s.blurRate >= 0.2) {
      score += 10;
      reasons.push(`Часто уходил со вкладки: ${s.blurs} раз за ${s.moves} ходов`);
    } else if (s.blurRate >= 0.1) {
      score += 4;
      reasons.push(`Уходил со вкладки ${s.blurs} раз`);
    }
  }

  score = Math.min(100, score);
  if (s.considered < MIN_CONSIDERED && score < 20) return { score, level: 'insufficient', reasons };
  return { score, level: levelOf(score), reasons };
}

/** Достаёт id партии из ссылки (https://…/game/abc123) или из самого id. */
export function parseGameId(input: string): string | null {
  const t = input.trim();
  const m = /\/game\/([A-Za-z0-9]{6,40})(?:[/?#]|$)/.exec(t);
  const id = m ? m[1] : t;
  return /^[A-Za-z0-9]{6,40}$/.test(id) ? id : null;
}

/**
 * Считать ли уход со вкладки: только во время идущей партии, на свой ход
 * и не чаще одного раза в 3 секунды (браузеры шлют несколько событий подряд).
 */
export function shouldCountBlur(
  state: { active: boolean; myTurn: boolean; lastCountedAt: number | null },
  now: number,
): boolean {
  if (!state.active || !state.myTurn) return false;
  return state.lastCountedAt === null || now - state.lastCountedAt >= 3000;
}

/** Время на ход из меток партии: сколько мс прошло с прошлого хода (с ограничением сверху). */
export function spentMs(lastMoveAt: number | null, now: number, cap = 86_400_000): number {
  if (lastMoveAt === null) return 0;
  return Math.max(0, Math.min(cap, now - lastMoveAt));
}
