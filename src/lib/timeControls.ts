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
  const minutes = tc.base / 60;
  const base = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${base}+${tc.inc}`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10000) {
    const s = Math.floor(total / 1000);
    const t = Math.floor((total % 1000) / 100);
    return `0:0${s}.${t}`;
  }
  const secs = Math.ceil(total / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
