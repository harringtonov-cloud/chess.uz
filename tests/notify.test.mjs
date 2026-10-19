import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PREFS,
  KIND_INFO,
  KIND_ORDER,
  clip,
  isEnabled,
  normalizeNotification,
  notificationId,
  parsePrefs,
  safeLink,
  timeAgo,
  toggleKind,
  unreadCount,
  visible,
} from '../src/lib/notifyLogic.ts';

test('настройки: мусор и пустота дают значения по умолчанию', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('не json'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('42'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('null'), DEFAULT_PREFS);
});

test('настройки: неизвестные и обязательные типы не могут быть отключены', () => {
  const p = parsePrefs(JSON.stringify({ muted: ['message', 'message', 'system', 'moderation', 'левое'], browser: true, sound: false }));
  assert.deepEqual(p.muted, ['message']);
  assert.equal(p.browser, true);
  assert.equal(p.sound, false);
});

test('toggleKind включает и выключает, но не трогает обязательные типы', () => {
  let p = toggleKind(DEFAULT_PREFS, 'message');
  assert.equal(isEnabled(p, 'message'), false);
  p = toggleKind(p, 'message');
  assert.equal(isEnabled(p, 'message'), true);
  assert.equal(toggleKind(DEFAULT_PREFS, 'moderation'), DEFAULT_PREFS);
  assert.equal(toggleKind(DEFAULT_PREFS, 'system'), DEFAULT_PREFS);
});

test('у каждого типа есть значок и подпись', () => {
  for (const k of KIND_ORDER) {
    assert.ok(KIND_INFO[k].icon.length > 0, k);
    assert.ok(KIND_INFO[k].label.length > 0, k);
  }
});

test('notificationId: одно событие — один идентификатор, разные отправители — разные', () => {
  assert.equal(notificationId('message', 'abc'), 'message_abc');
  assert.equal(notificationId('your_turn', 'abc', 'game1'), 'your_turn_abc_game1');
  assert.equal(notificationId('message', 'abc'), notificationId('message', 'abc'));
  assert.notEqual(notificationId('message', 'abc'), notificationId('message', 'xyz'));
});

test('notificationId: убирает лишние символы и не бывает слишком длинным', () => {
  const id = notificationId('message', 'a/b c!d', '../x');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(id), id);
  assert.ok(notificationId('message', 'x'.repeat(200), 'y'.repeat(200)).length <= 100);
});

test('clip: короткий текст не меняется, длинный режется по слову с многоточием', () => {
  assert.equal(clip('привет', 20), 'привет');
  assert.equal(clip('  много   пробелов  ', 30), 'много пробелов');
  const c = clip('это довольно длинное сообщение для проверки обрезки', 30);
  assert.ok(c.length <= 30, c);
  assert.ok(c.endsWith('…'));
  assert.equal(clip('a'.repeat(100), 10).length, 10);
});

test('normalizeNotification: отбрасывает неизвестные типы и чинит пустые поля', () => {
  assert.equal(normalizeNotification('x', { kind: 'левое' }), null);
  const n = normalizeNotification('id1', { kind: 'message', title: 'Т', read: true, createdAt: { toMillis: () => 5000 } });
  assert.deepEqual(n, { id: 'id1', kind: 'message', fromUid: '', fromName: '', title: 'Т', body: '', link: '', read: true, at: 5000 });
  const pending = normalizeNotification('id2', { kind: 'system', createdAt: null });
  assert.equal(pending.at, 0);
  assert.equal(pending.read, false);
});

test('visible и unreadCount учитывают настройки', () => {
  const mk = (id, kind, read) => ({ id, kind, fromUid: '', fromName: '', title: '', body: '', link: '', read, at: 1 });
  const items = [mk('1', 'message', false), mk('2', 'friend_request', false), mk('3', 'message', true)];
  const prefs = toggleKind(DEFAULT_PREFS, 'message');
  const v = visible(items, prefs);
  assert.deepEqual(v.map((i) => i.id), ['2']);
  assert.equal(unreadCount(v), 1);
  assert.equal(unreadCount(items), 2);
});

test('timeAgo: понятные подписи', () => {
  const now = new Date(2026, 9, 19, 12, 0, 0).getTime();
  assert.equal(timeAgo(0, now), 'только что');
  assert.equal(timeAgo(now - 30_000, now), 'только что');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5 мин назад');
  assert.equal(timeAgo(now - 3 * 3600_000, now), '3 ч назад');
  assert.equal(timeAgo(now - 30 * 3600_000, now), 'вчера');
  assert.equal(timeAgo(now - 3 * 86400_000, now), '3 дн назад');
  assert.equal(timeAgo(new Date(2026, 8, 5, 10, 0, 0).getTime(), now), '05.09');
  assert.equal(timeAgo(now + 10_000, now), 'только что'); // часы клиента и сервера могут расходиться
});

test('safeLink пропускает только пути внутри сайта', () => {
  assert.equal(safeLink('/game/abc123'), '/game/abc123');
  assert.equal(safeLink('/profile/u1?x=1'), '/profile/u1?x=1');
  assert.equal(safeLink('https://evil.example'), '/notifications');
  assert.equal(safeLink('//evil.example'), '/notifications');
  assert.equal(safeLink('javascript:alert(1)'), '/notifications');
  assert.equal(safeLink(''), '/notifications');
});
