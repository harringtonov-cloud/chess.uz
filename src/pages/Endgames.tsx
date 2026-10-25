import { useNavigate } from 'react-router-dom';
import { BOTS } from '../lib/bots';
import { ENDGAMES } from '../lib/endgames';
import type { Endgame } from '../lib/endgames';

const LEVEL = ['', 'Базовый', 'Средний', 'Сложный'];

export default function Endgames() {
  const nav = useNavigate();

  function play(e: Endgame) {
    try {
      sessionStorage.setItem('bot_endgame', e.id);
    } catch {
      /* без sessionStorage позиция не передастся, откроется обычная игра с ботом */
    }
    nav('/bots');
  }

  return (
    <div className="card">
      <h1>Тренировка эндшпилей</h1>
      <p className="muted">
        Выберите позицию и доведите её до победы против бота. Подсказка, возврат хода и анализ после партии работают как обычно.
      </p>
      <div className="lesson-grid">
        {ENDGAMES.map((e) => {
          const bot = BOTS.find((b) => b.id === e.bot);
          return (
            <div className="lesson-card" key={e.id}>
              <h3>{e.title}</h3>
              <div className="muted">
                {LEVEL[e.level]} · вы за {e.color === 'white' ? 'белых' : 'чёрных'}
                {bot ? ` · против ${bot.avatar} ${bot.name}` : ''}
              </div>
              <p>{e.goal}</p>
              <button className="btn primary" onClick={() => play(e)}>
                Играть против бота
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
