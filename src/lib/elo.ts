export function expectedScore(own: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - own) / 400));
}

/** score: 1 победа, 0.5 ничья, 0 поражение */
export function ratingDelta(own: number, opp: number, score: number, gamesPlayed: number): number {
  const k = gamesPlayed < 30 ? 40 : 20;
  return Math.round(k * (score - expectedScore(own, opp)));
}
