import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { CATEGORY_LABEL } from '../lib/timeControls';
import type { Profile } from '../lib/types';

type Tab = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'puzzle';
const LABEL: Record<Tab, string> = { ...CATEGORY_LABEL, puzzle: 'Головоломки' };

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>('blitz');
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    getDocs(query(collection(db, 'users'), orderBy(`ratings.${tab}`, 'desc'), limit(50)))
      .then((snap) => setRows(snap.docs.map((d) => ({ ...(d.data() as Profile), uid: d.id }))))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="card">
      <h2>Рейтинг игроков</h2>
      <div className="row wrap">
        {(Object.keys(LABEL) as Tab[]).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
            {LABEL[t]}
          </button>
        ))}
      </div>
      {!firebaseConfigured && <p className="notice">Таблица появится после подключения Firebase.</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Игрок</th>
            <th>Рейтинг</th>
            <th>Партий</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.uid}>
              <td>{i + 1}</td>
              <td>
                <Link to={`/profile/${p.uid}`}>{p.name}</Link>
              </td>
              <td>{p.ratings?.[tab] ?? 1200}</td>
              <td>{p.stats?.games ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
