import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { ROLE_LABEL, createClub, isMemberRole, memberCount, roleIn, useClubs } from '../lib/clubs';
import type { Club, ClubRole } from '../lib/clubs';

function ClubRow({ club, role }: { club: Club; role: ClubRole | undefined }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    memberCount(club.id).then((c) => alive && setCount(c));
    return () => {
      alive = false;
    };
  }, [club.id]);
  return (
    <div className="club-row">
      <div>
        <Link to={`/club/${club.id}`}>
          <b>{club.name}</b>
        </Link>{' '}
        <span className="muted">
          {club.isOpen ? 'открытый' : 'по заявке'}
          {count !== null ? ` · ${count} уч.` : ''}
          {role ? ` · вы: ${ROLE_LABEL[role]}` : ''}
        </span>
        {club.description && <div className="muted club-desc">{club.description}</div>}
      </div>
      <Link className="btn small" to={`/club/${club.id}`}>
        Открыть
      </Link>
    </div>
  );
}

export default function Clubs() {
  const { profile, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const { clubs, loading, error } = useClubs();
  const [roles, setRoles] = useState<Record<string, ClubRole | undefined>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const uid = profile?.uid;
  const idsKey = clubs.map((c) => c.id).join(',');

  // Узнаём, в каких клубах состоит игрок
  useEffect(() => {
    if (!uid || clubs.length === 0) {
      setRoles({});
      return;
    }
    let alive = true;
    Promise.all(clubs.map(async (c) => [c.id, await roleIn(c.id, uid)] as const)).then((pairs) => {
      if (alive) setRoles(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, idsKey]);

  if (!firebaseConfigured) return <div className="card">Клубы доступны после подключения Firebase.</div>;

  async function create() {
    if (!profile) return nav('/login');
    setBusy(true);
    setFormError('');
    try {
      const id = await createClub(profile, { name, description, isOpen });
      nav(`/club/${id}`);
    } catch (e) {
      setFormError((e as Error).message);
      setBusy(false);
    }
  }

  const mine = clubs.filter((c) => isMemberRole(roles[c.id]));
  const others = clubs.filter((c) => !isMemberRole(roles[c.id]));

  return (
    <div className="clubs-page">
      <section className="card">
        <div className="row spread">
          <h2>Клубы</h2>
          {!showForm && (
            <button className="btn primary" onClick={() => (profile ? setShowForm(true) : nav('/login'))}>
              + Создать клуб
            </button>
          )}
        </div>
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input
              placeholder="Название клуба (3–40 символов)"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              placeholder="Описание (необязательно)"
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="check-row">
              <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
              Открытый клуб (вступить может любой; без галочки — по заявке)
            </label>
            <div className="row">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Создаю…' : 'Создать'}
              </button>
              <button className="btn" type="button" onClick={() => setShowForm(false)}>
                Отмена
              </button>
            </div>
            {formError && <p className="error">{formError}</p>}
          </form>
        )}
        {!authLoading && !profile && (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы создавать клубы и вступать в них.
          </p>
        )}
      </section>

      {mine.length > 0 && (
        <section className="card">
          <h3>Мои клубы</h3>
          {mine.map((c) => (
            <ClubRow key={c.id} club={c} role={roles[c.id]} />
          ))}
        </section>
      )}

      <section className="card">
        <h3>{mine.length > 0 ? 'Другие клубы' : 'Все клубы'}</h3>
        {loading && <p className="muted">Загрузка…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && clubs.length === 0 && <p className="muted">Клубов пока нет — создайте первый.</p>}
        {others.map((c) => (
          <ClubRow key={c.id} club={c} role={roles[c.id]} />
        ))}
      </section>
    </div>
  );
}
