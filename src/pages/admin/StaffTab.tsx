import { useState } from 'react';
import { grantRole, playerName, revokeRole, useStaffList } from '../../lib/moderation';
import type { Staff } from '../../lib/moderation';
import { OWNER_UID, looksLikeUid } from '../../lib/moderationLogic';
import type { StaffRole } from '../../lib/moderationLogic';
import { searchUsers } from '../../lib/social';
import type { UserHit } from '../../lib/social';

/** Назначение и снятие администраторов и модераторов. Вкладка видна только владельцу сайта. */
export default function StaffTab({ owner, onOpenPlayer }: { owner: Staff; onOpenPlayer: (uid: string) => void }) {
  const { list, error } = useStaffList(true);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [role, setRole] = useState<StaffRole>('moderator');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function find() {
    setMsg('');
    setHits([]);
    const t = text.trim();
    try {
      if (looksLikeUid(t)) {
        const name = await playerName(t);
        if (!name) return setMsg('Игрок с таким uid не найден');
        setHits([{ uid: t, name, country: '' }]);
      } else {
        const found = await searchUsers(t);
        if (found.length === 0) setMsg('Никого не нашли. Ник ищется по началу и с учётом регистра, либо вставьте uid.');
        setHits(found);
      }
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function grant(h: UserHit) {
    setBusy(true);
    setMsg('');
    try {
      await grantRole(owner, { uid: h.uid, name: h.name }, role);
      setMsg(`${h.name}: назначен (${role === 'admin' ? 'администратор' : 'модератор'}) ✓. Ему нужно обновить страницу.`);
      setHits([]);
      setText('');
    } catch (e) {
      setMsg((e as Error).message.includes('permission') ? 'Нет прав: проверьте, что правила Firestore опубликованы.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="error">Не удалось загрузить список: {error}</p>;

  return (
    <div>
      <h3>Сотрудники</h3>
      <table className="table">
        <tbody>
          <tr>
            <td><b>Вы</b></td>
            <td>👑 владелец (администратор)</td>
            <td className="muted">{OWNER_UID.slice(0, 6)}…</td>
            <td />
          </tr>
          {list.filter((m) => m.uid !== OWNER_UID).map((m) => (
            <tr key={m.uid}>
              <td><button className="link-btn" onClick={() => onOpenPlayer(m.uid)}>{m.name}</button></td>
              <td>{m.role === 'admin' ? '🛡 администратор' : '🔰 модератор'}</td>
              <td className="muted">назначил: {m.addedByName || '—'}</td>
              <td>
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() => window.confirm(`Снять ${m.name} с должности?`) && revokeRole(owner, { uid: m.uid, name: m.name }).catch((e) => setMsg((e as Error).message))}
                >
                  Снять
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.filter((m) => m.uid !== OWNER_UID).length === 0 && <p className="muted">Других сотрудников пока нет.</p>}

      <h3>Назначить сотрудника</h3>
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); find(); }}>
        <input style={{ maxWidth: 320 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ник игрока (начало) или его uid" />
        <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          <option value="moderator">🔰 Модератор</option>
          <option value="admin">🛡 Администратор</option>
        </select>
        <button className="btn primary" type="submit" disabled={text.trim().length < 2}>Найти</button>
      </form>
      <div className="row wrap">
        {hits.map((h) => (
          <button key={h.uid} className="btn" disabled={busy} onClick={() => grant(h)}>
            Назначить: {h.name}
          </button>
        ))}
      </div>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted">
        Модератор разбирает жалобы и выдаёт санкции до 30 дней. Администратор может ещё банить навсегда, сбрасывать рейтинги и
        публиковать объявления. Назначать и снимать сотрудников можете только вы.
      </p>
    </div>
  );
}
