import { KIND_INFO, timeAgo } from '../lib/notifyLogic';
import type { NotificationItem } from '../lib/notifyLogic';

interface Props {
  n: NotificationItem;
  now: number;
  onOpen: (n: NotificationItem) => void;
  onDelete?: (n: NotificationItem) => void;
}

/** Одна строка уведомления: значок, заголовок, пояснение и время. Непрочитанные подсвечены. */
export default function NotificationRow({ n, now, onOpen, onDelete }: Props) {
  const info = KIND_INFO[n.kind];
  return (
    <div className={`notif-row${n.read ? '' : ' unread'}`}>
      <button className="notif-main" onClick={() => onOpen(n)}>
        <span className="notif-icon" aria-hidden>
          {info.icon}
        </span>
        <span className="notif-text">
          <b>{n.title}</b>
          {n.body && <span className="notif-body">{n.body}</span>}
          <span className="muted">{timeAgo(n.at, now)}</span>
        </span>
      </button>
      {onDelete && (
        <button className="btn small ghost" title="Удалить" onClick={() => onDelete(n)}>
          ✕
        </button>
      )}
    </div>
  );
}
