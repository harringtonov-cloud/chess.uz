/**
 * Запуск ИИ в Web Worker, чтобы интерфейс не зависал на высоких уровнях.
 * Если Worker недоступен — считаем в основном потоке (запасной вариант).
 */
import { chooseAiMove, type AiChoice, type AiParams } from './ai'

let worker: Worker | null = null
let failed = false
let nextId = 1
const pending = new Map<number, (c: AiChoice | null) => void>()

function getWorker(): Worker | null {
  if (failed) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; choice?: AiChoice | null; error?: string }>) => {
      const done = pending.get(e.data.id)
      if (done) {
        pending.delete(e.data.id)
        done(e.data.choice ?? null)
      }
    }
    worker.onerror = () => {
      failed = true
      worker = null
      // незавершённые запросы досчитает основной поток
      for (const [, done] of pending) done(null)
      pending.clear()
    }
  } catch {
    failed = true
    worker = null
  }
  return worker
}

export function requestAiMove(fen: string, params: AiParams): Promise<AiChoice | null> {
  return new Promise((resolve) => {
    const w = getWorker()
    if (!w) {
      // даём интерфейсу отрисовать «AI думает…» перед тяжёлым расчётом
      setTimeout(() => resolve(chooseAiMove(fen, params)), 30)
      return
    }
    const id = nextId++
    pending.set(id, (c) => resolve(c ?? chooseAiMove(fen, params)))
    w.postMessage({ id, fen, params })
  })
}
