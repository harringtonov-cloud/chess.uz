import type { Category } from './types';

export interface TimeControl {
  base: number; // секунды
  inc: number; // секунды
}

export function categoryOf(tc: TimeControl): Category {
  const estimated = tc.base + 40 * tc.inc;
  if (estimated < 180) return 'bullet';
  if (estimated < 480) return 'blitz';
  if (estimated < 1500) return 'rapid';
  return 'classical';
}

export const CATEGORY_LABEL: Record<Category, string> = {
  bullet: 'Пуля',
  blitz: 'Блиц',
  rapid: 'Рапид',
  classical: 'Классика',
};

export const TIME_CONTROLS: { group: Category; items: TimeControl[] }[] = [
  { group: 'bullet', items: [{ base: 60, inc: 0 }, { base: 120, inc: 1 }] },
  {
    group: 'blitz',
    items: [{ base: 180, inc: 0 }, { base: 180, inc: 2 }, { base: 300, inc: 0 }],
  },
  { group: 'rapid', items: [{ base: 600, inc: 0 }, { base: 900, inc: 10 }] },
  { group: 'classical', items: [{ base: 1800, inc: 0 }, { base: 1800, inc: 20 }] },
];

export function tcLabel(tc: TimeControl): string {
  if (tc.base >= 86400 && tc.inc === 0 && tc.base % 86400 === 0) return `${tc.base / 86400} дн./ход`;
  if (tc.base < 60) return tc.inc ? `${tc.base}с+${tc.inc}` : `${tc.base}с`;
  const minutes = tc.base / 60;
  const base = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${base}+${tc.inc}`;
}

/** Границы своей игры: от 15 секунд до 3 часов на партию, добавка до 3 минут. */
export const CUSTOM_LIMITS = { minBase: 15, maxBase: 10800, maxInc: 180 };

/** Проверяет настройки времени; возвращает текст ошибки или null. */
export function validateTimeControl(tc: TimeControl): string | null {
  if (!Number.isFinite(tc.base) || !Number.isFinite(tc.inc)) return 'Введите время числом';
  if (tc.base < CUSTOM_LIMITS.minBase) return 'Минимум 15 секунд на партию';
  if (tc.base > CUSTOM_LIMITS.maxBase) return 'Максимум 180 минут на партию';
  if (tc.inc < 0) return 'Добавка не может быть отрицательной';
  if (tc.inc > CUSTOM_LIMITS.maxInc) return 'Максимум 180 секунд добавки';
  return null;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10000) {
    const s = Math.floor(total / 1000);
    const t = Math.floor((total % 1000) / 100);
    return `0:0${s}.${t}`;
  }
  const secs = Math.ceil(total / 1000);
  if (secs >= 86400) {
    return `${Math.floor(secs / 86400)}д ${Math.floor((secs % 86400) / 3600)}ч`;
  }
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Дни на ход для ежедневных партий. */
export const DAILY_DAYS = [1, 2, 3, 5, 7, 14];

/** Название контроля времени партии: у ежедневных своя метка. */
export function gameCategoryLabel(g: { category: Category; daily?: boolean }): string {
  return g.daily ? 'Ежедневные' : CATEGORY_LABEL[g.category];
}
