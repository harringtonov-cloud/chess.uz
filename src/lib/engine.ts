// Stockfish работает в браузере в Web Worker. Скрипт движка подгружается с CDN,
// поэтому в репозитории не нужно хранить бинарные файлы.
const STOCKFISH_URL = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';

export interface EngineLine {
  multipv: number;
  depth: number;
  cp: number | null; // сантипешки с точки зрения стороны, которая ходит
  mate: number | null; // ходов до мата (знак: + мат ставит сторона, которая ходит)
  pv: string[]; // ходы в UCI
}

export interface SearchResult {
  bestMove: string | null;
  lines: EngineLine[];
}

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  skill?: number; // 0..20
  multipv?: number;
}

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    const blob = new Blob([`importScripts(${JSON.stringify(STOCKFISH_URL)});`], {
      type: 'application/javascript',
    });
    this.worker = new Worker(URL.createObjectURL(blob));
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      this.listeners.forEach((l) => l(line));
    };
    this.ready = this.init();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean, timeoutMs = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const listener = (line: string) => {
        if (pred(line)) {
          this.listeners.delete(listener);
          if (timer) clearTimeout(timer);
          resolve(line);
        }
      };
      this.listeners.add(listener);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.listeners.delete(listener);
          reject(new Error('Шахматный движок не отвечает'));
        }, timeoutMs);
      }
    });
  }

  private async init() {
    this.send('uci');
    await this.waitFor((l) => l === 'uciok', 30000);
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 30000);
  }

  /** Поиск лучшего хода. Запросы выполняются по очереди. */
  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready;
      const lines = new Map<number, EngineLine>();
      const listener = (line: string) => {
        if (!line.startsWith('info') || !line.includes(' pv ')) return;
        const depth = Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0);
        const multipv = Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1);
        const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
        const pv = (/ pv (.+)$/.exec(line)?.[1] ?? '').trim().split(/\s+/);
        if (!score) return;
        lines.set(multipv, {
          multipv,
          depth,
          cp: score[1] === 'cp' ? Number(score[2]) : null,
          mate: score[1] === 'mate' ? Number(score[2]) : null,
          pv,
        });
      };
      this.listeners.add(listener);
      this.send(`setoption name Skill Level value ${opts.skill ?? 20}`);
      this.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      this.send(`position fen ${fen}`);
      const parts = ['go'];
      if (opts.depth) parts.push(`depth ${opts.depth}`);
      if (opts.movetime) parts.push(`movetime ${opts.movetime}`);
      if (!opts.depth && !opts.movetime) parts.push('depth 12');
      this.send(parts.join(' '));
      const best = await this.waitFor((l) => l.startsWith('bestmove'));
      this.listeners.delete(listener);
      const move = best.split(/\s+/)[1];
      return {
        bestMove: move && move !== '(none)' ? move : null,
        lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
      };
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  stop() {
    this.send('stop');
  }

  terminate() {
    this.worker.terminate();
    this.listeners.clear();
  }
}

let shared: Engine | null = null;

/** Один общий движок на всё приложение (создаётся при первом обращении). */
export function getEngine(): Engine {
  if (!shared) shared = new Engine();
  return shared;
}
