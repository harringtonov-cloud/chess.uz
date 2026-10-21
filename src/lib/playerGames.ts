import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { newestFirst } from './gameSort';
import type { GameDoc } from './types';

export interface GameRow {
  id: string;
  g: GameDoc;
}

/** Сколько партий читаем, когда индекс не создан и сортировать приходится в браузере. */
const FALLBACK_READ = 300;

const rows = (docs: { id: string; data: () => unknown }[]): GameRow[] =>
  docs.map((d) => ({ id: d.id, g: d.data() as GameDoc }));

/**
 * Партии игрока, новые сверху. Основной запрос быстрый, но ему нужен составной индекс Firestore.
 * Если индекса нет (ошибка failed-precondition), читаем партии без сортировки и сортируем сами,
 * поэтому страница работает и без развёртывания индекса.
 */
export async function fetchPlayerGames(uid: string, max: number): Promise<GameRow[]> {
  const col = collection(db, 'games');
  try {
    const snap = await getDocs(query(col, where('participants', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(max)));
    return rows(snap.docs);
  } catch {
    const snap = await getDocs(query(col, where('participants', 'array-contains', uid), limit(FALLBACK_READ)));
    return newestFirst(rows(snap.docs), max);
  }
}

/** То же в реальном времени (для списка ежедневных партий). Возвращает функцию отписки. */
export function watchPlayerGames(uid: string, max: number, onData: (r: GameRow[]) => void): () => void {
  const col = collection(db, 'games');
  let inner: (() => void) | null = null;
  let closed = false;
  const outer = onSnapshot(
    query(col, where('participants', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(max)),
    (snap) => onData(rows(snap.docs)),
    () => {
      if (closed) return;
      inner = onSnapshot(
        query(col, where('participants', 'array-contains', uid), limit(FALLBACK_READ)),
        (snap) => onData(newestFirst(rows(snap.docs), max)),
        () => onData([]),
      );
    },
  );
  return () => {
    closed = true;
    outer();
    inner?.();
  };
}
