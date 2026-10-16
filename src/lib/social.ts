import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { createGame } from './games';
import { tcLabel } from './timeControls';
import type { TimeControl } from './timeControls';
import type { Profile } from './types';

export interface Friendship {
  id: string;
  users: [string, string];
  names: Record<string, string>;
  requester: string;
  status: 'pending' | 'accepted';
}

export interface Invite {
  id: string;
  from: string;
  fromName: string;
  to: string;
  gameId: string;
  label: string;
  createdAt: { toMillis: () => number } | null;
}

export interface DirectMessage {
  id: string;
  uid: string;
  name: string;
  text: string;
}

export interface UserHit {
  uid: string;
  name: string;
  country: string;
}

/** Приглашения старше этого времени считаются устаревшими. */
const INVITE_TTL_MS = 10 * 60 * 1000;

/** Идентификатор дружбы одинаков для обоих игроков: uid-ы по алфавиту через «_». */
export function pairId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

export function otherUid(f: Friendship, me: string): string {
  return f.users[0] === me ? f.users[1] : f.users[0];
}

export function otherName(f: Friendship, me: string): string {
  return f.names[otherUid(f, me)] || 'Игрок';
}

export async function sendFriendRequest(me: Profile, other: { uid: string; name: string }): Promise<void> {
  if (me.uid === other.uid) throw new Error('Нельзя добавить в друзья самого себя');
  await setDoc(doc(db, 'friendships', pairId(me.uid, other.uid)), {
    users: [me.uid, other.uid],
    names: { [me.uid]: me.name, [other.uid]: other.name },
    requester: me.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export function acceptFriendRequest(id: string) {
  return updateDoc(doc(db, 'friendships', id), { status: 'accepted' });
}

/** Отклонить запрос, отменить свой запрос или удалить из друзей — во всех случаях документ удаляется. */
export function removeFriendship(id: string) {
  return deleteDoc(doc(db, 'friendships', id));
}

export function sendDirectMessage(friendshipId: string, me: Profile, text: string) {
  return addDoc(collection(db, 'friendships', friendshipId, 'messages'), {
    uid: me.uid,
    name: me.name,
    text: text.slice(0, 300),
    createdAt: serverTimestamp(),
  });
}

/** Создаёт приватную партию и отправляет другу приглашение. Возвращает id партии. */
export async function inviteToGame(me: Profile, friend: { uid: string; name: string }, tc: TimeControl) {
  const gameId = await createGame(me, tc, { private: true });
  await addDoc(collection(db, 'invites'), {
    from: me.uid,
    fromName: me.name,
    to: friend.uid,
    gameId,
    label: tcLabel(tc),
    createdAt: serverTimestamp(),
  });
  return gameId;
}

export function dismissInvite(id: string) {
  return deleteDoc(doc(db, 'invites', id));
}

/** Поиск игроков по началу ника (с учётом регистра, как он записан в профиле). */
export async function searchUsers(text: string): Promise<UserHit[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('name'), where('name', '>=', q), where('name', '<=', q + ''), limit(10)),
  );
  return snap.docs.map((d) => {
    const data = d.data() as { name?: string; country?: string };
    return { uid: d.id, name: data.name ?? 'Игрок', country: data.country ?? '' };
  });
}

/** Все запросы и друзья текущего игрока в реальном времени. */
export function useFriendships(uid: string | undefined): Friendship[] {
  const [list, setList] = useState<Friendship[]>([]);
  useEffect(() => {
    if (!firebaseConfigured || !uid) {
      setList([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'friendships'), where('users', 'array-contains', uid)),
      (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Friendship, 'id'>) }))),
      (e) => console.error('friendships', e),
    );
  }, [uid]);
  return list;
}

/** Свежие приглашения на партию, адресованные игроку. */
export function useInvites(uid: string | undefined): Invite[] {
  const [list, setList] = useState<Invite[]>([]);
  useEffect(() => {
    if (!firebaseConfigured || !uid) {
      setList([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'invites'), where('to', '==', uid)),
      (snap) => {
        const now = Date.now();
        setList(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Invite, 'id'>) }))
            .filter((i) => !i.createdAt || now - i.createdAt.toMillis() < INVITE_TTL_MS),
        );
      },
      (e) => console.error('invites', e),
    );
  }, [uid]);
  return list;
}

export function useDirectMessages(friendshipId: string | null): DirectMessage[] {
  const [list, setList] = useState<DirectMessage[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured || !friendshipId) return;
    return onSnapshot(
      query(collection(db, 'friendships', friendshipId, 'messages'), orderBy('createdAt', 'asc'), limit(100)),
      (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DirectMessage, 'id'>) }))),
      (e) => console.error('messages', e),
    );
  }, [friendshipId]);
  return list;
}
