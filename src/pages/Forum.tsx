import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { createPost, usePosts } from '../lib/forum';
import {
  FORUM_LIMITS,
  POST_COOLDOWN,
  activityAt,
  cooldownLeft,
  repliesWord,
  snippet,
} from '../lib/forumLogic';
import { timeAgo } from '../lib/notifyLogic';
import { useModeration } from '../ModerationContext';

let lastPostAt: number | null = null; // пока открыта вкладка: защита от повторной отправки подряд

export default function Forum() {
  const { profile, loading: authLoading } = useAuth();
  const { muted, sanction } = useModeration();
  const nav = useNavigate();
  const { posts, loading, error } = usePosts();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  if (!firebaseConfigured) return <div className="card">Форум доступен после подключения Firebase.</div>;

  async function create() {
    if (!profile) return nav('/login');
    const wait = cooldownLeft(lastPostAt, Date.now(), POST_COOLDOWN);
    if (wait > 0) {
      setFormError(`Подождите ещё ${Math.ceil(wait / 1000)} с перед новой темой`);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const id = await createPost(profile, title, body);
      lastPostAt = Date.now();
      nav(`/forum/${id}`);
    } catch (e) {
      const msg = (e as Error).message;
      setFormError(msg.includes('permission') ? 'Не удалось опубликовать тему. Возможно, вам отключён чат.' : msg);
      setBusy(false);
    }
  }

  return (
    <div className="clubs-page">
      <section className="card">
        <div className="row spread">
          <h2>Форум</h2>
          {!showForm && (
            <button className="btn primary" onClick={() => (profile ? setShowForm(true) : nav('/login'))}>
              + Новая тема
            </button>
          )}
        </div>
        <p className="muted">Обсуждайте партии, дебюты и сайт. Будьте вежливы: за оскорбления и спам действуют санкции.</p>
        {profile && muted && (
          <p className="notice">🔇 Вам отключён чат{sanction ? ` (${sanction.reason})` : ''}: писать на форуме нельзя.</p>
        )}
        {showForm && !muted && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              placeholder="Заголовок (3–100 знаков)"
              value={title}
              maxLength={FORUM_LIMITS.titleMax}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              rows={6}
              placeholder="Текст темы"
              value={body}
              maxLength={FORUM_LIMITS.bodyMax}
              onChange={(e) => setBody(e.target.value)}
              required
            />
            <div className="row">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Публикую…' : 'Опубликовать'}
              </button>
              <button className="btn" type="button" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <span className="muted">{body.length}/{FORUM_LIMITS.bodyMax}</span>
            </div>
            {formError && <p className="error">{formError}</p>}
          </form>
        )}
        {!authLoading && !profile && (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы создавать темы и отвечать.
          </p>
        )}
      </section>

      <section className="card">
        {loading && <p className="muted">Загрузка…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && posts.length === 0 && <p className="muted">Тем пока нет — напишите первую.</p>}
        {posts.map((p) => (
          <div key={p.id} className="club-row">
            <div>
              <Link to={`/forum/${p.id}`}>
                <b>{p.title}</b>
              </Link>
              <div className="muted">
                {p.authorName} · {timeAgo(activityAt(p), now)} · {repliesWord(p.replyCount)}
              </div>
              <div className="muted club-desc">{snippet(p.body)}</div>
            </div>
            <Link className="btn small" to={`/forum/${p.id}`}>
              Открыть
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
