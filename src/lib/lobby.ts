import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import type { GameDoc } from './types';

export interface OpenGame {
  id: string;
  g: GameDoc;
}

/** Открытые партии, которые ждут соперника (не по ссылке). Живая подписка. */
export function useOpenGames(): OpenGame[] {
  const [games, setGames] = useState<OpenGame[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!firebaseConfigured) return;
    const q = query(
      collection(db, 'games'),
      where('status', '==', 'waiting'),
      where('private', '==', false),
      limit(40),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setGames(snap.docs.map((d) => ({ id: d.id, g: d.data() as GameDoc }))),
      () => setGames([]),
    );
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  // создатель шлёт «пульс» раз в 10 секунд; если молчит дольше 30 — партия брошена
  return games.filter(({ g }) => now - (g.heartbeat ?? 0) <= 30000);
}
