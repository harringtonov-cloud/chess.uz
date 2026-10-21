// Чистая логика уведомлений: без Firebase и React, поэтому проверяется обычными тестами (npm test).
// Здесь нет импортов намеренно: так файл можно запускать напрямую в node --test.

export type NotificationKind =
  | 'friend_request'
  | 'friend_accepted'
  | 'message'
  | 'game_invite'
  | 'your_turn'
  | 'club_request'
  | 'club_approved'
  | 'tournament_round'
  | 'system'
  | 'moderation';

export interface KindInfo {
  label: string;
  icon: string;
  /** Можно ли отключить этот тип в настройках. Системные и от модерации — нельзя. */
  optional: boolean;
}

export const KIND_INFO: Record<NotificationKind, KindInfo> = {
  friend_request: { label: 'Запросы в друзья', icon: '👋', optional: true },
  friend_accepted: { label: 'Запрос в друзья принят', icon: '🤝', optional: true },
  message: { label: 'Личные сообщения', icon: '💬', optional: true },
  game_invite: { label: 'Приглашения на партию', icon: '♟', optional: true },
  your_turn: { label: 'Ваш ход в ежедневных партиях', icon: '⏳', optional: true },
  club_request: { label: 'Заявки в ваш клуб', icon: '🏰', optional: true },
  club_approved: { label: 'Вас приняли в клуб', icon: '✅', optional: true },
  tournament_round: { label: 'Новый тур турнира', icon: '🏆', optional: true },
  system: { label: 'Объявления сайта', icon: '📢', optional: false },
  moderation: { label: 'Решения модерации', icon: '🛡', optional: false },
};

export const KIND_ORDER = Object.keys(KIND_INFO) as NotificationKind[];

export function isKind(v: unknown): v is NotificationKind {
  return typeof v === 'string' && v in KIND_INFO;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  fromUid: string;
  fromName: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  /** Время создания в миллисекундах (0, пока сервер ещё не поставил отметку). */
  at: number;
}

export interface NotifyPrefs {
  /** Типы, которые игрок отключил. */
  muted: NotificationKind[];
  /** Всплывающие уведомления браузера, пока вкладка в фоне. */
  browser: boolean;
  /** Короткий звук при новом уведомлении. */
  sound: boolean;
}

export const DEFAULT_PREFS: NotifyPrefs = { muted: [], browser: false, sound: true };

/** Читает настройки из строки localStorage; при любой неправильности возвращает значения по умолчанию. */
export function parsePrefs(raw: string | null): NotifyPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<NotifyPrefs> | null;
    if (!p || typeof p !== 'object') return DEFAULT_PREFS;
    const muted = Array.isArray(p.muted)
      ? Array.from(new Set(p.muted.filter(isKind).filter((k) => KIND_INFO[k].optional)))
      : [];
    return {
      muted,
      browser: typeof p.browser === 'boolean' ? p.browser : DEFAULT_PREFS.browser,
      sound: typeof p.sound === 'boolean' ? p.sound : DEFAULT_PREFS.sound,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function isEnabled(prefs: NotifyPrefs, kind: NotificationKind): boolean {
  return !prefs.muted.includes(kind);
}

export function toggleKind(prefs: NotifyPrefs, kind: NotificationKind): NotifyPrefs {
  if (!KIND_INFO[kind].optional) return prefs;
  const muted = prefs.muted.includes(kind) ? prefs.muted.filter((k) => k !== kind) : [...prefs.muted, kind];
  return { ...prefs, muted };
}

/**
 * Постоянный идентификатор уведомления. Одинаковое событие от одного игрока перезаписывает
 * прежнее уведомление, а не плодит новые (например, десять сообщений подряд — одна запись).
 */
export function notificationId(kind: NotificationKind, fromUid: string, ref = ''): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  return [kind, clean(fromUid), clean(ref)].filter(Boolean).join('_');
}

/** Обрезает текст до длины с многоточием (по границе слова, если получается). */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** Приводит документ Firestore к удобному виду; некорректные записи отбрасывает (null). */
export function normalizeNotification(
  id: string,
  data: Record<string, unknown>,
): NotificationItem | null {
  if (!isKind(data.kind)) return null;
  const at = data.createdAt as { toMillis?: () => number } | null | undefined;
  return {
    id,
    kind: data.kind,
    fromUid: typeof data.fromUid === 'string' ? data.fromUid : '',
    fromName: typeof data.fromName === 'string' ? data.fromName : '',
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    link: typeof data.link === 'string' ? data.link : '',
    read: data.read === true,
    at: at && typeof at.toMillis === 'function' ? at.toMillis() : 0,
  };
}

/** Оставляет только включённые игроком типы. */
export function visible(items: NotificationItem[], prefs: NotifyPrefs): NotificationItem[] {
  return items.filter((n) => isEnabled(prefs, n.kind));
}

export function unreadCount(items: NotificationItem[]): number {
  return items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

/** «только что», «5 мин назад», «вчера», «12.10» — коротко и по-русски. */
export function timeAgo(at: number, now: number): string {
  if (!at) return 'только что';
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;
  const d = new Date(at);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Ссылка внутри сайта: защита от javascript: и внешних адресов в уведомлении. */
export function safeLink(link: string): string {
  return /^\/[A-Za-z0-9_\-./?=&#]*$/.test(link) && !link.startsWith('//') ? link : '/notifications';
}
