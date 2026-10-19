import { useSyncExternalStore } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_PREFS, clip, notificationId, parsePrefs, toggleKind } from './notifyLogic';
import type { NotificationKind, NotifyPrefs } from './notifyLogic';

/** Откуда отправлено уведомление: достаточно uid и имени. */
export interface Sender {
  uid: string;
  name: string;
}

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Путь внутри сайта, например /game/abc. */
  link?: string;
  /** Уточнение для постоянного идентификатора: одинаковое событие перезаписывает прежнее уведомление. */
  ref?: string;
}

const notifCol = (uid: string) => collection(db, 'users', uid, 'notifications');

/**
 * Отправляет уведомление игроку. Это «лучшая попытка»: ошибка (например, игрок вас заблокировал)
 * не должна ломать основное действие, поэтому здесь она только записывается в консоль.
 */
export async function notify(to: string, from: Sender, input: NotifyInput): Promise<void> {
  if (!to || to === from.uid) return;
  try {
    await setDoc(doc(notifCol(to), notificationId(input.kind, from.uid, input.ref)), {
      kind: input.kind,
      fromUid: from.uid,
      fromName: clip(from.name, 24),
      title: clip(input.title, 80),
      body: clip(input.body ?? '', 200),
      link: input.link ?? '',
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Уведомление не отправлено', e);
  }
}

export function markRead(uid: string, id: string) {
  return updateDoc(doc(notifCol(uid), id), { read: true });
}

export async function markAllRead(uid: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.update(doc(notifCol(uid), id), { read: true }));
    await batch.commit();
  }
}

export function deleteNotification(uid: string, id: string) {
  return deleteDoc(doc(notifCol(uid), id));
}

/** Удаляет все уведомления игрока (по 400 штук за раз, чтобы уложиться в лимит пачки). */
export async function clearNotifications(uid: string): Promise<void> {
  for (;;) {
    const snap = await getDocs(query(notifCol(uid), limit(400)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 400) return;
  }
}

// ---------- Настройки (хранятся в браузере) ----------

const PREFS_KEY = 'chessuz.notify';

function loadPrefs(): NotifyPrefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefs: NotifyPrefs = loadPrefs();
const listeners = new Set<() => void>();

export function getNotifyPrefs(): NotifyPrefs {
  return prefs;
}

export function updateNotifyPrefs(patch: Partial<NotifyPrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage может быть недоступен — настройки просто не сохранятся */
  }
  listeners.forEach((l) => l());
}

export function toggleNotifyKind(kind: NotificationKind) {
  updateNotifyPrefs(toggleKind(prefs, kind));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useNotifyPrefs(): NotifyPrefs {
  return useSyncExternalStore(subscribe, getNotifyPrefs, getNotifyPrefs);
}

// ---------- Всплывающие уведомления браузера ----------

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function browserPermission(): NotificationPermission | 'unsupported' {
  return browserNotificationsSupported() ? Notification.permission : 'unsupported';
}

/** Спрашивает разрешение у браузера. Вызывать только по нажатию кнопки. */
export async function enableBrowserNotifications(): Promise<boolean> {
  if (!browserNotificationsSupported()) return false;
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  const ok = permission === 'granted';
  updateNotifyPrefs({ browser: ok });
  return ok;
}

/** Показывает системное уведомление, только если вкладка не на виду и разрешение дано. */
export function showBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (!prefs.browser || browserPermission() !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body, tag: 'chessuz' });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* некоторые мобильные браузеры не позволяют создавать Notification напрямую */
  }
}
