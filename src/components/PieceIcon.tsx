// Собственный векторный набор фигур (простые геометрические формы, нарисованы специально для chess.uz).

type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

const BASE = <rect x="11" y="37" width="23" height="4" rx="1.5" />;

function shapes(type: PieceType) {
  switch (type) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="13" r="5.5" />
          <path d="M16 36 C16 29 19 26 22.5 23 C26 26 29 29 29 36 Z" />
          {BASE}
        </>
      );
    case 'r':
      return (
        <>
          <path d="M14 36 L16 19 H29 L31 36 Z" />
          <path d="M13 11 H17 V14.5 H20.5 V11 H24.5 V14.5 H28 V11 H32 V19 H13 Z" />
          {BASE}
        </>
      );
    case 'n':
      return (
        <>
          <path d="M14 36 C14 26 17 21 21 17 L18 15 L19 10 L24 12 C31 14 33 22 31 36 Z" />
          <circle cx="23" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
          {BASE}
        </>
      );
    case 'b':
      return (
        <>
          <path d="M17 36 C17 29 19 26 22.5 22 C26 26 28 29 28 36 Z" />
          <ellipse cx="22.5" cy="16" rx="5" ry="7" />
          <circle cx="22.5" cy="7.5" r="2" />
          {BASE}
        </>
      );
    case 'q':
      return (
        <>
          <path d="M14 36 L12 14 L18 22 L22.5 10 L27 22 L33 14 L31 36 Z" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="22.5" cy="8" r="2" />
          <circle cx="33" cy="12" r="2" />
          {BASE}
        </>
      );
    case 'k':
      return (
        <>
          <path d="M15 36 C15 28 17 24 22.5 21 C28 24 30 28 30 36 Z" />
          <rect x="21" y="4" width="3" height="12" />
          <rect x="17.5" y="8" width="10" height="3" />
          <rect x="16" y="20" width="13" height="4" rx="1" />
          {BASE}
        </>
      );
  }
}

export default function PieceIcon({ type, color }: { type: string; color: 'w' | 'b' }) {
  const fill = color === 'w' ? '#f5f5f5' : '#3a3a3a';
  return (
    <svg
      viewBox="0 0 45 45"
      width="100%"
      height="100%"
      fill={fill}
      stroke="#111"
      strokeWidth="1.5"
      strokeLinejoin="round"
      style={{ color: color === 'w' ? '#111' : '#f5f5f5', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {shapes(type as PieceType)}
    </svg>
  );
}
