import Board from '../components/Board';
import { BOARD_THEMES, PIECE_SETS, updateSettings, useSettings } from '../lib/settings';
import type { BoardTheme, PieceSet } from '../lib/settings';

const DEMO_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

export default function SettingsPage() {
  const s = useSettings();
  return (
    <div className="settings-page">
      <section className="card">
        <h2>Настройки</h2>

        <h4>Тема доски</h4>
        <div className="row wrap">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((id) => {
            const t = BOARD_THEMES[id];
            return (
              <button
                key={id}
                className={`theme-swatch${s.boardTheme === id ? ' active' : ''}`}
                onClick={() => updateSettings({ boardTheme: id })}
                title={t.label}
              >
                <span className="swatch-board" style={{ background: `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)` }} />
                {t.label}
              </button>
            );
          })}
        </div>

        <h4>Набор фигур</h4>
        <div className="row wrap">
          {(Object.keys(PIECE_SETS) as PieceSet[]).map((id) => (
            <button
              key={id}
              className={`btn${s.pieceSet === id ? ' primary' : ''}`}
              onClick={() => updateSettings({ pieceSet: id })}
            >
              {PIECE_SETS[id]}
            </button>
          ))}
        </div>

        <h4>Доска</h4>
        <label className="check-row">
          <input type="checkbox" checked={s.coords} onChange={(e) => updateSettings({ coords: e.target.checked })} />
          Показывать координаты (a–h, 1–8)
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.highlights}
            onChange={(e) => updateSettings({ highlights: e.target.checked })}
          />
          Подсвечивать последний ход и выбранную фигуру
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.legalMoves}
            onChange={(e) => updateSettings({ legalMoves: e.target.checked })}
          />
          Показывать точки возможных ходов
        </label>

        <h4>Ходы</h4>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.autoQueen}
            onChange={(e) => updateSettings({ autoQueen: e.target.checked })}
          />
          Автоматически превращать пешку в ферзя
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.premoves}
            onChange={(e) => updateSettings({ premoves: e.target.checked })}
          />
          Премувы: задавать ход заранее, пока думает соперник (в живых партиях)
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.confirmMove}
            onChange={(e) => updateSettings({ confirmMove: e.target.checked })}
          />
          Подтверждать каждый ход (в живых партиях)
        </label>
        <p className="muted">Настройки сохраняются в этом браузере.</p>
      </section>

      <section className="card">
        <h2>Предпросмотр</h2>
        <Board fen={DEMO_FEN} lastMove={{ from: 'g1', to: 'f3' }} />
      </section>
    </div>
  );
}
