import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { submitReport } from '../lib/moderation';
import { REASON_INFO, REASON_ORDER } from '../lib/moderationLogic';
import type { ReportReason } from '../lib/moderationLogic';

interface Props {
  target: { uid: string; name: string };
  /** Если жалоба из-за конкретной партии, передайте её id: модератор сразу увидит ссылку. */
  gameId?: string;
  label?: string;
}

/** Кнопка «Пожаловаться» с раскрывающейся формой: причина и необязательное описание. */
export default function ReportButton({ target, gameId = '', label = '🚩 Пожаловаться' }: Props) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!profile || profile.uid === target.uid) return null;
  const me = profile;

  async function send() {
    setError('');
    setBusy(true);
    try {
      await submitReport({ uid: me.uid, name: me.name }, target, reason as ReportReason, details, gameId);
      setDone(true);
      setOpen(false);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('permission') ? 'Не получилось отправить жалобу. Попробуйте позже.' : msg);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="muted">Жалоба отправлена. Спасибо!</span>;

  return (
    <>
      <button className="btn small" onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="report-form card">
          <b>Жалоба на {target.name}</b>
          <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
            <option value="">— причина —</option>
            {REASON_ORDER.map((r) => (
              <option key={r} value={r}>
                {REASON_INFO[r].icon} {REASON_INFO[r].label}
              </option>
            ))}
          </select>
          <textarea
            value={details}
            maxLength={500}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Что произошло? (необязательно, кроме причины «Другое»)"
          />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn primary" disabled={busy || !reason} onClick={send}>
              Отправить
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {!open && error && <span className="error">{error}</span>}
    </>
  );
}
