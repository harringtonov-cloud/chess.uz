import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { LEVEL_LABEL, MIN_CONSIDERED, parseGameId } from '../../lib/anticheat';
import { checkGame } from '../../lib/anticheatRun';
import type { GameReport, SideReport } from '../../lib/anticheatRun';
import { logAnticheat } from '../../lib/moderation';
import type { Staff } from '../../lib/moderation';
import type { GameDoc } from '../../lib/types';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

function SideCard({ r, onOpenPlayer }: { r: SideReport; onOpenPlayer: (uid: string) => void }) {
  const s = r.stats;
  return (
    <div className={`anticheat-side level-${r.verdict.level}`}>
      <h4>
        {r.color === 'white' ? '⬜ Белые' : '⬛ Чёрные'}: {r.name || '—'} <span className="muted">({r.rating})</span>
      </h4>
      <div className="anticheat-score">
        <b>{r.verdict.score}</b>
        <span> / 100 · {LEVEL_LABEL[r.verdict.level]}</span>
      </div>
      <table className="table">
        <tbody>
          <tr><td>Ходов / значимых</td><td>{s.moves} / {s.considered}</td></tr>
          <tr><td>Совпадение с движком</td><td>{pct(s.top1)}</td></tr>
          <tr><td>Средняя потеря за ход</td><td>{s.acpl === null ? '—' : `${Math.round(s.acpl)} сотых пешки`}</td></tr>
          <tr>
            <td>Время на ход</td>
            <td>
              {s.timeMean === null ? 'не записано' : `${(s.timeMean / 1000).toFixed(1)} с, разброс ${s.timeCv === null ? '—' : s.timeCv.toFixed(2)}`}
            </td>
          </tr>
          <tr><td>Быстрее секунды</td><td>{pct(s.fastShare)}</td></tr>
          <tr><td>Уходов со вкладки</td><td>{s.blurs}</td></tr>
        </tbody>
      </table>
      {r.verdict.reasons.length > 0 && (
        <ul className="anticheat-reasons">
          {r.verdict.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {r.uid && (
        <button className="btn small" onClick={() => onOpenPlayer(r.uid as string)}>
          Открыть игрока
        </button>
      )}
    </div>
  );
}

/** Проверка партий на помощь движка: Stockfish в браузере модератора, итог — сигнал, а не приговор. */
export default function AnticheatTab({
  staff,
  initial,
  onOpenPlayer,
}: {
  staff: Staff;
  initial: string;
  onOpenPlayer: (uid: string) => void;
}) {
  const [input, setInput] = useState(initial);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [reports, setReports] = useState<GameReport[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const control = useRef({ cancel: false });

  async function run() {
    const ids = [...new Set(input.split(/[\s,;]+/).map(parseGameId).filter((x): x is string => x !== null))].slice(0, 10);
    if (ids.length === 0) {
      setNotes(['Вставьте ссылку на партию или её id (можно несколько, до 10).']);
      return;
    }
    control.current = { cancel: false };
    setRunning(true);
    setReports([]);
    setNotes([]);
    const out: GameReport[] = [];
    for (let n = 0; n < ids.length; n++) {
      const id = ids[n];
      try {
        const snap = await getDoc(doc(db, 'games', id));
        if (!snap.exists()) {
          setNotes((p) => [...p, `${id}: партия не найдена`]);
          continue;
        }
        const g = snap.data() as GameDoc;
        if (g.moves.length < 20) {
          setNotes((p) => [...p, `${id}: слишком короткая партия (${g.moves.length} полуходов), вывод невозможен`]);
          continue;
        }
        const report = await checkGame(
          id,
          g,
          (done, total) => setProgress(`Партия ${n + 1} из ${ids.length}: позиция ${done} из ${total}`),
          control.current,
        );
        if (!report) break;
        out.push(report);
        setReports([...out]);
        const worst = report.white.verdict.score >= report.black.verdict.score ? report.white : report.black;
        await logAnticheat(
          staff,
          worst.uid ? { uid: worst.uid, name: worst.name } : null,
          `партия ${id}: белые ${report.white.verdict.score}, чёрные ${report.black.verdict.score}`,
        ).catch(() => undefined);
      } catch (e) {
        setNotes((p) => [...p, `${id}: ${(e as Error).message}`]);
      }
    }
    setRunning(false);
    setProgress('');
  }

  return (
    <div>
      <h3>Проверка партий на помощь движка</h3>
      <p className="muted">
        Stockfish разбирает партию у вас в браузере и считает по каждому игроку: совпадение с лучшими ходами, среднюю
        потерю за ход, ровность времени и уходы со вкладки. Дебют, вынужденные и уже решённые позиции не учитываются.
        Нужно хотя бы {MIN_CONSIDERED} значимых ходов. Это <b>подсказка для решения человека</b>: сильный игрок, хорошо
        знающий теорию, тоже даёт высокое совпадение, поэтому смотрите на несколько партий и на жалобы.
        Время и уходы со вкладки записываются только в партиях, сыгранных после обновления.
      </p>
      <textarea
        rows={3}
        placeholder="Ссылки или id партий, по одной на строку (до 10)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="row wrap">
        <button className="btn primary" disabled={running} onClick={() => void run()}>
          🔍 Проверить
        </button>
        {running && (
          <button className="btn" onClick={() => (control.current.cancel = true)}>
            Остановить
          </button>
        )}
        {progress && <span className="muted">{progress}</span>}
      </div>
      {notes.map((n) => (
        <p key={n} className="error">{n}</p>
      ))}
      {reports.map((r) => (
        <div key={r.gameId} className="anticheat-report">
          <div className="row spread">
            <h4>
              Партия <Link to={`/game/${r.gameId}`}>{r.gameId}</Link>
            </h4>
            <Link className="btn small ghost" to={`/analysis?game=${r.gameId}`}>
              📈 Анализ
            </Link>
          </div>
          {!r.hasTimes && <p className="muted">В этой партии время ходов не записано: проверка только по ходам.</p>}
          <div className="anticheat-sides">
            <SideCard r={r.white} onOpenPlayer={onOpenPlayer} />
            <SideCard r={r.black} onOpenPlayer={onOpenPlayer} />
          </div>
        </div>
      ))}
    </div>
  );
}
