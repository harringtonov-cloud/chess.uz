import { useNow, useModLog } from '../../lib/moderation';
import { LOG_LABEL } from '../../lib/moderationLogic';
import { timeAgo } from '../../lib/notifyLogic';

export default function LogTab() {
  const { list, error } = useModLog(true);
  const now = useNow(60_000);
  if (error) return <p className="error">Не удалось загрузить журнал: {error}</p>;
  if (list.length === 0) return <p className="muted">Журнал пока пуст.</p>;
  return (
    <table className="table">
      <thead>
        <tr><th>Когда</th><th>Сотрудник</th><th>Действие</th><th>Игрок</th><th>Подробности</th></tr>
      </thead>
      <tbody>
        {list.map((l) => (
          <tr key={l.id}>
            <td className="muted">{timeAgo(l.at, now)}</td>
            <td>{l.byName}</td>
            <td>{LOG_LABEL[l.kind]}</td>
            <td>{l.targetName || '—'}</td>
            <td className="muted">{l.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
