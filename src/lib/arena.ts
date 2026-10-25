// Арена-турниры: работа с Firestore. Чистая логика (очки, подбор, таблица) — в arenaLogic.ts.
//
// Хранение: обычный документ турнира tournaments/{id} с полями type: 'arena', startsAt, endsAt (мс).
//   tournaments/{id}/players/{uid}   — игрок арены (ArenaPlayer + joinedAt)
//   tournaments/{id}/results/{gameId}_{uid} — итог одной партии для одного игрока
// Подбор пар делают сами браузеры игроков (серверного кода нет): пару создаёт транзакция,
// которая заново проверяет, что оба игрока свободны.

import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { chooseWhite, isAvailable, outcomeFor } from './arenaLogic';
import type { ArenaPlayer, ArenaResult } from './arenaLogic';
import { categoryOf } from './timeControls';
import type { Tournament } from './tournaments';
import { START_FEN } from './types';
import type { GameDoc, Profile } from './types';

export const ARENA_LIMITS = { minMinutes: 10, maxMinutes: 180 };

export interface ArenaInput {
  name: string;
  description: string;
  base: number;
  inc: number;
  /** Начало, мс с эпохи */
  startsAt: number;
  durationMin: number;
}

export function isArena(t: Pick<Tournament, 'type'> | null | undefined): boolean {
  return t?.type === 'arena';
}

export async function createArena(me: Profile, input: ArenaInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 50) throw new Error('Название арены — от 3 до 50 символов');
  if (input.description.length > 300) throw new Error('Описание — не больше 300 символов');
  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < ARENA_LIMITS.minMinutes ||
    input.durationMin > ARENA_LIMITS.maxMinutes
  ) {
    throw new Error('Длительность арены — от 10 минут до 3 часов');
  }
  const startsAt = Math.round(input.startsAt);
  const ref = await addDoc(collection(db, 'tournaments'), {
    name,
    description: input.description.trim(),
    organizerId: me.uid,
    organizerName: me.name,
    type: 'arena',
    base: input.base,
    inc: input.inc,
    category: categoryOf({ base: input.base, inc: input.inc }),
    rounds: 0,
    maxPlayers: 500,
    status: 'registration',
    currentRound: 0,
    startsAt,
    endsAt: startsAt + input.durationMin * 60_000,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

const playerRef = (tid: string, uid: string) => doc(db, 'tournaments', tid, 'players', uid);

export function joinArena(t: Tournament, me: Profile) {
  return setDoc(playerRef(t.id, me.uid), {
    uid: me.uid,
    name: me.name,
    rating: me.ratings?.[t.category] ?? 1200,
    waiting: false,
    paused: false,
    gameId: null,
    seenAt: Date.now(),
    joinedAt: serverTimestamp(),
  });
}

/** «Играть» (ищу соперника) или «Пауза». */
export function setArenaWaiting(tid: string, uid: string, waiting: boolean) {
  return updateDoc(playerRef(tid, uid), { waiting, paused: !waiting, seenAt: Date.now() });
}

/** Отметка «я на странице арены»: без неё игрок через полминуты выпадает из подбора. */
export function touchArena(tid: string, uid: string) {
  return updateDoc(playerRef(tid, uid), { seenAt: Date.now() });
}

/**
 * Создаёт партию между двумя ожидающими игроками. Возвращает id партии
 * или null, если кто-то из них уже занят (тогда ничего не записывается).
 */
export async function tryPair(
  t: Tournament,
  meUid: string,
  oppUid: string,
  results: ArenaResult[],
): Promise<string | null> {
  const meRef = playerRef(t.id, meUid);
  const oppRef = playerRef(t.id, oppUid);
  const gameRef = doc(collection(db, 'games'));
  return runTransaction(db, async (tx) => {
    const [meSnap, oppSnap] = await Promise.all([tx.get(meRef), tx.get(oppRef)]);
    if (!meSnap.exists() || !oppSnap.exists()) return null;
    const me = meSnap.data() as ArenaPlayer;
    const opp = oppSnap.data() as ArenaPlayer;
    const now = Date.now();
    if (!isAvailable(me, now) || !isAvailable(opp, now)) return null;
    if (t.endsAt !== undefined && now >= t.endsAt) return null;

    const { white, black } = chooseWhite(meUid, oppUid, results);
    const w = white === meUid ? me : opp;
    const b = white === meUid ? opp : me;
    tx.set(gameRef, {
      white: w.uid,
      black: b.uid,
      whiteName: w.name,
      blackName: b.name,
      whiteRating: w.rating,
      blackRating: b.rating,
      participants: [w.uid, b.uid],
      moves: [],
      fen: START_FEN,
      lastMove: null,
      status: 'active',
      result: null,
      reason: null,
      base: t.base,
      inc: t.inc,
      category: t.category,
      rated: true,
      daily: false,
      private: false,
      arenaId: t.id,
      whiteTime: t.base * 1000,
      blackTime: t.base * 1000,
      lastMoveAt: serverTimestamp(),
      drawOffer: null,
      takebackOffer: null,
      rematchOffer: null,
      rematch: null,
      ratingApplied: {},
      ratingDelta: {},
      times: [],
      blurs: { white: 0, black: 0 },
      heartbeat: now,
      createdAt: serverTimestamp(),
    });
    tx.update(meRef, { gameId: gameRef.id, waiting: false, seenAt: now });
    tx.update(oppRef, { gameId: gameRef.id, waiting: false });
    return gameRef.id;
  });
}

/**
 * После окончания партии арены: записать свой результат (один раз) и освободить место в подборе.
 * Безопасно вызывать повторно. Возвращает true, если партия закончилась.
 */
export async function recordArenaResult(tid: string, gameId: string, uid: string): Promise<boolean> {
  const gameRef = doc(db, 'games', gameId);
  const resRef = doc(db, 'tournaments', tid, 'results', `${gameId}_${uid}`);
  const pRef = playerRef(tid, uid);
  return runTransaction(db, async (tx) => {
    const [gSnap, rSnap, pSnap] = await Promise.all([tx.get(gameRef), tx.get(resRef), tx.get(pRef)]);
    if (!gSnap.exists()) return false;
    const g = gSnap.data() as GameDoc;
    if (g.status !== 'finished') return false;
    const outcome = outcomeFor(g.result, g.white, g.black, uid);
    if (outcome && !rSnap.exists()) {
      const color = g.white === uid ? 'white' : 'black';
      tx.set(resRef, {
        uid,
        gameId,
        result: outcome,
        opponent: (color === 'white' ? g.black : g.white) ?? '',
        color,
        at: Date.now(),
      });
    }
    if (pSnap.exists()) {
      const p = pSnap.data() as ArenaPlayer;
      if (p.gameId === gameId) {
        tx.update(pRef, { gameId: null, waiting: !p.paused, seenAt: Date.now() });
      }
    }
    return true;
  });
}

export function useArenaPlayers(id: string): ArenaPlayer[] {
  const [list, setList] = useState<ArenaPlayer[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured) return;
    return onSnapshot(
      collection(db, 'tournaments', id, 'players'),
      (snap) =>
        setList(
          snap.docs.map((d) => {
            const x = d.data() as Partial<ArenaPlayer>;
            return {
              uid: x.uid ?? d.id,
              name: x.name ?? '',
              rating: x.rating ?? 1200,
              waiting: x.waiting ?? false,
              seenAt: x.seenAt ?? 0,
              gameId: x.gameId ?? null,
              paused: x.paused ?? false,
            };
          }),
        ),
      (e) => console.error('arena players', e),
    );
  }, [id]);
  return list;
}

export function useArenaResults(id: string): ArenaResult[] {
  const [list, setList] = useState<ArenaResult[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured) return;
    return onSnapshot(
      collection(db, 'tournaments', id, 'results'),
      (snap) => setList(snap.docs.map((d) => d.data() as ArenaResult)),
      (e) => console.error('arena results', e),
    );
  }, [id]);
  return list;
}
