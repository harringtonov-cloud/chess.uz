import { useState } from 'react'
import { authErrorText, loginWithEmail, loginWithGoogle, registerWithEmail, resetPassword } from '../data/auth.ts'

type Props = {
  onClose: () => void
}

type Tab = 'login' | 'register'

export function AuthModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
      return true
    } catch (e) {
      setError(authErrorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const mail = email.trim()
    if (!mail || !password) {
      setError('Введите email и пароль.')
      return
    }
    if (tab === 'register' && password.length < 6) {
      setError('Пароль слишком короткий (минимум 6 символов).')
      return
    }
    const ok = await run(() =>
      tab === 'register' ? registerWithEmail(name.trim(), mail, password) : loginWithEmail(mail, password),
    )
    if (ok) onClose()
  }

  const google = async () => {
    const ok = await run(loginWithGoogle)
    if (ok) onClose()
  }

  const forgot = async () => {
    const mail = email.trim()
    if (!mail) {
      setError('Введите email, на который отправить письмо.')
      return
    }
    const ok = await run(() => resetPassword(mail))
    if (ok) setInfo('Письмо для сброса пароля отправлено.')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal auth-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="seg">
          <button type="button" className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>
            Вход
          </button>
          <button type="button" className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>
            Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {tab === 'register' && (
            <input
              type="text"
              placeholder="Имя (ник)"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '…' : tab === 'register' ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>

        {tab === 'login' && (
          <button type="button" className="link-btn" onClick={forgot} disabled={busy}>
            Забыли пароль?
          </button>
        )}

        <div className="auth-sep">или</div>
        <button type="button" className="ghost" onClick={google} disabled={busy}>
          Войти через Google
        </button>

        {error && <p className="auth-msg err">{error}</p>}
        {info && <p className="auth-msg ok">{info}</p>}

        <button type="button" className="link-btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  )
}
