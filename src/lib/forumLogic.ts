// Форум: проверка текста, задержки между сообщениями, порядок тем. Чистые функции без Firebase.

export const FORUM_LIMITS = { titleMin: 3, titleMax: 100, bodyMax: 2000, replyMax: 1000 };
/** Пауза между своими сообщениями, мс: защита от спама. */
export const POST_COOLDOWN = 30_000;
export const REPLY_COOLDOWN = 8_000;

/** Убирает лишние пробелы и пустые строки (не больше одной подряд). */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validatePost(title: string, body: string): string | null {
  const t = cleanText(title).replace(/\s+/g, ' ');
  const b = cleanText(body);
  if (t.length < FORUM_LIMITS.titleMin) return 'Заголовок — не короче 3 знаков';
  if (t.length > FORUM_LIMITS.titleMax) return 'Заголовок — не длиннее 100 знаков';
  if (b.length === 0) return 'Напишите текст темы';
  if (b.length > FORUM_LIMITS.bodyMax) return 'Текст темы — не длиннее 2000 знаков';
  return null;
}

export function validateReply(text: string): string | null {
  const t = cleanText(text);
  if (t.length === 0) return 'Напишите ответ';
  if (t.length > FORUM_LIMITS.replyMax) return 'Ответ — не длиннее 1000 знаков';
  return null;
}

/** Сколько миллисекунд осталось ждать до следующего сообщения (0 — можно писать). */
export function cooldownLeft(lastAt: number | null, now: number, cooldown: number): number {
  if (lastAt === null) return 0;
  return Math.max(0, lastAt + cooldown - now);
}

export interface ForumPost {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  replyCount: number;
  createdAt: number;
  /** null — ответов ещё не было */
  lastReplyAt: number | null;
}

/** Время последней активности в теме: ответ или, если ответов нет, создание. */
export function activityAt(p: Pick<ForumPost, 'createdAt' | 'lastReplyAt'>): number {
  return Math.max(p.createdAt, p.lastReplyAt ?? 0);
}

/** Темы с недавней активностью — выше; при равенстве новее создана — выше. */
export function sortPosts<T extends Pick<ForumPost, 'id' | 'createdAt' | 'lastReplyAt'>>(posts: T[]): T[] {
  return [...posts].sort(
    (a, b) => activityAt(b) - activityAt(a) || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1),
  );
}

/** Начало текста для списка: одна строка, не длиннее n знаков. */
export function snippet(text: string, n = 120): string {
  const one = cleanText(text).replace(/\s+/g, ' ');
  return one.length <= n ? one : `${one.slice(0, n - 1).trimEnd()}…`;
}

/** Firestore Timestamp или число → миллисекунды (ещё не записанный serverTimestamp → 0). */
export function toMillis(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/** Может ли игрок удалить сообщение: автор или сотрудник. */
export function canDelete(authorId: string, viewerUid: string | null | undefined, isStaff: boolean): boolean {
  return Boolean(viewerUid) && (isStaff || authorId === viewerUid);
}

/** Форма слова «ответ» для числа: 1 ответ, 2 ответа, 5 ответов. */
export function repliesWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ответ`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ответа`;
  return `${n} ответов`;
}
