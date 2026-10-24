import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import Board from '../components/Board';
import Chat from '../components/Chat';
import MoveList from '../components/MoveList';
import PlayerBar from '../components/PlayerBar';
import ReportButton from '../components/ReportButton';
import { recordArenaResult } from '../lib/arena';
import { replay, resultText } from '../lib/chessUtil';
import {
  abortGame,
  acceptDraw,
  acceptTakeback,
  applyRating,
  canRequestTakeback,
  cancelWaiting,
  clocks,
  colorOf,
  declineDraw,
  declineTakeback,
  flagGame,
  heartbeat,
  joinGame,
  makeMove,
  offerDraw,
  recordBlur,
  offerTakeback,
  requestRematch,
  resign,
} from '../lib/games';
import { shouldCountBlur } from '../lib/anticheat';
import { playSound } from '../lib/sound';
import { gameCategoryLabel, tcLabel } from '../lib/timeControls';
import type { GameDoc } from '../lib/types';

export default function GamePage() {
  const { id = '' } = useParams();
  const { profile, user, clockOffset } = useAuth();
  const nav = useNavigate();

  const [game, setGame] = useState<GameDoc | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now() + clockOffset);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const prevLen = useRef<number | null>(null);
  const prevStatus = useRef<string | null>(null);
  const flaggedAt = useRef(-1);
  const ratingTried = useRef(false);
  const joinTried = useRef(false);
  const initialRematch = useRef<string | null | undefined>(undefined);
  const arenaTried = useRef(false);

  useEffect(() => {
    prevLen.current = null;
    prevStatus.current = null;
    flaggedAt.current = -1;
    ratingTried.current = false;
    arenaTried.current = false;
    joinTried.current = false;
    initialRematch.current = undefined;
    setViewPly(null);
    setGame(undefined);
    return onSnapshot(
      doc(db, 'games', id),
      (snap) => setGame(snap.exists() ? (snap.data() as GameDoc) : null),
      (e) => setError(e.message),
    );
  }, [id]);

  const myColor = game ? colorOf(game, user?.uid) : null;

  // присоединяемся, если открыли чужую ожидающую партию
  useEffect(() => {
    if (!game || !profile || joinTried.current) return;
    if (game.status === 'waiting' && !game.participants.includes(profile.uid)) {
      joinTried.current = true;
      joinGame(id, profile).catch((e) => setError((e as Error).message));
    }
  }, [game, profile, id]);

  // «пульс» создателя, пока он ждёт соперника
  useEffect(() => {
    if (!game || game.status !== 'waiting' || !myColor) return;
    const t = setInterval(() => heartbeat(id).catch(() => undefined), 10000);
    return () => clearInterval(t);
  }, [game?.status, myColor, id]);

  // тикаем часы
  useEffect(() => {
    if (!game || game.status !== 'active') return;
    const t = setInterval(() => setNow(Date.now() + clockOffset), 100);
    return () => clearInterval(t);
  }, [game?.status, clockOffset]);

  const clk = useMemo(() => (game ? clocks(game, now) : { white: 0, black: 0 }), [game, now]);

  // фиксируем падение флажка
  useEffect(() => {
    if (!game || game.status !== 'active' || (game.moves.length < 2 && !game.daily)) return;
    const mover = game.moves.length % 2 === 0 ? clk.white : clk.black;
    if (mover <= 0 && flaggedAt.current !== game.moves.length) {
      flaggedAt.current = game.moves.length;
      flagGame(id, Date.now() + clockOffset).catch(() => undefined);
    }
  }, [clk, game, id, clockOffset]);

  // звуки
  useEffect(() => {
    if (!game) return;
    if (prevLen.current !== null && game.moves.length > prevLen.current) {
      const san = game.moves[game.moves.length - 1] ?? '';
      playSound(san.includes('#') || san.includes('+') ? 'check' : san.includes('x') ? 'capture' : 'move');
      setViewPly(null);
    }
    prevLen.current = game.moves.length;
    if (prevStatus.current && prevStatus.current !== 'finished' && game.status === 'finished') playSound('end');
    prevStatus.current = game.status;
  }, [game]);

  // античит: считаем уходы со вкладки в свой ход (на каждый ход максимум раз в 3 секунды)
  const lastBlurAt = useRef<number | null>(null);
  const blurState = useRef({ active: false, myTurn: false, color: null as 'white' | 'black' | null });
  blurState.current = {
    active: game?.status === 'active',
    myTurn: Boolean(game && myColor && (game.moves.length % 2 === 0) === (myColor === 'white')),
    color: myColor,
  };
  useEffect(() => {
    const onHide = () => {
      const s = blurState.current;
      if (document.visibilityState !== 'hidden' || !s.color) return;
      const now = Date.now();
      if (!shouldCountBlur({ active: s.active, myTurn: s.myTurn, lastCountedAt: lastBlurAt.current }, now)) return;
      lastBlurAt.current = now;
      recordBlur(id, s.color).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [id]);

  // рейтинг после окончания партии
  useEffect(() => {
    if (!game || !user || game.status !== 'finished' || ratingTried.current) return;
    if (!colorOf(game, user.uid) || game.ratingApplied?.[user.uid]) return;
    ratingTried.current = true;
    applyRating(id, user.uid).catch((e) => console.error('Рейтинг не обновлён', e));
  }, [game, user, id]);

  // партия арены закончилась: записываем результат в таблицу и освобождаем место в подборе
  useEffect(() => {
    if (!game || !user || game.status !== 'finished' || !game.arenaId || arenaTried.current) return;
    if (!colorOf(game, user.uid)) return;
    arenaTried.current = true;
    recordArenaResult(game.arenaId, id, user.uid).catch((e) => {
      arenaTried.current = false;
      console.error('Результат арены не записан', e);
    });
  }, [game, user, id]);

  // переход в партию-реванш, когда она появилась
  useEffect(() => {
    if (!game) return;
    if (initialRematch.current === undefined) {
      initialRematch.current = game.rematch;
      return;
    }
    if (game.rematch && game.rematch !== initialRematch.current && myColor) nav(`/game/${game.rematch}`);
  }, [game, myColor, nav]);

  const shownMoves = game?.moves ?? [];
  const shownPly = viewPly ?? shownMoves.length;
  const view = useMemo(() => {
    if (!game) return null;
    if (viewPly === null || viewPly >= game.moves.length) {
      return { fen: game.fen, last: game.lastMove };
    }
    const c = replay(game.moves.slice(0, viewPly));
    const h = c.history({ verbose: true });
    const last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
    return { fen: c.fen(), last };
  }, [game, viewPly]);

  if (game === undefined) return <div className="card">Загрузка…</div>;
  if (game === null) {
    return (
      <div className="card">
        Партия не найдена. <Link to="/">На главную</Link>
      </div>
    );
  }
  if (!view) return null;

  // ожидание соперника
  if (game.status === 'waiting') {
    const mine = Boolean(myColor);
    return (
      <div className="card narrow">
        <h2>{mine ? 'Ждём соперника…' : 'Подключаемся к партии…'}</h2>
        <p className="muted">
          {tcLabel({ base: game.base, inc: game.inc })} · {gameCategoryLabel(game)} ·{' '}
          {game.rated ? 'рейтинговая' : 'нерейтинговая'}
        </p>
        {mine && (
          <>
            <p>Отправьте ссылку другу или подождите, пока найдётся игрок:</p>
            <input readOnly value={window.location.href} onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  setCopied(true);
                }}
              >
                {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
              </button>
              <button
                className="btn"
                onClick={async () => {
                  await cancelWaiting(id).catch(() => undefined);
                  nav('/');
                }}
              >
                Отмена
              </button>
            </div>
          </>
        )}
        {!mine && !profile && (
          <p>
            <Link to="/login">Войдите</Link>, чтобы сыграть эту партию.
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const orientation = flipped ? (myColor === 'black' ? 'white' : 'black') : (myColor ?? 'white');
  const top = orientation === 'white' ? 'black' : 'white';
  const bottom = orientation;
  const toMove = game.moves.length % 2 === 0 ? 'white' : 'black';
  const active = game.status === 'active';
  const oppColor = myColor ? (myColor === 'white' ? 'black' : 'white') : null;

  const bar = (c: 'white' | 'black') => (
    <PlayerBar
      name={c === 'white' ? game.whiteName : game.blackName}
      rating={c === 'white' ? game.whiteRating : game.blackRating}
      clockMs={clk[c]}
      active={active && toMove === c}
      delta={game[c] ? (game.ratingDelta?.[game[c] as string] ?? null) : null}
    />
  );

  async function onMove(from: string, to: string, promotion?: string) {
    if (!user) return;
    setError('');
    try {
      await makeMove(id, user.uid, { from, to, promotion }, Date.now() + clockOffset);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const run = (fn: () => Promise<unknown>) => fn().catch((e) => setError((e as Error).message));

  return (
    <div className="game-layout">
      <div className="board-col">
        {bar(top)}
        <Board
          fen={view.fen}
          orientation={orientation}
          movable={active && viewPly === null && myColor ? myColor : null}
          lastMove={view.last}
          onMove={(f, t, p) => onMove(f, t, p)}
          premove
          confirmable
        />
        {bar(bottom)}
      </div>

      <div className="side-col">
        <div className="card">
          <div className="muted">
            {tcLabel({ base: game.base, inc: game.inc })} · {gameCategoryLabel(game)} ·{' '}
            {game.rated ? 'рейтинговая' : 'нерейтинговая'}
          </div>
          {game.status === 'finished' && (
            <div className="result-banner">{resultText(game.result, game.reason)}</div>
          )}
          <MoveList moves={shownMoves} current={shownPly} onSelect={(p) => setViewPly(p === shownMoves.length ? null : p)} />
          <div className="row nav-row">
            <button className="btn small" onClick={() => setViewPly(0)}>⏮</button>
            <button className="btn small" onClick={() => setViewPly(Math.max(0, shownPly - 1))}>◀</button>
            <button
              className="btn small"
              onClick={() => setViewPly(shownPly + 1 >= shownMoves.length ? null : shownPly + 1)}
            >
              ▶
            </button>
            <button className="btn small" onClick={() => setViewPly(null)}>⏭</button>
            <button className="btn small" onClick={() => setFlipped((f) => !f)}>🔄</button>
          </div>

          {myColor && active && (
            <div className="row wrap actions">
              {game.moves.length < 2 ? (
                <button className="btn" onClick={() => run(() => abortGame(id, user!.uid))}>Отменить партию</button>
              ) : (
                <button
                  className="btn"
                  onClick={() => window.confirm('Сдаться?') && run(() => resign(id, user!.uid))}
                >
                  🏳 Сдаться
                </button>
              )}
              {game.drawOffer === oppColor ? (
                <>
                  <span>Соперник предлагает ничью</span>
                  <button className="btn primary" onClick={() => run(() => acceptDraw(id, user!.uid))}>Принять</button>
                  <button className="btn" onClick={() => run(() => declineDraw(id))}>Отклонить</button>
                </>
              ) : game.drawOffer === myColor ? (
                <span className="muted">Ничья предложена…</span>
              ) : (
                game.moves.length >= 2 && (
                  <button className="btn" onClick={() => run(() => offerDraw(id, myColor))}>½ Ничья</button>
                )
              )}
              {game.takebackOffer === oppColor ? (
                <>
                  <span>Соперник просит вернуть ход</span>
                  <button
                    className="btn primary"
                    onClick={() => run(() => acceptTakeback(id, user!.uid, Date.now() + clockOffset))}
                  >
                    Разрешить
                  </button>
                  <button className="btn" onClick={() => run(() => declineTakeback(id))}>Отказать</button>
                </>
              ) : game.takebackOffer === myColor ? (
                <>
                  <span className="muted">Просьба вернуть ход отправлена…</span>
                  <button className="btn small" onClick={() => run(() => declineTakeback(id))}>Отмена</button>
                </>
              ) : (
                canRequestTakeback(game, myColor) && (
                  <button className="btn" onClick={() => run(() => offerTakeback(id, myColor))}>↩ Вернуть ход</button>
                )
              )}
            </div>
          )}

          {myColor && game.status === 'finished' && game.white && game.black && (
            <div className="row wrap actions">
              {game.rematchOffer && game.rematchOffer !== myColor && <span>Соперник предлагает реванш</span>}
              <button
                className="btn primary"
                disabled={game.rematchOffer === myColor}
                onClick={() => run(async () => {
                  const next = await requestRematch(id, user!.uid);
                  if (next) nav(`/game/${next}`);
                })}
              >
                {game.rematchOffer === myColor ? 'Реванш предложен…' : game.rematchOffer ? 'Принять реванш' : 'Реванш'}
              </button>
              <Link className="btn" to="/">Новая партия</Link>
            </div>
          )}
          {game.status === 'finished' && (
            <div className="row wrap actions">
              {game.arenaId && myColor && (
                <Link className="btn primary" to={`/arena/${game.arenaId}`}>⚔ Вернуться в арену</Link>
              )}
              <Link className="btn" to={`/analysis?game=${id}`}>📈 Анализ партии</Link>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="card">
          <Chat gameId={id} profile={profile} />
          {myColor && oppColor && (game[oppColor] ?? '') !== '' && (
            <div className="report-row">
              <ReportButton
                target={{ uid: game[oppColor] as string, name: oppColor === 'white' ? game.whiteName : game.blackName }}
                gameId={id}
                label="🚩 Пожаловаться на соперника"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
