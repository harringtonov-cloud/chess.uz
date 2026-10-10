import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChessClock,
  Game,
  PremoveController,
  categorize,
  gameFromPgn,
  premoveDests,
  premoveNeedsPromotion,
  toPgn,
  toPgnTimeControl,
  type Color,
  type MoveRecord,
  type Role,
  type Square,
} from './chess/index.ts'
import { ASSETS } from './assets'
import { ChessBoard } from './components/ChessBoard'
import { PromotionModal } from './components/PromotionModal'
import { requestAiMove } from './game/aiClient'
import {
  AI_LEVELS,
  CLOCK_PRESETS,
  COLORS,
  GAME_NAME,
  THEMES,
  VARIANTS,
  type VariantId,
  type AiLevel,
  type ClockPresetId,
  type PlayMode,
  type ThemeId,
} from './game/config'
import { formatMs } from './game/clock'
import { loadHistory, saveGame, type SavedGame } from './data/games'
import { logout, watchUser, type AuthUser } from './data/auth'
import { AuthModal } from './components/AuthModal'
import { SettingsModal } from './components/SettingsModal'
import { OnlineGame } from './components/OnlineGame'
import { createRoom, quickMatch } from './data/online'
import { loadSettings, saveSettings, type Settings } from './game/settings'
import { probeFileSet } from './chess-ui/pieces'
import { STARTER_PUZZLES } from './game/puzzles'
import { loadSounds, playGameBgm, playLobbyBgm, sfx, stopBgm, toggleMute } from './game/sound'

type Screen = 'lobby' | 'play' | 'puzzles' | 'analysis' | 'result' | 'online'
type ResultInfo = { title: string; subtitle: string; pgn: string }
type PendingPromo = { from: Square; to: Square; color: Color; premove?: boolean }
const SIDE_RU: Record<Color, string> = { w: 'Белые', b: 'Чёрные' }

function displayMove(rec: MoveRecord): { from: Square; to: Square } {
  if (rec.castle) {
    const rank = rec.move.from >> 3
    return { from: rec.move.from, to: rank * 8 + (rec.castle === 'k' ? 6 : 2) }
  }
  return { from: rec.move.from, to: rec.move.to }
}
function moveRows(g: Game): { no: number; w?: string; b?: string }[] {
  const rows: { no: number; w?: string; b?: string }[] = []
  let no = g.initial.fullmoves
  g.history.forEach((rec, i) => {
    if (rec.color === 'w') rows.push({ no, w: rec.san })
    else {
      if (i === 0 || rows.length === 0) rows.push({ no, b: rec.san })
      else rows[rows.length - 1].b = rec.san
      no++
    }
  })
  return rows
}
function outcomeInfo(game: Game, headers: Record<string, string>): ResultInfo {
  const pgn = toPgn(game, { headers })
  const o = game.outcome
  if (!o) return { title: 'Партия окончена', subtitle: '', pgn }
  const winner = o.winner ? SIDE_RU[o.winner] : ''
  const loser = o.winner ? SIDE_RU[o.winner === 'w' ? 'b' : 'w'] : ''
  switch (o.reason) {
    case 'checkmate': return { title: 'Мат!', subtitle: `${winner} побеждают`, pgn }
    case 'stalemate': return { title: 'Пат', subtitle: 'Ничья — нет легальных ходов', pgn }
    case 'insufficient-material': return { title: 'Ничья', subtitle: 'Недостаточно материала для мата', pgn }
    case 'fivefold-repetition': return { title: 'Ничья', subtitle: 'Пятикратное повторение позиции', pgn }
    case 'threefold-repetition': return { title: 'Ничья', subtitle: 'Троекратное повторение позиции', pgn }
    case 'seventyfive-moves': return { title: 'Ничья', subtitle: 'Правило 75 ходов', pgn }
    case 'fifty-moves': return { title: 'Ничья', subtitle: 'Правило 50 ходов', pgn }
    case 'agreement': return { title: 'Ничья', subtitle: 'По соглашению', pgn }
    case 'resignation': return { title: 'Сдача', subtitle: `${loser} сдались. ${winner} побеждают`, pgn }
    case 'timeout': return o.winner ? { title: 'Время!', subtitle: `${winner} побеждают по времени`, pgn } : { title: 'Время', subtitle: 'Ничья — у соперника недостаточно материала для мата', pgn }
    default: return { title: 'Партия окончена', subtitle: '', pgn }
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const theme: ThemeId = settings.boardTheme
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s) }
  useEffect(() => { void probeFileSet().then((ok) => ok && setSettings((s) => ({ ...s }))) }, [])
  const [muted, setMuted] = useState(false)
  const [ready, setReady] = useState(false)
  const [playMode, setPlayMode] = useState<PlayMode>('ai')
  const [aiLevel, setAiLevel] = useState<AiLevel>(4)
  const [clockPreset, setClockPreset] = useState<ClockPresetId>('blitz5')
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | 'random'>('w')
  const [variant, setVariant] = useState<VariantId>('standard')
  const [checkCounts, setCheckCounts] = useState({ w: 0, b: 0 })

  const gameRef = useRef(new Game())
  const premoveRef = useRef(new PremoveController())
  const clockRef = useRef<ChessClock | null>(null)
  const [, bump] = useState(0)
  const force = () => bump((n) => n + 1)
  const [orientation, setOrientation] = useState<Color>('w')
  const [selected, setSelected] = useState<Square | null>(null)
  const [legalTargets, setLegalTargets] = useState<Square[]>([])
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [pendingPromo, setPendingPromo] = useState<PendingPromo | null>(null)
  const [statusFlash, setStatusFlash] = useState<string>('')
  const [drawOfferedBy, setDrawOfferedBy] = useState<Color | null>(null)
  const [result, setResult] = useState<ResultInfo | null>(null)
  const [humanSide, setHumanSide] = useState<Color>('w')
  const [aiThinking, setAiThinking] = useState(false)
  const [undoLeft, setUndoLeft] = useState(3)
  const live = useRef({ screen, playMode, aiLevel, humanSide, clockPreset, variant })
  live.current = { screen, playMode, aiLevel, humanSide, clockPreset, variant }
  const lastTickSecond = useRef(-1)

  const [puzzleIndex, setPuzzleIndex] = useState(0)
  const [puzzleStep, setPuzzleStep] = useState(0)
  const [puzzleStreak, setPuzzleStreak] = useState(0)
  const [puzzleMessage, setPuzzleMessage] = useState('')
  const puzzle = STARTER_PUZZLES[puzzleIndex % STARTER_PUZZLES.length]
  const [fenInput, setFenInput] = useState('')
  const [pgnInput, setPgnInput] = useState('')
  const [history, setHistory] = useState<SavedGame[]>([])
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  useEffect(() => watchUser(setUser), [])
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(null)
  const [onlinePreset, setOnlinePreset] = useState<ClockPresetId>('blitz5')
  const [onlineColor, setOnlineColor] = useState<'w' | 'b' | 'random'>('random')
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const openOnlineRoom = (id: string) => { setOnlineRoomId(id); setScreen('online'); window.history.replaceState(null, '', `/?room=${id}`) }
  const exitOnline = () => { setOnlineRoomId(null); setScreen('lobby'); window.history.replaceState(null, '', '/') }

  const startOnline = async (kind: 'quick' | 'private') => {
    sfx('click'); setOnlineBusy(true); setOnlineError('')
    try {
      const tc = CLOCK_PRESETS[onlinePreset].tc
      const base = { tcId: onlinePreset, baseMs: tc.initialMs, incMs: tc.incrementMs, variant }
      const id = kind === 'quick' ? await quickMatch(base as any) : await createRoom({ ...base, color: onlineColor, isPublic: false, variant } as any)
      openOnlineRoom(id)
    } catch { setOnlineError('Не удалось начать онлайн-партию. Проверьте вход в Firebase и правила Firestore.') }
    finally { setOnlineBusy(false) }
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('room')
    if (id && /^[a-z0-9]{4,32}$/i.test(id)) { setOnlineRoomId(id); setScreen('online') }
  }, [])
  useEffect(() => { if (screen !== 'online' && onlineRoomId) { setOnlineRoomId(null); window.history.replaceState(null, '', '/') } }, [screen, onlineRoomId])
  useEffect(() => { if (screen !== 'lobby') return; loadHistory(8).then(setHistory).catch(() => setHistory([])) }, [screen, user?.uid])
  useEffect(() => { void loadSounds().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (!ready) return
    if (screen === 'lobby') playLobbyBgm()
    else if (screen === 'play' || screen === 'puzzles' || screen === 'analysis' || screen === 'online') playGameBgm()
    else stopBgm()
  }, [screen, ready])
  useEffect(() => { if (!statusFlash) return; const t = window.setTimeout(() => setStatusFlash(''), 1600); return () => clearTimeout(t) }, [statusFlash])

  const pgnHeaders = useCallback((): Record<string, string> => {
    const { playMode: mode, aiLevel: lvl, humanSide: side, clockPreset: cp, variant: v } = live.current
    const human = 'Игрок'; const ai = `AI (${AI_LEVELS[lvl].label})`; const tc = CLOCK_PRESETS[cp].tc
    const headers: Record<string, string> = { Event: GAME_NAME, Site: 'chess.uz', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), White: mode === 'ai' ? (side === 'w' ? human : ai) : 'Белые', Black: mode === 'ai' ? (side === 'b' ? human : ai) : 'Чёрные', Variant: VARIANTS[v].label }
    if (tc.initialMs > 0) headers.TimeControl = toPgnTimeControl(tc)
    return headers
  }, [])

  const finishGame = useCallback(() => {
    const g = gameRef.current; clockRef.current?.stop(); premoveRef.current.clear(); setAiThinking(false)
    const info = outcomeInfo(g, pgnHeaders()); setResult(info); setScreen('result')
    if (g.ply > 0 && g.outcome) {
      const h = pgnHeaders(); const { playMode: mode, aiLevel: lvl, clockPreset: cp } = live.current
      void saveGame({ pgn: info.pgn, result: g.outcome.result, reason: g.outcome.reason, white: h.White, black: h.Black, mode, aiLevel: mode === 'ai' ? lvl : null, timeControl: CLOCK_PRESETS[cp].label, plies: g.ply }).catch(() => undefined)
    }
    if (g.outcome?.reason === 'checkmate') sfx('mate', 0.9)
  }, [pgnHeaders])

  useEffect(() => {
    if (screen !== 'play') return
    let raf = 0; let last = 0
    const loop = (ts: number) => {
      const clock = clockRef.current
      if (clock?.enabled) {
        const flagged = clock.check()
        if (flagged) { gameRef.current.flag(flagged); finishGame(); return }
        if (clock.running) {
          const left = clock.time(clock.activeColor)
          if (left < 10_000) { const sec = Math.ceil(left / 1000); if (sec !== lastTickSecond.current) { lastTickSecond.current = sec; sfx('tick', 0.35) } }
        }
        if (ts - last > 90) { last = ts; force() }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [screen, finishGame])

  const clearSelection = () => { setSelected(null); setLegalTargets([]) }
  const feedback = (rec: MoveRecord) => {
    const g = gameRef.current; setLastMove(displayMove(rec))
    if (rec.mate) { sfx('mate', 0.9); setStatusFlash('МАТ!') }
    else if (rec.check) { sfx('check', 0.85); setStatusFlash(variant === 'threeCheck' ? `ШАХ! ${checkCounts.w+ (g.turn==='w'?1:0)}-${checkCounts.b + (g.turn==='b'?1:0)}` : 'ШАХ!') }
    else if (rec.captured) { sfx('capture', 0.8); setStatusFlash('') }
    else { sfx('move', 0.65); setStatusFlash('') }
    force()
  }
  const applyMove = (from: Square, to: Square, promotion?: Role): boolean => {
    const g = gameRef.current; const mover = g.turn; const rec = g.playFromTo(from, to, promotion)
    if (!rec) return false
    if (variant === 'threeCheck' && rec.check) {
      const checked = g.turn
      setCheckCounts(c => {
        const next = { ...c, [checked]: (c as any)[checked] + 1 }
        if ((next as any)[checked] >= 3) { setTimeout(() => { g.resign(checked as any); finishGame() }, 150) }
        return next
      })
    }
    const clock = clockRef.current
    if (live.current.screen === 'play' && clock?.enabled) {
      const left = clock.press(mover)
      if (clock.flagged) { g.undo(); g.flag(mover); finishGame(); return false }
      if (Number.isFinite(left)) rec.clockMs = left
    }
    clearSelection(); setDrawOfferedBy(null); feedback(rec)
    if (live.current.screen === 'play' && g.isOver) finishGame()
    return true
  }
  const queueAi = () => {
    const g = gameRef.current; if (g.isOver || g.turn !== live.current.humanSide) return
    setAiThinking(true); const fen = g.fen(); const level = AI_LEVELS[live.current.aiLevel]; const started = performance.now()
    void requestAiMove(fen, { depth: level.depth, ms: level.ms, noise: level.noise }).then((choice) => {
      const wait = Math.max(0, 350 - (performance.now() - started))
      window.setTimeout(() => {
        setAiThinking(false)
        if (!choice || gameRef.current !== g || g.isOver || g.fen() !== fen || live.current.screen !== 'play') return
        if (applyMove(choice.from, choice.to, choice.promotion)) afterOpponentMove()
      }, wait)
    })
  }
  const afterOpponentMove = () => {
    const g = gameRef.current; if (g.isOver) return
    const m = premoveRef.current.resolve(g.position)
    if (m && applyMove(m.from, m.to, m.promotion) && live.current.playMode === 'ai') queueAi()
    force()
  }
  const afterHumanMove = (ok: boolean) => {
    if (!ok) return
    if (live.current.screen === 'play' && live.current.playMode === 'ai') queueAi()
    if (live.current.screen === 'puzzles') handlePuzzlePlayerMove()
  }
  const onPremoveClick = (sq: Square) => {
    const g = gameRef.current; const pos = g.position; const pm = premoveRef.current; const piece = pos.pieceAt(sq)
    if (selected !== null && legalTargets.includes(sq)) {
      if (premoveNeedsPromotion(pos, selected, sq)) { setPendingPromo({ from: selected, to: sq, color: humanSide, premove: true }); return }
      pm.set(pos, { from: selected, to: sq }); clearSelection(); sfx('click', 0.4); force(); return
    }
    if (piece && piece.color === humanSide && sq !== selected) { setSelected(sq); setLegalTargets(premoveDests(pos, sq)); return }
    pm.clear(); clearSelection(); force()
  }
  const cancelPremove = () => { premoveRef.current.clear(); clearSelection(); force() }
  const onSquareClick = (sq: Square) => {
    if (pendingPromo) return; const g = gameRef.current; const pos = g.position
    if (screen === 'play') { if (result || g.isOver) return; if (playMode === 'ai' && g.turn !== humanSide) { onPremoveClick(sq); return } }
    if (selected !== null) {
      if (selected === sq) { clearSelection(); return }
      if (legalTargets.includes(sq)) {
        if (pos.needsPromotion(selected, sq)) { setPendingPromo({ from: selected, to: sq, color: pos.turn }); return }
        afterHumanMove(applyMove(selected, sq)); return
      }
    }
    const piece = pos.pieceAt(sq)
    if (piece && piece.color === g.turn) {
      if (screen === 'play' && playMode === 'ai' && piece.color !== humanSide) return
      setSelected(sq); setLegalTargets(pos.uiDests().get(sq) ?? []); sfx('click', 0.4)
    } else { clearSelection() }
  }
  const startPlay = () => {
    sfx('click'); const g = new Game(); gameRef.current = g; premoveRef.current.clear()
    clockRef.current = new ChessClock(CLOCK_PRESETS[clockPreset].tc); lastTickSecond.current = -1
    clearSelection(); setLastMove(null); setStatusFlash(''); setDrawOfferedBy(null); setResult(null); setAiThinking(false); setUndoLeft(3); setCheckCounts({ w: 0, b: 0 })
    const side: Color = playMode === 'local' ? 'w' : playerColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : playerColor
    setHumanSide(side); setOrientation(side)
    live.current = { ...live.current, screen: 'play', humanSide: side, playMode, aiLevel, clockPreset, variant }
    setScreen('play'); force()
    if (playMode === 'ai' && side === 'b') { window.setTimeout(() => queueAi(), 400) }
  }
  const resign = () => { sfx('fail', 0.6); const g = gameRef.current; g.resign(playMode === 'ai' ? humanSide : g.turn); finishGame() }
  const undoMove = () => {
    const g = gameRef.current
    if (screen === 'analysis') { if (g.undo()) { sfx('click', 0.4); setLastMove(g.lastMove ? displayMove(g.lastMove) : null); clearSelection(); force() } return }
    if (screen !== 'play' || playMode !== 'ai' || undoLeft <= 0 || aiThinking || g.ply === 0) return
    g.undo(); if (g.turn !== humanSide) g.undo(); premoveRef.current.clear(); setUndoLeft((n) => n - 1); setLastMove(g.lastMove ? displayMove(g.lastMove) : null); clearSelection(); sfx('click', 0.4); force()
  }
  const offerDraw = () => {
    if (screen !== 'play') return; const g = gameRef.current
    if (playMode === 'ai') { const accept = Math.random() < 0.35 || g.position.isInsufficientMaterial(); if (accept) { g.agreeDraw(); finishGame() } else { setStatusFlash('AI отклонил ничью'); sfx('fail', 0.45) } return }
    setDrawOfferedBy(g.turn); setStatusFlash('Предложена ничья — второй игрок может принять')
  }
  const acceptDraw = () => { gameRef.current.agreeDraw(); finishGame() }
  const claimDraw = () => { if (gameRef.current.claimDraw()) finishGame() }
  const loadPuzzle = (index: number) => {
    const p = STARTER_PUZZLES[index % STARTER_PUZZLES.length]; const g = Game.fromFen(p.fen); gameRef.current = g
    setPuzzleIndex(index % STARTER_PUZZLES.length); setPuzzleStep(0); setPuzzleMessage(p.hint); clearSelection(); setLastMove(null); setOrientation(g.turn); force()
  }
  const startPuzzles = () => { sfx('click'); setPuzzleStreak(0); live.current = { ...live.current, screen: 'puzzles' }; setScreen('puzzles'); loadPuzzle(0) }
  const handlePuzzlePlayerMove = () => {
    const p = STARTER_PUZZLES[puzzleIndex]; const g = gameRef.current; const normalize = (s: string) => s.replace(/[+#]/g, ''); const played = g.lastMove?.san ?? ''; const expected = p.solution[puzzleStep]
    if (normalize(played) !== normalize(expected)) { sfx('fail', 0.7); setPuzzleMessage('Неверный ход — попробуй ещё'); setPuzzleStreak(0); g.undo(); setLastMove(g.lastMove ? displayMove(g.lastMove) : null); force(); return }
    const solved = () => { sfx('mate', 0.7); setPuzzleStreak((s) => s + 1); setPuzzleMessage('Верно! +1 к серии'); window.setTimeout(() => loadPuzzle(puzzleIndex + 1), 700) }
    const nextStep = puzzleStep + 1
    if (nextStep >= p.solution.length) { setPuzzleStep(nextStep); solved(); return }
    const reply = g.play(p.solution[nextStep]); if (reply) feedback(reply)
    const afterReply = nextStep + 1; setPuzzleStep(afterReply); if (afterReply >= p.solution.length) solved(); else setPuzzleMessage('Так держать!')
  }
  const startAnalysis = () => { sfx('click'); gameRef.current = new Game(); clearSelection(); setLastMove(null); setOrientation('w'); setFenInput(gameRef.current.fen()); setPgnInput(''); live.current = { ...live.current, screen: 'analysis' }; setScreen('analysis'); force() }
  const loadFen = () => { try { gameRef.current = Game.fromFen(fenInput.trim()); clearSelection(); setLastMove(null); sfx('click'); force() } catch (e) { setStatusFlash(`Некорректный FEN: ${(e as Error).message}`); sfx('fail', 0.5) } }
  const loadPgn = (text = pgnInput) => { try { const g = gameFromPgn(text); gameRef.current = g; clearSelection(); setLastMove(g.lastMove ? displayMove(g.lastMove) : null); setFenInput(g.fen()); sfx('click'); force() } catch (e) { setStatusFlash(`Некорректный PGN: ${(e as Error).message}`); sfx('fail', 0.5) } }
  const exportPgn = async () => { const text = toPgn(gameRef.current, { headers: pgnHeaders() }); try { await navigator.clipboard.writeText(text); setStatusFlash('PGN скопирован'); sfx('click') } catch { setPgnInput(text); setStatusFlash('PGN в поле ниже') } }

  const game = gameRef.current; const position = game.position; const clock = clockRef.current; const themeDef = THEMES[theme]
  const premoveMode = screen === 'play' && playMode === 'ai' && !game.isOver && game.turn !== humanSide
  const interactive = (screen === 'play' && !result) || screen === 'puzzles' || screen === 'analysis'
  const claim = screen === 'play' ? game.claimableDraw() : null
  const rows = moveRows(gam
