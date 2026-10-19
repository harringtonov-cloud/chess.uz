import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { db, firebaseConfigured } from './firebase';
import { getNotifyPrefs, showBrowserNotification, useNotifyPrefs } from './lib/notifications';
import { normalizeNotification, safeLink, unreadCount, visible } from './lib/notifyLogic';
import type { NotificationItem } from './lib/notifyLogic';
import { playSound } from './lib/sound';

interface NotificationsState {
  /** Все уведомления без учёта настроек (нужны, чтобы отметить прочитанными или удалить). */
  all: NotificationItem[];
  /** Только включённые игроком типы. */
  items: NotificationItem[];
  unread: number;
  loading: boolean;
}

const Ctx = createContext<NotificationsState>({ all: [], items: [], unread: 0, loading: false });

export function useNotifications(): NotificationsState {
  return useContext(Ctx);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const prefs = useNotifyPrefs();
  const [all, setAll] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const uid = user?.uid;
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    setAll([]);
    if (!firebaseConfigured || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let first = true;
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(60)),
      (snap) => {
        const list: NotificationItem[] = [];
        snap.docs.forEach((d) => {
          const n = normalizeNotification(d.id, d.data());
          if (n) list.push(n);
        });
        setAll(list);
        setLoading(false);

        // Звук и всплывающее окно — только для новых событий, а не при первой загрузке списка.
        if (!first) {
          const current = getNotifyPrefs();
          for (const change of snap.docChanges()) {
            if (change.type === 'removed' || change.doc.metadata.hasPendingWrites) continue;
            const n = normalizeNotification(change.doc.id, change.doc.data());
            if (!n || n.read || current.muted.includes(n.kind)) continue;
            if (current.sound) playSound('notify');
            showBrowserNotification(n.title, n.body, () => navRef.current(safeLink(n.link)));
          }
        }
        first = false;
      },
      (e) => {
        console.error('notifications', e);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const value = useMemo<NotificationsState>(() => {
    const items = visible(all, prefs);
    return { all, items, unread: unreadCount(items), loading };
  }, [all, prefs, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
