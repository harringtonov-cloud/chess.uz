import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { useAuth } from '../AuthContext';
import Board from '../components/Board';
import { firebaseConfigured } from '../firebase';
import {
  BATTLE_MS,
  EMPTY_SCORE,
  addResult,
  battlePhase,
  mmss,
  outcomeOf,
  puzzleIndex,
} from '../lib/battleLogic';
import type { BattleScore } from '../lib/battleLogic';
import { uciToMove } from '../lib/chessUtil';
import { battleHeartbeat, cancelBattle, findBattle, submitScore, useBattle } from '../lib/puzzleBattle';
import { playSound } from '../lib/sound';

export default function PuzzleBattle() {
  const { id } = useParams();
  const { profile, user, loading: authLoading, clockOffset } = useAuth();
  const nav = useNavigate();
  const battle = useBattle(id);
  const [now, setNow] = useState(Date.now() + clockOffset);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  // позиция в текущей задаче и свой счёт (оптимистично: сразу после хода, до ответа сервера)
  const [fen, setFen] = useState('');
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [step, setStep] = useState(0);
  const [mine, setMine] = useState<BattleScore>({ ...EMPTY_SCORE });
  const mineRef = useRef<BattleScore>({ ...EMPTY_SCORE });
  const busy = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const loadedFor = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + clockOffset), 200);
    return () => clearInterval(t);
  }, [clockOffset]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const uid = user?.uid ?? '';
  const phase = battle ? battlePhase(battle, now) : null;
  const playing = Boolean(battle && uid && battle.players.includes(uid));

  // свой счёт берём из документа при первой загрузке (например, после обновления страницы)
  useEffect(() => {
    if (!battle || !uid) return;
    if (loadedFor.current !== battle.id) {
      loadedFor.current = battle.id;
      const s = battle.scores[uid] ?? { ...EMPTY_SCORE };
      mineRef.current = s;
      setMine(s);
      setStep(0);
      busy.current = false;
    }
  }, [battle, uid]);

  // пульс создателя, пока он ждёт соперника
  useEffect(() => {
    if (!id || !battle || battle.status !== 'waiting' || !playing) return;
    const t = setInterval(() => battleHeartbeat(id).catch(() => undefined), 10_000);
    return () => clearInterval(t);
  }, [id, battle?.status, playing]);

  // позиция текущей задачи
  const index = puzzleIndex(mine);
  const puzzle = battle && index < battle.puzzles.length ? battle.puzzles[index] : null;
  useEffect(() => {
    if (!puzzle) {
      setFen('');
      return;
    }
    setFen(puzzle.fen);
    setLast(null);
    setStep(0);
  }, [puzzle?.id, index]);

  async function search() {
    if (!profile) return nav('/login');
    setError('');
    setSearching(true);
    try {
      nav(`/battle/${await findBattle(profile, Date.now() + clockOffset)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  /** Задача закончена: засчитываем результат и переходим к следующей. */
  function resolve(ok: boolean) {
    if (!id || !uid) return;
    const next = addResult(mineRef.current, ok, Date.now() + clockOffset);
    mineRef.current = next;
    setMine(next);
    busy.current = false;
    playSound(ok ? 'correct' : 'wrong');
    // записи идут по очереди, чтобы счёт на сервере рос по одной задаче
    writes.current = writes.current.then(() => submitScore(id, uid, next)).catch(() => undefined);
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (phase !== 'running' || !puzzle || busy.current || !playing) return;
    const c = new Chess(fen);
    let mv;
    try {
      mv = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    if (uci !== puzzle.solution[step] && !c.isCheckmate()) {
      busy.current = true;
      timers.current.push(setTimeout(() => resolve(false), 350));
      return;
    }
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    playSound('move');
    if (c.isCheckmate() || step + 1 >= puzzle.solution.length) {
      busy.current = true;
      timers.current.push(setTimeout(() => resolve(true), 200));
      return;
    }
    busy.current = true;
    const reply = puzzle.solution[step + 1];
    timers.current.push(
      setTimeout(() => {
        const c2 = new Chess(c.fen());
        const om = c2.move(uciToMove(reply));
        setFen(c2.fen());
        setLast({ from: om.from, to: om.to });
        playSound('move');
        if (step + 2 >= puzzle.solution.length) {
          resolve(true);
        } else {
          setStep(step + 2);
          busy.current = false;
        }
      }, 400),
    );
  }

  if (!firebaseConfigured) return <div className="card">Puzzle Battle доступен после подключения Firebase.</div>;

  // ---- лобби ----
  if (!id) {
    return (
      <div className="card narrow">
        <h2>⚔ Puzzle Battle</h2>
        <p>
          Дуэль на задачах: вы и соперник решаете одни и те же задачи {BATTLE_MS / 60000} минуты. Побеждает тот, кто решил
          больше; при равенстве — у кого меньше ошибок. Ошибка засчитывается сразу, и вы переходите к следующей задаче.
        </p>
        {!authLoading && !profile && (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы играть.
          </p>
        )}
        <div className="row wrap">
          <button className="btn primary" disabled={searching || authLoading} onClick={() => void search()}>
            {searching ? 'Ищем соперника…' : '⚔ Найти соперника'}
          </button>
          <Link className="btn" to="/rush">⚡ Puzzle Rush (одному)</Link>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (battle === undefined) return <div className="card">Загрузка…</div>;
  if (battle === null) {
    return (
      <div className="card">
        Бой не найден или поиск отменён. <Link to="/battle">К поиску</Link>
      </div>
    );
  }

  const opp = battle.players.find((p) => p !== uid) ?? null;
  const oppScore = opp ? (battle.scores[opp] ?? { ...EMPTY_SCORE }) : null;
  const oppName = opp ? (battle.names[opp] ?? 'Соперник') : '';

  // ---- ждём соперника ----
  if (phase === 'waiting') {
    return (
      <div className="card narrow">
        <h2>Ищем соперника…</h2>
        <p className="muted">Как только найдётся игрок, начнётся отсчёт. Можно поделиться ссылкой на эту страницу с другом.</p>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              await cancelBattle(battle.id).catch(() => undefined);
              nav('/battle');
            }}
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  const myScore = mine;
  const orientation = puzzle ? (new Chess(puzzle.fen).turn() === 'w' ? 'white' : 'black') : 'white';
  const turn = fen ? (new Chess(fen).turn() === 'w' ? 'white' : 'black') : 'white';
  const left = (battle.endsAt ?? 0) - now;

  return (
    <div className="game-layout">
      <div className="board-col">
        {phase === 'running' && puzzle && fen ? (
          <Board
            fen={fen}
            orientation={orientation}
            movable={playing ? turn : null}
            lastMove={last}
            onMove={(f, t, p) => onMove(f, t, p)}
          />
        ) : (
          <div className="board-placeholder">
            {phase === 'countdown'
              ? `Старт через ${Math.max(0, Math.ceil(((battle.startAt ?? 0) - now) / 1000))}…`
              : phase === 'running'
                ? 'Задачи закончились, ждём конец боя'
                : 'Бой окончен'}
          </div>
        )}
      </div>
      <div className="side-col">
        <div className="card">
          <h3>⚔ Puzzle Battle</h3>
          {phase === 'running' && <div className="arena-timer">{mmss(left)}</div>}
          <table className="table">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Решено</th>
                <th>Ошибок</th>
              </tr>
            </thead>
            <tbody>
              <tr className="me">
                <td>{profile?.name ?? 'Вы'} (вы)</td>
                <td><b>{myScore.solved}</b></td>
                <td>{myScore.mistakes}</td>
              </tr>
              {oppScore && (
                <tr>
                  <td>{oppName}</td>
                  <td><b>{oppScore.solved}</b></td>
                  <td>{oppScore.mistakes}</td>
                </tr>
              )}
            </tbody>
          </table>
          {phase === 'running' && puzzle && (
            <p className="muted">
              Задача {index + 1} · сложность {puzzle.rating} · ходят {turn === 'white' ? 'белые' : 'чёрные'}
            </p>
          )}
          {phase === 'finished' && playing && oppScore && (
            <>
              <p className="result-banner">
                {{ win: 'Победа! 🏆', loss: 'Поражение', draw: 'Ничья' }[outcomeOf(myScore, oppScore)]}
              </p>
              <div className="row wrap">
                <button className="btn primary" onClick={() => nav('/battle')}>
                  Новый бой
                </button>
              </div>
            </>
          )}
          {phase === 'finished' && !playing && <Link className="btn" to="/battle">К поиску</Link>}
        </div>
      </div>
    </div>
  );
}
