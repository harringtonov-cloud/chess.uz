import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { createGame } from './games';
import { notify } from './notifications';
import { pairRound } from './swiss';
import type { PairResult, SwissPlayer } from './swiss';
import { categoryOf } from './timeControls';
import type { Category, Profile } from './types';

export type TournamentStatus = 'registration' | 'running' | 'finished';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  organizerId: string;
  organizerName: string;
  base: number; // секунды
  inc: number; // секунды
  category: Category;
  rounds: number;
  maxPlayers: number;
  status: TournamentStatus;
  currentRound: number;
  createdAt: { toMillis: () => number } | null;
}

export interface Pairing {
  id: string;
  round: number;
  board: number;
  white: string;
  black: string | null;
  whiteName: string;
  blackName: string;
  gameId: string | null;
  result: PairResult | null;
}

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  registration: 'идёт регистрация',
  running: 'идёт',
  finished: 'завершён',
};

export async function createTournament(
  me: Profile,
  input: { name: string; description: string; base: number; inc: number; rounds: number; maxPlayers: number },
): Promise<string> {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 50) throw new Error('Название турнира — от 3 до 50 символов');
  if (input.description.length > 300) throw new Error('Описание — не больше 300 символов');
  const ref = await addDoc(collection(db, 'tournaments'), {
    name,
    description: input.description.trim(),
    organizerId: me.uid,
    organizerName: me.name,
    base: input.base,
    inc: input.inc,
    category: categoryOf({ base: input.base, inc: input.inc }),
    rounds: input.rounds,
    maxPlayers: input.maxPlayers,
    status: 'registration',
    currentRound: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function joinTournament(t: Tournament, me: Profile) {
  return setDoc(doc(db, 'tournaments', t.id, 'players', me.uid), {
    uid: me.uid,
    name: me.name,
    rating: me.ratings?.[t.category] ?? 1200,
    joinedAt: serverTimestamp(),
  });
}

export function leaveTournament(tid: string, uid: string) {
  return deleteDoc(doc(db, 'tournaments', tid, 'players', uid));
}

/**
 * Организатор начинает турнир или следующий тур: жеребьёвка, запись пар, смена номера тура.
 * Всё одной пачкой: либо записывается всё, либо ничего.
 */
export async function startRound(t: Tournament, players: SwissPlayer[], previous: Pairing[]): Promise<void> {
  const round = t.currentRound + 1;
  if (round > t.rounds) throw new Error('Все туры уже сыграны');
  if (players.length < 2) throw new Error('Нужно минимум 2 участника');
  if (previous.some((p) => p.result === null)) throw new Error('Не все партии предыдущего тура сыграны');
  const byUid = new Map(players.map((p) => [p.uid, p]));
  const pairs = pairRound(players, previous);
  const batch = writeBatch(db);
  pairs.forEach((p, i) => {
    const board = i + 1;
    batch.set(doc(db, 'tournaments', t.id, 'pairings', `r${round}_b${board}`), {
      round,
      board,
      white: p.white,
      black: p.black,
      whiteName: byUid.get(p.white)?.name ?? '',
      blackName: p.black ? (byUid.get(p.black)?.name ?? '') : '',
      gameId: null,
      result: p.black ? null : 'bye',
    });
  });
  batch.update(doc(db, 'tournaments', t.id), { status: 'running', currentRound: round });
  await batch.commit();

  // Сообщаем игрокам о паре; ошибки отправки не должны ломать жеребьёвку.
  const organizer = { uid: t.organizerId, name: t.organizerName };
  for (const p of pairs) {
    const link = `/tournament/${t.id}`;
    if (!p.black) {
      void notify(p.white, organizer, {
        kind: 'tournament_round',
        title: `${t.name}: тур ${round}`,
        body: 'В этом туре у вас свободный круг (1 очко).',
        link,
        ref: t.id,
      });
      continue;
    }
    const white = byUid.get(p.white)?.name ?? '';
    const black = byUid.get(p.black)?.name ?? '';
    void notify(p.white, organizer, {
      kind: 'tournament_round',
      title: `${t.name}: тур ${round}`,
      body: `Вы играете белыми против ${black}.`,
      link,
      ref: t.id,
    });
    void notify(p.black, organizer, {
      kind: 'tournament_round',
      title: `${t.name}: тур ${round}`,
      body: `Вы играете чёрными против ${white}.`,
      link,
      ref: t.id,
    });
  }
}

export function finishTournament(tid: string) {
  return updateDoc(doc(db, 'tournaments', tid), { status: 'finished' });
}

/** Игрок за белых создаёт партию для пары (чёрные подключаются по ссылке). Возвращает id партии. */
export async function createPairingGame(t: Tournament, p: Pairing, me: Profile): Promise<string> {
  if (p.gameId) return p.gameId;
  if (p.white !== me.uid) throw new Error('Партию создаёт игрок, играющий белыми');
  const gameId = await createGame(me, { base: t.base, inc: t.inc }, { private: true, color: 'white' });
  await updateDoc(doc(db, 'tournaments', t.id, 'pairings', p.id), { gameId });
  return gameId;
}

/** Организатор вручную проставляет результат (неявка, зависшая партия). */
export function setPairingResult(tid: string, pairingId: string, result: PairResult) {
  return updateDoc(doc(db, 'tournaments', tid, 'pairings', pairingId), { result });
}

/** Переносит результат закончившейся партии в таблицу турнира. */
export function recordPairingResult(tid: string, pairingId: string, result: PairResult) {
  return updateDoc(doc(db, 'tournaments', tid, 'pairings', pairingId), { result });
}

export function useTournaments(): { tournaments: Tournament[]; loading: boolean; error: string } {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(
      query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'), limit(60)),
      (snap) => {
        setTournaments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tournament, 'id'>) })));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);
  return { tournaments, loading, error };
}

/** undefined — загрузка, null — турнир не найден. */
export function useTournament(id: string): Tournament | null | undefined {
  const [t, setT] = useState<Tournament | null | undefined>(undefined);
  useEffect(() => {
    setT(undefined);
    if (!firebaseConfigured) return;
    return onSnapshot(
      doc(db, 'tournaments', id),
      (s) => setT(s.exists() ? { id: s.id, ...(s.data() as Omit<Tournament, 'id'>) } : null),
      () => setT(null),
    );
  }, [id]);
  return t;
}

export function useTournamentPlayers(id: string): SwissPlayer[] {
  const [list, setList] = useState<SwissPlayer[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured) return;
    return onSnapshot(
      collection(db, 'tournaments', id, 'players'),
      (snap) => setList(snap.docs.map((d) => d.data() as SwissPlayer)),
      (e) => console.error('tournament players', e),
    );
  }, [id]);
  return list;
}

export function useTournamentPairings(id: string): Pairing[] {
  const [list, setList] = useState<Pairing[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured) return;
    return onSnapshot(
      collection(db, 'tournaments', id, 'pairings'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pairing, 'id'>) }));
        rows.sort((a, b) => a.round - b.round || a.board - b.board);
        setList(rows);
      },
      (e) => console.error('tournament pairings', e),
    );
  }, [id]);
  return list;
}

/** Следит за партией и сообщает, когда она закончилась с результатом (победа или ничья). */
export function watchFinishedGame(gameId: string, onResult: (result: PairResult) => void): () => void {
  return onSnapshot(
    doc(db, 'games', gameId),
    (s) => {
      const g = s.data() as { status?: string; result?: string | null } | undefined;
      if (g?.status === 'finished' && (g.result === '1-0' || g.result === '0-1' || g.result === '1/2-1/2')) {
        onResult(g.result);
      }
    },
    () => undefined,
  );
}
