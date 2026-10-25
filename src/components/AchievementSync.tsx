import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { db, firebaseConfigured } from '../firebase';
import { CATALOG, metricsOf, newlyEarned, normalizeEarned } from '../lib/achievements';

const seenKey = (uid: string) => `achievements_seen_${uid}`;

function readSeen(uid: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(seenKey(uid));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(uid: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(seenKey(uid), JSON.stringify([...ids]));
  } catch {
    /* localStorage может быть недоступен — тогда просто покажем всплывающее окно повторно */
  }
}

/**
 * Работает в фоне: 1) записывает в профиль достижения, которые игрок заработал по счётчикам
 * (после партии, задачи или у старых игроков при первом входе); 2) показывает всплывающее окно
 * о новом достижении. При самом первом запуске уже заработанное помечается как виденное без показа.
 */
export default function AchievementSync() {
  const { profile } = useAuth();
  const [toast, setToast] = useState<string[]>([]);
  const writing = useRef(false);

  useEffect(() => {
    if (!firebaseConfigured || !profile) return;
    const uid = profile.uid;
    const have = normalizeEarned(profile.achievements);

    // 1) дописываем в профиль недостающее
    const missing = newlyEarned(metricsOf(profile), have);
    if (missing.length > 0 && !writing.current) {
      writing.current = true;
      const now = Date.now();
      const patch: Record<string, number> = {};
      for (const a of missing) patch[`achievements.${a.id}`] = now;
      updateDoc(doc(db, 'users', uid), patch)
        .catch((e) => console.error('achievements', e))
        .finally(() => {
          writing.current = false;
        });
    }

    // 2) всплывающее окно о новых
    const seen = readSeen(uid);
    const owned = Object.keys(have);
    if (seen === null) {
      writeSeen(uid, owned); // первый запуск: ничего не показываем
      return;
    }
    const fresh = owned.filter((id) => !seen.has(id));
    if (fresh.length > 0) {
      writeSeen(uid, [...seen, ...fresh]);
      setToast(fresh);
    }
  }, [profile]);

  useEffect(() => {
    if (toast.length === 0) return;
    const t = setTimeout(() => setToast([]), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (toast.length === 0) return null;
  const items = toast.map((id) => CATALOG.find((a) => a.id === id)).filter((a) => a !== undefined);
  return (
    <div className="achievement-toast" role="status" onClick={() => setToast([])}>
      <b>🏆 {items.length > 1 ? 'Новые достижения' : 'Новое достижение'}</b>
      {items.slice(0, 3).map((a) => (
        <div key={a.id}>
          {a.icon} {a.title}
        </div>
      ))}
      {items.length > 3 && <div className="muted">и ещё {items.length - 3}</div>}
    </div>
  );
}
