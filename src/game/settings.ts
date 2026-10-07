/** Настройки внешнего вида (как на Lichess). Хранятся в localStorage, если он доступен. */
import type { PieceSetId } from '../chess-ui/pieces.ts'
import { THEMES, type ThemeId } from './config'

export interface Settings {
  boardTheme: ThemeId
  pieceSet: PieceSetId
  coords: boolean
  lastMove: boolean
  legalMoves: boolean
  /** Тёмный фон страницы в стиле Lichess вместо неоновых картинок. */
  plainPage: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  boardTheme: 'lichess',
  pieceSet: 'classic',
  coords: true,
  lastMove: true,
  legalMoves: true,
  plainPage: false,
}

const KEY = 'chessuz.settings.v1'
const PIECE_SETS: PieceSetId[] = ['classic', 'warm', 'ocean', 'cburnett']

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const o = JSON.parse(raw) as Partial<Settings>
    return {
      boardTheme: o.boardTheme && o.boardTheme in THEMES ? o.boardTheme : DEFAULT_SETTINGS.boardTheme,
      pieceSet: o.pieceSet && PIECE_SETS.includes(o.pieceSet) ? o.pieceSet : DEFAULT_SETTINGS.pieceSet,
      coords: o.coords ?? DEFAULT_SETTINGS.coords,
      lastMove: o.lastMove ?? DEFAULT_SETTINGS.lastMove,
      legalMoves: o.legalMoves ?? DEFAULT_SETTINGS.legalMoves,
      plainPage: o.plainPage ?? DEFAULT_SETTINGS.plainPage,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* хранилище недоступно — настройки просто не сохранятся */
  }
}
