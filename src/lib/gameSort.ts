// Чистая логика сортировки партий: без Firebase и React, проверяется обычными тестами (npm test).

export interface HasCreatedAt {
  createdAt?: { toMillis?: () => number } | null;
}

function at(g: HasCreatedAt): number {
  const t = g.createdAt;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : Number.MAX_SAFE_INTEGER;
}

/**
 * Сначала новые. Партия без отметки времени (её ещё создаёт сервер) считается самой свежей.
 * Нужна, когда запрос идёт без индекса Firestore и сортировать приходится в браузере.
 */
export function newestFirst<T extends { g: HasCreatedAt }>(items: T[], max: number): T[] {
  return [...items].sort((a, b) => at(b.g) - at(a.g)).slice(0, max);
}
