export type CodePurpose = 'reset' | 'signup';

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new Error('Нет соединения с сервером');
  }
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* ответ без JSON — ниже сработает общее сообщение */
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error('Серверная часть недоступна (на локальном vite dev она не запускается — используйте Vercel)');
    throw new Error(data.error || 'Ошибка сервера');
  }
  return data as T;
}

/** Отправляет на почту 6-значный код. Возвращает, через сколько секунд можно отправить повторно. */
export async function sendCode(email: string, purpose: CodePurpose): Promise<number> {
  const r = await call<{ cooldown: number }>('send-code', { email, purpose });
  return r.cooldown ?? 60;
}

/** Проверяет код. При успехе возвращает билет для следующего шага. */
export async function verifyCode(email: string, purpose: CodePurpose, code: string): Promise<string> {
  const r = await call<{ ticket: string }>('verify-code', { email, purpose, code });
  return r.ticket;
}

export async function resetPassword(email: string, ticket: string, newPassword: string): Promise<void> {
  await call('reset-password', { email, ticket, newPassword });
}

export async function signupWithTicket(email: string, ticket: string, password: string, name: string): Promise<void> {
  await call('signup', { email, ticket, password, name });
}
