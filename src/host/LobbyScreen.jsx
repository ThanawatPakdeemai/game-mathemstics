import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { gradeTitle, LOBBY_MS } from '../../shared/constants.js';
import { Avatar, Brand, DifficultyBadge } from '../components/ui.jsx';
import { characterById } from '../lib/characters.js';
import { formatClock, untilMs, useNow } from '../lib/time.js';
import { PUBLIC_URL, SERVER_URL } from '../lib/socket.js';

export function RoomHeader({ view, right }) {
  const s = view.settings;
  const grade = gradeTitle(s.grade);
  return (
    <header className="room-header">
      <Brand small />
      <div className="room-meta">
        <span className="chip chip-strong">{s.className}</span>
        <span className="chip">{grade}</span>
        <span className="chip">{s.topicLabel}</span>
        <DifficultyBadge id={s.difficulty} />
      </div>
      <div className="room-right">
        {right}
        <span className="player-count" title="จำนวนผู้เข้าร่วม">
          👥 {view.players.length}/{view.maxPlayers}
        </span>
      </div>
    </header>
  );
}

function useJoinHosts() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    fetch(`${SERVER_URL}/api/info`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ lanIps: [] }));
  }, []);
  return info;
}

function buildJoinUrl(code, info, lanIp) {
  // ลำดับ: ลิงก์ที่ตั้งตอน build (VITE_PUBLIC_URL) → PUBLIC_URL ของเซิร์ฟเวอร์ → IP ในวง LAN
  const base = PUBLIC_URL || info?.publicUrl;
  if (base) return `${base.replace(/\/$/, '')}/join/${code}`;
  let host = window.location.hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(host) && lanIp) host = lanIp;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${host}${port}/join/${code}`;
}

export default function LobbyScreen({ view, offset, action, onLeave }) {
  const now = useNow(250);
  const info = useJoinHosts();
  const [lanIp, setLanIp] = useState(null);
  const ip = lanIp ?? info?.lanIps?.[0];
  const joinUrl = buildJoinUrl(view.code, info, ip);
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  const left = untilMs(view.lobbyEndsAt, offset, now);
  const pct = (left / LOBBY_MS) * 100;
  const expired = view.qrExpired || left <= 0;

  const start = () => {
    const unnamed = view.players.filter((p) => !p.name || p.characterId == null).length;
    if (unnamed && !window.confirm(`มีผู้เล่น ${unnamed} คนที่ยังเลือกไม่ครบ ระบบจะสุ่มชื่อ/ตัวละครให้อัตโนมัติ เริ่มเกมเลยไหม?`)) return;
    action('host:start');
  };

  const cancel = () => {
    if (window.confirm('ยกเลิกห้องเกมนี้? นักเรียนทุกคนจะถูกออกจากห้อง')) onLeave(true);
  };

  return (
    <div className="page lobby">
      <RoomHeader view={view} />

      <div className="lobby-grid">
        <section className="card qr-card">
          <h2>สแกนเพื่อเข้าร่วม</h2>
          <div className={`qr-wrap ${expired ? 'is-expired' : ''}`}>
            <QRCodeSVG value={joinUrl} size={320} level="M" marginSize={1} fgColor="#1f2a6b" />
            {expired && (
              <div className="qr-expired">
                <b>QR-Code หมดอายุแล้ว</b>
                <button className="btn btn-primary" onClick={() => action('host:renewQr')}>
                  🔄 สร้าง QR-Code ใหม่
                </button>
              </div>
            )}
          </div>
          <div className="room-code">
            <span>รหัสห้อง</span>
            <b>{view.code}</b>
          </div>
          <div className="join-url">{joinUrl}</div>
          {isLocalHost && info?.lanIps?.length > 1 && (
            <label className="ip-select">
              เครือข่าย:
              <select value={ip} onChange={(e) => setLanIp(e.target.value)}>
                {info.lanIps.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
          {isLocalHost && !info?.lanIps?.length && !info?.publicUrl && !PUBLIC_URL && (
            <p className="warn-text">ไม่พบ IP ในวง LAN — มือถือต้องเชื่อมต่อ Wi-Fi เดียวกับเครื่องนี้</p>
          )}

          <div className={`qr-timer ${pct < 20 ? 'is-low' : ''}`}>
            <div className="qr-timer-track">
              <div className="qr-timer-fill" style={{ width: `${expired ? 0 : pct}%` }} />
            </div>
            <span>{expired ? 'หมดเวลา' : `QR หมดอายุใน ${formatClock(left)}`}</span>
          </div>
        </section>

        <section className="card players-card">
          <header className="players-head">
            <h2>ผู้เข้าร่วม</h2>
            <span className="muted">
              {view.players.length === 0 ? 'รอนักเรียนสแกน QR-Code…' : 'นักเรียนกำลังเลือกตัวละครและกรอกชื่อ'}
            </span>
          </header>
          <ul className="player-grid">
            {view.players.map((p) => (
              <li key={p.id} className={`player-tile ${p.connected ? '' : 'is-offline'} pop-in`}>
                <Avatar characterId={p.characterId} size={72} placeholder="…" />
                <div className="player-tile-text">
                  <b>{p.name || <i className="muted">กำลังกรอกชื่อ…</i>}</b>
                  <small>{characterById(p.characterId)?.name || 'กำลังเลือกตัวละคร'}</small>
                </div>
                <button className="tile-x" title="นำออกจากห้อง" onClick={() => action('host:kick', p.id)}>
                  ×
                </button>
              </li>
            ))}
            {Array.from({ length: Math.max(0, Math.min(3, view.maxPlayers - view.players.length)) }).map((_, i) => (
              <li key={`empty-${i}`} className="player-tile is-empty">
                <div className="avatar avatar-ghost" style={{ width: 72, height: 72 }} />
                <span className="muted">ว่าง</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="action-bar">
        <button className="btn btn-ghost" onClick={cancel}>
          ✕ ยกเลิก
        </button>
        <button className="btn btn-cta btn-xl" onClick={start} disabled={view.players.length === 0}>
          ▶ เริ่มเกม
        </button>
      </footer>
    </div>
  );
}
