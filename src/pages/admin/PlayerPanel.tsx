import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNow } from '../../lib/moderation';
import {
  issueSanction,
  liftSanction,
  loadPlayerOverview,
  resetProfileText,
  resetRatings,
  warnPlayer,
} from '../../lib/moderation';
import type { PlayerOverview, Staff } from '../../lib/moderation';
import {
  ACTION_LABEL,
  REASON_INFO,
  STATUS_LABEL,
  allowedDurations,
  isActive,
  remainingText,
} from '../../lib/moderationLogic';
import type { SanctionType } from '../../lib/moderationLogic';
import { resultText } from '../../lib/chessUtil';
import { timeAgo } from '../../lib/notifyLogic';

/** Карточка игрока для модератора: профиль, санкции, партии, жалобы и действия. */
export default function PlayerPanel({ uid, staff, onClose }: { uid: string; staff: Staff; onClose: () => void }) {
  const [data, setData] = useState<PlayerOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<SanctionType>('mute');
  const durations = allowedDurations(staff.role);
  const [duration, setDuration] = useState(durations[0]?.id ?? '1h');
  const [reason, setReason] = useState('');
  const [warn, setWarn] = useState('');
  const now = useNow(60_000);

  const reload = useCallback(() => {
    loadPlayerOverview(uid)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [uid]);

  useEffect(() => {
    setData(null);
    setError('');
    reload();
  }, [reload]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="card"><p className="error">{error}</p><button className="btn" onClick={onClose}>Закрыть</button></div>;
  if (!data) return <div className="card">Загрузка…</div>;
  if (!data.profile) return <div className="card">Игрок не найден. <button className="btn small" onClick={onClose}>Закрыть</button></div>;

  const p = data.profile;
  const target = { uid, name: p.name };
  const active = isActive(data.sanction, now) ? data.sanction : null;
  const isSelf = uid === staff.uid;

  return (
    <div className="card player-panel">
      <div className="row spread">
        <h3>
          <Link to={`/profile/${uid}`}>{p.name}</Link>
        </h3>
        <button className="btn small" onClick={onClose}>✕ Закрыть</button>
      </div>
      <div className="muted">
        uid: <code>{uid}</code> · партий {p.stats?.games ?? 0} (+{p.stats?.wins ?? 0} ={p.stats?.draws ?? 0} −{p.stats?.losses ?? 0}) · блиц{' '}
        {p.ratings?.blitz ?? 1200} · рапид {p.ratings?.rapid ?? 1200} · пуля {p.ratings?.bullet ?? 1200} · классика{' '}
        {p.ratings?.classical ?? 1200}
      </div>
      {error && <p className="error">{error}</p>}

      {active ? (
        <div className="result-banner">
          {active.type === 'ban' ? '⛔ Бан' : '🔇 Мьют'}: {remainingText(active.until, now)}. Причина: {active.reason || '—'}. Выдал:{' '}
          {active.byName}.{' '}
          <button className="btn small" disabled={busy} onClick={() => run(() => liftSanction(staff, target))}>
            Снять
          </button>
        </div>
      ) : (
        <p className="muted">Сейчас ограничений нет.</p>
      )}

      {!isSelf && (
        <div className="form">
          <b>Выдать санкцию</b>
          <div className="row wrap">
            <select value={type} onChange={(e) => setType(e.target.value as SanctionType)}>
              <option value="mute">🔇 Мьют (только чаты)</option>
              <option value="ban">⛔ Бан (игры, запросы, чаты)</option>
            </select>
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {durations.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Причина (её увидит игрок)" />
          <div>
            <button
              className="btn primary"
              disabled={busy || reason.trim().length < 3}
              onClick={() => run(() => issueSanction(staff, target, type, duration, reason.trim()))}
            >
              Применить
            </button>
          </div>
          <b>Предупреждение</b>
          <input value={warn} maxLength={200} onChange={(e) => setWarn(e.target.value)} placeholder="Текст предупреждения" />
          <div>
            <button
              className="btn"
              disabled={busy || warn.trim().length < 3}
              onClick={() => run(async () => { await warnPlayer(staff, target, warn.trim()); setWarn(''); })}
            >
              Отправить предупреждение
            </button>
          </div>
          {staff.role === 'admin' && (
            <>
              <b>Только администратор</b>
              <div className="row wrap">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => window.confirm(`Сбросить все рейтинги ${p.name} до 1200?`) && run(() => resetRatings(staff, target))}
                >
                  Сбросить рейтинги
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => window.confirm(`Заменить ник и очистить описание ${p.name}?`) && run(() => resetProfileText(staff, target))}
                >
                  Очистить ник и описание
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <h4>Жалобы на игрока ({data.reportsAgainst.length})</h4>
      <ReportList items={data.reportsAgainst} now={now} showWho="reporter" />
      <h4>Жалобы от игрока ({data.reportsBy.length})</h4>
      <ReportList items={data.reportsBy} now={now} showWho="target" />

      <h4>Последние партии</h4>
      {data.games.length === 0 ? (
        <p className="muted">Партий нет</p>
      ) : (
        <table className="table">
          <tbody>
            {data.games.filter(({ g }) => g.status !== 'waiting').map(({ id, g }) => (
              <tr key={id}>
                <td><Link to={`/game/${id}`}>{g.whiteName} — {g.blackName}</Link></td>
                <td>{g.rated ? 'рейтинговая' : 'товарищеская'}</td>
                <td>{g.status === 'finished' ? resultText(g.result, g.reason) : 'идёт'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReportList({
  items,
  now,
  showWho,
}: {
  items: PlayerOverview['reportsAgainst'];
  now: number;
  showWho: 'reporter' | 'target';
}) {
  if (items.length === 0) return <p className="muted">Нет</p>;
  return (
    <table className="table">
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <td>{REASON_INFO[r.reason].icon} {REASON_INFO[r.reason].label}</td>
            <td>{showWho === 'reporter' ? r.reporterName : r.targetName}</td>
            <td>{STATUS_LABEL[r.status]}{r.status === 'resolved' ? ` (${ACTION_LABEL[r.action]})` : ''}</td>
            <td className="muted">{timeAgo(r.createdAt, now)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
