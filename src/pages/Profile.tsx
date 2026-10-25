import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { useAuth } from '../AuthContext';
import { resultText } from '../lib/chessUtil';
import { CATEGORY_LABEL, tcLabel } from '../lib/timeControls';
import {
  acceptFriendRequest,
  blockUser,
  pairId,
  removeFriendship,
  sendFriendRequest,
  unblockUser,
  useBlocks,
  useFriendships,
} from '../lib/social';
import { fetchPlayerGames } from '../lib/playerGames';
import { ratingView } from '../lib/glicko2';
import ProfileExtras from '../components/ProfileExtras';
import { downloadText } from '../lib/download';
import { gamesPgn } from '../lib/gamePgn';
import ReportButton from '../components/ReportButton';
import { useModeration } from '../ModerationContext';
import type { GameDoc, Profile as ProfileDoc } from '../lib/types';

/** Рейтинг с пометкой «?», пока он ещё уточняется (Glicko-2: большая неопределённость). */
function RatingText({ p, c }: { p: ProfileDoc; c: 'bullet' | 'blitz' | 'rapid' | 'classical' }) {
  const v = ratingView(p.ratings?.[c] ?? 1200, p.glicko?.[c], p.stats?.games ?? 0);
  return (
    <b title={`Неопределённость рейтинга: ±${v.rd}${v.provisional ? ' (рейтинг ещё уточняется)' : ''}`}>
      {v.rating}
      {v.provisional && '?'}
    </b>
  );
}

export default function Profile() {
  const { uid = '' } = useParams();
  const { user, profile: me } = useAuth();
  const [p, setP] = useState<ProfileDoc | null | undefined>(undefined);
  const [games, setGames] = useState<{ id: string; g: GameDoc }[]>([]);
  const [gamesError, setGamesError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [saved, setSaved] = useState(false);
  const friendships = useFriendships(user?.uid);
  const [friendError, setFriendError] = useState('');
  const blocks = useBlocks(user?.uid);
  const { role } = useModeration();

  const isMe = user?.uid === uid;
  const shown = isMe && me ? me : p;

  useEffect(() => {
    if (!firebaseConfigured) return;
    setP(undefined);
    getDoc(doc(db, 'users', uid))
      .then((s) => setP(s.exists() ? ({ ...(s.data() as ProfileDoc), uid }) : null))
      .catch(() => setP(null));
    fetchPlayerGames(uid, 100)
      .then(setGames)
      .catch((e: Error) => setGamesError(e.message));
  }, [uid]);

  if (!firebaseConfigured) return <div className="card">Профили доступны после подключения Firebase.</div>;
  if (shown === undefined) return <div className="card">Загрузка…</div>;
  if (shown === null) return <div className="card">Игрок не найден.</div>;

  async function save() {
    await updateDoc(doc(db, 'users', uid), {
      name: name.trim().slice(0, 24) || shown!.name,
      bio: bio.slice(0, 200),
      country: country.slice(0, 2).toUpperCase(),
    });
    setEditing(false);
    setSaved(true);
  }

  const relation = user ? friendships.find((f) => f.id === pairId(user.uid, uid)) : undefined;

  async function friendAction() {
    setFriendError('');
    try {
      if (!me || !shown) return;
      if (!relation) await sendFriendRequest(me, { uid, name: shown.name });
      else if (relation.status === 'pending' && relation.requester !== me.uid) await acceptFriendRequest(relation, me);
      else await removeFriendship(relation.id);
    } catch (e) {
      const msg = (e as Error).message;
      setFriendError(
        msg.includes('permission') ? 'Не получилось: возможно, игрок ограничил запросы в друзья.' : msg,
      );
    }
  }

  const blocked = blocks.some((b) => b.uid === uid);

  async function toggleBlock() {
    setFriendError('');
    try {
      if (!me || !shown) return;
      if (blocked) await unblockUser(me.uid, uid);
      else if (window.confirm(`Заблокировать ${shown.name}? Игрок не сможет писать вам запросы, приглашения и уведомления.`))
        await blockUser(me, { uid, name: shown.name });
    } catch (e) {
      setFriendError((e as Error).message);
    }
  }

  let friendLabel = 'Добавить в друзья';
  if (relation?.status === 'accepted') friendLabel = 'Удалить из друзей';
  else if (relation && relation.requester === me?.uid) friendLabel = 'Отменить запрос';
  else if (relation) friendLabel = 'Принять запрос в друзья';

  const flag = (code: string) =>
    code.length === 2
      ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
      : '';

  return (
    <div className="profile">
      <div className="card">
        <div className="row spread">
          <h2>
            {flag(shown.country)} {shown.name}
          </h2>
          {!isMe && me && (
            <span className="row">
              {!blocked && (
                <button className="btn small" onClick={friendAction}>
                  {friendLabel}
                </button>
              )}
              <button className="btn small ghost" onClick={toggleBlock} title="Чёрный список">
                {blocked ? 'Разблокировать' : '🚫 Заблокировать'}
              </button>
              <ReportButton target={{ uid, name: shown.name }} />
              {role && (
                <Link className="btn small ghost" to={`/admin?player=${uid}`} title="Открыть в панели модерации">
                  🛡
                </Link>
              )}
            </span>
          )}
          {isMe && !editing && (
            <button
              className="btn small"
              onClick={() => {
                setName(shown.name);
                setBio(shown.bio ?? '');
                setCountry(shown.country ?? '');
                setEditing(true);
              }}
            >
              Редактировать
            </button>
          )}
        </div>
        {friendError && <p className="error">{friendError}</p>}
        {editing ? (
          <div className="form">
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Ник" />
            <input
              value={country}
              maxLength={2}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Код страны, например UZ"
            />
            <textarea value={bio} maxLength={200} onChange={(e) => setBio(e.target.value)} placeholder="О себе" />
            <div className="row">
              <button className="btn primary" onClick={save}>Сохранить</button>
              <button className="btn" onClick={() => setEditing(false)}>Отмена</button>
            </div>
          </div>
        ) : (
          <>
            {shown.bio && <p>{shown.bio}</p>}
            {saved && <p className="muted">Сохранено ✓</p>}
          </>
        )}
        <div className="ratings">
          {(['bullet', 'blitz', 'rapid', 'classical'] as const).map((c) => (
            <div key={c} className="rating-box">
              <span className="muted">{CATEGORY_LABEL[c]}</span>
              <RatingText p={shown} c={c} />
            </div>
          ))}
          <div className="rating-box">
            <span className="muted">Головоломки</span>
            <b>{shown.ratings?.puzzle ?? 1200}</b>
          </div>
        </div>
        <p className="muted small-note">
          Рейтинг считается по системе Glicko-2. Знак «?» значит, что рейтинг ещё уточняется (мало партий или давно не играли);
          наведите на число, чтобы увидеть точность ±.
        </p>
        <div className="muted">
          Партий: {shown.stats?.games ?? 0} · побед {shown.stats?.wins ?? 0} · ничьих {shown.stats?.draws ?? 0} ·
          поражений {shown.stats?.losses ?? 0}
        </div>
      </div>

      <ProfileExtras profile={shown} games={games} />

      <div className="card">
        <div className="row spread">
          <h3>Последние партии</h3>
          {games.filter(({ g }) => g.moves.length > 0 && g.status !== 'waiting').length > 0 && (
            <button
              className="btn small"
              onClick={() =>
                downloadText(
                  `chess-uz_${shown.name.replace(/[^A-Za-z0-9]+/g, '-') || 'player'}_games.pgn`,
                  gamesPgn(games.filter(({ g }) => g.moves.length > 0 && g.status !== 'waiting')),
                )
              }
            >
              ⬇ Скачать все (PGN)
            </button>
          )}
        </div>
        {gamesError && (
          <p className="error">
            {gamesError.includes('index')
              ? 'Нужен индекс Firestore: выполните `firebase deploy --only firestore:indexes` (см. README).'
              : gamesError}
          </p>
        )}
        {games.length === 0 && !gamesError && <p className="muted">Партий пока нет</p>}
        <table className="table">
          <tbody>
            {games
              .filter(({ g }) => g.status !== 'waiting')
              .slice(0, 20)
              .map(({ id, g }) => (
                <tr key={id}>
                  <td>
                    <Link to={`/game/${id}`}>
                      {g.whiteName} — {g.blackName}
                    </Link>
                  </td>
                  <td>{tcLabel({ base: g.base, inc: g.inc })}</td>
                  <td>{g.status === 'finished' ? resultText(g.result, g.reason) : 'идёт'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
