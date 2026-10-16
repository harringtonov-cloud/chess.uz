import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
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
import type { Profile } from './types';

export type ClubRole = 'owner' | 'admin' | 'member' | 'pending';

export interface Club {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  /** true — вступить может любой; false — по заявке, которую одобряет админ */
  isOpen: boolean;
  createdAt: { toMillis: () => number } | null;
}

export interface ClubMember {
  uid: string;
  name: string;
  role: ClubRole;
}

export interface ClubMessage {
  id: string;
  uid: string;
  name: string;
  text: string;
}

export const ROLE_LABEL: Record<ClubRole, string> = {
  owner: 'владелец',
  admin: 'админ',
  member: 'участник',
  pending: 'заявка',
};

export function canManage(role: ClubRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function isMemberRole(role: ClubRole | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

function checkText(name: string, description: string) {
  const n = name.trim();
  if (n.length < 3 || n.length > 40) throw new Error('Название клуба — от 3 до 40 символов');
  if (description.length > 300) throw new Error('Описание — не больше 300 символов');
  return { name: n, description: description.trim() };
}

export async function createClub(
  me: Profile,
  input: { name: string; description: string; isOpen: boolean },
): Promise<string> {
  const { name, description } = checkText(input.name, input.description);
  const ref = doc(collection(db, 'clubs'));
  const batch = writeBatch(db);
  batch.set(ref, {
    name,
    description,
    isOpen: input.isOpen,
    ownerId: me.uid,
    ownerName: me.name,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'clubs', ref.id, 'members', me.uid), {
    uid: me.uid,
    name: me.name,
    role: 'owner',
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

export function updateClub(club: Club, input: { name: string; description: string; isOpen: boolean }) {
  const { name, description } = checkText(input.name, input.description);
  return updateDoc(doc(db, 'clubs', club.id), { name, description, isOpen: input.isOpen });
}

/** В открытый клуб вступают сразу, в закрытый — подают заявку. */
export function joinClub(club: Club, me: Profile) {
  return setDoc(doc(db, 'clubs', club.id, 'members', me.uid), {
    uid: me.uid,
    name: me.name,
    role: club.isOpen ? 'member' : 'pending',
    joinedAt: serverTimestamp(),
  });
}

/** Выйти из клуба, отозвать заявку, отклонить заявку или исключить участника. */
export function removeMember(clubId: string, uid: string) {
  return deleteDoc(doc(db, 'clubs', clubId, 'members', uid));
}

export function approveMember(clubId: string, uid: string) {
  return updateDoc(doc(db, 'clubs', clubId, 'members', uid), { role: 'member' });
}

export function setMemberRole(clubId: string, uid: string, role: 'admin' | 'member') {
  return updateDoc(doc(db, 'clubs', clubId, 'members', uid), { role });
}

export function sendClubMessage(clubId: string, me: Profile, text: string) {
  return addDoc(collection(db, 'clubs', clubId, 'messages'), {
    uid: me.uid,
    name: me.name,
    text: text.slice(0, 300),
    createdAt: serverTimestamp(),
  });
}

export function deleteClubMessage(clubId: string, messageId: string) {
  return deleteDoc(doc(db, 'clubs', clubId, 'messages', messageId));
}

/** Сколько записей в списке участников клуба (вместе с неодобренными заявками). Без входа вернёт null. */
export async function memberCount(clubId: string): Promise<number | null> {
  try {
    const snap = await getCountFromServer(collection(db, 'clubs', clubId, 'members'));
    return snap.data().count;
  } catch {
    return null;
  }
}

/** Роль игрока в клубе (или undefined, если он не состоит). */
export async function roleIn(clubId: string, uid: string): Promise<ClubRole | undefined> {
  try {
    const s = await getDoc(doc(db, 'clubs', clubId, 'members', uid));
    return s.exists() ? (s.data() as ClubMember).role : undefined;
  } catch {
    return undefined;
  }
}

export function useClubs(): { clubs: Club[]; loading: boolean; error: string } {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(
      query(collection(db, 'clubs'), orderBy('createdAt', 'desc'), limit(60)),
      (snap) => {
        setClubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Club, 'id'>) })));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);
  return { clubs, loading, error };
}

/** undefined — загрузка, null — клуб не найден. */
export function useClub(id: string): Club | null | undefined {
  const [club, setClub] = useState<Club | null | undefined>(undefined);
  useEffect(() => {
    setClub(undefined);
    if (!firebaseConfigured) return;
    return onSnapshot(
      doc(db, 'clubs', id),
      (s) => setClub(s.exists() ? { id: s.id, ...(s.data() as Omit<Club, 'id'>) } : null),
      () => setClub(null),
    );
  }, [id]);
  return club;
}

export function useClubMembers(id: string, enabled: boolean): ClubMember[] {
  const [list, setList] = useState<ClubMember[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured || !enabled) return;
    return onSnapshot(
      collection(db, 'clubs', id, 'members'),
      (snap) => setList(snap.docs.map((d) => d.data() as ClubMember)),
      (e) => console.error('club members', e),
    );
  }, [id, enabled]);
  return list;
}

export function useClubMessages(id: string, enabled: boolean): ClubMessage[] {
  const [list, setList] = useState<ClubMessage[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured || !enabled) return;
    return onSnapshot(
      query(collection(db, 'clubs', id, 'messages'), orderBy('createdAt', 'asc'), limit(150)),
      (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubMessage, 'id'>) }))),
      (e) => console.error('club messages', e),
    );
  }, [id, enabled]);
  return list;
}
