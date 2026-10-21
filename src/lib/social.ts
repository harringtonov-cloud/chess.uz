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
import { notify } from './notifications';
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
  void notify(other.uid, me, {
    kind: 'friend_request',
    title: `${me.name} хочет добавить вас в друзья`,
    link: '/friends',
  });
}

export async function acceptFriendRequest(f: Friendship, me: Profile): Promise<void> {
  await updateDoc(doc(db, 'friendships', f.id), { status: 'accepted' });
  void notify(otherUid(f, me.uid), me, {
    kind: 'friend_accepted',
    title: `${me.name} принял(а) ваш запрос в друзья`,
    link: `/profile/${me.uid}`,
  });
}

/** Отклонить запрос, отменить свой запрос или удалить из друзей — во всех случаях документ удаляется. */
export function removeFriendship(id: string) {
  return deleteDoc(doc(db, 'friendships', id));
}

export async function sendDirectMessage(friendshipId: string, me: Profile, toUid: string, text: string) {
  const body = text.slice(0, 300);
  await addDoc(collection(db, 'friendships', friendshipId, 'messages'), {
    uid: me.uid,
    name: me.name,
    text: body,
    createdAt: serverTimestamp(),
  });
  // Одно уведомление на собеседника: новое сообщение заменяет прежнее, а не множит их.
  void notify(toUid, me, { kind: 'message', title: `Сообщение от ${me.name}`, body, link: '/friends' });
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
  void notify(friend.uid, me, {
    kind: 'game_invite',
    title: `${me.name} приглашает вас на партию`,
    body: tcLabel(tc),
    link: `/game/${gameId}`,
    ref: gameId,
  });
  return gameId;
}

export function dismissInvite(id: string) {
  return deleteDoc(doc(db, 'invites', id));
}

// ---------- Чёрный список ----------

export interface BlockedUser {
  uid: string;
  name: string;
}

/**
 * Блокировка: игрок больше не может слать вам запросы в друзья, приглашения и уведомления
 * (это проверяют правила Firestore). Дружба между вами, если была, удаляется.
 */
export async function blockUser(me: Profile, other: { uid: string; name: string }): Promise<void> {
  if (me.uid === other.uid) throw new Error('Нельзя заблокировать самого себя');
  await setDoc(doc(db, 'users', me.uid, 'blocks', other.uid), {
    uid: other.uid,
    name: other.name,
    createdAt: serverTimestamp(),
  });
  await deleteDoc(doc(db, 'friendships', pairId(me.uid, other.uid))).catch(() => undefined);
}

export function unblockUser(myUid: string, blockedUid: string) {
  return deleteDoc(doc(db, 'users', myUid, 'blocks', blockedUid));
}

export function useBlocks(uid: string | undefined): BlockedUser[] {
  const [list, setList] = useState<BlockedUser[]>([]);
  useEffect(() => {
    if (!firebaseConfigured || !uid) {
      setList([]);
      return;
    }
    return onSnapshot(
      collection(db, 'users', uid, 'blocks'),
      (snap) => setList(snap.docs.map((d) => ({ uid: d.id, name: (d.data() as { name?: string }).name ?? 'Игрок' }))),
      (e) => console.error('blocks', e),
    );
  }, [uid]);
  return list;
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
