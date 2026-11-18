import { useRef, useState } from 'react';
import { CHOICE_LABELS, TAPS_REQUIRED } from '../../shared/constants.js';
import { characterById } from '../lib/characters.js';

/**
 * มินิเกมแบบ Pop Cat: กดตัวละครรัว ๆ ให้ครบ 100 ครั้งเพื่อส่งคำตอบ
 */
export default function TapGame({ characterId, choice, choiceText, disabled, onChangeChoice, onComplete }) {
  const [taps, setTaps] = useState(0);
  const [pops, setPops] = useState([]);
  const doneRef = useRef(false);
  const popId = useRef(0);
  const character = characterById(characterId);
  const pct = Math.min(100, (taps / TAPS_REQUIRED) * 100);

  const tap = (e) => {
    e.preventDefault();
    if (disabled || doneRef.current) return;
    const next = taps + 1;
    setTaps(next);
    navigator.vibrate?.(8);

    // ตัวเลข +1 ลอยขึ้นตามตำแหน่งที่กด
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++popId.current;
    setPops((p) => [...p.slice(-12), { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 600);

    if (next >= TAPS_REQUIRED) {
      doneRef.current = true;
      Promise.resolve(onComplete()).then(() => {
        doneRef.current = false;
      });
    }
  };

  return (
    <div className="tap-game">
      <div className="tap-choice">
        คำตอบของคุณ <b className={`tap-choice-label choice-${choice}`}>{CHOICE_LABELS[choice]}</b>
        <span className="tap-choice-text">{choiceText}</span>
      </div>
      <p className="tap-hint">กดตัวละครรัว ๆ ให้ครบ {TAPS_REQUIRED} ครั้งเพื่อส่งคำตอบ!</p>

      <button className="tap-target" onPointerDown={tap} disabled={disabled} aria-label="กดตัวละคร">
        <span key={taps} className={`tap-count ${taps ? 'pop' : ''}`}>
          {taps}
        </span>
        <span className="tap-ring" style={{ '--pct': `${pct * 3.6}deg` }} />
        {character && (
          <img
            key={`c-${taps}`}
            src={character.url}
            alt={character.name}
            draggable={false}
            className={taps === 0 ? 'tap-idle' : taps % 2 ? 'wiggle-l' : 'wiggle-r'}
          />
        )}
        {pops.map((p) => (
          <span key={p.id} className="tap-pop" style={{ left: p.x, top: p.y }}>
            +1
          </span>
        ))}
      </button>

      <div className="tap-progress">
        <div className="tap-progress-fill" style={{ width: `${pct}%` }} />
        <span>
          {taps}/{TAPS_REQUIRED}
        </span>
      </div>

      <button className="btn btn-ghost btn-sm" onClick={onChangeChoice} disabled={disabled}>
        ← เปลี่ยนคำตอบ
      </button>
    </div>
  );
}
