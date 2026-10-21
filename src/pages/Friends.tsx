import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import {
  acceptFriendRequest,
  dismissInvite,
  inviteToGame,
  otherName,
  otherUid,
  pairId,
  removeFriendship,
  searchUsers,
  sendDirectMessage,
  sendFriendRequest,
  useDirectMessages,
  useFriendships,
  useInvites,
} from '../lib/social';
import type { Friendship, UserHit } from '../lib/social';
import { CATEGORY_LABEL, TIME_CONTROLS, categoryOf, tcLabel } from '../lib/timeControls';

const FLAT_TC = TIME_CONTROLS.flatMap((g) => g.items);

function ChatPanel({ friendship, onClose }: { friendship: Friendship; onClose: () => void }) {
  const { profile } = useAuth();
  const msgs = useDirectMessages(friendship.id);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs.length]);

  if (!profile) return null;

  async function send() {
    const value = text.trim();
    if (!value || !profile) return;
    setText('');
    try {
      await sendDirectMessage(friendship.id, profile, otherUid(friendship, profile.uid), value);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="card">
      <div className="row spread">
        <h3>Чат с {otherName(friendship, profile.uid)}</h3>
        <button className="btn small ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="chat">
        <div className="chat-log">
          {msgs.length === 0 && <div className="muted">Сообщений пока нет</div>}
          {msgs.map((m) => (
            <div key={m.id} className={m.uid === profile.uid ? 'me' : ''}>
              <b>{m.name}:</b> {m.text}
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
    </div>
  );
}

export default function Friends() {
  const { profile, loading } = useAuth();
  const nav = useNavigate();
  const friendships = useFriendships(profile?.uid);
  const invites = useInvites(profile?.uid);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [tc, setTc] = useState('300+0');
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  if (!firebaseConfigured) return <div className="card">Друзья доступны после подключения Firebase.</div>;
  if (loading) return <div className="card">Загрузка…</div>;
  if (!profile) {
    return (
      <div className="card">
        <Link to="/login">Войдите</Link>, чтобы добавлять друзей и приглашать их на партии.
      </div>
    );
  }
  const me = profile;

  const incoming = friendships.filter((f) => f.status === 'pending' && f.requester !== me.uid);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requester === me.uid);
  const friends = friendships.filter((f) => f.status === 'accepted');
  const chatFriendship = friendships.find((f) => f.id === chatWith && f.status === 'accepted') ?? null;

  function relationTo(uid: string): Friendship | undefined {
    return friendships.find((f) => f.id === pairId(me.uid, uid));
  }

  async function runSearch() {
    setError('');
    try {
      const found = await searchUsers(search);
      setHits(found.filter((h) => h.uid !== me.uid));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function add(hit: UserHit) {
    setError('');
    try {
      await sendFriendRequest(me, hit);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function invite(f: Friendship) {
    const [base, inc] = tc.split('+').map(Number);
    const uid = otherUid(f, me.uid);
    setBusy(f.id);
    setError('');
    try {
      const gameId = await inviteToGame(me, { uid, name: otherName(f, me.uid) }, { base, inc });
      nav(`/game/${gameId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  async function acceptInvite(id: string, gameId: string) {
    await dismissInvite(id).catch(() => undefined);
    nav(`/game/${gameId}`);
  }

  return (
    <div className="friends-page">
      {invites.length > 0 && (
        <section className="card">
          <h2>Приглашения на партию</h2>
          {invites.map((i) => (
            <div key={i.id} className="row spread">
              <span>
                <b>{i.fromName}</b> зовёт сыграть · {i.label}
              </span>
              <span className="row">
                <button className="btn small primary" onClick={() => acceptInvite(i.id, i.gameId)}>
                  Принять
                </button>
                <button className="btn small" onClick={() => dismissInvite(i.id)}>
                  Отклонить
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {incoming.length > 0 && (
        <section className="card">
          <h2>Запросы в друзья</h2>
          {incoming.map((f) => (
            <div key={f.id} className="row spread">
              <Link to={`/profile/${otherUid(f, me.uid)}`}>{otherName(f, me.uid)}</Link>
              <span className="row">
                <button className="btn small primary" onClick={() => acceptFriendRequest(f, me)}>
                  Принять
                </button>
                <button className="btn small" onClick={() => removeFriendship(f.id)}>
                  Отклонить
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Мои друзья</h2>
        <div className="row wrap">
          <span className="muted">Контроль времени для приглашений:</span>
          <select value={tc} onChange={(e) => setTc(e.target.value)}>
            {FLAT_TC.map((t) => (
              <option key={tcLabel(t)} value={`${t.base}+${t.inc}`}>
                {tcLabel(t)} ({CATEGORY_LABEL[categoryOf(t)]})
              </option>
            ))}
          </select>
        </div>
        {friends.length === 0 && <p className="muted">Друзей пока нет. Найдите игрока по нику ниже.</p>}
        {friends.map((f) => (
          <div key={f.id} className="row spread">
            <Link to={`/profile/${otherUid(f, me.uid)}`}>{otherName(f, me.uid)}</Link>
            <span className="row">
              <button className="btn small primary" disabled={busy !== ''} onClick={() => invite(f)}>
                {busy === f.id ? 'Создаю…' : '♞ Партия'}
              </button>
              <button className="btn small" onClick={() => setChatWith(f.id)}>
                💬
              </button>
              <button
                className="btn small ghost"
                title="Удалить из друзей"
                onClick={() => {
                  if (window.confirm(`Удалить ${otherName(f, me.uid)} из друзей?`)) {
                    removeFriendship(f.id);
                    if (chatWith === f.id) setChatWith(null);
                  }
                }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        {outgoing.length > 0 && (
          <>
            <h4>Отправленные запросы</h4>
            {outgoing.map((f) => (
              <div key={f.id} className="row spread">
                <span>{otherName(f, me.uid)} · ждёт ответа</span>
                <button className="btn small" onClick={() => removeFriendship(f.id)}>
                  Отменить
                </button>
              </div>
            ))}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {chatFriendship && <ChatPanel friendship={chatFriendship} onClose={() => setChatWith(null)} />}

      <section className="card">
        <h2>Найти игрока</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ник (минимум 2 символа, с учётом регистра)"
          />
          <button className="btn primary" type="submit">
            Найти
          </button>
        </form>
        {hits && hits.length === 0 && <p className="muted">Никого не найдено</p>}
        {hits?.map((h) => {
          const rel = relationTo(h.uid);
          return (
            <div key={h.uid} className="row spread">
              <Link to={`/profile/${h.uid}`}>{h.name}</Link>
              {!rel && (
                <button className="btn small" onClick={() => add(h)}>
                  Добавить в друзья
                </button>
              )}
              {rel?.status === 'accepted' && <span className="muted">уже друг</span>}
              {rel?.status === 'pending' && <span className="muted">запрос отправлен</span>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
