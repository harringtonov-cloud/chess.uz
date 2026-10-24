// Puzzle Battle: Firestore. Чистая логика (фазы, счёт, исход) — в battleLogic.ts.
//
// puzzleBattles/{id}: players (1–2 uid), names, status ('waiting' | 'active'), puzzles (общий список),
// startAt / endsAt (мс), scores { uid: { solved, mistakes, lastAt } }, heartbeat (пульс создателя).
// Партию ждёт создатель; второй игрок заходит транзакцией и запускает отсчёт.

import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import {
  BATTLE_MS,
  BATTLE_PUZZLES,
  COUNTDOWN_MS,
  MIN_BATTLE_PUZZLES,
  EMPTY_SCORE,
  joinable,
  readScore,
} from './battleLogic';
import type { BattleScore } from './battleLogic';
import { fetchPuzzleBatch } from './puzzleApi';
import type { Puzzle } from './puzzleApi';
import type { Profile } from './types';

export interface Battle {
  id: string;
  players: string[];
  names: Record<string, string>;
  status: 'waiting' | 'active';
  puzzles: Puzzle[];
  startAt: number | null;
  endsAt: number | null;
  scores: Record<string, BattleScore>;
  heartbeat: number;
}

function toBattle(id: string, d: Record<string, unknown>): Battle {
  const scores: Record<string, BattleScore> = {};
  const raw = (d.scores ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(raw)) scores[k] = readScore(raw[k]);
  return {
    id,
    players: Array.isArray(d.players) ? (d.players as string[]) : [],
    names: (d.names ?? {}) as Record<string, string>,
    status: d.status === 'active' ? 'active' : 'waiting',
    puzzles: Array.isArray(d.puzzles) ? (d.puzzles as Puzzle[]) : [],
    startAt: typeof d.startAt === 'number' ? d.startAt : null,
    endsAt: typeof d.endsAt === 'number' ? d.endsAt : null,
    scores,
    heartbeat: typeof d.heartbeat === 'number' ? d.heartbeat : 0,
  };
}

const col = () => collection(db, 'puzzleBattles');

async function joinBattle(id: string, me: Profile, now: number): Promise<boolean> {
  const ref = doc(db, 'puzzleBattles', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const b = toBattle(id, snap.data());
    if (!joinable(b, me.uid, now)) return false;
    const startAt = now + COUNTDOWN_MS;
    tx.update(ref, {
      players: [...b.players, me.uid],
      [`names.${me.uid}`]: me.name,
      [`scores.${me.uid}`]: { ...EMPTY_SCORE },
      status: 'active',
      startAt,
      endsAt: startAt + BATTLE_MS,
    });
    return true;
  });
}

/**
 * Ищет ожидающего соперника и присоединяется, а если никого нет — создаёт свой бой и ждёт.
 * now — время с поправкой на часы сервера. Возвращает id боя.
 */
export async function findBattle(me: Profile, now: number): Promise<string> {
  const snap = await getDocs(query(col(), where('status', '==', 'waiting'), limit(10)));
  for (const d of snap.docs) {
    const b = toBattle(d.id, d.data());
    if (!joinable(b, me.uid, Date.now())) continue;
    try {
      if (await joinBattle(d.id, me, now)) return d.id;
    } catch {
      /* кто-то успел раньше — пробуем следующий */
    }
  }
  const puzzles = await fetchPuzzleBatch(BATTLE_PUZZLES);
  if (puzzles.length < MIN_BATTLE_PUZZLES) {
    throw new Error('База задач Lichess недоступна. Попробуйте позже.');
  }
  const ref = await addDoc(col(), {
    players: [me.uid],
    names: { [me.uid]: me.name },
    status: 'waiting',
    puzzles: puzzles.map((p) => ({ id: p.id, rating: p.rating, fen: p.fen, solution: p.solution, themes: [] })),
    startAt: null,
    endsAt: null,
    scores: { [me.uid]: { ...EMPTY_SCORE } },
    heartbeat: Date.now(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function battleHeartbeat(id: string) {
  return updateDoc(doc(db, 'puzzleBattles', id), { heartbeat: Date.now() });
}

export function cancelBattle(id: string) {
  return deleteDoc(doc(db, 'puzzleBattles', id));
}

/** Записать свой счёт (по правилам он может вырасти не больше чем на одну задачу за раз). */
export function submitScore(id: string, uid: string, score: BattleScore) {
  return updateDoc(doc(db, 'puzzleBattles', id), { [`scores.${uid}`]: score });
}

/** undefined — загрузка, null — бой не найден (например, создатель отменил поиск). */
export function useBattle(id: string | undefined): Battle | null | undefined {
  const [battle, setBattle] = useState<Battle | null | undefined>(undefined);
  useEffect(() => {
    setBattle(undefined);
    if (!id || !firebaseConfigured) return;
    return onSnapshot(
      doc(db, 'puzzleBattles', id),
      (s) => setBattle(s.exists() ? toBattle(s.id, s.data()) : null),
      () => setBattle(null),
    );
  }, [id]);
  return battle;
}
