/**
 * Онлайн-партии через Firestore (коллекция rooms). Firebase грузится лениво, как в games.ts.
 * Вся шахматная логика — в src/online/room.ts; здесь только чтение и запись комнат.
 */
import { newRoom, type Patch, type Room } from '../online/room.ts'
import { ensureUser } from './games'
import type { Color } from '../chess/index.ts'

const FRESH_MS = 45_000

async function firebase() {
  const [{ auth, db }, fs] = await Promise.all([import('./firebase'), import('firebase/firestore')])
  return { auth, db, fs }
}

function randomId(len = 8): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export async function currentUid(): Promise<string> {
  return ensureUser()
}

export function guestName(uid: string, displayName?: string | null): string {
  return displayName?.trim() || `Гость-${uid.slice(0, 4)}`
}

async function myName(uid: string): Promise<string> {
  const { auth } = await firebase()
  return guestName(uid, auth.currentUser?.displayName)
}

export interface CreateOptions {
  tcId: string
  baseMs: number
  incMs: number
  color: Color | 'random'
  isPublic: boolean
}

/** Создать комнату и вернуть её идентификатор. */
export async function createRoom(o: CreateOptions): Promise<string> {
  const { db, fs } = await firebase()
  const uid = await ensureUser()
  const name = await myName(uid)
  const color: Color = o.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : o.color
  const room = newRoom({ tcId: o.tcId, baseMs: o.baseMs, incMs: o.incMs, color, uid, name, isPublic: o.isPublic })
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomId()
    try {
      await fs.setDoc(fs.doc(db, 'rooms', id), room)
      return id
    } catch (e) {
      if (attempt === 2) throw e
    }
  }
  throw new Error('create-failed')
}

export type JoinResult = 'joined' | 'already' | 'spectator' | 'not-found'

/** Занять свободное место в комнате. Если место занято — вы наблюдатель. */
export async function joinRoom(id: string): Promise<JoinResult> {
  const { db, fs } = await firebase()
  const uid = await ensureUser()
  const name = await myName(uid)
  const ref = fs.doc(db, 'rooms', id)
  return fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return 'not-found' as JoinResult
    const room = snap.data() as Room
    if (room.white === uid || room.black === uid) return 'already' as JoinResult
    if (room.status !== 'waiting') return 'spectator' as JoinResult
    const now = Date.now()
    if (room.white === null) {
      tx.update(ref, { white: uid, whiteName: name, status: 'playing', lastMoveAt: now, updatedAt: now })
    } else if (room.black === null) {
      tx.update(ref, { black: uid, blackName: name, status: 'playing', lastMoveAt: now, updatedAt: now })
    } else {
      return 'spectator' as JoinResult
    }
    return 'joined' as JoinResult
  })
}

export function watchRoom(id: string, cb: (room: Room | null) => void, onError: (e: unknown) => void): () => void {
  let off: (() => void) | null = null
  let cancelled = false
  void firebase()
    .then(({ db, fs }) => {
      if (cancelled) return
      off = fs.onSnapshot(
        fs.doc(db, 'rooms', id),
        (snap) => cb(snap.exists() ? (snap.data() as Room) : null),
        onError,
      )
    })
    .catch(onError)
  return () => {
    cancelled = true
    off?.()
  }
}

export async function patchRoom(id: string, patch: Patch): Promise<void> {
  const { db, fs } = await firebase()
  await fs.updateDoc(fs.doc(db, 'rooms', id), { ...patch, updatedAt: Date.now() })
}

/** Найти чужую свежую публичную комнату с тем же контролем времени и занять в ней место. */
async function joinOpenRoom(tcId: string, olderThan?: { createdAt: number; id: string }): Promise<string | null> {
  const { db, fs } = await firebase()
  const uid = await ensureUser()
  const snap = await fs.getDocs(
    fs.query(
      fs.collection(db, 'rooms'),
      fs.where('public', '==', true),
      fs.where('status', '==', 'waiting'),
      fs.where('tcId', '==', tcId),
      fs.limit(20),
    ),
  )
  const now = Date.now()
  const candidates = snap.docs
    .map((d) => ({ id: d.id, room: d.data() as Room }))
    .filter(({ id, room }) => {
      if (room.white === uid || room.black === uid) return false
      if (now - room.updatedAt > FRESH_MS) return false
      if (!olderThan) return true
      // при слиянии двух ожидающих комнат присоединяемся только к более старой
      return room.createdAt < olderThan.createdAt || (room.createdAt === olderThan.createdAt && id < olderThan.id)
    })
    .sort((a, b) => a.room.createdAt - b.room.createdAt)
  for (const c of candidates) {
    try {
      const res = await joinRoom(c.id)
      if (res === 'joined') return c.id
    } catch {
      /* кто-то успел раньше — пробуем следующую */
    }
  }
  return null
}

/** Быстрая игра: присоединиться к ожидающему игроку или создать публичную комнату. */
export async function quickMatch(o: Omit<CreateOptions, 'isPublic' | 'color'>): Promise<string> {
  const found = await joinOpenRoom(o.tcId)
  if (found) return found
  return createRoom({ ...o, color: 'random', isPublic: true })
}

/**
 * Если пока мы ждём, соперник тоже создал комнату, договариваемся: младшая комната
 * закрывается, её владелец идёт в более старую. Возвращает id новой комнаты или null.
 */
export async function mergeIntoOlder(myId: string, my: Room): Promise<string | null> {
  const id = await joinOpenRoom(my.tcId, { createdAt: my.createdAt, id: myId })
  if (!id) return null
  await patchRoom(myId, { status: 'finished', reason: 'abandoned', result: null })
  return id
}
