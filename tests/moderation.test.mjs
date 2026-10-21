import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DURATIONS,
  PERMANENT_UNTIL,
  allowedDurations,
  filterReports,
  groupByTarget,
  isActive,
  isPermanent,
  matchesPlayer,
  normalizeAnnouncement,
  normalizeLog,
  normalizeReport,
  normalizeRole,
  normalizeSanction,
  remainingText,
  reportDocId,
  reportStats,
  restrictions,
  untilFor,
  validateReport,
} from '../src/lib/moderationLogic.ts';

const ts = (ms) => ({ toMillis: () => ms });
const rep = (over = {}) =>
  normalizeReport(over.id ?? 'r1', {
    reporterUid: 'a',
    reporterName: 'Аня',
    targetUid: 'b',
    targetName: 'Борис',
    reason: 'cheating',
    status: 'open',
    createdAt: ts(1000),
    ...over,
  });

test('роль берётся только из admin или moderator', () => {
  assert.equal(normalizeRole({ role: 'admin' }), 'admin');
  assert.equal(normalizeRole({ role: 'moderator' }), 'moderator');
  assert.equal(normalizeRole({ role: 'root' }), null);
  assert.equal(normalizeRole(null), null);
  assert.equal(normalizeRole('admin'), null);
});

test('проверка жалобы: себя, причина, длина, «другое»', () => {
  const ok = { reporterUid: 'a', targetUid: 'b', reason: 'abuse', details: '' };
  assert.equal(validateReport(ok), null);
  assert.match(validateReport({ ...ok, reporterUid: '' }), /Войдите/);
  assert.match(validateReport({ ...ok, targetUid: 'a' }), /самого себя/);
  assert.match(validateReport({ ...ok, reason: 'xx' }), /причину/);
  assert.match(validateReport({ ...ok, details: 'x'.repeat(501) }), /500/);
  assert.match(validateReport({ ...ok, reason: 'other', details: 'мало' }), /двух словах/);
  assert.equal(validateReport({ ...ok, reason: 'other', details: 'подробное описание' }), null);
});

test('идентификатор жалобы стабилен и чист', () => {
  assert.equal(reportDocId('a', 'b'), 'a_b_profile');
  assert.equal(reportDocId('a', 'b', 'g1'), 'a_b_g1');
  assert.equal(reportDocId('a/../x', 'b', 'g 1'), 'ax_b_g1');
});

test('нормализация жалобы: плохая причина отбрасывается, статус по умолчанию open', () => {
  assert.equal(normalizeReport('x', { reason: 'bogus' }), null);
  const r = normalizeReport('x', { reason: 'spam', status: 'weird', action: 'ban' });
  assert.equal(r.status, 'open');
  assert.equal(r.action, 'ban');
  assert.equal(r.targetName, 'Игрок');
  assert.equal(r.createdAt, 0);
});

test('фильтр жалоб по статусу, причине и нику', () => {
  const list = [
    rep({ id: '1' }),
    rep({ id: '2', reason: 'spam', status: 'resolved' }),
    rep({ id: '3', targetName: 'Виктор', reporterName: 'Дима' }),
  ];
  const all = { status: 'all', reason: 'all', query: '' };
  assert.equal(filterReports(list, all).length, 3);
  assert.deepEqual(filterReports(list, { ...all, status: 'open' }).map((r) => r.id), ['1', '3']);
  assert.deepEqual(filterReports(list, { ...all, reason: 'spam' }).map((r) => r.id), ['2']);
  assert.deepEqual(filterReports(list, { ...all, query: 'вик' }).map((r) => r.id), ['3']);
  assert.deepEqual(filterReports(list, { ...all, query: 'ДИМА' }).map((r) => r.id), ['3']);
});

test('группировка по игроку: больше жалоб выше, при равенстве — старее выше', () => {
  const list = [
    rep({ id: '1', targetUid: 'x', targetName: 'X', createdAt: ts(500) }),
    rep({ id: '2', targetUid: 'y', targetName: 'Y', createdAt: ts(100) }),
    rep({ id: '3', targetUid: 'z', targetName: 'Z', createdAt: ts(900) }),
    rep({ id: '4', targetUid: 'z', targetName: 'Z', createdAt: ts(950) }),
  ];
  assert.deepEqual(groupByTarget(list).map((g) => g.targetUid), ['z', 'y', 'x']);
  assert.equal(groupByTarget(list)[0].reports.length, 2);
});

test('статистика жалоб', () => {
  const s = reportStats([
    rep({ id: '1' }),
    rep({ id: '2', status: 'resolved' }),
    rep({ id: '3', status: 'dismissed', reason: 'spam' }),
  ]);
  assert.equal(s.open, 1);
  assert.equal(s.resolved, 1);
  assert.equal(s.dismissed, 1);
  assert.equal(s.byReason.cheating, 2);
  assert.equal(s.byReason.spam, 1);
  assert.equal(s.byReason.other, 0);
});

test('сроки: модератор без «навсегда», администратор со всеми', () => {
  assert.equal(allowedDurations('admin').length, DURATIONS.length);
  assert.ok(!allowedDurations('moderator').some((d) => d.id === 'perm'));
  assert.deepEqual(allowedDurations(null), []);
  assert.equal(untilFor('1d', 1000), 1000 + 86_400_000);
  assert.equal(untilFor('perm', 1000), PERMANENT_UNTIL);
  assert.throws(() => untilFor('week', 0));
});

test('санкция действует до конца срока; бан запрещает всё, мьют — чаты', () => {
  const ban = normalizeSanction('u', { type: 'ban', until: ts(2000), reason: 'читы' });
  const mute = normalizeSanction('u', { type: 'mute', until: ts(2000) });
  assert.equal(normalizeSanction('u', { type: 'warn' }), null);
  assert.equal(isActive(ban, 1999), true);
  assert.equal(isActive(ban, 2000), false);
  assert.equal(isActive(null, 0), false);
  assert.deepEqual(restrictions(ban, 1000), { banned: true, muted: true });
  assert.deepEqual(restrictions(mute, 1000), { banned: false, muted: true });
  assert.deepEqual(restrictions(ban, 5000), { banned: false, muted: false });
  assert.equal(isPermanent({ until: PERMANENT_UNTIL }), true);
  assert.equal(isPermanent(ban), false);
});

test('оставшееся время по-русски', () => {
  const now = 0;
  assert.equal(remainingText(PERMANENT_UNTIL, now), 'навсегда');
  assert.equal(remainingText(10_000, now), 'ещё 1 мин');
  assert.equal(remainingText(30 * 60_000, now), 'ещё 30 мин');
  assert.equal(remainingText(5 * 3600_000, now), 'ещё 5 ч');
  assert.equal(remainingText(3 * 86_400_000, now), 'ещё 3 дн');
});

test('журнал и объявление нормализуются, мусор отбрасывается', () => {
  assert.equal(normalizeLog('1', { kind: 'nope' }), null);
  const l = normalizeLog('1', { kind: 'ban', by: 'm', createdAt: ts(7) });
  assert.equal(l.byName, 'Сотрудник');
  assert.equal(l.at, 7);
  assert.equal(normalizeAnnouncement(undefined), null);
  assert.equal(normalizeAnnouncement({ active: false, text: 'x' }), null);
  assert.equal(normalizeAnnouncement({ active: true, text: '  ' }), null);
  assert.deepEqual(normalizeAnnouncement({ active: true, text: 'Привет', level: 'warning' }), {
    text: 'Привет',
    level: 'warning',
    active: true,
  });
  assert.equal(normalizeAnnouncement({ active: true, text: 'x'.repeat(300) }).text.length, 200);
});

test('поиск игрока по части ника без учёта регистра', () => {
  assert.equal(matchesPlayer('Магнус', 'гну'), true);
  assert.equal(matchesPlayer('Магнус', '  '), false);
  assert.equal(matchesPlayer('Магнус', 'xyz'), false);
});
