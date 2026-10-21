import { useState } from 'react';
import { searchUsers } from '../../lib/social';
import type { UserHit } from '../../lib/social';

/** Поиск игрока по началу ника (с учётом регистра) или по точному uid. */
export default function PlayersTab({ onOpenPlayer }: { onOpenPlayer: (uid: string) => void }) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    setError('');
    const t = text.trim();
    if (t.length >= 20 && !t.includes(' ')) {
      onOpenPlayer(t); // похоже на uid
      return;
    }
    try {
      setHits(await searchUsers(t));
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Начало ника (с учётом регистра) или uid игрока" />
        <button className="btn primary" type="submit">Найти</button>
      </form>
      {error && <p className="error">{error}</p>}
      {searched && hits.length === 0 && <p className="muted">Никого не нашли. Ник ищется по началу и с учётом регистра.</p>}
      <div className="row wrap">
        {hits.map((h) => (
          <button key={h.uid} className="btn" onClick={() => onOpenPlayer(h.uid)}>{h.name}</button>
        ))}
      </div>
    </div>
  );
}
