// Серверная функция Vercel: коды подтверждения из письма для регистрации и восстановления пароля.
//
// POST /api/auth  { action: 'send-code' | 'verify-code' | 'reset-password' | 'signup', ... }
//
// Нужные переменные окружения (Vercel → Project Settings → Environment Variables), см. README:
//   FIREBASE_SERVICE_ACCOUNT — JSON сервисного аккаунта Firebase (одной строкой)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — почтовый SMTP; MAIL_FROM — необязательно

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

type Purpose = 'reset' | 'signup';

const CODE_TTL_MS = 10 * 60 * 1000; // код живёт 10 минут
const TICKET_TTL_MS = 15 * 60 * 1000; // после проверки кода на следующий шаг даётся 15 минут
const RESEND_COOLDOWN_MS = 60 * 1000; // повторная отправка не чаще раза в минуту
const MAX_ATTEMPTS = 5; // неверных вводов кода до сброса
const MAX_SENDS_PER_HOUR = 5; // писем на один адрес в час
const COLLECTION = 'authCodes'; // клиентам закрыта правилами Firestore (доступ только у сервера)

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface CodeDoc {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  windowStart: number;
  sendCount: number;
  verified: boolean;
  nonce: string | null;
  ticketExpiresAt: number;
}

function serviceAccount(): { project_id: string; client_email: string; private_key: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new HttpError(500, 'Сервер не настроен: нет переменной FIREBASE_SERVICE_ACCOUNT');
  try {
    const sa = JSON.parse(raw);
    sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    return sa;
  } catch {
    throw new HttpError(500, 'Сервер не настроен: FIREBASE_SERVICE_ACCOUNT — некорректный JSON');
  }
}

function admin() {
  if (!getApps().length) {
    const sa = serviceAccount();
    initializeApp({
      credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

/** Секрет для подписей берём из приватного ключа сервисного аккаунта — отдельной переменной не нужно. */
function secret(): Buffer {
  return createHash('sha256').update(serviceAccount().private_key).digest();
}

function hashCode(email: string, purpose: Purpose, code: string): string {
  return createHmac('sha256', secret()).update(`${email}:${purpose}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function docId(email: string, purpose: Purpose): string {
  return `${purpose}_${createHash('sha256').update(email).digest('hex').slice(0, 40)}`;
}

function signTicket(email: string, purpose: Purpose, nonce: string): string {
  const payload = Buffer.from(
    JSON.stringify({ e: email, p: purpose, n: nonce, x: Date.now() + TICKET_TTL_MS }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Проверяет подпись и срок билета, сверяет его с записью в базе. Возвращает ссылку на запись кода. */
async function checkTicket(ticket: unknown, email: string, purpose: Purpose) {
  const bad = new HttpError(400, 'Подтверждение устарело — запросите код заново');
  if (typeof ticket !== 'string' || !ticket.includes('.')) throw bad;
  const [payload, sig] = ticket.split('.');
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) throw bad;
  let data: { e: string; p: string; n: string; x: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw bad;
  }
  if (data.e !== email || data.p !== purpose || data.x < Date.now()) throw bad;
  const ref = admin().db.collection(COLLECTION).doc(docId(email, purpose));
  const snap = await ref.get();
  const doc = snap.data() as CodeDoc | undefined;
  if (!doc || !doc.verified || !doc.nonce || !safeEqual(doc.nonce, data.n) || doc.ticketExpiresAt < Date.now()) throw bad;
  return ref;
}

function mailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new HttpError(500, 'Сервер не настроен: нет SMTP_HOST / SMTP_USER / SMTP_PASS');
  const port = Number(process.env.SMTP_PORT || 465);
  return {
    transport: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }),
    from: process.env.MAIL_FROM || `chess.uz <${user}>`,
  };
}

async function sendCodeEmail(to: string, purpose: Purpose, code: string) {
  const { transport, from } = mailer();
  const title = purpose === 'reset' ? 'Восстановление пароля' : 'Подтверждение почты';
  await transport.sendMail({
    from,
    to,
    subject: `${code} — код для chess.uz`,
    text: `${title}\n\nВаш код: ${code}\nОн действует 10 минут. Никому его не сообщайте.\n\nЕсли вы ничего не запрашивали, просто проигнорируйте это письмо.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
      <h2 style="margin:0 0 12px">♞ chess.uz</h2>
      <p>${title}</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
      <p style="color:#666">Код действует 10 минут. Никому его не сообщайте.<br>Если вы ничего не запрашивали, просто проигнорируйте это письмо.</p>
    </div>`,
  });
}

function cleanEmail(v: unknown): string {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400, 'Некорректная почта');
  return email;
}

function cleanPurpose(v: unknown): Purpose {
  if (v !== 'reset' && v !== 'signup') throw new HttpError(400, 'Неизвестная цель');
  return v;
}

function cleanPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, 'Пароль должен быть не короче 8 символов');
  if (v.length > 128) throw new HttpError(400, 'Пароль слишком длинный');
  return v;
}

async function userByEmail(email: string) {
  try {
    return await admin().auth.getUserByEmail(email);
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/user-not-found') return null;
    throw e;
  }
}

async function sendCode(body: Record<string, unknown>) {
  const email = cleanEmail(body.email);
  const purpose = cleanPurpose(body.purpose);
  const { db } = admin();
  const exists = await userByEmail(email);

  if (purpose === 'signup' && exists) throw new HttpError(409, 'Эта почта уже зарегистрирована. Войдите или восстановите пароль.');
  // Для восстановления не раскрываем, есть ли такой аккаунт: ответ всегда одинаковый.
  if (purpose === 'reset' && !exists) return { ok: true, cooldown: RESEND_COOLDOWN_MS / 1000 };

  const ref = db.collection(COLLECTION).doc(docId(email, purpose));
  const prev = (await ref.get()).data() as CodeDoc | undefined;
  const now = Date.now();
  if (prev && now - prev.lastSentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - prev.lastSentAt)) / 1000);
    throw new HttpError(429, `Подождите ${wait} с перед повторной отправкой`);
  }
  const inWindow = prev && now - prev.windowStart < 60 * 60 * 1000;
  if (inWindow && prev.sendCount >= MAX_SENDS_PER_HOUR) {
    throw new HttpError(429, 'Слишком много запросов. Попробуйте через час.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const doc: CodeDoc = {
    codeHash: hashCode(email, purpose, code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: now,
    windowStart: inWindow ? prev.windowStart : now,
    sendCount: inWindow ? prev.sendCount + 1 : 1,
    verified: false,
    nonce: null,
    ticketExpiresAt: 0,
  };
  await ref.set(doc);
  try {
    await sendCodeEmail(email, purpose, code);
  } catch (e) {
    await ref.delete().catch(() => undefined);
    console.error('Не удалось отправить письмо', e);
    throw new HttpError(502, 'Не удалось отправить письмо. Проверьте адрес и попробуйте позже.');
  }
  return { ok: true, cooldown: RESEND_COOLDOWN_MS / 1000 };
}

async function verifyCode(body: Record<string, unknown>) {
  const email = cleanEmail(body.email);
  const purpose = cleanPurpose(body.purpose);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Введите 6 цифр из письма');

  const ref = admin().db.collection(COLLECTION).doc(docId(email, purpose));
  const doc = (await ref.get()).data() as CodeDoc | undefined;
  const invalid = new HttpError(400, 'Код недействителен или истёк. Запросите новый.');
  if (!doc || doc.verified || doc.expiresAt < Date.now()) throw invalid;
  if (doc.attempts >= MAX_ATTEMPTS) {
    await ref.delete().catch(() => undefined);
    throw new HttpError(429, 'Слишком много неверных попыток. Запросите новый код.');
  }
  if (!safeEqual(doc.codeHash, hashCode(email, purpose, code))) {
    await ref.update({ attempts: doc.attempts + 1 });
    const left = MAX_ATTEMPTS - doc.attempts - 1;
    throw new HttpError(400, left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.');
  }
  const nonce = randomBytes(16).toString('hex');
  await ref.update({ verified: true, nonce, ticketExpiresAt: Date.now() + TICKET_TTL_MS });
  return { ok: true, ticket: signTicket(email, purpose, nonce) };
}

async function resetPassword(body: Record<string, unknown>) {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.newPassword);
  const ref = await checkTicket(body.ticket, email, 'reset');
  const user = await userByEmail(email);
  if (!user) throw new HttpError(400, 'Подтверждение устарело — запросите код заново');
  const { auth } = admin();
  await auth.updateUser(user.uid, { password });
  await auth.revokeRefreshTokens(user.uid); // старые сессии на других устройствах завершатся
  await ref.delete();
  return { ok: true };
}

async function signup(body: Record<string, unknown>) {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password);
  const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 24) || email.split('@')[0];
  const ref = await checkTicket(body.ticket, email, 'signup');
  try {
    await admin().auth.createUser({ email, password, displayName: name, emailVerified: true });
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpError(409, 'Эта почта уже зарегистрирована. Войдите или восстановите пароль.');
    }
    throw e;
  }
  await ref.delete();
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Пустой запрос');
    switch (body.action) {
      case 'send-code':
        return res.status(200).json(await sendCode(body));
      case 'verify-code':
        return res.status(200).json(await verifyCode(body));
      case 'reset-password':
        return res.status(200).json(await resetPassword(body));
      case 'signup':
        return res.status(200).json(await signup(body));
      default:
        throw new HttpError(400, 'Неизвестное действие');
    }
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('auth api', e);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
