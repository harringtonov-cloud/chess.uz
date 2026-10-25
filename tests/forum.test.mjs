import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  POST_COOLDOWN,
  activityAt,
  canDelete,
  cleanText,
  cooldownLeft,
  repliesWord,
  snippet,
  sortPosts,
  toMillis,
  validatePost,
  validateReply,
} from '../src/lib/forumLogic.ts';

test('cleanText: лишние пробелы и пустые строки', () => {
  assert.equal(cleanText('  привет  \r\n\r\n\r\n\r\nмир \n'), 'привет\n\nмир');
  assert.equal(cleanText(''), '');
});

test('validatePost: границы заголовка и текста', () => {
  assert.equal(validatePost('Как играть Найдорф?', 'Подскажите план'), null);
  assert.match(validatePost('ab', 'текст'), /Заголовок/);
  assert.match(validatePost('x'.repeat(101), 'текст'), /Заголовок/);
  assert.match(validatePost('Заголовок', '   \n  '), /текст/);
  assert.match(validatePost('Заголовок', 'я'.repeat(2001)), /2000/);
  assert.equal(validatePost('Заголовок', 'я'.repeat(2000)), null);
  // пробелы по краям не считаются
  assert.match(validatePost('  a  ', 'текст'), /Заголовок/);
});

test('validateReply: пустой и слишком длинный ответ', () => {
  assert.equal(validateReply('Спасибо!'), null);
  assert.match(validateReply('  \n '), /Напишите/);
  assert.match(validateReply('я'.repeat(1001)), /1000/);
});

test('cooldownLeft: сколько ещё ждать', () => {
  assert.equal(cooldownLeft(null, 1000, POST_COOLDOWN), 0);
  assert.equal(cooldownLeft(1000, 11_000, POST_COOLDOWN), POST_COOLDOWN - 10_000);
  assert.equal(cooldownLeft(1000, 1000 + POST_COOLDOWN, POST_COOLDOWN), 0);
  assert.equal(cooldownLeft(1000, 999_999, POST_COOLDOWN), 0);
});

test('sortPosts: по последней активности, при равенстве — новее создана', () => {
  const posts = [
    { id: 'old', createdAt: 100, lastReplyAt: null },
    { id: 'replied', createdAt: 50, lastReplyAt: 500 },
    { id: 'new', createdAt: 300, lastReplyAt: null },
    { id: 'tie', createdAt: 400, lastReplyAt: 300 },
  ];
  assert.deepEqual(sortPosts(posts).map((p) => p.id), ['replied', 'tie', 'new', 'old']);
  assert.equal(activityAt(posts[1]), 500);
  assert.equal(activityAt(posts[0]), 100);
  assert.equal(posts[0].id, 'old'); // исходный массив не меняется
});

test('snippet: одна строка и многоточие', () => {
  assert.equal(snippet('короткий\n\nтекст'), 'короткий текст');
  const s = snippet('слово '.repeat(50), 20);
  assert.ok(s.length <= 20 && s.endsWith('…'));
});

test('toMillis: число, Timestamp и «ещё не записано»', () => {
  assert.equal(toMillis(5), 5);
  assert.equal(toMillis({ toMillis: () => 42 }), 42);
  assert.equal(toMillis(null), 0);
  assert.equal(toMillis(undefined), 0);
});

test('canDelete: автор или сотрудник, гость — нет', () => {
  assert.equal(canDelete('a', 'a', false), true);
  assert.equal(canDelete('a', 'b', false), false);
  assert.equal(canDelete('a', 'b', true), true);
  assert.equal(canDelete('a', null, true), false);
});

test('repliesWord: правильные окончания', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 21, 22, 25, 111].map(repliesWord), [
    '0 ответов', '1 ответ', '2 ответа', '4 ответа', '5 ответов', '11 ответов', '12 ответов',
    '21 ответ', '22 ответа', '25 ответов', '111 ответов',
  ]);
});
