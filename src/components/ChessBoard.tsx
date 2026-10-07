import { useMemo, useRef, useState } from 'react'
import { FILE_NAMES, makeSquare, type Color, type Position, type Square } from '../chess/index.ts'
import { pieceUrl } from '../chess-ui/pieces.ts'
import { THEMES, type ThemeId } from '../game/config'

type Props = {
  position: Position
  theme: ThemeId
  orientation: Color
  interactive: boolean
  selected: Square | null
  legalTargets: Square[]
  /** Цели выбранной фигуры показаны как пре-мув (другой цвет). */
  premoveMode?: boolean
  premove?: { from: Square; to: Square } | null
  lastMove: { from: Square; to: Square } | null
  onSquareClick: (sq: Square) => void
  /** Правый клик по доске — отмена пре-мува. */
  onCancel?: () => void
  highlightCheck?: boolean
}

export function ChessBoard({
  position,
  theme,
  orientation,
  interactive,
  selected,
  legalTargets,
  premoveMode = false,
  premove = null,
  lastMove,
  onSquareClick,
  onCancel,
  highlightCheck = true,
}: Props) {
  const t = THEMES[theme]
  const [dragOver, setDragOver] = useState<Square | null>(null)
  const dragFrom = useRef<Square | null>(null)

  const checkSquare = useMemo<Square | null>(
    () => (highlightCheck && position.inCheck() ? position.kingSquare(position.turn) : null),
    [position, highlightCheck],
  )

  const ranks = orientation === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const files = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const lastRankShown = ranks[7]
  const rightFileShown = files[7]

  const dotColor = premoveMode ? t.premove : t.moveTo

  return (
    <div
      className={`chess-board${t.flat ? ' flat' : ''}`}
      style={
        t.flat
          ? undefined
          : { border: `2px solid ${t.boardBorder}`, boxShadow: `0 0 24px ${t.boardBorder}55, inset 0 0 40px #0008` }
      }
      onContextMenu={(e) => {
        e.preventDefault()
        onCancel?.()
      }}
    >
      {ranks.map((rank) =>
        files.map((file) => {
          const sq = makeSquare(file, rank)
          const name = FILE_NAMES[file] + String(rank + 1)
          const piece = position.pieceAt(sq)
          const isLight = (file + rank) % 2 === 1
          const isTarget = legalTargets.includes(sq)
          const isLast = !!lastMove && (lastMove.from === sq || lastMove.to === sq)
          const isPremove = !!premove && (premove.from === sq || premove.to === sq)

          return (
            <button
              key={sq}
              type="button"
              className="sq"
              disabled={!interactive}
              onClick={() => onSquareClick(sq)}
              onDragOver={(e) => {
                if (!interactive) return
                e.preventDefault()
                setDragOver(sq)
              }}
              onDragLeave={() => setDragOver((d) => (d === sq ? null : d))}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(null)
                if (dragFrom.current !== null) onSquareClick(sq)
                dragFrom.current = null
              }}
              style={{ background: isLight ? t.light : t.dark }}
              aria-label={name}
            >
              {isLast && <span className="hl" style={{ background: t.last }} />}
              {selected === sq && <span className="hl" style={{ background: premoveMode ? t.premove : t.select }} />}
              {isPremove && <span className="hl" style={{ background: t.premove }} />}
              {checkSquare === sq && (
                <span
                  className="hl"
                  style={{
                    background: t.flat
                      ? 'radial-gradient(ellipse at center, rgba(255,0,0,1) 0%, rgba(231,0,0,1) 25%, rgba(169,0,0,0) 89%, rgba(158,0,0,0) 100%)'
                      : t.check,
                  }}
                />
              )}
              {dragOver === sq && isTarget && <span className="hl" style={{ background: dotColor, opacity: 0.6 }} />}
              {isTarget && !piece && <span className="dot" style={{ background: dotColor }} />}
              {isTarget && piece && <span className="ring" style={{ borderColor: dotColor }} />}
              {piece && (
                <img
                  className="piece"
                  src={pieceUrl(piece.color, piece.role)}
                  alt={piece.color + piece.role}
                  draggable={interactive}
                  onDragStart={() => {
                    dragFrom.current = sq
                    if (selected !== sq) onSquareClick(sq)
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null
                  }}
                />
              )}
              {file === rightFileShown && (
                <span className="coord rank" style={{ color: isLight ? t.lightText : t.darkText }}>
                  {rank + 1}
                </span>
              )}
              {rank === lastRankShown && (
                <span className="coord file" style={{ color: isLight ? t.lightText : t.darkText }}>
                  {FILE_NAMES[file]}
                </span>
              )}
            </button>
          )
        }),
      )}
    </div>
  )
}
