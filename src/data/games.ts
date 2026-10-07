/**
 * Хранение партий в Firestore. Firebase грузится лениво (динамический import):
 * если он недоступен, игра продолжает работать, просто без сохранения.
 */
export interface SavedGame {
  id?: string
  uid: string
  pgn: string
  result: string
  reason: string
  white: string
  black: string
  mode: 'ai' | 'local'
  aiLevel: number | null
  timeControl: string
  plies: number
  createdAt?: number
}

async function firebase() {
  const [{ auth, db }, authMod, fs] = await Promise.all([
    import('./firebase'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])
  return { auth, db, signInAnonymously: authMod.signInAnonymously, fs }
}

/** Анонимный вход: у каждого посетителя свой uid без регистрации. */
export async function ensureUser(): Promise<string> {
  const { auth, signInAnonymously } = await firebase()
  if (auth.currentUser) return auth.currentUser.uid
  const cred = await signInAnonymously(auth)
  return cred.user.uid
}

export async function saveGame(game: Omit<SavedGame, 'uid' | 'id' | 'createdAt'>): Promise<void> {
  const { db, fs } = await firebase()
  const uid = await ensureUser()
  await fs.addDoc(fs.collection(db, 'games'), { ...game, uid, createdAt: fs.serverTimestamp() })
}

/** Последние партии пользователя (сортировка на клиенте — не нужен составной индекс). */
export async function loadHistory(max = 20): Promise<SavedGame[]> {
  const { db, fs } = await firebase()
  const uid = await ensureUser()
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'games'), fs.where('uid', '==', uid), fs.limit(100)))
  const list = snap.docs.map((d) => {
    const data = d.data() as Omit<SavedGame, 'id' | 'createdAt'> & { createdAt?: { toMillis(): number } }
    return { ...data, id: d.id, createdAt: data.createdAt?.toMillis() ?? 0 } as SavedGame
  })
  return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, max)
}
