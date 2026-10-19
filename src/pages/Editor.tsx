import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import PieceIcon from '../components/PieceIcon';
import { useSettings } from '../lib/settings';

const FILES = 'abcdefgh';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const GLYPH: Record<string, string> = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];

type Cells = (string | null)[]; // 64 клетки, индекс 0 = a8, 63 = h1

function parsePlacement(placement: string): Cells {
  const cells: Cells = [];
  for (const row of placement.split('/')) {
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push(null);
      else cells.push(ch);
    }
  }
  while (cells.length < 64) cells.push(null);
  return cells.slice(0, 64);
}

function toPlacement(cells: Cells): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let out = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = cells[r * 8 + f];
      if (!c) empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += c;
      }
    }
    rows.push(out + (empty ? empty : ''));
  }
  return rows.join('/');
}

/** Редактор позиции: расставьте фигуры, получите FEN, отправьте в анализ или сыграйте с ботом. */
export default function Editor() {
  const nav = useNavigate();
  const settings = useSettings();
  const svg = settings.pieceSet === 'svg';
  const [cells, setCells] = useState<Cells>(() => parsePlacement(START.split(' ')[0]));
  const [tool, setTool] = useState<string>('P'); // фигура или 'x' — ластик
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [castle, setCastle] = useState({ K: true, Q: true, k: true, q: true });
  const [flipped, setFlipped] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');

  const fen = useMemo(() => {
    const placement = toPlacement(cells);
    // рокировка возможна только если король и ладья стоят на своих местах
    const ok = {
      K: castle.K && cells[60] === 'K' && cells[63] === 'R',
      Q: castle.Q && cells[60] === 'K' && cells[56] === 'R',
      k: castle.k && cells[4] === 'k' && cells[7] === 'r',
      q: castle.q && cells[4] === 'k' && cells[0] === 'r',
    };
    const c = (ok.K ? 'K' : '') + (ok.Q ? 'Q' : '') + (ok.k ? 'k' : '') + (ok.q ? 'q' : '');
    return `${placement} ${turn} ${c || '-'} - 0 1`;
  }, [cells, turn, castle]);

  const problem = useMemo(() => {
    try {
      new Chess(fen);
      return null;
    } catch (e) {
      const text = (e as Error).message ?? '';
      if (/king/i.test(text)) return 'На доске должно быть по одному королю каждого цвета.';
      if (/pawn/i.test(text) || cells.slice(0, 8).includes('P') || cells.slice(56).includes('p'))
        return 'Пешки не могут стоять на крайних горизонталях.';
      return 'Позиция недопустима (например, королю противника уже объявлен шах).';
    }
  }, [fen, cells]);

  function click(idx: number) {
    setCells((prev) => {
      const next = [...prev];
      next[idx] = tool === 'x' || prev[idx] === tool ? null : tool;
      return next;
    });
    setMsg('');
  }

  function importFen() {
    const text = importText.trim();
    try {
      const c = new Chess(text);
      const parts = c.fen().split(' ');
      setCells(parsePlacement(parts[0]));
      setTurn(parts[1] === 'b' ? 'b' : 'w');
      setCastle({ K: parts[2].includes('K'), Q: parts[2].includes('Q'), k: parts[2].includes('k'), q: parts[2].includes('q') });
      setMsg('Позиция загружена');
    } catch {
      setMsg('Не удалось прочитать FEN');
    }
  }

  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));

  const piece = (ch: string) => {
    const color = ch === ch.toUpperCase() ? 'w' : 'b';
    const type = ch.toLowerCase() as 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
    return (
      <span className={`piece ${color === 'w' ? 'white' : 'black'}${svg ? ' svg' : ''}`}>
        {svg ? <PieceIcon type={type} color={color} /> : GLYPH[type]}
      </span>
    );
  };

  return (
    <div className="game-layout">
      <div className="board-col">
        <div className="board vision-board">
          {order.map((idx) => {
            const f = idx % 8;
            const r = Math.floor(idx / 8);
            const dark = (f + (7 - r)) % 2 === 0;
            const c = cells[idx];
            return (
              <div key={idx} className={`sq ${dark ? 'dark' : 'light'}`} onClick={() => click(idx)} title={`${FILES[f]}${8 - r}`}>
                {c && piece(c)}
              </div>
            );
          })}
        </div>
        <div className="palette">
          {PALETTE.map((p) => (
            <button key={p} className={`palette-btn ${tool === p ? 'active' : ''}`} onClick={() => setTool(p)}>
              {piece(p)}
            </button>
          ))}
          <button className={`palette-btn ${tool === 'x' ? 'active' : ''}`} onClick={() => setTool('x')} title="Ластик">
            ✖
          </button>
        </div>
      </div>

      <div className="side-col">
        <div className="card">
          <h2>Редактор позиции</h2>
          <p className="muted">Выберите фигуру внизу и нажимайте на клетки. Повторный клик по такой же фигуре убирает её.</p>
          <div className="row wrap">
            <span>Ход:</span>
            <button className={`btn small ${turn === 'w' ? 'primary' : ''}`} onClick={() => setTurn('w')}>Белых</button>
            <button className={`btn small ${turn === 'b' ? 'primary' : ''}`} onClick={() => setTurn('b')}>Чёрных</button>
          </div>
          <div className="row wrap">
            <span>Рокировка:</span>
            {([['K', 'белые O-O'], ['Q', 'белые O-O-O'], ['k', 'чёрные O-O'], ['q', 'чёрные O-O-O']] as const).map(([k, label]) => (
              <label key={k} className="check-row">
                <input type="checkbox" checked={castle[k]} onChange={(e) => setCastle({ ...castle, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <div className="row wrap">
            <button className="btn small" onClick={() => { setCells(parsePlacement(START.split(' ')[0])); setTurn('w'); setCastle({ K: true, Q: true, k: true, q: true }); }}>Начальная</button>
            <button className="btn small" onClick={() => setCells(Array(64).fill(null))}>Очистить</button>
            <button className="btn small" onClick={() => setFlipped((v) => !v)}>🔄</button>
          </div>
          <input readOnly value={fen} onFocus={(e) => e.currentTarget.select()} />
          {problem && <p className="error">{problem}</p>}
          <div className="row wrap actions">
            <button className="btn" onClick={() => navigator.clipboard?.writeText(fen)}>Копировать FEN</button>
            <button
              className="btn primary"
              disabled={problem !== null}
              onClick={() => { sessionStorage.setItem('analysis_pgn', fen); nav('/analysis'); }}
            >
              📈 В анализ
            </button>
            <button
              className="btn primary"
              disabled={problem !== null}
              onClick={() => { sessionStorage.setItem('bot_fen', fen); nav('/bots'); }}
            >
              🤖 Играть с ботом
            </button>
          </div>
        </div>
        <div className="card">
          <h4>Загрузить FEN</h4>
          <input value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Вставьте FEN" />
          <div className="row">
            <button className="btn" onClick={importFen}>Загрузить</button>
            {msg && <span className="muted">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
