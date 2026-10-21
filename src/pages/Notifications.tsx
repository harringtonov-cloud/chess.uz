import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../NotificationsContext';
import NotificationRow from '../components/NotificationRow';
import { firebaseConfigured } from '../firebase';
import {
  browserPermission,
  clearNotifications,
  deleteNotification,
  enableBrowserNotifications,
  markAllRead,
  markRead,
  toggleNotifyKind,
  updateNotifyPrefs,
  useNotifyPrefs,
} from '../lib/notifications';
import { KIND_INFO, KIND_ORDER, safeLink } from '../lib/notifyLogic';
import type { NotificationItem } from '../lib/notifyLogic';
import { unblockUser, useBlocks } from '../lib/social';

export default function NotificationsPage() {
  const { user } = useAuth();
  const { items, unread, loading } = useNotifications();
  const prefs = useNotifyPrefs();
  const blocks = useBlocks(user?.uid);
  const nav = useNavigate();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [message, setMessage] = useState('');
  const permission = browserPermission();

  if (!firebaseConfigured) return <div className="card">Уведомления доступны после подключения Firebase.</div>;
  if (!user) {
    return (
      <div className="card">
        <Link to="/login">Войдите</Link>, чтобы видеть уведомления.
      </div>
    );
  }
  const uid = user.uid;
  const shown = tab === 'unread' ? items.filter((i) => !i.read) : items;
  const now = Date.now();

  function open(n: NotificationItem) {
    if (!n.read) markRead(uid, n.id).catch(() => undefined);
    nav(safeLink(n.link));
  }

  async function enableBrowser() {
    setMessage('');
    const ok = await enableBrowserNotifications();
    if (!ok) {
      setMessage(
        permission === 'unsupported'
          ? 'Этот браузер не поддерживает всплывающие уведомления.'
          : 'Браузер не разрешил уведомления. Разрешите их для сайта в настройках браузера (значок замка у адреса).',
      );
    }
  }

  return (
    <div className="notif-page">
      <div className="card">
        <div className="row spread">
          <h2>Уведомления{unread > 0 ? ` (${unread})` : ''}</h2>
          <span className="row">
            <button
              className="btn small"
              disabled={unread === 0}
              onClick={() =>
                markAllRead(
                  uid,
                  items.filter((i) => !i.read).map((i) => i.id),
                ).catch((e: Error) => setMessage(e.message))
              }
            >
              Прочитать все
            </button>
            <button
              className="btn small"
              disabled={items.length === 0}
              onClick={() =>
                window.confirm('Удалить все уведомления?') &&
                clearNotifications(uid).catch((e: Error) => setMessage(e.message))
              }
            >
              Очистить
            </button>
          </span>
        </div>
        <div className="tabs">
          <button className={`tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
            Все
          </button>
          <button className={`tab${tab === 'unread' ? ' active' : ''}`} onClick={() => setTab('unread')}>
            Непрочитанные
          </button>
        </div>
        {message && <p className="error">{message}</p>}
        {loading && <p className="muted">Загрузка…</p>}
        {!loading && shown.length === 0 && (
          <p className="muted">{tab === 'unread' ? 'Непрочитанных нет' : 'Уведомлений пока нет'}</p>
        )}
        {shown.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            now={now}
            onOpen={open}
            onDelete={(x) => deleteNotification(uid, x.id).catch((e: Error) => setMessage(e.message))}
          />
        ))}
      </div>

      <div className="card">
        <h3>Какие уведомления получать</h3>
        <p className="muted">Настройки хранятся в этом браузере. Выключенные типы не показываются и не звучат.</p>
        {KIND_ORDER.map((k) => (
          <label key={k} className="check-row">
            <input
              type="checkbox"
              checked={!prefs.muted.includes(k)}
              disabled={!KIND_INFO[k].optional}
              onChange={() => toggleNotifyKind(k)}
            />
            <span>
              {KIND_INFO[k].icon} {KIND_INFO[k].label}
              {!KIND_INFO[k].optional && <span className="muted"> — всегда включено</span>}
            </span>
          </label>
        ))}
        <hr className="sep" />
        <label className="check-row">
          <input type="checkbox" checked={prefs.sound} onChange={(e) => updateNotifyPrefs({ sound: e.target.checked })} />
          <span>🔊 Звук при новом уведомлении</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={prefs.browser && permission === 'granted'}
            disabled={permission === 'unsupported' || permission === 'denied'}
            onChange={(e) => (e.target.checked ? enableBrowser() : updateNotifyPrefs({ browser: false }))}
          />
          <span>
            🖥 Всплывающие окна браузера, когда вкладка в фоне
            {permission === 'denied' && <span className="muted"> — запрещено в настройках браузера</span>}
            {permission === 'unsupported' && <span className="muted"> — не поддерживается</span>}
          </span>
        </label>
      </div>

      <div className="card">
        <h3>Чёрный список</h3>
        <p className="muted">
          Заблокированные игроки не могут слать вам запросы в друзья, приглашения и уведомления. Заблокировать
          можно на странице профиля игрока.
        </p>
        {blocks.length === 0 && <p className="muted">Никого нет</p>}
        {blocks.map((b) => (
          <div key={b.uid} className="row spread">
            <Link to={`/profile/${b.uid}`}>{b.name}</Link>
            <button className="btn small" onClick={() => unblockUser(uid, b.uid).catch((e: Error) => setMessage(e.message))}>
              Разблокировать
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
