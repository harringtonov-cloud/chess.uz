import type { Color, Role } from '../chess/index.ts'
import { pieceUrl } from '../chess-ui/pieces.ts'

type Props = {
  color: Color
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel?: () => void
}

const OPTIONS: Array<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n']

export function PromotionModal({ color, onPick, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Превращение</h3>
        <div className="promo-row">
          {OPTIONS.map((p) => (
            <button key={p} type="button" className="promo-btn" onClick={() => onPick(p)} aria-label={p}>
              <img src={pieceUrl(color, p as Role)} alt={p} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
