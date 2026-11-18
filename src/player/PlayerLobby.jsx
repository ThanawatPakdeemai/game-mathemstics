import { useEffect, useRef, useState } from 'react';
import { emitAsync, socket } from '../lib/socket.js';
import { CHARACTERS } from '../lib/characters.js';
import { formatClock, untilMs, useNow } from '../lib/time.js';

export default function PlayerLobby({ view, offset, notify }) {
  const now = useNow(250);
  const me = view.me;
  const [name, setName] = useState(me.name || '');
  const [index, setIndex] = useState(me.characterId ?? 0);
  const trackRef = useRef(null);
  const nameTimer = useRef(null);
  const left = untilMs(view.lobbyEndsAt, offset, now);
  const locked = view.qrExpired || left <= 0;

  // ชื่อที่ระบบสุ่มให้ → แสดงในช่องกรอก
  useEffect(() => {
    if (me.name && !name) setName(me.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.name]);

  const onName = (value) => {
    setName(value);
    clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => socket.emit('player:name', value), 300);
  };

  const scrollTo = (i) => {
    const n = CHARACTERS.length;
    const next = (i + n) % n;
    setIndex(next);
    const el = trackRef.current?.children[next];
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  // เลื่อนไปตัวละครที่เลือกไว้เมื่อเปิดหน้า
  useEffect(() => {
    const el = trackRef.current?.children[me.characterId ?? 0];
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // อัปเดต index ตามการปัดนิ้ว
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    [...track.children].forEach((child, i) => {
      const d = Math.abs(child.offsetLeft + child.clientWidth / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best !== index) setIndex(best);
  };

  const owner = (id) => view.takenCharacters[id];
  const ownerName = (id) => view.players.find((p) => p.id === owner(id))?.name || 'เพื่อน';
  const current = CHARACTERS[index];
  const takenByOther = owner(index) && owner(index) !== me.id;
  const isMine = me.characterId === index;

  const pick = async () => {
    const res = await emitAsync('player:character', isMine ? null : index);
    if (res.error) notify(res.error);
  };

  const ready = Boolean(me.name) && me.characterId != null;

  return (
    <div className="m-screen m-lobby">
      <div className={`m-lobby-timer ${left < 60000 ? 'is-low' : ''}`}>
        {locked ? '⏰ หมดเวลาเลือก — ระบบสุ่มตัวละครให้แล้ว' : `⏱ เลือกภายใน ${formatClock(left)}`}
      </div>

      <label className="field">
        <span>ชื่อ</span>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="ชื่อตัวแทนกลุ่มหรือนักเรียน"
          maxLength={30}
          enterKeyHint="done"
        />
      </label>

      <h2 className="m-section">เลือกตัวละคร</h2>
      <div className="carousel">
        <button className="carousel-nav prev" onClick={() => scrollTo(index - 1)} aria-label="ก่อนหน้า">
          ‹
        </button>
        <div className="carousel-track" ref={trackRef} onScroll={onScroll}>
          {CHARACTERS.map((c) => {
            const taken = owner(c.id) && owner(c.id) !== me.id;
            const mine = me.characterId === c.id;
            return (
              <button
                key={c.id}
                className={`carousel-card ${c.id === index ? 'is-current' : ''} ${taken ? 'is-taken' : ''} ${mine ? 'is-mine' : ''}`}
                onClick={() => scrollTo(c.id)}
              >
                <img src={c.url} alt={c.name} draggable={false} />
                {taken && <span className="taken-tag">🔒 {ownerName(c.id)}</span>}
                {mine && <span className="mine-tag">✓ ของฉัน</span>}
              </button>
            );
          })}
        </div>
        <button className="carousel-nav next" onClick={() => scrollTo(index + 1)} aria-label="ถัดไป">
          ›
        </button>
      </div>
      <div className="carousel-caption">
        <b>{current.name}</b>
        <small>
          {index + 1}/{CHARACTERS.length}
        </small>
      </div>
      <div className="carousel-dots">
        {CHARACTERS.map((c) => (
          <span
            key={c.id}
            className={`${c.id === index ? 'is-now' : ''} ${owner(c.id) ? (owner(c.id) === me.id ? 'is-mine' : 'is-taken') : ''}`}
          />
        ))}
      </div>

      <button
        className={`btn btn-block ${isMine ? 'btn-ghost' : 'btn-cta'}`}
        disabled={takenByOther || (locked && !isMine)}
        onClick={pick}
      >
        {takenByOther ? `🔒 ${ownerName(index)} เลือกแล้ว` : isMine ? 'ยกเลิกการเลือกตัวละครนี้' : 'เลือกตัวละครนี้'}
      </button>

      <div className={`ready-box ${ready ? 'is-ready' : ''}`}>
        {ready ? '✅ พร้อมแล้ว! รอคุณครูเริ่มเกม' : 'กรอกชื่อและเลือกตัวละครให้เรียบร้อย'}
      </div>
    </div>
  );
}
