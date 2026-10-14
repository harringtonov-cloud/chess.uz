import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env;

// Веб-конфиг Firebase не секрет: доступ к данным защищают правила Firestore (firestore.rules).
// Переменные окружения VITE_FIREBASE_* (если заданы) имеют приоритет над значениями по умолчанию.
const config = {
  apiKey: (env.VITE_FIREBASE_API_KEY as string | undefined) ?? 'AIzaSyDdkPVmV-uHf5sXXQDjInBMDi3u0XjJwSk',
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? 'chess-b0c48.firebaseapp.com',
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'chess-b0c48',
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? 'chess-b0c48.firebasestorage.app',
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? '332644566493',
  appId: (env.VITE_FIREBASE_APP_ID as string | undefined) ?? '1:332644566493:web:2b087f355adc6a36fce234',
};

/** true, если в окружении заданы ключи Firebase. Без них работают только боты, анализ и задачи. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

const app = initializeApp(
  firebaseConfigured
    ? config
    : { apiKey: 'not-configured', authDomain: 'x', projectId: 'not-configured', appId: 'x' },
);

export const auth = getAuth(app);
export const db = getFirestore(app);
