import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useNow, useSanction, useStaffRole } from './lib/moderation';
import type { Staff } from './lib/moderation';
import { restrictions } from './lib/moderationLogic';
import type { Sanction, StaffRole } from './lib/moderationLogic';

interface ModerationState {
  role: StaffRole | null;
  /** Данные сотрудника для записи в журнал; null, если игрок не сотрудник. */
  staff: Staff | null;
  /** Санкция, которая действует прямо сейчас (истёкшие не показываются). */
  sanction: Sanction | null;
  banned: boolean;
  muted: boolean;
}

const Ctx = createContext<ModerationState>({ role: null, staff: null, sanction: null, banned: false, muted: false });

export function useModeration(): ModerationState {
  return useContext(Ctx);
}

export function ModerationProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const role = useStaffRole(user?.uid);
  const sanction = useSanction(user?.uid);
  const now = useNow();
  const value = useMemo<ModerationState>(() => {
    const r = restrictions(sanction, now);
    return {
      role,
      staff: role && profile ? { uid: profile.uid, name: profile.name, role } : null,
      sanction: r.muted ? sanction : null,
      banned: r.banned,
      muted: r.muted,
    };
  }, [role, profile, sanction, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
