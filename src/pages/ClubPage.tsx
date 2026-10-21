import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import {
  ROLE_LABEL,
  approveMember,
  canManage,
  deleteClubMessage,
  isMemberRole,
  joinClub,
  removeMember,
  sendClubMessage,
  setMemberRole,
  updateClub,
  useClub,
  useClubMembers,
  useClubMessages,
} from '../lib/clubs';
import type { ClubMember } from '../lib/clubs';
import { inviteToGame } from '../lib/social';

export default function ClubPage() {
  const { id = '' } = useParams();
  const { profile, user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const club = useClub(id);
  const signedIn = Boolean(user);
  const members = useClubMembers(id, signedIn);
  const me = members.find((m) => m.uid === user?.uid);
  const isMember = isMemberRole(me?.role);
  const messages = useClubMessages(id, isMember);

  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  if (!firebaseConfigured) return <div className="card">Клубы доступны после подключения Firebase.</div>;
  if (club === undefined) return <div className="card">Загрузка…</div>;
  if (club === null) {
    return (
      <div className="card">
        Клуб не найден. <Link to="/clubs">Ко всем клубам</Link>
      </div>
    );
  }
  const c = club;
  const manager = canManage(me?.role);
  const owner = me?.role === 'owner';
  const pending = members.filter((m) => m.role === 'pending');
  const accepted = members.filter((m) => m.role !== 'pending');
  const order = { owner: 0, admin: 1, member: 2, pending: 3 } as const;
  accepted.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const value = text.trim();
    if (!value || !profile) return;
    setText('');
    try {
      await sendClubMessage(c.id, profile, value);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit() {
    setName(c.name);
    setDescription(c.description ?? '');
    setIsOpen(c.isOpen);
    setEditing(true);
  }

  function challenge(m: ClubMember) {
    if (!profile) return;
    run(async () => {
      const gameId = await inviteToGame(profile, { uid: m.uid, name: m.name }, { base: 300, inc: 0 });
      nav(`/game/${gameId}`);
    });
  }

  return (
    <div className="club-page">
      <section className="card">
        <div className="row spread">
          <h2>{c.name}</h2>
          <Link className="btn small ghost" to="/clubs">
            ← Все клубы
          </Link>
        </div>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await updateClub(c, { name, description, isOpen });
                setEditing(false);
              });
            }}
          >
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
            <textarea value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
            <label className="check-row">
              <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
              Открытый клуб
            </label>
            <div className="row">
              <button className="btn primary" disabled={busy}>
                Сохранить
              </button>
              <button className="btn" type="button" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <>
            {c.description && <p>{c.description}</p>}
            <p className="muted">
              {c.isOpen ? 'Открытый клуб' : 'Вступление по заявке'} · владелец: {c.ownerName}
            </p>
          </>
        )}

        <div className="row wrap">
          {!authLoading && !signedIn && (
            <span className="muted">
              <Link to="/login">Войдите</Link>, чтобы вступить в клуб.
            </span>
          )}
          {signedIn && profile && !me && (
            <button className="btn primary" disabled={busy} onClick={() => run(() => joinClub(c, profile))}>
              {c.isOpen ? 'Вступить' : 'Подать заявку'}
            </button>
          )}
          {me?.role === 'pending' && (
            <>
              <span className="muted">Заявка отправлена — ждёт решения админа</span>
              <button className="btn small" onClick={() => run(() => removeMember(c.id, me.uid))}>
                Отозвать
              </button>
            </>
          )}
          {me && me.role !== 'pending' && me.role !== 'owner' && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => window.confirm('Выйти из клуба?') && run(() => removeMember(c.id, me.uid))}
            >
              Выйти из клуба
            </button>
          )}
          {owner && !editing && (
            <button className="btn" onClick={startEdit}>
              ✎ Изменить клуб
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {manager && pending.length > 0 && (
        <section className="card">
          <h3>Заявки на вступление ({pending.length})</h3>
          {pending.map((m) => (
            <div key={m.uid} className="row spread">
              <Link to={`/profile/${m.uid}`}>{m.name}</Link>
              <span className="row">
                <button className="btn small primary" onClick={() => run(() => approveMember(c, m.uid, profile!))}>
                  Принять
                </button>
                <button className="btn small" onClick={() => run(() => removeMember(c.id, m.uid))}>
                  Отклонить
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {isMember && (
        <section className="card">
          <h3>Чат клуба</h3>
          <div className="chat">
            <div className="chat-log club-chat">
              {messages.length === 0 && <div className="muted">Сообщений пока нет</div>}
              {messages.map((m) => (
                <div key={m.id} className={m.uid === user?.uid ? 'me' : ''}>
                  <b>{m.name}:</b> {m.text}
                  {manager && (
                    <button
                      className="btn small ghost"
                      title="Удалить сообщение"
                      onClick={() => run(() => deleteClubMessage(c.id, m.id))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Сообщение…" />
            </form>
          </div>
        </section>
      )}

      <section className="card">
        <h3>Участники{signedIn ? ` (${accepted.length})` : ''}</h3>
        {!signedIn && <p className="muted">Список участников виден после входа.</p>}
        {accepted.map((m) => (
          <div key={m.uid} className="row spread">
            <span>
              <Link to={`/profile/${m.uid}`}>{m.name}</Link> <span className="muted">· {ROLE_LABEL[m.role]}</span>
            </span>
            <span className="row">
              {isMember && m.uid !== user?.uid && (
                <button className="btn small" disabled={busy} title="Позвать на партию 5+0" onClick={() => challenge(m)}>
                  ♞ Вызвать
                </button>
              )}
              {owner && m.role === 'member' && (
                <button className="btn small" onClick={() => run(() => setMemberRole(c.id, m.uid, 'admin'))}>
                  Сделать админом
                </button>
              )}
              {owner && m.role === 'admin' && (
                <button className="btn small" onClick={() => run(() => setMemberRole(c.id, m.uid, 'member'))}>
                  Снять админа
                </button>
              )}
              {((manager && m.role === 'member') || (owner && m.role === 'admin')) && (
                <button
                  className="btn small ghost"
                  title="Исключить из клуба"
                  onClick={() =>
                    window.confirm(`Исключить ${m.name} из клуба?`) && run(() => removeMember(c.id, m.uid))
                  }
                >
                  ✕
                </button>
              )}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
