import { useEffect, useState } from 'react';
import { ERROR_TEXT, fetchLichessStats, fetchOwnStats } from '../lib/explorer';
import type { StatSource } from '../lib/explorer';
import type { StatRow, StatTable } from '../lib/explorerLogic';

interface Props {
  fen: string;
  /** Ходы до текущей позиции в SAN (для статистики по партиям chess.uz) */
  moves: string[];
  /** Сыграть ход из таблицы (SAN) */
  onPick: (san: string) => void;
}

const SOURCES: { id: StatSource; label: string }[] = [
  { id: 'lichess', label: 'Lichess' },
  { id: 'masters', label: 'Мастера' },
  { id: 'own', label: 'chess.uz' },
];

function Bar({ x }: { x: { whitePct: number; drawPct: number; blackPct: number } }) {
  return (
    <span className="stat-bar" title={`Белые ${x.whitePct}% · ничьи ${x.drawPct}% · чёрные ${x.blackPct}%`}>
      <span className="stat-w" style={{ width: `${x.whitePct}%` }}>{x.whitePct >= 14 ? `${x.whitePct}%` : ''}</span>
      <span className="stat-d" style={{ width: `${x.drawPct}%` }}>{x.drawPct >= 14 ? `${x.drawPct}%` : ''}</span>
      <span className="stat-b" style={{ width: `${x.blackPct}%` }}>{x.blackPct >= 14 ? `${x.blackPct}%` : ''}</span>
    </span>
  );
}

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n));

export default function OpeningStats({ fen, moves, onPick }: Props) {
  const [source, setSource] = useState<StatSource>('lichess');
  const [table, setTable] = useState<StatTable | null>(null);
  const [note, setNote] = useState('');
  const [shownSource, setShownSource] = useState<StatSource>('own');
  const [loading, setLoading] = useState(true);

  const movesKey = moves.join(' ');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNote('');
    (async () => {
      try {
        if (source === 'own') {
          const t = await fetchOwnStats(moves);
          if (!cancelled) {
            setTable(t);
            setShownSource('own');
          }
          return;
        }
        const t = await fetchLichessStats(fen, source);
        if (!cancelled) {
          setTable(t);
          setShownSource(source);
        }
      } catch (e) {
        const code = (e as Error).message;
        // Если Lichess недоступен, показываем статистику chess.uz и объясняем почему
        try {
          const t = await fetchOwnStats(moves);
          if (!cancelled) {
            setTable(t);
            setShownSource('own');
            setNote(`${ERROR_TEXT[code] ?? 'Не удалось получить данные Lichess.'} Показана статистика партий chess.uz.`);
          }
        } catch {
          if (!cancelled) {
            setTable(null);
            setNote('Не удалось загрузить статистику.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // moves входит через movesKey: массив пересоздаётся при каждом рендере родителя
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, movesKey, source]);

  const rows: StatRow[] = table?.rows ?? [];

  return (
    <div className="card">
      <h4>Статистика ходов</h4>
      <div className="row wrap">
        {SOURCES.map((s) => (
          <button key={s.id} className={`btn small ${source === s.id ? 'primary' : ''}`} onClick={() => setSource(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {note && <p className="muted">{note}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && table && table.total === 0 && (
        <p className="muted">
          {shownSource === 'own' ? 'В партиях chess.uz такой позиции ещё не было.' : 'В базе нет партий с этой позиции.'}
        </p>
      )}
      {!loading && table && table.total > 0 && (
        <>
          <div className="muted">
            {table.opening ? `${table.opening} · ` : ''}
            {fmt(table.total)} {shownSource === 'own' ? 'партий chess.uz' : shownSource === 'masters' ? 'партий мастеров' : 'партий Lichess'}
          </div>
          <Bar x={table} />
          <table className="table stat-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.san} className="stat-row" onClick={() => onPick(r.san)}>
                  <td><b>{r.san}</b></td>
                  <td className="muted">{fmt(r.total)}</td>
                  <td className="stat-cell"><Bar x={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {shownSource === 'own' && !loading && (
        <p className="muted small">Считается по последним 500 завершённым партиям сайта; перестановки ходов считаются разными позициями.</p>
      )}
    </div>
  );
}
