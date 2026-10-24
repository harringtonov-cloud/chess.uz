// Puzzle Battle: дуэль двух игроков на одних и тех же задачах. Чистая логика без Firebase.
// Каждый решает задачи в своём темпе по одному и тому же списку; побеждает тот, кто за время боя решил больше.

export const BATTLE_MS = 180_000; // 3 минуты
export const COUNTDOWN_MS = 5_000; // отсчёт перед стартом
export const BATTLE_PUZZLES = 30;
export const MIN_BATTLE_PUZZLES = 8; // меньше задач — бой не создаём
/** Быстрее одной задачи за столько мс подряд решить нельзя: защита от накрутки счёта в правилах */
export const MIN_SOLVE_MS = 1500;

export interface BattleScore {
  solved: number;
  mistakes: number;
  /** Когда игрок в последний раз менял счёт, мс */
  lastAt: number;
}

export const EMPTY_SCORE: BattleScore = { solved: 0, mistakes: 0, lastAt: 0 };

export type BattlePhase = 'waiting' | 'countdown' | 'running' | 'finished';

export function battlePhase(
  b: { status: 'waiting' | 'active'; startAt: number | null; endsAt: number | null },
  now: number,
): BattlePhase {
  if (b.status === 'waiting' || b.startAt === null || b.endsAt === null) return 'waiting';
  if (now < b.startAt) return 'countdown';
  if (now < b.endsAt) return 'running';
  return 'finished';
}

/** Безопасно читает счёт из документа (может быть пустым или повреждённым). */
export function readScore(raw: unknown): BattleScore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SCORE };
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return { solved: n(r.solved), mistakes: n(r.mistakes), lastAt: n(r.lastAt) };
}

/** Новый счёт после решённой или проваленной задачи. */
export function addResult(prev: BattleScore, ok: boolean, now: number): BattleScore {
  return ok
    ? { solved: prev.solved + 1, mistakes: prev.mistakes, lastAt: now }
    : { solved: prev.solved, mistakes: prev.mistakes + 1, lastAt: now };
}

/** Номер текущей задачи: сколько задач игрок уже закончил (решил или провалил). */
export function puzzleIndex(s: BattleScore): number {
  return s.solved + s.mistakes;
}

/** Положительное — a впереди, отрицательное — b, 0 — поровну (больше решено, потом меньше ошибок). */
export function compareScores(a: BattleScore, b: BattleScore): number {
  return a.solved - b.solved || b.mistakes - a.mistakes;
}

export type BattleOutcome = 'win' | 'loss' | 'draw';

export function outcomeOf(mine: BattleScore, theirs: BattleScore): BattleOutcome {
  const c = compareScores(mine, theirs);
  return c > 0 ? 'win' : c < 0 ? 'loss' : 'draw';
}

/** Самое большое число решённых задач, которое ещё можно считать правдоподобным (то же ограничение — в правилах Firestore). */
export function maxPlausibleSolved(startAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startAt + MIN_SOLVE_MS) / MIN_SOLVE_MS));
}

/** Время до события в виде 2:35. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Подходит ли чужая ожидающая партия: не моя, создатель на связи. */
export function joinable(
  b: { players: string[]; status: string; heartbeat: number },
  myUid: string,
  now: number,
  ttl = 30_000,
): boolean {
  return b.status === 'waiting' && b.players.length === 1 && b.players[0] !== myUid && now - b.heartbeat <= ttl;
}
