import { useState } from 'react';
import { DIFFICULTIES } from '../../shared/constants.js';
import { ALL_QUESTIONS } from '../../shared/questionSet.js';
import { characterById } from '../lib/characters.js';
import { MASCOTS } from '../lib/subjects.js';
import { formatClock } from '../lib/time.js';
import { useConnected } from '../lib/socket.js';

// สัญลักษณ์จางๆ ของหลายวิชา: ไทย คณิต อังกฤษ วิทย์ ประวัติศาสตร์ วรรณกรรม
const SYMBOLS = ['ก', 'π', 'Aa', '⚛', '✎', 'Σ', 'ข', 'H₂O', '√', 'Bb', '?', 'ฅ', '∞', '♪', '÷', '★'];

export function Backdrop() {
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
      <span className="brand-mark" aria-hidden="true">
        Q
      </span>
      <span className="brand-text">
        Quiz<b>Motion</b>
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
  if (id === ALL_QUESTIONS) return <span className="badge badge-all">ทั้งชุด</span>;
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

/**
 * ความหนาแน่นของรายชื่อผู้เล่นบนจอโปรเจคเตอร์ (รองรับ 50 คน)
 * คืน { cls, size } — ใช้ cls กับรายการ และ size เป็นขนาดรูปตัวละคร
 */
export function crowd(count, sizes) {
  const [normal, crowded, packed] = sizes;
  if (count > 30) return { cls: 'is-packed', size: packed };
  if (count > 15) return { cls: 'is-crowded', size: crowded };
  return { cls: '', size: normal };
}

// ตำแหน่งรอบขอบจอ สลับบน-ล่าง-ซ้าย-ขวา (from = ทิศที่ตัวละครเด้งเข้ามา)
const MASCOT_SLOTS = ['tl', 'br', 'mr', 'bl', 'tr', 'ml'];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * ตัวละครประจำวิชาที่เด้งเข้ามาจากขอบจอตอนเปิดหน้า แล้วลอยเบาๆ
 * อยู่หลังเนื้อหา (ไม่บังปุ่ม/ข้อความ) สุ่มตัวใหม่ทุกครั้งที่เปิดหน้า
 */
export function SubjectMascots({ count = MASCOT_SLOTS.length }) {
  const [picks] = useState(() => shuffled(MASCOTS).slice(0, count));
  return (
    <div className="mascots" aria-hidden="true">
      {picks.map((m, i) => (
        <span key={m.name} className={`mascot mascot-${MASCOT_SLOTS[i]}`} style={{ '--i': i }}>
          <img src={m.url} alt="" draggable={false} />
        </span>
      ))}
    </div>
  );
}
