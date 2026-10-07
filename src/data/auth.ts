/**
 * Вход и регистрация (Firebase Auth). Firebase грузится лениво, как и в games.ts.
 * Регистрация делается «поверх» анонимного аккаунта (linkWithCredential),
 * поэтому уже сыгранные партии остаются у пользователя.
 */
export interface AuthUser {
  uid: string
  anonymous: boolean
  name: string
  email: string | null
}

type FbUser = {
  uid: string
  isAnonymous: boolean
  displayName: string | null
  email: string | null
}

function toUser(u: FbUser | null): AuthUser | null {
  if (!u) return null
  return {
    uid: u.uid,
    anonymous: u.isAnonymous,
    name: u.displayName || u.email?.split('@')[0] || 'Гость',
    email: u.email,
  }
}

async function mods() {
  const [{ auth }, a] = await Promise.all([import('./firebase'), import('firebase/auth')])
  return { auth, a }
}

/** Подписка на смену пользователя. Возвращает функцию отписки. */
export function watchUser(cb: (u: AuthUser | null) => void): () => void {
  let off: (() => void) | null = null
  let cancelled = false
  void mods()
    .then(({ auth, a }) => {
      if (cancelled) return
      off = a.onAuthStateChanged(auth, (u) => cb(toUser(u)))
    })
    .catch(() => cb(null))
  return () => {
    cancelled = true
    off?.()
  }
}

/** Понятные русские сообщения вместо кодов Firebase. */
export function authErrorText(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-email':
      return 'Некорректный email.'
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'Этот email уже зарегистрирован — перейдите на вкладку «Вход».'
    case 'auth/weak-password':
      return 'Пароль слишком короткий (минимум 6 символов).'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Неверный email или пароль.'
    case 'auth/too-many-requests':
      return 'Слишком много попыток. Попробуйте позже.'
    case 'auth/network-request-failed':
      return 'Нет связи с сервером. Проверьте интернет.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    case 'auth/operation-not-allowed':
      return 'Этот способ входа не включён в Firebase Console (Authentication → Sign-in method).'
    case 'auth/unauthorized-domain':
      return 'Домен сайта не добавлен в Authorized domains в Firebase.'
    default:
      return 'Не удалось выполнить действие. Попробуйте ещё раз.'
  }
}

export async function registerWithEmail(name: string, email: string, password: string): Promise<void> {
  const { auth, a } = await mods()
  const cur = auth.currentUser
  if (cur && cur.isAnonymous) {
    const cred = a.EmailAuthProvider.credential(email, password)
    const res = await a.linkWithCredential(cur, cred)
    if (name) await a.updateProfile(res.user, { displayName: name })
  } else {
    const res = await a.createUserWithEmailAndPassword(auth, email, password)
    if (name) await a.updateProfile(res.user, { displayName: name })
  }
  // Обновляем состояние, чтобы имя сразу появилось в интерфейсе
  await auth.currentUser?.reload()
  if (auth.currentUser) await a.getIdToken(auth.currentUser, true)
}

export async function loginWithEmail(email: string, password: string): Promise<void> {
  const { auth, a } = await mods()
  await a.signInWithEmailAndPassword(auth, email, password)
}

export async function loginWithGoogle(): Promise<void> {
  const { auth, a } = await mods()
  const provider = new a.GoogleAuthProvider()
  const cur = auth.currentUser
  if (cur && cur.isAnonymous) {
    try {
      await a.linkWithPopup(cur, provider)
      return
    } catch (e) {
      // Google-аккаунт уже есть — просто входим в него
      if ((e as { code?: string }).code !== 'auth/credential-already-in-use') throw e
    }
  }
  await a.signInWithPopup(auth, provider)
}

export async function resetPassword(email: string): Promise<void> {
  const { auth, a } = await mods()
  await a.sendPasswordResetEmail(auth, email)
}

/** Выход. Дальше ensureUser() сам создаст нового анонимного гостя. */
export async function logout(): Promise<void> {
  const { auth, a } = await mods()
  await a.signOut(auth)
}
