import { DIFFICULTIES } from '../../shared/constants.js';
import { characterById } from '../lib/characters.js';
import { formatClock } from '../lib/time.js';
import { useConnected } from '../lib/socket.js';

const SYMBOLS = ['∪', '∩', '⊂', '∈', '∀', '∃', '→', '↔', 'Σ', 'θ', 'π', '√', '∞', '÷', '×', '≠'];

export function MathBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      {SYMBOLS.map((s, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 61) % 100}%`,
            top: `${(i * 37 + 7) % 100}%`,
            animationDelay: `${-i * 1.7}s`,
            fontSize: `${28 + ((i * 13) % 40)}px`,
          }}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export function Brand({ small }) {
  return (
    <div className={`brand ${small ? 'brand-sm' : ''}`}>
      <span className="brand-mark">∑</span>
      <span className="brand-text">
        Math<b>Motion</b>
      </span>
    </div>
  );
}

export function Avatar({ characterId, size = 64, className = '', placeholder = '?' }) {
  const c = characterById(characterId);
  return (
    <div className={`avatar ${className}`} style={{ width: size, height: size }}>
      {c ? <img src={c.url} alt={c.name} draggable={false} /> : <span className="avatar-empty">{placeholder}</span>}
    </div>
  );
}

export function DifficultyBadge({ id }) {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) return null;
  return <span className={`badge badge-${id}`}>{d.label}</span>;
}

export function TimerBar({ remaining, duration, paused, compact }) {
  const pct = duration ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;
  const tone = pct <= 10 ? 'danger' : pct <= 25 ? 'warn' : 'ok';
  return (
    <div className={`timer ${compact ? 'timer-compact' : ''} timer-${tone} ${paused ? 'is-paused' : ''}`}>
      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="timer-label">
        <span className="timer-icon">{paused ? '⏸️' : '⏱️'}</span>
        {formatClock(remaining)}
      </div>
    </div>
  );
}

export function PausedOverlay({ text = 'หยุดเวลาชั่วคราว' }) {
  return (
    <div className="paused-overlay">
      <div className="paused-card">
        <div className="paused-icon">⏸️</div>
        <div>{text}</div>
      </div>
    </div>
  );
}

export function ConnectionBanner() {
  const connected = useConnected();
  if (connected) return null;
  return <div className="conn-banner">กำลังเชื่อมต่อเซิร์ฟเวอร์ใหม่…</div>;
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
