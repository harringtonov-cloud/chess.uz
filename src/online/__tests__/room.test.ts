import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clocksRunning,
  colorOf,
  describeResult,
  gameFromMoves,
  newRoom,
  planAbandon,
  planClaimDraw,
  planDrawAccept,
  planDrawDecline,
  planDrawOffer,
  planFlag,
  planMove,
  planResign,
  remainingMs,
  turnOf,
  type Room,
} from '../room.ts'

function playing(over: Partial<Room> = {}): Room {
  return { ...newRoom({ tcId: 'blitz5', baseMs: 300_000, incMs: 2000, color: 'w', uid: 'A', name: 'A' }), black: 'B', blackName: 'B', status: 'playing', ...over }
}

function apply(room: Room, uci: string, elapsed = 0): Room {
  const color = turnOf(room)
  const plan = planMove(room, uci, color, elapsed)
  assert.ok(plan.ok, plan.ok ? '' : plan.error)
  return { ...room, ...plan.patch } as Room
}

test('newRoom: создатель занимает выбранное место', () => {
  const w = newRoom({ tcId: 'x', baseMs: 0, incMs: 0, color: 'w', uid: 'A', name: 'A', isPublic: false })
  assert.equal(w.white, 'A')
  assert.equal(w.black, null)
  const b = newRoom({ tcId: 'x', baseMs: 0, incMs: 0, color: 'b', uid: 'A', name: 'A', isPublic: true })
  assert.equal(b.black, 'A')
  assert.equal(b.white, null)
  assert.equal(colorOf(b, 'A'), 'b')
  assert.equal(colorOf(b, 'Z'), null)
})

test('ход не в свою очередь и нелегальный ход отклоняются', () => {
  const r = playing()
  const wrong = planMove(r, 'e7e5', 'b', 0)
  assert.equal(wrong.ok, false)
  const illegal = planMove(r, 'e2e5', 'w', 0)
  assert.equal(illegal.ok, false)
  const waiting = planMove({ ...r, status: 'waiting' }, 'e2e4', 'w', 0)
  assert.equal(waiting.ok, false)
})

test('детский мат завершает партию', () => {
  let r = playing({ baseMs: 0 })
  for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) r = apply(r, m)
  assert.equal(r.status, 'finished')
  assert.equal(r.result, '0-1')
  assert.equal(r.reason, 'checkmate')
  assert.equal(describeResult(r), 'Победили чёрные — мат')
  assert.equal(gameFromMoves(r.moves)?.isOver, true)
})

test('часы: первые два хода бесплатны, дальше списывается время и начисляется прибавка', () => {
  let r = playing()
  assert.equal(clocksRunning(r), false)
  r = apply(r, 'e2e4', 5000) // ход 1: часы ещё не идут
  assert.equal(r.whiteMs, 300_000)
  r = apply(r, 'e7e5', 5000)
  assert.equal(clocksRunning(r), true)
  assert.equal(remainingMs(r, 'w', 10_000), 290_000)
  assert.equal(remainingMs(r, 'b', 10_000), 300_000)
  r = apply(r, 'g1f3', 10_000) // 300000 - 10000 + 2000
  assert.equal(r.whiteMs, 292_000)
})

test('падение флажка и ход после истечения времени', () => {
  let r = playing({ baseMs: 60_000, incMs: 0, whiteMs: 60_000, blackMs: 60_000 })
  r = apply(r, 'e2e4')
  r = apply(r, 'e7e5')
  const early = planFlag(r, 30_000)
  assert.equal(early.ok, false)
  const late = planFlag(r, 61_000)
  assert.ok(late.ok)
  if (late.ok) {
    assert.equal(late.patch.status, 'finished')
    assert.equal(late.patch.result, '0-1')
    assert.equal(late.patch.reason, 'timeout')
  }
  const tooSlow = planMove(r, 'g1f3', 'w', 70_000)
  assert.ok(tooSlow.ok)
  if (tooSlow.ok) {
    assert.equal(tooSlow.patch.result, '0-1')
    assert.equal(tooSlow.patch.moves, undefined)
  }
})

test('сдача и ничья по соглашению', () => {
  let r = playing({ baseMs: 0 })
  const resign = planResign(r, 'w')
  assert.ok(resign.ok && resign.patch.result === '0-1' && resign.patch.reason === 'resignation')

  assert.equal(planDrawOffer(r, 'w').ok, false) // слишком рано
  r = apply(apply(r, 'e2e4'), 'e7e5')
  const offer = planDrawOffer(r, 'w')
  assert.ok(offer.ok)
  r = { ...r, ...(offer.ok ? offer.patch : {}) } as Room
  assert.equal(r.drawOfferBy, 'w')
  assert.equal(planDrawAccept(r, 'w').ok, false) // свою ничью принять нельзя
  const decline = planDrawDecline(r, 'b')
  assert.ok(decline.ok && decline.patch.drawOfferBy === null)
  const accept = planDrawAccept(r, 'b')
  assert.ok(accept.ok && accept.patch.result === '1/2-1/2' && accept.patch.reason === 'agreement')
  // ход снимает предложение
  assert.equal(apply(r, 'g1f3').drawOfferBy, null)
})

test('требование ничьей и отмена партии', () => {
  const r = playing({ baseMs: 0 })
  assert.equal(planClaimDraw(r).ok, false)
  // троекратное повторение: конь туда-обратно
  let g = r
  for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) g = apply(g, m)
  const claim = planClaimDraw(g)
  assert.ok(claim.ok && claim.patch.reason === 'threefold-repetition')

  const waiting = newRoom({ tcId: 'x', baseMs: 0, incMs: 0, color: 'w', uid: 'A', name: 'A', isPublic: true })
  const ab = planAbandon(waiting)
  assert.ok(ab.ok && ab.patch.reason === 'abandoned')
  assert.equal(describeResult({ result: null, reason: 'abandoned' }), 'Партия отменена')
})
