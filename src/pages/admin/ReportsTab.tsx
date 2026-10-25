import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { closeReport, issueSanction, useNow, useReports, warnPlayer } from '../../lib/moderation';
import type { Staff } from '../../lib/moderation';
import {
  ACTION_LABEL,
  REASON_INFO,
  REASON_ORDER,
  STATUS_LABEL,
  allowedDurations,
  filterReports,
  groupByTarget,
} from '../../lib/moderationLogic';
import type { Report, ReportAction, ReportFilter } from '../../lib/moderationLogic';
import { timeAgo } from '../../lib/notifyLogic';

export default function ReportsTab({ staff, onOpenPlayer }: { staff: Staff; onOpenPlayer: (uid: string) => void }) {
  const { reports, loading, error } = useReports(true);
  const [filter, setFilter] = useState<ReportFilter>({ status: 'open', reason: 'all', query: '' });
  const now = useNow(60_000);
  const shown = useMemo(() => filterReports(reports, filter), [reports, filter]);
  const hot = useMemo(
    () => groupByTarget(reports.filter((r) => r.status === 'open')).filter((g) => g.reports.length >= 2).slice(0, 5),
    [reports],
  );

  if (error) {
    return <p className="error">Не удалось загрузить жалобы: {error}. Проверьте, что правила Firestore опубликованы и у вас есть роль в коллекции admins.</p>;
  }

  return (
    <div>
      {hot.length > 0 && (
        <div className="card">
          <b>🔥 На кого жалуются чаще всего (новые жалобы)</b>
          <div className="row wrap">
            {hot.map((g) => (
              <button key={g.targetUid} className="btn small" onClick={() => onOpenPlayer(g.targetUid)}>
                {g.targetName} · {g.reports.length}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="row wrap">
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as ReportFilter['status'] })}>
          <option value="open">Новые</option>
          <option value="resolved">Меры приняты</option>
          <option value="dismissed">Отклонённые</option>
          <option value="all">Все</option>
        </select>
        <select value={filter.reason} onChange={(e) => setFilter({ ...filter, reason: e.target.value as ReportFilter['reason'] })}>
          <option value="all">Все причины</option>
          {REASON_ORDER.map((r) => (
            <option key={r} value={r}>{REASON_INFO[r].icon} {REASON_INFO[r].label}</option>
          ))}
        </select>
        <input
          style={{ maxWidth: 220 }}
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          placeholder="Поиск по нику"
        />
        <span className="muted">{shown.length} из {reports.length}</span>
      </div>
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && shown.length === 0 && <p className="muted">Жалоб по этому фильтру нет.</p>}
      {shown.map((r) => (
        <ReportCard key={r.id} r={r} staff={staff} now={now} onOpenPlayer={onOpenPlayer} />
      ))}
    </div>
  );
}

function ReportCard({
  r,
  staff,
  now,
  onOpenPlayer,
}: {
  r: Report;
  staff: Staff;
  now: number;
  onOpenPlayer: (uid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ReportAction>('warn');
  const durations = allowedDurations(staff.role);
  const [duration, setDuration] = useState(durations[0]?.id ?? '1h');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function apply(status: 'resolved' | 'dismissed') {
    setBusy(true);
    setError('');
    try {
      const target = { uid: r.targetUid, name: r.targetName };
      if (status === 'resolved') {
        if (action === 'warn') await warnPlayer(staff, target, note || REASON_INFO[r.reason].label);
        if (action === 'mute' || action === 'ban') {
          await issueSanction(staff, target, action, duration, note || REASON_INFO[r.reason].label);
        }
      }
      await closeReport(staff, r, status, action, note);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card report-card">
      <div className="row spread wrap">
        <b>
          {REASON_INFO[r.reason].icon} {REASON_INFO[r.reason].label}
        </b>
        <span className="muted">
          {STATUS_LABEL[r.status]} · {timeAgo(r.createdAt, now)}
        </span>
      </div>
      <div>
        на{' '}
        <button className="link-btn" onClick={() => onOpenPlayer(r.targetUid)}>{r.targetName}</button> · от{' '}
        <button className="link-btn" onClick={() => onOpenPlayer(r.reporterUid)}>{r.reporterName}</button>
        {r.gameId && (
          <>
            {' '}· <Link to={`/game/${r.gameId}`}>партия</Link>{' '}
            (<Link to={`/admin?game=${r.gameId}`}>🔍 проверить</Link>)
          </>
        )}
      </div>
      {r.details && <p className="report-details">«{r.details}»</p>}
      {r.status !== 'open' && (
        <p className="muted">
          {r.resolvedByName}: {ACTION_LABEL[r.action]}
          {r.note ? ` — ${r.note}` : ''}
        </p>
      )}
      {r.status === 'open' &&
        (open ? (
          <div className="form">
            <div className="row wrap">
              <select value={action} onChange={(e) => setAction(e.target.value as ReportAction)}>
                <option value="none">Принять без санкций</option>
                <option value="warn">⚠️ Предупреждение</option>
                <option value="mute">🔇 Мьют</option>
                <option value="ban">⛔ Бан</option>
              </select>
              {(action === 'mute' || action === 'ban') && (
                <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                  {durations.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              )}
            </div>
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Заметка (игрок увидит её в предупреждении или причине санкции)" />
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => apply('resolved')}>Применить и закрыть</button>
              <button className="btn" disabled={busy} onClick={() => apply('dismissed')}>Отклонить</button>
              <button className="btn ghost" onClick={() => setOpen(false)}>Отмена</button>
            </div>
          </div>
        ) : (
          <button className="btn small" onClick={() => setOpen(true)}>Разобрать</button>
        ))}
    </div>
  );
}
