// Форум: темы (forumPosts) и ответы (forumPosts/{id}/replies). Проверка текста — в forumLogic.ts.

import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../firebase';
import { FORUM_LIMITS, cleanText, sortPosts, toMillis, validatePost, validateReply } from './forumLogic';
import type { ForumPost } from './forumLogic';
import { logForumDelete } from './moderation';
import type { Staff } from './moderation';
import type { Profile } from './types';

export interface ForumReply {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

function toPost(id: string, d: Record<string, unknown>): ForumPost {
  return {
    id,
    title: String(d.title ?? ''),
    body: String(d.body ?? ''),
    authorId: String(d.authorId ?? ''),
    authorName: String(d.authorName ?? ''),
    replyCount: typeof d.replyCount === 'number' ? d.replyCount : 0,
    createdAt: toMillis(d.createdAt),
    lastReplyAt: d.lastReplyAt ? toMillis(d.lastReplyAt) : null,
  };
}

export async function createPost(me: Profile, title: string, body: string): Promise<string> {
  const err = validatePost(title, body);
  if (err) throw new Error(err);
  const ref = await addDoc(collection(db, 'forumPosts'), {
    authorId: me.uid,
    authorName: me.name,
    title: cleanText(title).replace(/\s+/g, ' '),
    body: cleanText(body),
    replyCount: 0,
    lastReplyAt: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Ответ и счётчик ответов в теме записываются одной пачкой. */
export async function addReply(postId: string, me: Profile, text: string): Promise<void> {
  const err = validateReply(text);
  if (err) throw new Error(err);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'forumPosts', postId, 'replies')), {
    authorId: me.uid,
    authorName: me.name,
    text: cleanText(text),
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'forumPosts', postId), { replyCount: increment(1), lastReplyAt: serverTimestamp() });
  await batch.commit();
}

/**
 * Удаление темы. Автор удаляет только саму тему; сотрудник удаляет вместе с ответами
 * и оставляет запись в журнале модерации.
 */
export async function deletePost(post: ForumPost, staff: Staff | null): Promise<void> {
  if (staff) {
    const replies = await getDocs(collection(db, 'forumPosts', post.id, 'replies'));
    const batch = writeBatch(db);
    replies.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'forumPosts', post.id));
    await batch.commit();
    if (post.authorId !== staff.uid) {
      await logForumDelete(staff, { uid: post.authorId, name: post.authorName }, post.title);
    }
    return;
  }
  await deleteDoc(doc(db, 'forumPosts', post.id));
}

export async function deleteReply(postId: string, reply: ForumReply, staff: Staff | null): Promise<void> {
  await deleteDoc(doc(db, 'forumPosts', postId, 'replies', reply.id));
  if (staff && reply.authorId !== staff.uid) {
    await logForumDelete(staff, { uid: reply.authorId, name: reply.authorName }, reply.text);
  }
}

export function usePosts(): { posts: ForumPost[]; loading: boolean; error: string } {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(
      query(collection(db, 'forumPosts'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        setPosts(sortPosts(snap.docs.map((d) => toPost(d.id, d.data()))));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);
  return { posts, loading, error };
}

/** undefined — загрузка, null — тема не найдена. */
export function usePost(id: string): ForumPost | null | undefined {
  const [post, setPost] = useState<ForumPost | null | undefined>(undefined);
  useEffect(() => {
    setPost(undefined);
    if (!firebaseConfigured) return;
    return onSnapshot(
      doc(db, 'forumPosts', id),
      (s) => setPost(s.exists() ? toPost(s.id, s.data()) : null),
      () => setPost(null),
    );
  }, [id]);
  return post;
}

export function useReplies(id: string): ForumReply[] {
  const [list, setList] = useState<ForumReply[]>([]);
  useEffect(() => {
    setList([]);
    if (!firebaseConfigured) return;
    return onSnapshot(
      query(collection(db, 'forumPosts', id, 'replies'), orderBy('createdAt', 'asc'), limit(300)),
      (snap) =>
        setList(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              authorId: String(x.authorId ?? ''),
              authorName: String(x.authorName ?? ''),
              text: String(x.text ?? ''),
              createdAt: toMillis(x.createdAt),
            };
          }),
        ),
      (e) => console.error('forum replies', e),
    );
  }, [id]);
  return list;
}

export { FORUM_LIMITS };
