import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase';
import type { Profile } from './lib/types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Разница между серверным и локальным временем (мс). Нужна для шахматных часов. */
  clockOffset: number;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth вне AuthProvider');
  return v;
}

function defaultProfile(user: User, name?: string): Profile {
  const fallback = user.displayName || user.email?.split('@')[0] || 'Игрок';
  return {
    uid: user.uid,
    name: (name || fallback).slice(0, 24),
    bio: '',
    country: '',
    ratings: { bullet: 1200, blitz: 1200, rapid: 1200, classical: 1200, puzzle: 1200 },
    stats: { games: 0, wins: 0, losses: 0, draws: 0 },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let unsubProfile: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      unsubProfile?.();
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const ref = doc(db, 'users', u.uid);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, { ...defaultProfile(u), createdAt: serverTimestamp() });
        }
        // отметка серверного времени для расчёта смещения часов
        await setDoc(ref, { lastSeen: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.error('Не удалось создать профиль', e);
      }
      unsubProfile = onSnapshot(ref, (s) => {
        if (!s.exists()) return;
        const data = s.data() as Profile & { lastSeen?: { toMillis: () => number } | null };
        setProfile({ ...data, uid: u.uid });
        if (data.lastSeen && !s.metadata.hasPendingWrites) {
          setClockOffset(data.lastSeen.toMillis() - Date.now());
        }
        setLoading(false);
      });
    });
    return () => {
      unsubAuth();
      unsubProfile?.();
    };
  }, []);

  const value: AuthState = {
    user,
    profile,
    loading,
    clockOffset,
    signInGoogle: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    signInEmail: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUpEmail: async (email, password, name) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      // профиль создастся в onAuthStateChanged; обновим имя, если он уже создан
      await setDoc(doc(db, 'users', cred.user.uid), defaultProfile(cred.user, name), { merge: true });
    },
    logout: async () => {
      await signOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
