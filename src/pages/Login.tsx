import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';

function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Неверная почта или пароль',
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/email-already-in-use': 'Эта почта уже зарегистрирована',
    'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
    'auth/invalid-email': 'Некорректная почта',
    'auth/popup-closed-by-user': 'Окно входа закрыто',
    'auth/unauthorized-domain': 'Этот домен не добавлен в Firebase → Authentication → Settings → Authorized domains',
    'auth/operation-not-allowed': 'Этот способ входа не включён в Firebase Authentication',
  };
  return map[code] ?? (e as Error)?.message ?? 'Не удалось войти';
}

export default function Login() {
  const { user, signInGoogle, signInEmail, signUpEmail } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav('/', { replace: true });
  }, [user, nav]);

  if (!firebaseConfigured) {
    return (
      <div className="card narrow">
        <h2>Вход недоступен</h2>
        <p>Firebase не настроен. Добавьте ключи в переменные окружения (см. README).</p>
      </div>
    );
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>{mode === 'in' ? 'Вход' : 'Регистрация'}</h2>
      <button className="btn wide" disabled={busy} onClick={() => run(signInGoogle)}>
        Войти через Google
      </button>
      <div className="divider">или</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            mode === 'in' ? signInEmail(email, password) : signUpEmail(email, password, name.trim() || email.split('@')[0]),
          );
        }}
      >
        {mode === 'up' && (
          <input placeholder="Ник" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} required />
        )}
        <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button className="btn primary wide" disabled={busy}>
          {mode === 'in' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        {mode === 'in' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); setError(''); }}>
          {mode === 'in' ? 'Зарегистрироваться' : 'Войти'}
        </a>
      </p>
    </div>
  );
}
