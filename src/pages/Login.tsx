import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { resetPassword, sendCode, signupWithTicket, verifyCode } from '../lib/authApi';

function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Неверная почта или пароль',
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/email-already-in-use': 'Эта почта уже зарегистрирована',
    'auth/weak-password': 'Пароль слишком короткий',
    'auth/invalid-email': 'Некорректная почта',
    'auth/too-many-requests': 'Слишком много попыток входа. Подождите немного или восстановите пароль.',
    'auth/popup-closed-by-user': 'Окно входа закрыто',
    'auth/unauthorized-domain': 'Этот домен не добавлен в Firebase → Authentication → Settings → Authorized domains',
    'auth/operation-not-allowed': 'Этот способ входа не включён в Firebase Authentication',
  };
  return map[code] ?? (e as Error)?.message ?? 'Не удалось войти';
}

type Mode = 'in' | 'up' | 'forgot';
type Step = 'form' | 'code' | 'password';

export default function Login() {
  const { user, signInGoogle, signInEmail } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('in');
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav('/', { replace: true });
  }, [user, nav]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

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
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep('form');
    setCode('');
    setTicket('');
    setPassword('');
    setPassword2('');
    setError('');
    setInfo('');
  }

  async function requestCode() {
    const purpose = mode === 'forgot' ? 'reset' : 'signup';
    const wait = await sendCode(email.trim(), purpose);
    setCooldown(wait);
    setCode('');
    setStep('code');
    setInfo(`Мы отправили код на ${email.trim()}. Проверьте также папку «Спам».`);
  }

  async function submit() {
    const mail = email.trim();
    if (mode === 'in') return signInEmail(mail, password);

    if (step === 'form') {
      if (mode === 'up' && password.length < 8) throw new Error('Пароль должен быть не короче 8 символов');
      return requestCode();
    }

    if (step === 'code') {
      const t = await verifyCode(mail, mode === 'forgot' ? 'reset' : 'signup', code);
      if (mode === 'up') {
        await signupWithTicket(mail, t, password, name.trim() || mail.split('@')[0]);
        await signInEmail(mail, password);
        return;
      }
      setTicket(t);
      setStep('password');
      setInfo('Код подтверждён. Придумайте новый пароль.');
      return;
    }

    // forgot → password
    if (password.length < 8) throw new Error('Пароль должен быть не короче 8 символов');
    if (password !== password2) throw new Error('Пароли не совпадают');
    await resetPassword(mail, ticket, password);
    await signInEmail(mail, password);
  }

  const title =
    mode === 'in' ? 'Вход' : mode === 'up' ? 'Регистрация' : step === 'password' ? 'Новый пароль' : 'Восстановление пароля';

  let button = 'Войти';
  if (mode === 'up') button = step === 'form' ? 'Получить код на почту' : 'Подтвердить и создать аккаунт';
  if (mode === 'forgot') button = step === 'form' ? 'Отправить код' : step === 'code' ? 'Проверить код' : 'Сохранить пароль';

  return (
    <div className="card narrow">
      <h2>{title}</h2>

      {mode !== 'forgot' && step === 'form' && (
        <>
          <button className="btn wide" disabled={busy} onClick={() => run(signInGoogle)}>
            Войти через Google
          </button>
          <div className="divider">или</div>
        </>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(submit);
        }}
      >
        {step === 'form' && (
          <>
            {mode === 'up' && (
              <input placeholder="Ник" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} required />
            )}
            <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {mode !== 'forgot' && (
              <input
                type="password"
                placeholder={mode === 'up' ? 'Пароль (минимум 8 символов)' : 'Пароль'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              />
            )}
          </>
        )}

        {step === 'code' && (
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="Код из письма (6 цифр)"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
        )}

        {step === 'password' && (
          <>
            <input
              type="password"
              placeholder="Новый пароль (минимум 8 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
            />
            <input
              type="password"
              placeholder="Повторите пароль"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              autoComplete="new-password"
            />
          </>
        )}

        <button className="btn primary wide" disabled={busy}>
          {busy ? 'Подождите…' : button}
        </button>
      </form>

      {info && <p className="muted">{info}</p>}
      {error && <p className="error">{error}</p>}

      {step === 'code' && (
        <p className="muted">
          Не пришёл код?{' '}
          {cooldown > 0 ? (
            <>Отправить снова можно через {cooldown} с</>
          ) : (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                run(requestCode);
              }}
            >
              Отправить код ещё раз
            </a>
          )}
        </p>
      )}

      {mode === 'in' && (
        <p className="muted">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              switchMode('forgot');
            }}
          >
            Забыли пароль?
          </a>
        </p>
      )}

      <p className="muted">
        {mode === 'in' ? 'Нет аккаунта? ' : mode === 'up' ? 'Уже есть аккаунт? ' : 'Вспомнили пароль? '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchMode(mode === 'in' ? 'up' : 'in');
          }}
        >
          {mode === 'in' ? 'Зарегистрироваться' : 'Войти'}
        </a>
      </p>
    </div>
  );
}
