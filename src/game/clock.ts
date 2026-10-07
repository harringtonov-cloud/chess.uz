/**
 * Отображение времени. Сама логика часов (Фишер, задержка, Бронштейн) живёт в движке:
 * см. src/chess/clock.ts (ChessClock).
 */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '∞'
  if (ms < 10_000) {
    // последние секунды — с десятыми
    return `0:${(Math.max(0, ms) / 1000).toFixed(1).padStart(4, '0')}`
  }
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}
