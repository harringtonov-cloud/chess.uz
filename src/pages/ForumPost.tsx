import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { addReply, deletePost, deleteReply, usePost, useReplies } from '../lib/forum';
import { FORUM_LIMITS, REPLY_COOLDOWN, canDelete, cooldownLeft, repliesWord } from '../lib/forumLogic';
import { timeAgo } from '../lib/notifyLogic';
import { useModeration } from '../ModerationContext';

let lastReplyAt: number | null = null;

export default function ForumPostPage() {
  const { id = '' } = useParams();
  const { profile, user, loading: authLoading } = useAuth();
  const { staff, muted, sanction } = useModeration();
  const nav = useNavigate();
  const post = usePost(id);
  const replies = useReplies(id);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  if (!firebaseConfigured) return <div className="card">Форум доступен после подключения Firebase.</div>;
  if (post === undefined) return <div className="card">Загрузка…</div>;
  if (post === null) {
    return (
      <div className="card">
        Тема не найдена или удалена. <Link to="/forum">Ко всем темам</Link>
      </div>
    );
  }
  const current = post;
  const isStaff = Boolean(staff);

  async function send() {
    if (!profile) return;
    const wait = cooldownLeft(lastReplyAt, Date.now(), REPLY_COOLDOWN);
    if (wait > 0) {
      setError(`Подождите ещё ${Math.ceil(wait / 1000)} с`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await addReply(id, profile, text);
      lastReplyAt = Date.now();
      setText('');
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('permission') ? 'Не удалось отправить ответ. Возможно, вам отключён чат.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="club-page">
      <section className="card">
        <div className="row spread">
          <h2>{current.title}</h2>
          <Link className="btn small ghost" to="/forum">
            ← Все темы
          </Link>
        </div>
        <div className="muted">
          <Link to={`/profile/${current.authorId}`}>{current.authorName}</Link> · {timeAgo(current.createdAt, now)} ·{' '}
          {repliesWord(current.replyCount)}
        </div>
        <p className="forum-text">{current.body}</p>
        {canDelete(current.authorId, user?.uid, isStaff) && (
          <button
            className="btn small ghost"
            onClick={() => {
              if (!window.confirm('Удалить тему?')) return;
              deletePost(current, staff)
                .then(() => nav('/forum'))
                .catch((e: Error) => setError(e.message));
            }}
          >
            🗑 Удалить тему
          </button>
        )}
      </section>

      <section className="card">
        <h3>Ответы</h3>
        {replies.length === 0 && <p className="muted">Ответов пока нет.</p>}
        {replies.map((r) => (
          <div key={r.id} className="forum-reply">
            <div className="muted">
              <Link to={`/profile/${r.authorId}`}>{r.authorName}</Link> · {timeAgo(r.createdAt, now)}
              {canDelete(r.authorId, user?.uid, isStaff) && (
                <button
                  className="btn small ghost"
                  title="Удалить ответ"
                  onClick={() => deleteReply(id, r, staff).catch((e: Error) => setError(e.message))}
                >
                  ✕
                </button>
              )}
            </div>
            <p className="forum-text">{r.text}</p>
          </div>
        ))}
      </section>

      <section className="card">
        {!authLoading && !profile && (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы отвечать.
          </p>
        )}
        {profile && muted && (
          <p className="notice">🔇 Вам отключён чат{sanction ? ` (${sanction.reason})` : ''}: отвечать нельзя.</p>
        )}
        {profile && !muted && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              rows={4}
              placeholder="Ваш ответ"
              value={text}
              maxLength={FORUM_LIMITS.replyMax}
              onChange={(e) => setText(e.target.value)}
              required
            />
            <div className="row">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Отправляю…' : 'Ответить'}
              </button>
              <span className="muted">{text.length}/{FORUM_LIMITS.replyMax}</span>
            </div>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
