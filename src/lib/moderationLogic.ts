// Чистая логика жалоб и модерации: без Firebase и React, поэтому проверяется обычными тестами (npm test).
// Импортов здесь нет намеренно: файл можно запускать напрямую в node --test.

export type StaffRole = 'admin' | 'moderator';

/** Роль сотрудника хранится в коллекции admins (документ с id = uid игрока). Создаётся только вручную в консоли Firebase. */
export function normalizeRole(data: unknown): StaffRole | null {
  if (!data || typeof data !== 'object') return null;
  const r = (data as { role?: unknown }).role;
  return r === 'admin' || r === 'moderator' ? r : null;
}

// ---------- Жалобы ----------

export type ReportReason = 'cheating' | 'abuse' | 'spam' | 'name' | 'stalling' | 'sandbagging' | 'other';

export const REASON_INFO: Record<ReportReason, { label: string; icon: string }> = {
  cheating: { label: 'Читерство (помощь движка)', icon: '🤖' },
  abuse: { label: 'Оскорбления и грубость в чате', icon: '🤬' },
  spam: { label: 'Спам и реклама', icon: '📣' },
  name: { label: 'Неприемлемый ник или описание', icon: '🏷' },
  stalling: { label: 'Затягивание времени, уход из партии', icon: '⏱' },
  sandbagging: { label: 'Накрутка или сброс рейтинга', icon: '📉' },
  other: { label: 'Другое', icon: '❓' },
};

export const REASON_ORDER = Object.keys(REASON_INFO) as ReportReason[];

export function isReason(v: unknown): v is ReportReason {
  return typeof v === 'string' && v in REASON_INFO;
}

export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ReportAction = 'none' | 'warn' | 'mute' | 'ban';

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Новая',
  resolved: 'Меры приняты',
  dismissed: 'Отклонена',
};

export const ACTION_LABEL: Record<ReportAction, string> = {
  none: 'без санкций',
  warn: 'предупреждение',
  mute: 'мьют чата',
  ban: 'бан',
};

export interface Report {
  id: string;
  reporterUid: string;
  reporterName: string;
  targetUid: string;
  targetName: string;
  reason: ReportReason;
  details: string;
  /** Партия, из-за которой жалоба (пустая строка — жалоба на профиль). */
  gameId: string;
  status: ReportStatus;
  createdAt: number;
  resolvedBy: string;
  resolvedByName: string;
  resolvedAt: number;
  note: string;
  action: ReportAction;
}

const millis = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/** Идентификатор жалобы: один игрок может подать на другого только одну жалобу на профиль и по одной на каждую партию. */
export function reportDocId(reporterUid: string, targetUid: string, gameId = ''): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  return `${clean(reporterUid)}_${clean(targetUid)}_${clean(gameId) || 'profile'}`;
}

export interface ReportInput {
  reporterUid: string;
  targetUid: string;
  reason: string;
  details: string;
}

/** Возвращает текст ошибки или null, если жалобу можно отправлять. */
export function validateReport(i: ReportInput): string | null {
  if (!i.reporterUid) return 'Войдите, чтобы отправить жалобу';
  if (!i.targetUid) return 'Не выбран игрок';
  if (i.reporterUid === i.targetUid) return 'Нельзя пожаловаться на самого себя';
  if (!isReason(i.reason)) return 'Выберите причину';
  if (i.details.trim().length > 500) return 'Описание длиннее 500 символов';
  if (i.reason === 'other' && i.details.trim().length < 10) return 'Опишите проблему хотя бы в двух словах';
  return null;
}

export function normalizeReport(id: string, d: Record<string, unknown>): Report | null {
  if (!isReason(d.reason)) return null;
  const status: ReportStatus = d.status === 'resolved' || d.status === 'dismissed' ? d.status : 'open';
  const action: ReportAction =
    d.action === 'warn' || d.action === 'mute' || d.action === 'ban' ? d.action : 'none';
  return {
    id,
    reporterUid: str(d.reporterUid),
    reporterName: str(d.reporterName) || 'Игрок',
    targetUid: str(d.targetUid),
    targetName: str(d.targetName) || 'Игрок',
    reason: d.reason,
    details: str(d.details),
    gameId: str(d.gameId),
    status,
    createdAt: millis(d.createdAt),
    resolvedBy: str(d.resolvedBy),
    resolvedByName: str(d.resolvedByName),
    resolvedAt: millis(d.resolvedAt),
    note: str(d.note),
    action,
  };
}

export interface ReportFilter {
  status: ReportStatus | 'all';
  reason: ReportReason | 'all';
  query: string;
}

export function filterReports(list: Report[], f: ReportFilter): Report[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(
    (r) =>
      (f.status === 'all' || r.status === f.status) &&
      (f.reason === 'all' || r.reason === f.reason) &&
      (!q || r.targetName.toLowerCase().includes(q) || r.reporterName.toLowerCase().includes(q)),
  );
}

export interface TargetGroup {
  targetUid: string;
  targetName: string;
  reports: Report[];
}

/** Группирует жалобы по игроку: больше жалоб — выше, при равенстве — у кого раньше самая старая. */
export function groupByTarget(list: Report[]): TargetGroup[] {
  const map = new Map<string, TargetGroup>();
  for (const r of list) {
    const g = map.get(r.targetUid) ?? { targetUid: r.targetUid, targetName: r.targetName, reports: [] };
    g.reports.push(r);
    map.set(r.targetUid, g);
  }
  const oldest = (g: TargetGroup) => Math.min(...g.reports.map((r) => r.createdAt || Infinity));
  return [...map.values()].sort((a, b) => b.reports.length - a.reports.length || oldest(a) - oldest(b));
}

export interface ReportStats {
  open: number;
  resolved: number;
  dismissed: number;
  byReason: Record<ReportReason, number>;
}

export function reportStats(list: Report[]): ReportStats {
  const byReason = Object.fromEntries(REASON_ORDER.map((r) => [r, 0])) as Record<ReportReason, number>;
  const s: ReportStats = { open: 0, resolved: 0, dismissed: 0, byReason };
  for (const r of list) {
    s[r.status] += 1;
    byReason[r.reason] += 1;
  }
  return s;
}

// ---------- Санкции ----------

export type SanctionType = 'ban' | 'mute';

export interface Sanction {
  uid: string;
  type: SanctionType;
  reason: string;
  /** Конец действия в миллисекундах. */
  until: number;
  by: string;
  byName: string;
  targetName: string;
  createdAt: number;
}

/** «Навсегда» хранится как далёкая дата, чтобы правила Firestore могли сравнивать её с текущим временем. */
export const PERMANENT_UNTIL = Date.UTC(2100, 0, 1);

export interface Duration {
  id: string;
  label: string;
  ms: number;
}

const HOUR = 3600_000;
export const DURATIONS: Duration[] = [
  { id: '1h', label: '1 час', ms: HOUR },
  { id: '1d', label: '1 день', ms: 24 * HOUR },
  { id: '7d', label: '7 дней', ms: 7 * 24 * HOUR },
  { id: '30d', label: '30 дней', ms: 30 * 24 * HOUR },
  { id: 'perm', label: 'Навсегда', ms: Infinity },
];

/** Модераторы могут наказывать до 30 дней, бессрочный бан — только администратор. */
export function allowedDurations(role: StaffRole | null): Duration[] {
  if (role === 'admin') return DURATIONS;
  if (role === 'moderator') return DURATIONS.filter((d) => d.ms !== Infinity);
  return [];
}

export function untilFor(durationId: string, now: number): number {
  const d = DURATIONS.find((x) => x.id === durationId);
  if (!d) throw new Error('Неизвестный срок');
  return d.ms === Infinity ? PERMANENT_UNTIL : now + d.ms;
}

export function isActive(s: Pick<Sanction, 'until'> | null | undefined, now: number): boolean {
  return !!s && s.until > now;
}

export function isPermanent(s: Pick<Sanction, 'until'>): boolean {
  return s.until >= PERMANENT_UNTIL;
}

export function normalizeSanction(uid: string, d: Record<string, unknown>): Sanction | null {
  if (d.type !== 'ban' && d.type !== 'mute') return null;
  return {
    uid,
    type: d.type,
    reason: str(d.reason),
    until: millis(d.until),
    by: str(d.by),
    byName: str(d.byName),
    targetName: str(d.targetName) || 'Игрок',
    createdAt: millis(d.createdAt),
  };
}

/** «навсегда», «ещё 3 дн», «ещё 5 ч», «ещё 12 мин». */
export function remainingText(until: number, now: number): string {
  if (until >= PERMANENT_UNTIL) return 'навсегда';
  const min = Math.max(1, Math.ceil((until - now) / 60_000));
  if (min < 60) return `ещё ${min} мин`;
  const hours = Math.ceil(min / 60);
  if (hours < 48) return `ещё ${hours} ч`;
  return `ещё ${Math.ceil(hours / 24)} дн`;
}

/** Действует ли на игрока запрет: бан запрещает всё, мьют только чаты. */
export function restrictions(s: Sanction | null | undefined, now: number): { banned: boolean; muted: boolean } {
  if (!isActive(s, now)) return { banned: false, muted: false };
  return { banned: s!.type === 'ban', muted: true };
}

// ---------- Журнал действий ----------

export type LogKind = 'ban' | 'mute' | 'unban' | 'warn' | 'resolve' | 'dismiss' | 'reset_ratings' | 'delete_message' | 'announce';

export const LOG_LABEL: Record<LogKind, string> = {
  ban: 'Бан',
  mute: 'Мьют',
  unban: 'Снятие санкции',
  warn: 'Предупреждение',
  resolve: 'Жалоба принята',
  dismiss: 'Жалоба отклонена',
  reset_ratings: 'Сброс рейтингов',
  delete_message: 'Удалено сообщение',
  announce: 'Объявление сайта',
};

export interface LogEntry {
  id: string;
  kind: LogKind;
  by: string;
  byName: string;
  targetUid: string;
  targetName: string;
  detail: string;
  at: number;
}

export function normalizeLog(id: string, d: Record<string, unknown>): LogEntry | null {
  if (typeof d.kind !== 'string' || !(d.kind in LOG_LABEL)) return null;
  return {
    id,
    kind: d.kind as LogKind,
    by: str(d.by),
    byName: str(d.byName) || 'Сотрудник',
    targetUid: str(d.targetUid),
    targetName: str(d.targetName),
    detail: str(d.detail),
    at: millis(d.createdAt),
  };
}

// ---------- Объявление сайта ----------

export type AnnouncementLevel = 'info' | 'warning';

export interface Announcement {
  text: string;
  level: AnnouncementLevel;
  active: boolean;
}

export function normalizeAnnouncement(d: Record<string, unknown> | undefined): Announcement | null {
  if (!d || d.active !== true) return null;
  const text = clip(str(d.text), 200);
  if (!text) return null;
  return { text, level: d.level === 'warning' ? 'warning' : 'info', active: true };
}

// ---------- Поиск игроков ----------

export function matchesPlayer(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length > 0 && name.toLowerCase().includes(q);
}
