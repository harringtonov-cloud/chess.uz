import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../NotificationsContext';
import { markAllRead, markRead } from '../lib/notifications';
import { safeLink } from '../lib/notifyLogic';
import type { NotificationItem } from '../lib/notifyLogic';
import NotificationRow from './NotificationRow';

/** Колокольчик в шапке: число непрочитанных и короткий список последних уведомлений. */
export default function NotificationBell() {
  const { user } = useAuth();
  const { items, unread } = useNotifications();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;
  const uid = user.uid;
  const latest = items.slice(0, 6);

  function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.read) markRead(uid, n.id).catch(() => undefined);
    nav(safeLink(n.link));
  }

  return (
    <div className="bell" ref={box}>
      <button
        className="btn small ghost"
        title="Уведомления"
        aria-label={unread > 0 ? `Уведомления: ${unread} новых` : 'Уведомления'}
        onClick={() => setOpen((o) => !o)}
      >
        🔔{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-menu">
          <div className="row spread">
            <b>Уведомления</b>
            {unread > 0 && (
              <button
                className="btn small ghost"
                onClick={() =>
                  markAllRead(
                    uid,
                    items.filter((i) => !i.read).map((i) => i.id),
                  ).catch(() => undefined)
                }
              >
                Прочитать все
              </button>
            )}
          </div>
          {latest.length === 0 && <p className="muted">Пока ничего нового</p>}
          {latest.map((n) => (
            <NotificationRow key={n.id} n={n} now={Date.now()} onOpen={openItem} />
          ))}
          <Link to="/notifications" className="bell-all" onClick={() => setOpen(false)}>
            Все уведомления и настройки
          </Link>
        </div>
      )}
    </div>
  );
}
