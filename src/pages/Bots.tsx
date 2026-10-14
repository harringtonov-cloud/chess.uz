import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Board from '../components/Board';
import MoveList from '../components/MoveList';
import PlayerBar from '../components/PlayerBar';
import { BOTS } from '../lib/bots';
import type { Bot } from '../lib/bots';
import { gameOverInfo, replay, resultText, uciToMove, uciToSan } from '../lib/chessUtil';
import { getEngine } from '../lib/engine';
import { playSound } from '../lib/sound';

type ColorChoice = 'white' | 'black' | 'random';

export default function Bots() {
  const nav = useNavigate();
  const [bot, setBot] = useState<Bot>(BOTS[2]);
  const [choice, setChoice] = useState<ColorChoice>('white');
  const [human, setHuman] = useState<'white' | 'black'>('white');
  const [started, setStarted] = useState(false);
  const [moves, setMoves] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [hintText, setHintText] = useState('');
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const lastSoundLen = useRef(0);

  const chess = useMemo(() => replay(moves), [moves]);
  const over = useMemo(() => gameOverInfo(chess), [chess]);
  const finished = over !== null || resigned;
  const humanToMove = (chess.turn() === 'w') === (human === 'white');
  const botToMove = started && !finished && !humanToMove;

  // ход бота
  useEffect(() => {
    if (!botToMove) return;
    let cancelled = false;
    setThinking(true);
    setError('');
    getEngine()
      .search(chess.fen(), { skill: bot.skill, depth: bot.depth, movetime: bot.movetime })
      .then((res) => {
        if (cancelled || !res.bestMove) return;
        const c = replay(moves);
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
    if (over) playSound('end');
  }, [over]);

  function start() {
    const color = choice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : choice;
    setHuman(color);
    setFlipped(false);
    setMoves([]);
    setResigned(false);
    setHint(null);
    setHintText('');
    setError('');
    lastSoundLen.current = 0;
    setStarted(true);
  }

  function onMove(from: string, to: string, promotion?: string) {
    try {
      const c = replay(moves);
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
    if (thinking || moves.length === 0) return;
    const drop = humanToMove ? 2 : 1;
    setMoves(moves.slice(0, Math.max(0, moves.length - drop)));
    setHint(null);
    setHintText('');
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

  const result = resigned
    ? 'Вы сдались'
    : over
      ? resultText(over.result, over.reason)
      : null;

  return (
    <div className="game-layout">
      <div className="board-col">
        <PlayerBar name={`${bot.name}`} avatar={bot.avatar} rating={bot.elo} active={botToMove} />
        <Board
          fen={chess.fen()}
          orientation={orientation}
          movable={!finished && humanToMove && !thinking ? human : null}
          lastMove={last}
          hint={hint}
          onMove={(f, t, p) => onMove(f, t, p)}
        />
        <PlayerBar name="Вы" active={humanToMove && !finished} />
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
            <button className="btn" disabled={thinking || moves.length === 0} onClick={undo}>↩ Отменить ход</button>
            <button className="btn" onClick={() => setFlipped((f) => !f)}>🔄</button>
            {!finished && <button className="btn" onClick={() => window.confirm('Сдаться?') && setResigned(true)}>🏳 Сдаться</button>}
          </div>
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
