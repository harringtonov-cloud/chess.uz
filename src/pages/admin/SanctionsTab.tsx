import { liftSanction, useNow, useSanctions } from '../../lib/moderation';
import type { Staff } from '../../lib/moderation';
import { isActive, remainingText } from '../../lib/moderationLogic';

export default function SanctionsTab({ staff, onOpenPlayer }: { staff: Staff; onOpenPlayer: (uid: string) => void }) {
  const { list, error } = useSanctions(true);
  const now = useNow(60_000);
  if (error) return <p className="error">Не удалось загрузить: {error}</p>;
  const active = list.filter((s) => isActive(s, now));
  const expired = list.filter((s) => !isActive(s, now));
  return (
    <div>
      <h3>Действующие ({active.length})</h3>
      {active.length === 0 && <p className="muted">Сейчас никто не наказан.</p>}
      <table className="table">
        <tbody>
          {active.map((s) => (
            <tr key={s.uid}>
              <td><button className="link-btn" onClick={() => onOpenPlayer(s.uid)}>{s.targetName}</button></td>
              <td>{s.type === 'ban' ? '⛔ бан' : '🔇 мьют'}</td>
              <td>{remainingText(s.until, now)}</td>
              <td>{s.reason || '—'}</td>
              <td className="muted">{s.byName}</td>
              <td>
                <button className="btn small" onClick={() => liftSanction(staff, { uid: s.uid, name: s.targetName })}>Снять</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {expired.length > 0 && (
        <>
          <h3>Истекшие ({expired.length})</h3>
          <table className="table">
            <tbody>
              {expired.map((s) => (
                <tr key={s.uid} className="muted">
                  <td><button className="link-btn" onClick={() => onOpenPlayer(s.uid)}>{s.targetName}</button></td>
                  <td>{s.type === 'ban' ? 'бан' : 'мьют'}</td>
                  <td>{s.reason || '—'}</td>
                  <td>
                    <button className="btn small ghost" onClick={() => liftSanction(staff, { uid: s.uid, name: s.targetName })}>Убрать запись</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
