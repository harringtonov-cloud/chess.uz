import { useEffect, useMemo, useRef, useState } from 'react'
import { Game, toPgn, type Color, type EndReason, type Square } from '../chess/index.ts'
import { ChessBoard } from './ChessBoard'
import { PromotionModal } from './PromotionModal'
import { CLOCK_PRESETS, GAME_NAME, type ClockPresetId } from '../game/config'
import { formatMs } from '../game/clock'
import { sfx } from '../game/sound'
import type { Settings } from '../game/settings'
import { saveGame } from '../data/games'
import { currentUid, joinRoom, mergeIntoOlder, patchRoom, watchRoom } from '../data/online'
import {
  clocksRunning,
  colorOf,
  describeResult,
  gameFromMoves,
  planAbandon,
  planClaimDraw,
  planDrawAccept,
  planDrawDecline,
  planDrawOffer,
  planFlag,
  planMove,
  planResign,
  remainingMs,
  turnOf,
  type Plan,
  type Room,
} from '../online/room.ts'

type Props = {
  roomId: string
  settings: Settings
  onExit: () => void
  /** Сменить комнату (при слиянии ожидающих комнат в быстрой игре). */
  onSwitchRoom: (id: string) => void
}

const SIDE_RU: Record<Color, string> = { w: 'Белые', b: 'Чёрные' }

export function OnlineGame({ roomId, settings, onExit, onSwitchRoom }: Props) {
  const [room, setRoom] = useState<Room | null | undefined>(undefined)
  const [uid, setUid] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Square | null>(null)
  const [legalTargets, setLegalTargets] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const [, setTick] = useState(0)

  const roomRef = useRef<Room | null>(null)
  /** Когда мы получили текущее число ходов — от этого момента считаем затраченное время. */
  const recvRef = useRef<{ len: number; at: number } | null>(null)
  const prevLenRef = useRef(-1)
  const flagSentRef = useRef(-1)
  const joinTriedRef = useRef(false)
  const savedRef = useRef(false)

  const link = `${window.location.origin}/?room=${roomId}`

  // ── Подписка на комнату ──
  useEffect(() => {
    setRoom(undefined)
    recvRef.current = null
    prevLenRef.current = -1
    flagSentRef.current = -1
    joinTriedRef.current = false
    savedRef.current = false
    setSelected(null)
    setLegalTargets([])
    const off = watchRoom(
      roomId,
      (r) => {
        if (r) {
          const len = r.moves.length
          if (!recvRef.current || recvRef.current.len !== len) {
            const first = !recvRef.current
            const since = first ? Math.min(Math.max(Date.now() - r.lastMoveAt, 0), 600_000) : 0
            recvRef.current = { len, at: performance.now() - since }
          }
        }
        roomRef.current = r
        setRoom(r)
      },
      () => setError('Не удалось подключиться к партии. Проверьте интернет и правила Firestore.'),
    )
    return off
  }, [roomId])

  useEffect(() => {
    void currentUid()
      .then(setUid)
      .catch(() => setError('Не удалось войти. Включите Anonymous в Firebase Authentication.'))
  }, [])

  const myColor: Color | null = room ? colorOf(room, uid) : null

  // ── Занять свободное место, если пришли по ссылке ──
  useEffect(() => {
    if (!room || !uid || myColor || joinTriedRef.current) return
    if (room.status === 'waiting' && (room.white === null || room.black === null)) {
      joinTriedRef.current = true
      joinRoom(roomId).catch(() => setError('Не удалось присоединиться к партии.'))
    }
  }, [room, uid, myColor, roomId])

  const movesKey = room ? room.moves.join(' ') : ''
  const game = useMemo<Game | null>(() => (room ? gameFromMoves(room.moves) : null), [movesKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const emptyGame = useMemo(() => new Game(), [])
  const position = (game ?? emptyGame).position

  const elapsed = () => (recvRef.current ? performance.now() - recvRef.current.at : 0)

  // ── Звук и сброс выбора при новом ходе ──
  useEffect(() => {
    if (!room || !game) return
    const len = room.moves.length
    if (prevLenRef.current >= 0 && len > prevLenRef.current) {
      const rec = game.lastMove
      if (rec) {
        if (rec.mate) sfx('mate', 0.9)
        else if (rec.check) sfx('check', 0.85)
        else if (rec.captured) sfx('capture', 0.8)
        else sfx('move', 0.65)
      }
      setSelected(null)
      setLegalTargets([])
    }
    prevLenRef.current = len
  }, [room, game])

  // ── Часы: тик интерфейса и контроль флажка ──
  const running = !!room && clocksRunning(room)
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => {
      setTick((n) => n + 1)
      const r = roomRef.current
      if (!r || !myColor) return
      const plan = planFlag(r, elapsed())
      if (plan.ok && flagSentRef.current !== r.moves.length) {
        flagSentRef.current = r.moves.length
        patchRoom(roomId, plan.patch).catch(() => undefined)
      }
    }, 100)
    return () => window.clearInterval(t)
  }, [running, myColor, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Пока ждём соперника: «пульс» комнаты и слияние при быстрой игре ──
  const waitingMine = !!room && room.status === 'waiting' && !!myColor
  const isPublic = !!room?.public
  useEffect(() => {
    if (!waitingMine) return
    const beat = window.setInterval(() => patchRoom(roomId, {}).catch(() => undefined), 15_000)
    let merge: number | undefined
    if (isPublic) {
      merge = window.setInterval(() => {
        const r = roomRef.current
        if (!r || r.status !== 'waiting') return
        void mergeIntoOlder(roomId, r)
          .then((id) => id && onSwitchRoom(id))
          .catch(() => undefined)
      }, 4000)
    }
    return () => {
      window.clearInterval(beat)
      if (merge) window.clearInterval(merge)
    }
  }, [waitingMine, isPublic, roomId, onSwitchRoom])

  // ── Сохранить законченную партию в «Мои партии» ──
  useEffect(() => {
    if (!room || room.status !== 'finished' || !myColor || savedRef.current) return
    if (!room.result || room.moves.length === 0) return
    savedRef.current = true
    const g = gameFromMoves(room.moves)
    if (!g) return
    const preset = CLOCK_PRESETS[room.tcId as ClockPresetId]
    try {
      if (!g.isOver) {
        g.end({
          result: room.result,
          winner: room.result === '1-0' ? 'w' : room.result === '0-1' ? 'b' : null,
          reason: (room.reason ?? 'agreement') as EndReason,
        })
      }
      const pgn = toPgn(g, {
        headers: {
          Event: `${GAME_NAME} онлайн`,
          Site: 'chess.uz',
          Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
          White: room.whiteName || 'Белые',
          Black: room.blackName || 'Чёрные',
        },
      })
      void saveGame({
        pgn,
        result: room.result,
        reason: room.reason ?? '',
        white: room.whiteName || 'Белые',
        black: room.blackName || 'Чёрные',
        mode: 'online',
        aiLevel: null,
        timeControl: preset?.label ?? room.tcId,
        plies: room.moves.length,
      }).catch(() => undefined)
    } catch {
      /* сохранение необязательно */
    }
  }, [room, myColor])

  // ── Действия ──
  const run = (plan: Plan) => {
    if (!plan.ok) {
      setError(plan.error)
      return
    }
    setError('')
    patchRoom(roomId, plan.patch).catch(() => setError('Не удалось отправить. Проверьте соединение.'))
  }

  const myTurn = !!room && !!myColor && room.status === 'playing' && turnOf(room) === myColor

  const submit = (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
    if (!room || !myColor) return
    const g = gameFromMoves(room.moves)
    const rec = g?.playFromTo(from, to, promotion)
    if (!rec) return
    setSelected(null)
    setLegalTargets([])
    run(planMove(room, rec.uci, myColor, elapsed()))
  }

  const onSquareClick = (sq: Square) => {
    if (promo || !room || !myColor || !myTurn) return
    const pos = position
    if (selected !== null) {
      if (selected === sq) {
        setSelected(null)
        setLegalTargets([])
        return
      }
      if (legalTargets.includes(sq)) {
        if (pos.needsPromotion(selected, sq)) {
          setPromo({ from: selected, to: sq })
          return
        }
        submit(selected, sq)
        return
      }
    }
    const piece = pos.pieceAt(sq)
    if (piece && piece.color === myColor) {
      setSelected(sq)
      setLegalTargets(pos.uiDests().get(sq) ?? [])
      sfx('click', 0.4)
    } else {
      setSelected(null)
      setLegalTargets([])
    }
  }

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => window.prompt('Скопируйте ссылку:', link))
  }

  // ── Отображение ──
  if (room === undefined) {
    return (
      <main className="lobby">
        <section className="setup-card">
          <h2>Подключение…</h2>
          {error && <p className="auth-msg err">{error}</p>}
          <button type="button" className="ghost" onClick={onExit}>
            В лобби
          </button>
        </section>
      </main>
    )
  }

  if (room === null) {
    return (
      <main className="lobby">
        <section className="setup-card">
          <h2>Партия не найдена</h2>
          <p className="small">Ссылка устарела или указана неверно.</p>
          <button type="button" className="primary" onClick={onExit}>
            В лобби
          </button>
        </section>
      </main>
    )
  }

  const preset = CLOCK_PRESETS[room.tcId as ClockPresetId]

  if (room.status === 'waiting' && myColor) {
    return (
      <main className="lobby">
        <section className="setup-card">
          <h2>Ждём соперника…</h2>
          <p className="small">
            {preset?.label ?? room.tcId} · вы играете {myColor === 'w' ? 'белыми' : 'чёрными'}
            {room.public ? ' · быстрая игра' : ''}
          </p>
          {!room.public && (
            <>
              <p className="small">Отправьте эту ссылку другу — когда он её откроет, партия начнётся:</p>
              <input className="link-box" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="primary" onClick={copyLink}>
                {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
              </button>
            </>
          )}
          {error && <p className="auth-msg err">{error}</p>}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const plan = planAbandon(room)
              if (plan.ok) patchRoom(roomId, plan.patch).catch(() => undefined)
              onExit()
            }}
          >
            Отмена
          </button>
        </section>
      </main>
    )
  }

  const orientation: Color = flipped ? (myColor === 'b' ? 'w' : 'b') : (myColor ?? 'w')
  const top: Color = orientation === 'w' ? 'b' : 'w'
  const bottom: Color = orientation
  const finished = room.status === 'finished'
  const spectator = !myColor
  const claim = room.status === 'playing' && myColor ? game?.claimableDraw() : null
  const lastRec = game?.lastMove ?? null
  const lastMove = lastRec
    ? lastRec.castle
      ? { from: lastRec.move.from, to: (lastRec.move.from >> 3) * 8 + (lastRec.castle === 'k' ? 6 : 2) }
      : { from: lastRec.move.from, to: lastRec.move.to }
    : null
  const incoming = myColor && room.drawOfferBy && room.drawOfferBy !== myColor
  const outgoing = myColor && room.drawOfferBy === myColor

  const nameOf = (c: Color) => (c === 'w' ? room.whiteName : room.blackName) || SIDE_RU[c]
  const clockBox = (c: Color) => {
    const ms = remainingMs(room, c, elapsed())
    const hot = room.status === 'playing' && clocksRunning(room) && turnOf(room) === c
    const timed = room.baseMs > 0
    return (
      <div className={`clock ${hot ? 'hot' : ''} ${timed && ms < 10_000 ? 'low' : ''}`}>
        <span title={SIDE_RU[c]}>{nameOf(c)}</span>
        <strong>{timed ? formatMs(Math.max(0, ms)) : '∞'}</strong>
      </div>
    )
  }

  const rows: { no: number; w?: string; b?: string }[] = []
  game?.history.forEach((rec, i) => {
    if (rec.color === 'w') rows.push({ no: Math.floor(i / 2) + 1, w: rec.san })
    else if (rows.length) rows[rows.length - 1].b = rec.san
  })

  return (
    <main className="play-layout">
      <aside className="side panel">
        <div className="meta">
          <strong>Онлайн-партия</strong>
          <span className="muted">{preset?.label ?? room.tcId}</span>
          {spectator && <span className="muted">Вы наблюдатель</span>}
          {room.status === 'playing' && !spectator && (
            <span className={myTurn ? 'ok' : 'muted'}>{myTurn ? 'Ваш ход' : 'Ход соперника'}</span>
          )}
          {room.status === 'playing' && room.moves.length < 2 && room.baseMs > 0 && (
            <span className="muted small">Часы запустятся после первых ходов</span>
          )}
        </div>
        <div className="moves">
          <h4>Ходы</h4>
          <ol>
            {rows.map((r) => (
              <li key={r.no}>
                <span>{r.no}.</span> {r.w ?? '…'} {r.b ?? ''}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <section className="board-wrap">
        <ChessBoard
          position={position}
          theme={settings.boardTheme}
          orientation={orientation}
          interactive={myTurn}
          selected={selected}
          legalTargets={legalTargets}
          lastMove={lastMove}
          onSquareClick={onSquareClick}
          pieceSet={settings.pieceSet}
          showCoords={settings.coords}
          showLastMove={settings.lastMove}
          showLegal={settings.legalMoves}
        />
        {finished && (
          <div className="pulse-banner" style={{ borderColor: '#facc15' }}>
            {describeResult(room)}
          </div>
        )}
      </section>

      <aside className="side panel controls">
        {clockBox(top)}
        {clockBox(bottom)}
        {error && <p className="auth-msg err">{error}</p>}
        <button type="button" className="ghost" onClick={() => setFlipped((f) => !f)}>
          Перевернуть
        </button>
        {!finished && myColor && room.status === 'playing' && (
          <>
            {incoming ? (
              <div className="btn-row">
                <button type="button" className="primary" onClick={() => run(planDrawAccept(room, myColor))}>
                  Принять ничью
                </button>
                <button type="button" className="ghost" onClick={() => run(planDrawDecline(room, myColor))}>
                  Отклонить
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="ghost"
                disabled={!!outgoing || room.moves.length < 2}
                onClick={() => run(planDrawOffer(room, myColor))}
              >
                {outgoing ? 'Ничья предложена…' : 'Предложить ничью'}
              </button>
            )}
            {claim && (
              <button type="button" className="primary slim" onClick={() => run(planClaimDraw(room))}>
                {claim === 'threefold-repetition' ? 'Ничья: повторение ×3' : 'Ничья: правило 50 ходов'}
              </button>
            )}
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm('Сдаться?')) run(planResign(room, myColor))
              }}
            >
              Сдаться
            </button>
          </>
        )}
        {room.status === 'playing' && !myColor && !room.public && (
          <button type="button" className="ghost" onClick={copyLink}>
            {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
          </button>
        )}
        <button type="button" className={finished ? 'primary' : 'ghost'} onClick={onExit}>
          {finished ? 'В лобби' : 'Выйти'}
        </button>
      </aside>

      {promo && (
        <PromotionModal
          color={myColor ?? 'w'}
          pieceSet={settings.pieceSet}
          onCancel={() => setPromo(null)}
          onPick={(p) => {
            const { from, to } = promo
            setPromo(null)
            submit(from, to, p)
          }}
        />
      )}
    </main>
  )
}
