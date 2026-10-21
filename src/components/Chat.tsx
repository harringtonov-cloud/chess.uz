import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { sendChat } from '../lib/games';
import { useModeration } from '../ModerationContext';
import { deleteGameChatMessage } from '../lib/moderation';
import type { Profile } from '../lib/types';

interface Msg {
  id: string;
  uid: string;
  name: string;
  text: string;
}

const QUICK = ['👍', '😀', '😮', '🤝', 'gg', 'gl hf'];

export default function Chat({ gameId, profile }: { gameId: string; profile: Profile | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);
  const { staff, muted } = useModeration();

  useEffect(() => {
    const q = query(collection(db, 'games', gameId, 'chat'), orderBy('createdAt', 'asc'), limit(100));
    return onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, 'id'>) })));
    });
  }, [gameId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs.length]);

  async function send(t: string) {
    const value = t.trim();
    if (!value || !profile) return;
    setText('');
    try {
      await sendChat(gameId, profile, value);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="chat">
      <div className="chat-log">
        {msgs.map((m) => (
          <div key={m.id} className={m.uid === profile?.uid ? 'me' : ''}>
            <b>{m.name}:</b> {m.text}
            {staff && (
              <button
                className="btn small ghost"
                title="Удалить сообщение (модерация)"
                onClick={() =>
                  deleteGameChatMessage(staff, gameId, m.id, { uid: m.uid, name: m.name }, m.text).catch((e) =>
                    console.error(e),
                  )
                }
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {profile && muted ? (
        <div className="muted">🔇 Вам отключён чат. Подробности вверху страницы.</div>
      ) : profile ? (
        <>
          <div className="quick">
            {QUICK.map((q) => (
              <button key={q} className="btn small" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              placeholder="Сообщение…"
            />
          </form>
        </>
      ) : (
        <div className="muted">Войдите, чтобы писать в чат</div>
      )}
    </div>
  );
}
