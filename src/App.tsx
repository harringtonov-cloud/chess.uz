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
const SIDE_RU: Record<Color, string> = { w: 'Белые', b: 'Черные' }

function displayMove(rec: MoveRecord): { from: Square; to: Square } {
  if (rec.castle) {
    const rank = rec.move.from >> 3
    return { from: rec.move.from, to: rank * 8 + (rec.castle === 'k'? 6 : 2) }
  }
  return { from: rec.move.from, to: rec.move.to }
}
function moveRows(g: Game) {
  const rows: { no: number; w?: string; b?: string }[] = []
  let no = g.initial.fullmoves
  g.history.forEach((rec) => {
    if (rec.color === 'w') rows.push({ no, w: rec.san })
    else {
      if (rows.length === 0) rows.push({ no, b: rec.san })
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
  const winner = o.winner? SIDE_RU[o.winner] : ''
  switch (o.reason) {
    case 'checkmate': return { title: 'Мат!', subtitle: `${winner} побеждают`, pgn }
    default: return { title: 'Партия окончена', subtitle: '', pgn }
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const theme: ThemeId = settings.boardTheme
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s) }
  useEffect(() => { void probeFileSet().then((ok) => ok && setSettings((s) => ({...s }))) }, [])
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
      const id = kind === 'quick'? await quickMatch(base as any) : await createRoom({...base, color: onlineColor, isPublic: false, variant } as any)
      openOnlineRoom(id)
    } catch {
      setOnlineError('Не удалось начать онлайн-партию.')
    } finally { setOnlineBusy(false) }
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('room')
    if (id && /^[a-z0-9]{4,32}$/i.test(id)) { setOnlineRoomId(id); setScreen('online') }
  }, [])

  useEffect(() => { if (screen!== 'lobby') return; loadHistory(8).then(setHistory).catch(() => setHistory([])) }, [screen, user?.uid])
  useEffect(() => { void loadSounds().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (!ready) return
    if (screen === 'lobby') playLobbyBgm()
    else playGameBgm()
  }, [screen, ready])

  const pgnHeaders = useCallback(() => {
    const { playMode: mode, aiLevel: lvl, humanSide: side, clockPreset: cp, variant: v } = live.current
    const tc = CLOCK_PRESETS[cp].tc
    return {
      Event: GAME_NAME, Site: 'chess.uz',
      White: mode === 'ai'? (side === 'w'? 'Игрок' : `AI ${lvl}`) : 'Белые',
      Black: mode === 'ai'? (side === 'b'? 'Игрок' : `AI ${lvl}`) : 'Черные',
      Variant: VARIANTS[v].label,
      TimeControl: tc.initialMs > 0? toPgnTimeControl(tc) : '-',
    }
  }, [])

  const finishGame = useCallback(() => {
    const g = gameRef.current; clockRef.current?.stop()
    const info = outcomeInfo(g, pgnHeaders()); setResult(info); setScreen('result')
  }, [pgnHeaders])

  const clearSelection = () => { setSelected(null); setLegalTargets([]) }
  const feedback = (rec: MoveRecord) => {
    setLastMove(displayMove(rec))
    if (rec.mate) { sfx('mate', 0.9); setStatusFlash('МАТ!') }
    else if (rec.check) { sfx('check', 0.85); setStatusFlash(`ШАХ! ${checkCounts.w}-${checkCounts.b}`) }
    else if (rec.captured) sfx('capture', 0.8)
    else sfx('move', 0.65)
    force()
  }

  const applyMove = (from: Square, to: Square, promotion?: Role): boolean => {
    const g = gameRef.current; const rec = g.playFromTo(from, to, promotion)
    if (!rec) return false
    if (variant === 'threeCheck' && rec.check) {
      const checked = g.turn
      setCheckCounts(c => {
        const next = {...c, [checked]: (c as any)[checked] + 1 }
        if (next[checked as keyof typeof next] >= 3) {
          setTimeout(() => { g.resign(checked as any); finishGame() }, 100)
        }
        return next
      })
    }
    clearSelection(); feedback(rec)
    if (live.current.screen === 'play' && g.isOver) finishGame()
    return true
  }

  const queueAi = () => {
    const g = gameRef.current; if (g.isOver || g.turn!== live.current.humanSide) return
    setAiThinking(true); const fen = g.fen(); const level = AI_LEVELS[live.current.aiLevel]
    void requestAiMove(fen, { depth: level.depth, ms: level.ms, noise: level.noise }).then((choice) => {
      setAiThinking(false)
      if (!choice || gameRef.current!== g || g.isOver) return
      if (applyMove(choice.from, choice.to, choice.promotion)) {
        const m = premoveRef.current.resolve(gameRef.current.position)
        if (m) applyMove(m.from, m.to, m.promotion)
      }
    })
  }
  const afterHumanMove = (ok: boolean) => { if (ok && live.current.playMode === 'ai') queueAi() }
  const onSquareClick = (sq: Square) => {
    if (pendingPromo) return
    const g = gameRef.current; const pos = g.position
    if (selected!== null && legalTargets.includes(sq)) {
      if (pos.needsPromotion(selected, sq)) { setPendingPromo({ from: selected, to: sq, color: pos.turn }); return }
      afterHumanMove(applyMove(selected, sq)); return
    }
    const piece = pos.pieceAt(sq)
    if (piece && piece.color === g.turn) { setSelected(sq); setLegalTargets(pos.uiDests().get(sq)?? []); }
    else clearSelection()
  }

  const startPlay = () => {
    sfx('click'); const g = new Game(); gameRef.current = g; setCheckCounts({ w: 0, b: 0 })
    const side: Color = playerColor === 'random'? (Math.random() < 0.5? 'w' : 'b') : playerColor as Color
    setHumanSide(side); setOrientation(side); setScreen('play'); force()
    if (playMode === 'ai' && side === 'b') setTimeout(queueAi, 400)
  }

  const game = gameRef.current; const position = game.position
  const rows = moveRows(game); const pm = premoveRef.current.premove
  const aiPlayable = ['standard','chess960','threeCheck','fromPosition'].includes(variant)

  return (
    <div className="app-root">
      {screen === 'lobby' && (
        <main className="lobby">
          <section className="setup-card">
            <h2>Онлайн {VARIANTS[variant].label}</h2>
            <p className="muted small">{VARIANTS[variant].desc}</p>
            <div className="row"><label>Вариант</label><div className="seg wrap">
              {(Object.keys(VARIANTS) as VariantId[]).map(id => (
                <button key={id} className={variant===id?'on':''} onClick={()=>setVariant(id)}>{VARIANTS[id].label}</button>
              ))}
            </div></div>
            <div className="row"><label>Часы</label><div className="seg wrap">
              {(Object.keys(CLOCK_PRESETS) as ClockPresetId[]).map(id => (
                <button key={id} className={onlinePreset===id?'on':''} onClick={()=>setOnlinePreset(id)}>{CLOCK_PRESETS[id].label}</button>
              ))}
            </div></div>
            <div className="btn-row">
              <button className="primary" onClick={()=>void startOnline('quick')}>Быстрая игра</button>
              <button className="ghost" onClick={()=>void startOnline('private')}>По ссылке</button>
            </div>
            {onlineError && <p className="err">{onlineError}</p>}
          </section>

          <section className="setup-card">
            <h2>Игра {VARIANTS[variant].label}</h2>
            <div className="row"><label>Режим</label><div className="seg">
              <button className={playMode==='ai'?'on':''} onClick={()=>setPlayMode('ai')}>vs AI</button>
              <button className={playMode==='local'?'on':''} onClick={()=>setPlayMode('local')}>2 игрока</button>
            </div></div>
            {!aiPlayable && playMode==='ai' && <p className="err">ИИ для {VARIANTS[variant].label} в разработке</p>}
            <button className="primary" onClick={startPlay} disabled={playMode==='ai' &&!aiPlayable}>Начать {VARIANTS[variant].label}</button>
          </section>
        </main>
      )}
      {(screen==='play') && (
        <main className="play-layout">
          <ChessBoard position={position} theme={settings.boardTheme} orientation={orientation} interactive={true} selected={selected} legalTargets={legalTargets} lastMove={lastMove} onSquareClick={onSquareClick} />
          <div>{variant==='threeCheck' && <div>Шахи {checkCounts.w}-{checkCounts.b}</div>}</div>
        </main>
      )}
      {screen==='result' && result && <div><h1>{result.title}</h1><button onClick={()=>setScreen('lobby')}>Лобби</button></div>}
      {screen==='online' && onlineRoomId && <OnlineGame roomId={onlineRoomId} settings={settings} onExit={()=>setScreen('lobby')} onSwitchRoom={openOnlineRoom} />}
      {pendingPromo && <PromotionModal color={pendingPromo.color} pieceSet={settings.pieceSet} onCancel={()=>setPendingPromo(null)} onPick={p=>{ const {from,to}=pendingPromo; setPendingPromo(null); applyMove(from,to,p)}} />}
    </div>
  )
}
