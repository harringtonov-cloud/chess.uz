import { formatClock } from '../lib/timeControls';

interface Props {
  name: string;
  rating?: number;
  avatar?: string;
  clockMs?: number | null;
  active?: boolean;
  delta?: number | null;
}

export default function PlayerBar({ name, rating, avatar, clockMs, active, delta }: Props) {
  return (
    <div className={`player-bar ${active ? 'active' : ''}`}>
      <div className="who">
        <span className="avatar">{avatar ?? name.slice(0, 1).toUpperCase()}</span>
        <span className="pname">{name || '—'}</span>
        {rating ? <span className="prating">({rating})</span> : null}
        {delta != null && (
          <span className={`delta ${delta >= 0 ? 'plus' : 'minus'}`}>
            {delta >= 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      {clockMs != null && (
        <div className={`clock ${clockMs < 10000 ? 'low' : ''}`}>{formatClock(clockMs)}</div>
      )}
    </div>
  );
}
