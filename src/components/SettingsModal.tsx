import { PIECE_SET_LABELS, pieceUrl, isFileSetAvailable, type PieceSetId } from '../chess-ui/pieces.ts'
import { THEMES, type ThemeId } from '../game/config'
import { DEFAULT_SETTINGS, type Settings } from '../game/settings.ts'

type Props = {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
}

const BOARD_ORDER: ThemeId[] = ['lichess', 'green', 'blue', 'purple', 'grey', 'royal', 'midnight', 'ember']

export function SettingsModal({ settings, onChange, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })
  const sets: PieceSetId[] = isFileSetAvailable()
    ? ['classic', 'warm', 'ocean', 'cburnett']
    : ['classic', 'warm', 'ocean']

  const toggle = (key: 'coords' | 'lastMove' | 'legalMoves' | 'plainPage', label: string) => (
    <label className="set-toggle">
      <input type="checkbox" checked={settings[key]} onChange={(e) => set({ [key]: e.target.checked } as Partial<Settings>)} />
      <span>{label}</span>
    </label>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Настройки</h3>

        <div className="set-block">
          <div className="set-title">Тема доски</div>
          <div className="swatches">
            {BOARD_ORDER.map((id) => {
              const t = THEMES[id]
              return (
                <button
                  key={id}
                  type="button"
                  className={`swatch ${settings.boardTheme === id ? 'on' : ''}`}
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => set({ boardTheme: id })}
                >
                  <span style={{ background: t.light }} />
                  <span style={{ background: t.dark }} />
                  <span style={{ background: t.dark }} />
                  <span style={{ background: t.light }} />
                </button>
              )
            })}
          </div>
          <div className="set-hint">{THEMES[settings.boardTheme].label}</div>
        </div>

        <div className="set-block">
          <div className="set-title">Фигуры</div>
          <div className="piece-sets">
            {sets.map((id) => (
              <button
                key={id}
                type="button"
                className={`piece-set ${settings.pieceSet === id ? 'on' : ''}`}
                onClick={() => set({ pieceSet: id })}
                title={PIECE_SET_LABELS[id]}
              >
                <img src={pieceUrl('w', 'n', id)} alt="" />
                <img src={pieceUrl('b', 'q', id)} alt="" />
                <small>{PIECE_SET_LABELS[id]}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="set-block">
          {toggle('coords', 'Координаты на доске')}
          {toggle('lastMove', 'Подсвечивать последний ход')}
          {toggle('legalMoves', 'Показывать допустимые ходы')}
          {toggle('plainPage', 'Простой тёмный фон (как на Lichess)')}
        </div>

        <div className="set-actions">
          <button type="button" className="ghost" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
            Сбросить
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
