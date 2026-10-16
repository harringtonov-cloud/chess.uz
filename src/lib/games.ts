import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { gameOverInfo, replay } from './chessUtil';
import { ratingDelta } from './elo';
import { categoryOf } from './timeControls';
import type { TimeControl } from './timeControls';
import { START_FEN } from './types';
import type { Color, GameDoc, Profile } from './types';

const gamesCol = () => collection(db, 'games');

function otherColor(c: Color): Color {
  return c === 'white' ? 'black' : 'white';
}

export function colorOf(g: GameDoc, uid: string | undefined): Color | null {
  if (!uid) return null;
  if (g.white === uid) return 'white';
  if (g.black === uid) return 'black';
  return null;
}

/** Остаток времени у обоих игроков на момент now (серверное время, мс). */
export function clocks(g: GameDoc, now: number): { white: number; black: number } {
  let white = g.whiteTime;
  let black = g.blackTime;
  if (g.status === 'active' && g.moves.length >= 2 && g.lastMoveAt) {
    const elapsed = Math.max(0, now - g.lastMoveAt.toMillis());
    if (g.moves.length % 2 === 0) white -= elapsed;
    else black -= elapsed;
  }
  return { white: Math.max(0, white), black: Math.max(0, black) };
}

export async function createGame(
  profile: Profile,
  tc: TimeControl,
  opts: { private: boolean; color?: Color; rated?: boolean },
): Promise<string> {
  const color: Color = opts.color ?? (Math.random() < 0.5 ? 'white' : 'black');
  const category = categoryOf(tc);
  const ref = await addDoc(gamesCol(), {
    white: color === 'white' ? profile.uid : null,
    black: color === 'black' ? profile.uid : null,
    whiteName: color === 'white' ? profile.name : '',
    blackName: color === 'black' ? profile.name : '',
    whiteRating: color === 'white' ? profile.ratings[category] : 0,
    blackRating: color === 'black' ? profile.ratings[category] : 0,
    participants: [profile.uid],
    moves: [],
    fen: START_FEN,
    lastMove: null,
    status: 'waiting',
    result: null,
    reason: null,
    base: tc.base,
    inc: tc.inc,
    category,
    rated: opts.rated ?? !opts.private,
    private: opts.private,
    whiteTime: tc.base * 1000,
    blackTime: tc.base * 1000,
    lastMoveAt: null,
    drawOffer: null,
    takebackOffer: null,
    rematchOffer: null,
    rematch: null,
    ratingApplied: {},
    ratingDelta: {},
    heartbeat: Date.now(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function joinGame(id: string, profile: Profile): Promise<'joined' | 'already'> {
  const ref = doc(db, 'games', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Партия не найдена');
    const g = snap.data() as GameDoc;
    if (g.participants.includes(profile.uid)) return 'already';
    if (g.status !== 'waiting') throw new Error('Партия уже началась');
    const seat: Color = g.white ? 'black' : 'white';
    tx.update(ref, {
      [seat]: profile.uid,
      [`${seat}Name`]: profile.name,
      [`${seat}Rating`]: profile.ratings[g.category],
      participants: arrayUnion(profile.uid),
      status: 'active',
      lastMoveAt: serverTimestamp(),
      heartbeat: Date.now(),
    });
    return 'joined';
  });
}

/** Быстрый поиск: присоединяемся к чужой открытой партии или создаём свою. */
export async function seekGame(profile: Profile, tc: TimeControl): Promise<string> {
  const q = query(
    gamesCol(),
    where('status', '==', 'waiting'),
    where('private', '==', false),
    where('rated', '==', true),
    where('base', '==', tc.base),
    where('inc', '==', tc.inc),
    limit(20),
  );
  const snap = await getDocs(q);
  const now = Date.now();
  for (const d of snap.docs) {
    const g = d.data() as GameDoc;
    if (g.participants.includes(profile.uid)) continue;
    if (now - (g.heartbeat ?? 0) > 30000) continue; // создатель давно ушёл
    try {
      await joinGame(d.id, profile);
      return d.id;
    } catch {
      /* кто-то успел раньше — пробуем следующую */
    }
  }
  return createGame(profile, tc, { private: false });
}

export function heartbeat(id: string) {
  return updateDoc(doc(db, 'games', id), { heartbeat: Date.now() });
}

export function cancelWaiting(id: string) {
  return deleteDoc(doc(db, 'games', id));
}

export async function makeMove(
  id: string,
  uid: string,
  move: { from: string; to: string; promotion?: string },
  now: number,
): Promise<void> {
  const ref = doc(db, 'games', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Партия не найдена');
    const g = snap.data() as GameDoc;
    if (g.status !== 'active') throw new Error('Партия не идёт');
    const chess = replay(g.moves);
    const color: Color = chess.turn() === 'w' ? 'white' : 'black';
    if (g[color] !== uid) throw new Error('Сейчас не ваш ход');

    const played = chess.move(move); // бросает ошибку при нелегальном ходе
    const timeKey = color === 'white' ? 'whiteTime' : 'blackTime';
    let time = color === 'white' ? g.whiteTime : g.blackTime;

    if (g.moves.length >= 2) {
      const last = g.lastMoveAt ? g.lastMoveAt.toMillis() : now;
      time -= Math.max(0, now - last);
      if (time <= 0) {
        tx.update(ref, {
          status: 'finished',
          result: color === 'white' ? '0-1' : '1-0',
          reason: 'timeout',
          [timeKey]: 0,
          drawOffer: null,
        });
        return;
      }
      time += g.inc * 1000;
    }

    const update: Record<string, unknown> = {
      fen: chess.fen(),
      moves: [...g.moves, played.san],
      lastMove: { from: played.from, to: played.to },
      [timeKey]: time,
      lastMoveAt: serverTimestamp(),
      drawOffer: null,
      takebackOffer: null,
    };
    const over = gameOverInfo(chess);
    if (over) {
      update.status = 'finished';
      update.result = over.result;
      update.reason = over.reason;
    }
    tx.update(ref, update);
  });
}

async function finishIfActive(
  id: string,
  decide: (g: GameDoc) => { result: GameDoc['result']; reason: string } | null,
) {
  const ref = doc(db, 'games', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const g = snap.data() as GameDoc;
    if (g.status !== 'active') return;
    const outcome = decide(g);
    if (!outcome) return;
    tx.update(ref, {
      status: 'finished',
      result: outcome.result,
      reason: outcome.reason,
      drawOffer: null,
    });
  });
}

export function resign(id: string, uid: string) {
  return finishIfActive(id, (g) => {
    const color = colorOf(g, uid);
    if (!color) return null;
    return { result: color === 'white' ? '0-1' : '1-0', reason: 'resignation' };
  });
}

export function abortGame(id: string, uid: string) {
  return finishIfActive(id, (g) => {
    if (!colorOf(g, uid) || g.moves.length >= 2) return null;
    return { result: null, reason: 'aborted' };
  });
}

/** Любой участник может зафиксировать падение флажка, если время действительно вышло. */
export function flagGame(id: string, now: number) {
  return finishIfActive(id, (g) => {
    if (g.moves.length < 2) return null;
    const c = clocks(g, now);
    if (g.moves.length % 2 === 0 && c.white <= 0) return { result: '0-1', reason: 'timeout' };
    if (g.moves.length % 2 === 1 && c.black <= 0) return { result: '1-0', reason: 'timeout' };
    return null;
  });
}

export function offerDraw(id: string, color: Color) {
  return updateDoc(doc(db, 'games', id), { drawOffer: color });
}

export function declineDraw(id: string) {
  return updateDoc(doc(db, 'games', id), { drawOffer: null });
}

export function acceptDraw(id: string, uid: string) {
  return finishIfActive(id, (g) => {
    const color = colorOf(g, uid);
    if (!color || !g.drawOffer || g.drawOffer === color) return null;
    return { result: '1/2-1/2', reason: 'agreement' };
  });
}

/** Можно ли просить вернуть ход: свой последний ход или (если соперник уже ответил) свой ход вместе с ответом. */
export function canRequestTakeback(g: GameDoc, color: Color): boolean {
  if (g.status !== 'active' || g.moves.length === 0) return false;
  const lastMover: Color = g.moves.length % 2 === 1 ? 'white' : 'black';
  return lastMover === color || g.moves.length >= 2;
}

export function offerTakeback(id: string, color: Color) {
  return updateDoc(doc(db, 'games', id), { takebackOffer: color });
}

export function declineTakeback(id: string) {
  return updateDoc(doc(db, 'games', id), { takebackOffer: null });
}

/**
 * Соперник согласился: убираем последний ход попросившего (и ответный ход, если он уже сделан).
 * Время, потраченное на отменённые ходы, не возвращается — часы продолжают идти с текущих значений.
 */
export async function acceptTakeback(id: string, uid: string, now: number): Promise<void> {
  const ref = doc(db, 'games', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const g = snap.data() as GameDoc;
    const color = colorOf(g, uid);
    const asker = g.takebackOffer;
    if (g.status !== 'active' || !color || !asker || asker === color) return;
    if (!canRequestTakeback(g, asker)) return;
    const lastMover: Color = g.moves.length % 2 === 1 ? 'white' : 'black';
    const drop = lastMover === asker ? 1 : 2;
    const moves = g.moves.slice(0, g.moves.length - drop);
    const chess = replay(moves);
    const hist = chess.history({ verbose: true });
    const last = hist.length ? hist[hist.length - 1] : null;
    const c = clocks(g, now);
    tx.update(ref, {
      moves,
      fen: chess.fen(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      whiteTime: c.white,
      blackTime: c.black,
      lastMoveAt: serverTimestamp(),
      takebackOffer: null,
      drawOffer: null,
    });
  });
}

/** Реванш: первый игрок предлагает, второй принимает и партия создаётся с обмененными цветами. */
export async function requestRematch(id: string, uid: string): Promise<string | null> {
  const ref = doc(db, 'games', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const g = snap.data() as GameDoc;
    const color = colorOf(g, uid);
    if (g.status !== 'finished' || !color || !g.white || !g.black) return null;
    if (g.rematch) return g.rematch;
    if (g.rematchOffer && g.rematchOffer !== color) {
      const newRef = doc(gamesCol());
      tx.set(newRef, {
        white: g.black,
        black: g.white,
        whiteName: g.blackName,
        blackName: g.whiteName,
        whiteRating: g.blackRating,
        blackRating: g.whiteRating,
        participants: g.participants,
        moves: [],
        fen: START_FEN,
        lastMove: null,
        status: 'active',
        result: null,
        reason: null,
        base: g.base,
        inc: g.inc,
        category: g.category,
        rated: g.rated,
        private: g.private,
        whiteTime: g.base * 1000,
        blackTime: g.base * 1000,
        lastMoveAt: serverTimestamp(),
        drawOffer: null,
        takebackOffer: null,
        rematchOffer: null,
        rematch: null,
        ratingApplied: {},
        ratingDelta: {},
        heartbeat: Date.now(),
        createdAt: serverTimestamp(),
      });
      tx.update(ref, { rematch: newRef.id });
      return newRef.id;
    }
    tx.update(ref, { rematchOffer: color });
    return null;
  });
}

/** Каждый игрок после окончания партии один раз обновляет СВОЙ рейтинг и счётчики. */
export async function applyRating(gameId: string, uid: string): Promise<void> {
  const gRef = doc(db, 'games', gameId);
  const uRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(gRef);
    const uSnap = await tx.get(uRef);
    if (!gSnap.exists() || !uSnap.exists()) return;
    const g = gSnap.data() as GameDoc;
    const u = uSnap.data() as Profile;
    if (g.status !== 'finished' || g.ratingApplied?.[uid]) return;
    const color = colorOf(g, uid);
    if (!color) return;
    if (!g.rated || !g.result || g.reason === 'aborted') {
      tx.update(gRef, { [`ratingApplied.${uid}`]: true });
      return;
    }
    const score = g.result === '1/2-1/2' ? 0.5 : (g.result === '1-0') === (color === 'white') ? 1 : 0;
    const own = u.ratings?.[g.category] ?? 1200;
    const opp = color === 'white' ? g.blackRating : g.whiteRating;
    const delta = ratingDelta(own, opp, score, u.stats?.games ?? 0);
    const field = score === 1 ? 'wins' : score === 0 ? 'losses' : 'draws';
    tx.update(uRef, {
      [`ratings.${g.category}`]: own + delta,
      'stats.games': increment(1),
      [`stats.${field}`]: increment(1),
    });
    tx.update(gRef, { [`ratingApplied.${uid}`]: true, [`ratingDelta.${uid}`]: delta });
  });
}

export function sendChat(id: string, profile: Profile, text: string) {
  return addDoc(collection(db, 'games', id, 'chat'), {
    uid: profile.uid,
    name: profile.name,
    text: text.slice(0, 300),
    createdAt: serverTimestamp(),
  });
}

export { otherColor };
