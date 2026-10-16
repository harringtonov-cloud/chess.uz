import { useSyncExternalStore } from 'react';

export type BoardTheme = 'green' | 'brown' | 'blue' | 'gray' | 'purple';
export type PieceSet = 'svg' | 'unicode';

export interface Settings {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  coords: boolean;
  highlights: boolean;
}

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  green: { label: 'Зелёная', light: '#ebecd0', dark: '#739552' },
  brown: { label: 'Коричневая', light: '#f0d9b5', dark: '#b58863' },
  blue: { label: 'Синяя', light: '#dee3e6', dark: '#8ca2ad' },
  gray: { label: 'Серая', light: '#d9d9d9', dark: '#8a8a8a' },
  purple: { label: 'Фиолетовая', light: '#e6e0ef', dark: '#8877b2' },
};

export const PIECE_SETS: Record<PieceSet, string> = {
  svg: 'Векторные (SVG)',
  unicode: 'Символы Unicode',
};

const KEY = 'chessuz.settings';

const DEFAULTS: Settings = {
  boardTheme: 'green',
  pieceSet: 'svg',
  coords: true,
  highlights: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      boardTheme: parsed.boardTheme && parsed.boardTheme in BOARD_THEMES ? parsed.boardTheme : DEFAULTS.boardTheme,
      pieceSet: parsed.pieceSet && parsed.pieceSet in PIECE_SETS ? parsed.pieceSet : DEFAULTS.pieceSet,
      coords: typeof parsed.coords === 'boolean' ? parsed.coords : DEFAULTS.coords,
      highlights: typeof parsed.highlights === 'boolean' ? parsed.highlights : DEFAULTS.highlights,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

function applyTheme(s: Settings) {
  if (typeof document === 'undefined') return;
  const t = BOARD_THEMES[s.boardTheme];
  document.documentElement.style.setProperty('--light', t.light);
  document.documentElement.style.setProperty('--dark', t.dark);
}

applyTheme(current);

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* localStorage может быть недоступен — настройки просто не сохранятся */
  }
  applyTheme(current);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
