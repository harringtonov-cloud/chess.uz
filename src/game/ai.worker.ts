/// <reference lib="webworker" />
import { chooseAiMove, type AiParams } from './ai.ts'

self.onmessage = (e: MessageEvent<{ id: number; fen: string; params: AiParams }>) => {
  const { id, fen, params } = e.data
  try {
    ;(self as unknown as Worker).postMessage({ id, choice: chooseAiMove(fen, params) })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: String(err) })
  }
}
