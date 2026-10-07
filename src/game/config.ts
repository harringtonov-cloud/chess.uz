import { timeControl, type TimeControl } from '../chess/index.ts'

export const GAME_NAME = 'CHESS.UZ'

export type ThemeId = 'lichess' | 'green' | 'blue' | 'purple' | 'grey' | 'royal' | 'midnight' | 'ember'

export type ClockPresetId = 'none' | 'bullet1' | 'bullet2' | 'blitz3' | 'blitz5' | 'rapid10' | 'rapid15'

export type VariantId = 
  | 'standard' 
  | 'chess960' 
  | 'crazyhouse' 
  | 'threeCheck' 
  | 'fiveCheck'
  | 'atomic' 
  | 'antichess' 
  | 'kingOfTheHill' 
  | 'horde' 
  | 'racingKings'

export type AiLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type PlayMode = 'ai' | 'local'

export const VARIANTS: Record<VariantId, { label: string; lichessKey: string; desc: string }> = {
  standard: { label: 'Стандарт', lichessKey: 'standard', desc: 'Классические шахматы' },
  chess960: { label: 'Шах960', lichessKey: 'chess960', desc: 'Фишер рэндом, 960 позиций' },
  crazyhouse: { label: 'Крейзихаус', lichessKey: 'crazyhouse', desc: 'Съеденные фигуры можно ставить' },
  threeCheck: { label: '3 шаха', lichessKey: 'threeCheck', desc: 'Победа после 3 шахов королю' },
  fiveCheck: { label: '5 шахов', lichessKey: 'fiveCheck', desc: 'Победа после 5 шахов' },
  atomic: { label: 'Атомик', lichessKey: 'atomic', desc: 'Взрывы вокруг взятия' },
  antichess: { label: 'Поддавки', lichessKey: 'antichess', desc: 'Кто первый съел все фигуры - победил' },
  kingOfTheHill: { label: 'Царь горы', lichessKey: 'kingOfTheHill', desc: 'Приведи короля в центр - победа' },
  horde: { label: 'Орда', lichessKey: 'horde', desc: 'Пешки против фигур' },
  racingKings: { label: 'Гонка королей', lichessKey: 'racingKings', desc: 'Кто первым доведет короля до 8-й линии' },
}

export const THEMES: Record<
  ThemeId,
  {
    label: string
    light: string
    dark: string
    lightText: string
    darkText: string
    select: string
    moveTo: string
    last: string
    check: string
    premove: string
    boardBorder: string
    flat?: boolean
  }
> = {
  lichess: {
    label: 'Классика (коричневая)',
    light: '#f0d9b5',
    dark: '#b58863',
    lightText: '#b58863',
    darkText: '#f0d9b5',
    select: 'rgba(20, 85, 30, 0.5)',
    moveTo: 'rgba(20, 85, 0, 0.5)',
    last: 'rgba(155, 199, 0, 0.41)',
    check: 'rgba(235, 20, 20, 0.85)',
    premove: 'rgba(20, 30, 85, 0.5)',
    boardBorder: 'transparent',
    flat: true,
  },
  green: {
    label: 'Зелёная',
    light: '#ffffdd',
    dark: '#86a666',
    lightText: '#86a666',
    darkText: '#ffffdd',
    select: 'rgba(20, 85, 30, 0.5)',
    moveTo: 'rgba(20, 85, 0, 0.5)',
    last: 'rgba(155, 199, 0, 0.41)',
    check: 'rgba(235, 20, 20, 0.85)',
    premove: 'rgba(20, 30, 85, 0.5)',
    boardBorder: 'transparent',
    flat: true,
  },
  blue: {
    label: 'Синяя',
    light: '#dee3e6',
    dark: '#8ca2ad',
    lightText: '#8ca2ad',
    darkText: '#dee3e6',
    select: 'rgba(20, 85, 30, 0.5)',
    moveTo: 'rgba(20, 85, 0, 0.5)',
    last: 'rgba(155, 199, 0, 0.41)',
    check: 'rgba(235, 20, 20, 0.85)',
    premove: 'rgba(20, 30, 85, 0.5)',
    boardBorder: 'transparent',
    flat: true,
  },
  purple: {
    label: 'Фиолетовая',
    light: '#9f90b0',
    dark: '#7d4a8d',
    lightText: '#7d4a8d',
    darkText: '#9f90b0',
    select: 'rgba(20, 85, 30, 0.5)',
    moveTo: 'rgba(20, 85, 0, 0.5)',
    last: 'rgba(155, 199, 0, 0.41)',
    check: 'rgba(235, 20, 20, 0.85)',
    premove: 'rgba(20, 30, 85, 0.5)',
    boardBorder: 'transparent',
    flat: true,
  },
  grey: {
    label: 'Серая',
    light: '#b8b8b8',
    dark: '#8d8d8d',
    lightText: '#8d8d8d',
    darkText: '#b8b8b8',
    select: 'rgba(20, 85, 30, 0.5)',
    moveTo: 'rgba(20, 85, 0, 0.5)',
    last: 'rgba(155, 199, 0, 0.41)',
    check: 'rgba(235, 20, 20, 0.85)',
    premove: 'rgba(20, 30, 85, 0.5)',
    boardBorder: 'transparent',
    flat: true,
  },
  royal: {
    label: 'Royal Neon',
    light: '#2a3358',
    dark: '#151a33',
    lightText: '#7dd3fc',
    darkText: '#67e8f9',
    select: 'rgba(34, 211, 238, 0.55)',
    moveTo: 'rgba(236, 72, 153, 0.45)',
    last: 'rgba(250, 204, 21, 0.35)',
    check: 'rgba(239, 68, 68, 0.7)',
    premove: 'rgba(59, 130, 246, 0.55)',
    boardBorder: '#22d3ee',
  },
  midnight: {
    label: 'Midnight',
    light: '#1e3a5f',
    dark: '#0b1224',
    lightText: '#93c5fd',
    darkText: '#60a5fa',
    select: 'rgba(96, 165, 250, 0.55)',
    moveTo: 'rgba(167, 139, 250, 0.45)',
    last: 'rgba(52, 211, 153, 0.35)',
    check: 'rgba(248, 113, 113, 0.7)',
    premove: 'rgba(250, 204, 21, 0.45)',
    boardBorder: '#60a5fa',
  },
  ember: {
    label: 'Ember',
    light: '#3b2a2a',
    dark: '#1a1014',
    lightText: '#fdba74',
    darkText: '#fb7185',
    select: 'rgba(251, 146, 60, 0.55)',
    moveTo: 'rgba(244, 63, 94, 0.45)',
    last: 'rgba(250, 204, 21, 0.35)',
    check: 'rgba(239, 68, 68, 0.75)',
    premove: 'rgba(59, 130, 246, 0.55)',
    boardBorder: '#fb7185',
  },
}

export const CLOCK_PRESETS: Record<ClockPresetId, { label: string; tc: TimeControl }> = {
  none: { label: 'Без часов', tc: timeControl(0, 0) },
  bullet1: { label: 'Bullet 1+0', tc: timeControl(1, 0) },
  bullet2: { label: 'Bullet 2+1', tc: timeControl(2, 1) },
  blitz3: { label: 'Blitz 3+2', tc: timeControl(3, 2) },
  blitz5: { label: 'Blitz 5+0', tc: timeControl(5, 0) },
  rapid10: { label: 'Rapid 10+0', tc: timeControl(10, 0) },
  rapid15: { label: 'Rapid 15+10', tc: timeControl(15, 10) },
}

export const AI_LEVELS: Record<AiLevel, { label: string; depth: number; ms: number; noise: number; elo: number }> = {
  1: { label: 'Уровень 1', depth: 1, ms: 300, noise: 400, elo: 400 },
  2: { label: 'Уровень 2', depth: 1, ms: 300, noise: 250, elo: 600 },
  3: { label: 'Уровень 3', depth: 2, ms: 500, noise: 160, elo: 800 },
  4: { label: 'Уровень 4', depth: 2, ms: 500, noise: 90, elo: 1000 },
  5: { label: 'Уровень 5', depth: 3, ms: 800, noise: 60, elo: 1200 },
  6: { label: 'Уровень 6', depth: 3, ms: 1000, noise: 25, elo: 1400 },
  7: { label: 'Уровень 7', depth: 4, ms: 1000, noise: 10, elo: 1550 },
  8: { label: 'Уровень 8', depth: 5, ms: 1500, noise: 0, elo: 1700 },
  9: { label: 'Уровень 9', depth: 6, ms: 2500, noise: 0, elo: 1850 },
  10: { label: 'Уровень 10', depth: 8, ms: 4000, noise: 0, elo: 2000 },
  11: { label: 'Уровень 11', depth: 10, ms: 6000, noise: 0, elo: 2100 },
  12: { label: 'Уровень 12', depth: 12, ms: 9000, noise: 0, elo: 2200 },
}

export const COLORS = {
  bg: '#070a14',
  panel: 'rgba(10, 14, 30, 0.82)',
  panelSolid: '#0d1224',
  cyan: '#22d3ee',
  magenta: '#ec4899',
  gold: '#facc15',
  text: '#e8eefc',
  muted: '#8b9bb8',
  danger: '#fb7185',
  ok: '#34d399',
}
