import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { notify } from './notifications';
import { clip as clipText } from './notifyLogic';
import {
  isActive,
  normalizeAnnouncement,
  normalizeLog,
  normalizeReport,
  normalizeRole,
  normalizeSanction,
  reportDocId,
  untilFor,
  validateReport,
} from './moderationLogic';
import type {
  Announcement,
  AnnouncementLevel,
  LogEntry,
  LogKind,
  Report,
  ReportAction,
  ReportReason,
  Sanction,
  SanctionType,
  StaffRole,
} from './moderationLogic';
import type { GameDoc, Profile } from './types';

/** Кто совершает действие. */
export interface Staff {
  uid: string;
  name: string;
  role: StaffRole;
}

export interface PlayerRef {
  uid: string;
  name: string;
}

// ---------- Роли и санкции ----------

/** Роль текущего игрока. Пока документа в коллекции admins нет — null. */
export function useStaffRole(uid: string | undefined): StaffRole | null {
  const [role, setRole] = useState<StaffRole | null>(null);
  useEffect(() => {
    setRole(null);
    if (!firebaseConfigured || !uid) return;
    return onSnapshot(
      doc(db, 'admins', uid),
      (s) => setRole(s.exists() ? normalizeRole(s.data()) : null),
      () => setRole(null),
    );
  }, [uid]);
  return role;
}

/** Текущая санкция игрока (даже истёкшая; проверять действие нужно через isActive). */
export function useSanction(uid: string | undefined): Sanction | null {
  const [s, setS] = useState<Sanction | null>(null);
  useEffect(() => {
    setS(null);
    if (!firebaseConfigured || !uid) return;
    return onSnapshot(
      doc(db, 'bans', uid),
      (snap) => setS(snap.exists() ? normalizeSanction(uid, snap.data()) : null),
      () => setS(null),
    );
  }, [uid]);
  return s;
}

/** Текущее время, обновляется раз в 30 секунд: нужно, чтобы санкция снималась сама, когда срок вышел. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useAnnouncement(): Announcement | null {
  const [a, setA] = useState<Announcement | null>(null);
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(
      doc(db, 'config', 'announcement'),
      (s) => setA(s.exists() ? normalizeAnnouncement(s.data()) : null),
      () => setA(null),
    );
  }, []);
  return a;
}

// ---------- Жалобы ----------

/** Отправляет жалобу. Повторная жалоба на того же игрока по тому же поводу отклоняется правилами. */
export async function submitReport(
  me: PlayerRef,
  target: PlayerRef,
  reason: ReportReason,
  details: string,
  gameId = '',
): Promise<void> {
  const err = validateReport({ reporterUid: me.uid, targetUid: target.uid, reason, details });
  if (err) throw new Error(err);
  const id = reportDocId(me.uid, target.uid, gameId);
  const ref = doc(db, 'reports', id);
  // Проверяем заранее, чтобы показать понятное сообщение вместо ошибки доступа
  const existing = await getDoc(ref).catch(() => null);
  if (existing?.exists()) throw new Error('Вы уже отправляли жалобу на этого игрока по этому поводу');
  await setDoc(ref, {
    reporterUid: me.uid,
    reporterName: clipText(me.name, 24),
    targetUid: target.uid,
    targetName: clipText(target.name, 24),
    reason,
    details: details.trim().slice(0, 500),
    gameId,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export function useReports(enabled: boolean): { reports: Report[]; loading: boolean; error: string } {
  const [state, setState] = useState<{ reports: Report[]; loading: boolean; error: string }>({
    reports: [],
    loading: enabled,
    error: '',
  });
  useEffect(() => {
    if (!enabled || !firebaseConfigured) {
      setState({ reports: [], loading: false, error: '' });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(300)),
      (snap) => {
        const reports = snap.docs
          .map((d) => normalizeReport(d.id, d.data()))
          .filter((r): r is Report => r !== null);
        setState({ reports, loading: false, error: '' });
      },
      (e) => setState({ reports: [], loading: false, error: e.message }),
    );
  }, [enabled]);
  return state;
}

async function writeLog(
  staff: Staff,
  kind: LogKind,
  target: { uid: string; name: string } | null,
  detail: string,
): Promise<void> {
  await addDoc(collection(db, 'modLog'), {
    kind,
    by: staff.uid,
    byName: clipText(staff.name, 24),
    targetUid: target?.uid ?? '',
    targetName: target ? clipText(target.name, 24) : '',
    detail: clipText(detail, 300),
    createdAt: serverTimestamp(),
  });
}

/** Закрывает жалобу: принимает меры или отклоняет. Сами санкции выдаются отдельно (issueSanction / warnPlayer). */
export async function closeReport(
  staff: Staff,
  report: Report,
  status: 'resolved' | 'dismissed',
  action: ReportAction,
  note: string,
): Promise<void> {
  await updateDoc(doc(db, 'reports', report.id), {
    status,
    action: status === 'dismissed' ? 'none' : action,
    note: clipText(note, 300),
    resolvedBy: staff.uid,
    resolvedByName: clipText(staff.name, 24),
    resolvedAt: serverTimestamp(),
  });
  await writeLog(
    staff,
    status === 'resolved' ? 'resolve' : 'dismiss',
    { uid: report.targetUid, name: report.targetName },
    `${report.reason}${note ? ': ' + note : ''}`,
  );
}

// ---------- Санкции ----------

/** Выдаёт бан или мьют на выбранный срок и сообщает игроку уведомлением. */
export async function issueSanction(
  staff: Staff,
  target: PlayerRef,
  type: SanctionType,
  durationId: string,
  reason: string,
): Promise<void> {
  const until = untilFor(durationId, Date.now());
  await setDoc(doc(db, 'bans', target.uid), {
    type,
    reason: clipText(reason, 200),
    until: Timestamp.fromMillis(until),
    by: staff.uid,
    byName: clipText(staff.name, 24),
    targetName: clipText(target.name, 24),
    createdAt: serverTimestamp(),
  });
  await writeLog(staff, type, target, `${durationId}${reason ? ': ' + reason : ''}`);
  await notify(
    target.uid,
    { uid: staff.uid, name: staff.name },
    {
      kind: 'moderation',
      title: type === 'ban' ? 'Ваш аккаунт заблокирован' : 'Вам отключён чат',
      body: reason || 'Нарушение правил сайта',
      link: '/',
      ref: String(Date.now()),
    },
  );
}

export async function liftSanction(staff: Staff, target: PlayerRef): Promise<void> {
  await deleteDoc(doc(db, 'bans', target.uid));
  await writeLog(staff, 'unban', target, '');
  await notify(
    target.uid,
    { uid: staff.uid, name: staff.name },
    { kind: 'moderation', title: 'Ограничения с вашего аккаунта сняты', link: '/', ref: String(Date.now()) },
  );
}

export async function warnPlayer(staff: Staff, target: PlayerRef, text: string): Promise<void> {
  await writeLog(staff, 'warn', target, text);
  await notify(
    target.uid,
    { uid: staff.uid, name: staff.name },
    {
      kind: 'moderation',
      title: 'Предупреждение от модерации',
      body: text || 'Пожалуйста, соблюдайте правила сайта',
      link: '/',
      ref: String(Date.now()),
    },
  );
}

export function useSanctions(enabled: boolean): { list: Sanction[]; error: string } {
  const [state, setState] = useState<{ list: Sanction[]; error: string }>({ list: [], error: '' });
  useEffect(() => {
    if (!enabled || !firebaseConfigured) return;
    return onSnapshot(
      collection(db, 'bans'),
      (snap) => {
        const list = snap.docs
          .map((d) => normalizeSanction(d.id, d.data()))
          .filter((s): s is Sanction => s !== null)
          .sort((a, b) => b.createdAt - a.createdAt);
        setState({ list, error: '' });
      },
      (e) => setState({ list: [], error: e.message }),
    );
  }, [enabled]);
  return state;
}

export function useModLog(enabled: boolean): { list: LogEntry[]; error: string } {
  const [state, setState] = useState<{ list: LogEntry[]; error: string }>({ list: [], error: '' });
  useEffect(() => {
    if (!enabled || !firebaseConfigured) return;
    return onSnapshot(
      query(collection(db, 'modLog'), orderBy('createdAt', 'desc'), limit(150)),
      (snap) => {
        const list = snap.docs.map((d) => normalizeLog(d.id, d.data())).filter((l): l is LogEntry => l !== null);
        setState({ list, error: '' });
      },
      (e) => setState({ list: [], error: e.message }),
    );
  }, [enabled]);
  return state;
}

// ---------- Действия над игроком (только администратор) ----------

export async function resetRatings(staff: Staff, target: PlayerRef): Promise<void> {
  await updateDoc(doc(db, 'users', target.uid), {
    ratings: { bullet: 1200, blitz: 1200, rapid: 1200, classical: 1200, puzzle: 1200 },
  });
  await writeLog(staff, 'reset_ratings', target, 'Все рейтинги сброшены до 1200');
}

/** Очищает ник и описание профиля (например, после жалобы на неприемлемый ник). */
export async function resetProfileText(staff: Staff, target: PlayerRef): Promise<void> {
  const name = `Игрок-${target.uid.slice(0, 5)}`;
  await updateDoc(doc(db, 'users', target.uid), { name, bio: '' });
  await writeLog(staff, 'reset_ratings', { uid: target.uid, name }, `Ник «${target.name}» и описание очищены`);
}

// ---------- Сообщения чата ----------

export async function deleteGameChatMessage(
  staff: Staff,
  gameId: string,
  messageId: string,
  author: PlayerRef,
  text: string,
): Promise<void> {
  await deleteDoc(doc(db, 'games', gameId, 'chat', messageId));
  await writeLog(staff, 'delete_message', author, text);
}

// ---------- Объявление сайта ----------

export async function saveAnnouncement(
  staff: Staff,
  input: { text: string; level: AnnouncementLevel; active: boolean },
): Promise<void> {
  await setDoc(doc(db, 'config', 'announcement'), {
    text: clipText(input.text, 200),
    level: input.level,
    active: input.active,
    by: staff.uid,
    updatedAt: serverTimestamp(),
  });
  await writeLog(staff, 'announce', null, input.active ? input.text : '(снято)');
}

// ---------- Обзор игрока и сайта ----------

export interface PlayerOverview {
  profile: Profile | null;
  sanction: Sanction | null;
  games: { id: string; g: GameDoc }[];
  reportsAgainst: Report[];
  reportsBy: Report[];
}

export async function loadPlayerOverview(uid: string): Promise<PlayerOverview> {
  const [p, s, games, against, by] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'bans', uid)),
    getDocs(
      query(collection(db, 'games'), where('participants', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(30)),
    ).catch(() => null),
    getDocs(query(collection(db, 'reports'), where('targetUid', '==', uid), limit(50))),
    getDocs(query(collection(db, 'reports'), where('reporterUid', '==', uid), limit(50))),
  ]);
  const toReports = (snap: typeof against) =>
    snap.docs.map((d) => normalizeReport(d.id, d.data())).filter((r): r is Report => r !== null);
  return {
    profile: p.exists() ? ({ ...(p.data() as Profile), uid }) : null,
    sanction: s.exists() ? normalizeSanction(uid, s.data()) : null,
    games: games ? games.docs.map((d) => ({ id: d.id, g: d.data() as GameDoc })) : [],
    reportsAgainst: toReports(against).sort((a, b) => b.createdAt - a.createdAt),
    reportsBy: toReports(by).sort((a, b) => b.createdAt - a.createdAt),
  };
}

export interface SiteStats {
  users: number;
  games: number;
  activeGames: number;
  clubs: number;
  tournaments: number;
  openReports: number;
  activeSanctions: number;
}

async function count(q: ReturnType<typeof query> | ReturnType<typeof collection>): Promise<number> {
  try {
    return (await getCountFromServer(q)).data().count;
  } catch {
    return -1;
  }
}

/** Счётчики для обзора. -1 означает, что число получить не удалось. */
export async function loadSiteStats(now: number): Promise<SiteStats> {
  const [users, games, activeGames, clubs, tournaments, openReports, sanctions] = await Promise.all([
    count(collection(db, 'users')),
    count(collection(db, 'games')),
    count(query(collection(db, 'games'), where('status', '==', 'active'))),
    count(collection(db, 'clubs')),
    count(collection(db, 'tournaments')),
    count(query(collection(db, 'reports'), where('status', '==', 'open'))),
    count(query(collection(db, 'bans'), where('until', '>', Timestamp.fromMillis(now)))),
  ]);
  return { users, games, activeGames, clubs, tournaments, openReports, activeSanctions: sanctions };
}

export { isActive };
