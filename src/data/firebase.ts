/**
 * Firebase: инициализация. Эти ключи веб-приложения публичны по замыслу Firebase —
 * безопасность обеспечивают правила Firestore (см. firestore.rules), а не секретность ключей.
 */
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyDdkPVmV-uHf5sXXQDjInBMDi3u0XjJwSk',
  authDomain: 'chess-b0c48.firebaseapp.com',
  projectId: 'chess-b0c48',
  storageBucket: 'chess-b0c48.firebasestorage.app',
  messagingSenderId: '332644566493',
  appId: '1:332644566493:web:2b087f355adc6a36fce234',
  measurementId: 'G-N5N79SFJNB',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Аналитика работает не везде (блокировщики, http) — включаем только если поддерживается
void isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null)
