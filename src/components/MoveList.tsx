import { useEffect, useRef } from 'react';

interface Props {
  moves: string[];
  /** Номер полухода, который показан на доске (0 — начальная позиция) */
  current: number;
  onSelect?: (ply: number) => void;
  /** необязательные пометки для полуходов (индекс = номер хода от 0) */
  marks?: Record<number, { label: string; cls: string }>;
}

export default function MoveList({ moves, current, onSelect, marks }: Props) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current, moves.length]);

  const rows: JSX.Element[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const cell = (idx: number) => {
      if (idx >= moves.length) return <span className="mv" />;
      const ply = idx + 1;
      const mark = marks?.[idx];
      return (
        <span
          ref={current === ply ? activeRef : undefined}
          className={`mv ${current === ply ? 'active' : ''}`}
          onClick={() => onSelect?.(ply)}
        >
          {moves[idx]}
          {mark && <i className={`mark ${mark.cls}`}>{mark.label}</i>}
        </span>
      );
    };
    rows.push(
      <div className="mv-row" key={i}>
        <span className="mv-num">{i / 2 + 1}.</span>
        {cell(i)}
        {cell(i + 1)}
      </div>,
    );
  }
  return <div className="move-list">{rows.length ? rows : <div className="muted">Ходов пока нет</div>}</div>;
}
