import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPgn, buildPgnBundle, movetext, pgnDate, pgnFileName, tagValue } from '../src/lib/pgn.ts';

const T = Date.UTC(2026, 9, 24, 12, 0, 0);

test('tagValue: кавычки, слэши и переводы строк', () => {
  assert.equal(tagValue('a"b\\c\nd'), 'a\\"b\\\\c d');
});

test('pgnDate: дата UTC или вопросительные знаки', () => {
  assert.equal(pgnDate(T), '2026.10.24');
  assert.equal(pgnDate(undefined), '????.??.??');
  assert.equal(pgnDate(0), '????.??.??');
});

test('movetext: нумерация, результат и перенос строк', () => {
  assert.equal(movetext(['e4', 'e5', 'Nf3'], '*'), '1. e4 e5 2. Nf3 *');
  assert.equal(movetext([], '1-0'), '1-0');
  const long = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'Nbd7' : 'Nbd2'));
  const out = movetext(long, '1/2-1/2');
  assert.ok(out.split('\n').length > 1);
  assert.ok(out.split('\n').every((l) => l.length <= 80));
  assert.ok(out.endsWith('1/2-1/2'));
  // без переносов получается та же последовательность знаков
  assert.equal(out.replace(/\n/g, ' ').split(' ').filter((t) => t.endsWith('.')).length, 30);
});

test('buildPgn: теги, контроль времени и ходы', () => {
  const pgn = buildPgn({
    moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'],
    white: 'Алишер',
    black: 'Bob "B"',
    whiteRating: 1500,
    blackRating: 1480,
    result: '1-0',
    reason: 'checkmate',
    base: 300,
    inc: 2,
    rated: true,
    category: 'blitz',
    createdAt: T,
    url: 'https://chess.uz/game/abc123',
  });
  assert.match(pgn, /\[Event "chess\.uz: блиц, рейтинговая"\]/);
  assert.match(pgn, /\[Site "https:\/\/chess\.uz\/game\/abc123"\]/);
  assert.match(pgn, /\[Date "2026\.10\.24"\]/);
  assert.match(pgn, /\[White "Алишер"\]/);
  assert.match(pgn, /\[Black "Bob \\"B\\""\]/);
  assert.match(pgn, /\[Result "1-0"\]/);
  assert.match(pgn, /\[WhiteElo "1500"\]/);
  assert.match(pgn, /\[TimeControl "300\+2"\]/);
  assert.match(pgn, /\[Termination "Мат"\]/);
  assert.match(pgn, /\n\n1\. e4 e5 2\. Qh5 Nc6 3\. Bc4 Nf6 4\. Qxf7# 1-0\n$/);
});

test('buildPgn: незаконченная партия и ежедневная', () => {
  const live = buildPgn({ moves: ['d4'], white: 'a', black: 'b', result: null });
  assert.match(live, /\[Result "\*"\]/);
  assert.match(live, /\n\n1\. d4 \*\n$/);
  assert.ok(!live.includes('WhiteElo'));
  const daily = buildPgn({ moves: [], white: 'a', black: 'b', result: '1/2-1/2', base: 86400 * 3, inc: 0, daily: true });
  assert.match(daily, /\[TimeControl "1\/259200"\]/);
  assert.match(daily, /ежедневные/);
});

test('buildPgnBundle: партии разделены пустой строкой', () => {
  const g = { moves: ['e4'], white: 'a', black: 'b', result: null };
  const out = buildPgnBundle([g, g]);
  assert.equal(out.split('[Event ').length - 1, 2);
  assert.ok(out.includes('*\n\n[Event'));
});

test('pgnFileName: безопасное имя файла', () => {
  assert.equal(pgnFileName('Bob', 'Alice', T), 'Bob_vs_Alice_2026-10-24.pgn');
  assert.equal(pgnFileName('Алишер', '../etc/passwd', T), 'player_vs_etc-passwd_2026-10-24.pgn');
  assert.equal(pgnFileName('a'.repeat(50), 'b', undefined), `${'a'.repeat(20)}_vs_b_no-date.pgn`);
});
