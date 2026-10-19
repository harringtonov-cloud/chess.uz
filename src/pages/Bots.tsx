import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Board from '../components/Board';
import MoveList from '../components/MoveList';
import PlayerBar from '../components/PlayerBar';
import { Chess } from 'chess.js';
import { BOTS, ODDS_LABEL, oddsFen } from '../lib/bots';
import type { Bot, Odds } from '../lib/bots';
import { gameOverInfo, replayFrom, resultText, uciToMove, uciToSan } from '../lib/chessUtil';
import { getEngine } from '../lib/engine';
import { playSound } from '../lib/sound';

type ColorChoice = 'white' | 'black' | 'random';

/** Контроль времени против бота (base — секунд; 0 — без часов). */
const BOT_TC = [
  { label: 'Без часов', base: 0, inc: 0 },
  { label: '1+0', base: 60, inc: 0 },
  { label: '3+0', base: 180, inc: 0 },
  { label: '3+2', base: 180, inc: 2 },
  { label: '5+0', base: 300, inc: 0 },
  { label: '10+0', base: 600, inc: 0 },
  { label: '15+10', base: 900, inc: 10 },
];

export default function Bots() {
  const nav = useNavigate();
  const [bot, setBot] = useState<Bot>(BOTS[2]);
  const [choice, setChoice] = useState<ColorChoice>('white');
  const [human, setHuman] = useState<'white' | 'black'>('white');
  const [started, setStarted] = useState(false);
  const [moves, setMoves] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [drawMsg, setDrawMsg] = useState('');
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [hintText, setHintText] = useState('');
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const lastSoundLen = useRef(0);
  const [startFen, setStartFen] = useState<string | null>(null);
  const [tcIdx, setTcIdx] = useState(0);
  const [odds, setOdds] = useState<Odds>('none');
  const [customFen, setCustomFen] = useState('');
  const [startError, setStartError] = useState('');
  const [clocks, setClocks] = useState({ white: 0, black: 0 });
  const [flag, setFlag] = useState<'white' | 'black' | null>(null);
  const turnRef = useRef<'w' | 'b'>('w');
  const prevLenRef = useRef(0);
  const tc = BOT_TC[tcIdx].base > 0 ? BOT_TC[tcIdx] : null;

  const chess = useMemo(() => replayFrom(startFen, moves), [startFen, moves]);
  turnRef.current = chess.turn();
  const over = useMemo(() => gameOverInfo(chess), [chess]);
  const finished = over !== null || resigned || drawn || flag !== null;
  const humanToMove = (chess.turn() === 'w') === (human === 'white');
  const botToMove = started && !finished && !humanToMove;

  // ход бота
  useEffect(() => {
    if (!botToMove) return;
    let cancelled = false;
    setThinking(true);
    setError('');
    getEngine()
      .search(chess.fen(), {
        skill: bot.skill,
        depth: bot.depth,
        // при нехватке времени бот думает короче, чтобы не терять флажок
        movetime: tc
          ? Math.max(50, Math.min(bot.movetime, Math.floor(clocks[human === 'white' ? 'black' : 'white'] / 30)))
          : bot.movetime,
      })
      .then((res) => {
        if (cancelled || !res.bestMove) return;
        const c = replayFrom(startFen, moves);
        const mv = c.move(uciToMove(res.bestMove));
        setMoves([...moves, mv.san]);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setThinking(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botToMove, moves.length, started]);

  // звуки
  useEffect(() => {
    if (moves.length > lastSoundLen.current) {
      const san = moves[moves.length - 1];
      playSound(san.includes('+') || san.includes('#') ? 'check' : san.includes('x') ? 'capture' : 'move');
    }
    lastSoundLen.current = moves.length;
  }, [moves]);

  useEffect(() => {
    if (over || flag) playSound('end');
  }, [over, flag]);

  // шахматные часы: идут у того, чей ход (включая время раздумий бота)
  useEffect(() => {
    if (!started || finished || !tc) return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      const side = turnRef.current === 'w' ? 'white' : 'black';
      setClocks((c) => ({ ...c, [side]: Math.max(0, c[side] - dt) }));
    }, 100);
    return () => clearInterval(t);
  }, [started, finished, tc]);

  // падение флажка
  useEffect(() => {
    if (!started || !tc || flag) return;
    if (clocks.white <= 0) setFlag('white');
    else if (clocks.black <= 0) setFlag('black');
  }, [clocks, started, tc, flag]);

  // добавка времени тому, кто только что сделал ход
  useEffect(() => {
    if (tc && tc.inc > 0 && moves.length === prevLenRef.current + 1) {
      const mover = chess.turn() === 'w' ? 'black' : 'white';
      setClocks((c) => ({ ...c, [mover]: c[mover] + tc.inc * 1000 }));
    }
    prevLenRef.current = moves.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves.length]);

  function start() {
    const color = choice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : choice;
    // стартовая позиция: свой FEN, фора боту или обычная
    let fen: string | null = null;
    const custom = customFen.trim();
    if (custom) {
      try {
        new Chess(custom);
        fen = custom;
      } catch {
        setStartError('Некорректный FEN: проверьте позицию');
        return;
      }
    } else if (odds !== 'none') {
      fen = oddsFen(color === 'white' ? 'black' : 'white', odds);
    }
    setStartError('');
    setStartFen(fen);
    prevLenRef.current = 0;
    setFlag(null);
    setClocks({ white: tc ? tc.base * 1000 : 0, black: tc ? tc.base * 1000 : 0 });
    setHuman(color);
    setFlipped(false);
    setMoves([]);
    setResigned(false);
    setDrawn(false);
    setDrawMsg('');
    setHint(null);
    setHintText('');
    setError('');
    lastSoundLen.current = 0;
    setStarted(true);
  }

  function onMove(from: string, to: string, promotion?: string) {
    try {
      const c = replayFrom(startFen, moves);
      const mv = c.move({ from, to, promotion });
      setHint(null);
      setHintText('');
      setMoves([...moves, mv.san]);
    } catch {
      /* нелегальный ход игнорируем */
    }
  }

  async function showHint() {
    setError('');
    try {
      const res = await getEngine().search(chess.fen(), { depth: 12, skill: 20 });
      if (res.bestMove) {
        const m = uciToMove(res.bestMove);
        setHint({ from: m.from, to: m.to });
        setHintText(uciToSan(chess.fen(), res.bestMove) ?? '');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function undo() {
    if (thinking || moves.length === 0 || resigned || drawn || flag !== null) return;
    const drop = humanToMove ? 2 : 1;
    setMoves(moves.slice(0, Math.max(0, moves.length - drop)));
    setHint(null);
    setHintText('');
    setDrawMsg('');
  }

  /** Предложение ничьей: бот соглашается, если по оценке движка у него не лучше равной позиции. */
  async function offerDraw() {
    if (thinking || finished || !humanToMove) return;
    setError('');
    setDrawMsg('');
    if (moves.length < 20) {
      setDrawMsg(`${bot.name} отказывается: ещё слишком рано для ничьей`);
      return;
    }
    setThinking(true);
    try {
      const res = await getEngine().search(chess.fen(), { depth: 12, skill: 20 });
      const line = res.lines[0];
      // cp — с точки зрения стороны, которая ходит (то есть игрока); для бота знак обратный
      const botScore = line?.mate != null ? (line.mate > 0 ? -10000 : 10000) : -(line?.cp ?? 0);
      if (botScore <= 30) {
        setDrawn(true);
      } else {
        setDrawMsg(`${bot.name} отказывается от ничьей: считает, что стоит лучше`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  if (!started) {
    return (
      <div className="card">
        <h2>Игра с ботом</h2>
        <div className="bot-grid">
          {BOTS.map((b) => (
            <button key={b.id} className={`bot-card ${bot.id === b.id ? 'selected' : ''}`} onClick={() => setBot(b)}>
              <span className="bot-avatar">{b.avatar}</span>
              <b>{b.name}</b>
              <span>{b.elo}</span>
              <small>{b.blurb}</small>
            </button>
          ))}
        </div>
        <div className="row">
          <span>Играть за:</span>
          {(['white', 'random', 'black'] as ColorChoice[]).map((c) => (
            <button key={c} className={`btn ${choice === c ? 'primary' : ''}`} onClick={() => setChoice(c)}>
              {c === 'white' ? '♔ Белые' : c === 'black' ? '♚ Чёрные' : '🎲 Случайно'}
            </button>
          ))}
        </div>
        <div className="row wrap">
          <span>Время:</span>
          <select value={tcIdx} onChange={(e) => setTcIdx(Number(e.target.value))}>
            {BOT_TC.map((t, i) => (
              <option key={t.label} value={i}>{t.label}</option>
            ))}
          </select>
          <span>Фора:</span>
          <select value={odds} disabled={customFen.trim() !== ''} onChange={(e) => setOdds(e.target.value as Odds)}>
            {(Object.keys(ODDS_LABEL) as Odds[]).map((o) => (
              <option key={o} value={o}>{ODDS_LABEL[o]}</option>
            ))}
          </select>
        </div>
        <details>
          <summary>Начать из своей позиции (FEN)</summary>
          <input
            value={customFen}
            onChange={(e) => setCustomFen(e.target.value)}
            placeholder="Например: 4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"
          />
          <p className="muted">Если поле заполнено, фора не используется.</p>
        </details>
        {startError && <p className="error">{startError}</p>}
        <div className="row">
          <button className="btn primary big" onClick={start}>Начать игру</button>
        </div>
        <p className="muted">Боты работают на движке Stockfish прямо в вашем браузере.</p>
      </div>
    );
  }

  const orientation = flipped ? (human === 'white' ? 'black' : 'white') : human;
  const botColor = human === 'white' ? 'black' : 'white';
  const last = (() => {
    const h = chess.history({ verbose: true });
    return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  })();

  const result = flag
    ? flag === human
      ? 'Время вышло: вы проиграли'
      : 'Время бота вышло: вы победили'
    : resigned
    ? 'Вы сдались'
    : drawn
      ? 'Ничья по соглашению'
      : over
      ? resultText(over.result, over.reason)
      : null;

  return (
    <div className="game-layout">
      <div className="board-col">
        <PlayerBar name={`${bot.name}`} avatar={bot.avatar} rating={bot.elo} active={botToMove} clockMs={tc ? clocks[botColor] : null} />
        <Board
          fen={chess.fen()}
          orientation={orientation}
          movable={!finished && humanToMove && !thinking ? human : null}
          lastMove={last}
          hint={hint}
          onMove={(f, t, p) => onMove(f, t, p)}
        />
        <PlayerBar name="Вы" active={humanToMove && !finished} clockMs={tc ? clocks[human] : null} />
      </div>
      <div className="side-col">
        <div className="card">
          <div className="muted">
            Против: {bot.avatar} {bot.name} ({bot.elo}) · вы за {human === 'white' ? 'белых' : 'чёрных'}
            {botToMove && thinking ? ` · ${botColor === 'white' ? 'белые' : 'чёрные'} думают…` : ''}
          </div>
          {result && <div className="result-banner">{result}</div>}
          <MoveList moves={moves} current={moves.length} />
          <div className="row wrap actions">
            <button className="btn" disabled={finished || thinking || !humanToMove} onClick={showHint}>💡 Подсказка</button>
            <button className="btn" disabled={thinking || moves.length === 0 || resigned || drawn || flag !== null} onClick={undo}>↩ Вернуть ход</button>
            <button className="btn" onClick={() => setFlipped((f) => !f)}>🔄</button>
            {!finished && (
              <button className="btn" disabled={thinking || !humanToMove} onClick={offerDraw}>½ Ничья</button>
            )}
            {!finished && <button className="btn" onClick={() => window.confirm('Сдаться?') && setResigned(true)}>🏳 Сдаться</button>}
          </div>
          {drawMsg && <p className="muted">{drawMsg}</p>}
          {hintText && <p>Подсказка: <b>{hintText}</b></p>}
          {error && <p className="error">{error}</p>}
          <div className="row wrap actions">
            <button className="btn primary" onClick={() => { setStarted(false); setMoves([]); }}>Новая игра</button>
            <button className="btn" disabled={moves.length === 0} onClick={start}>Реванш</button>
            <button
              className="btn"
              disabled={moves.length === 0}
              onClick={() => {
                sessionStorage.setItem('analysis_pgn', chess.pgn());
                nav('/analysis');
              }}
            >
              📈 Анализ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
