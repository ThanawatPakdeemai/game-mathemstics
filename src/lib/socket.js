import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

// ถ้าหน้าเว็บกับเซิร์ฟเวอร์เกมอยู่คนละโดเมน (เช่นหน้าเว็บบน Vercel) ให้ตั้ง VITE_SERVER_URL
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || '').replace(/\/$/, '');

export const socket = SERVER_URL
  ? io(SERVER_URL, { transports: ['websocket', 'polling'] })
  : io({ transports: ['websocket', 'polling'] });

/** ส่ง event แล้วรอผลตอบกลับ (ack) */
export function emitAsync(event, payload) {
  return new Promise((resolve) => {
    const done = (res) => resolve(res || {});
    if (payload === undefined) socket.timeout(8000).emit(event, (err, res) => done(err ? { error: 'การเชื่อมต่อขัดข้อง' } : res));
    else socket.timeout(8000).emit(event, payload, (err, res) => done(err ? { error: 'การเชื่อมต่อขัดข้อง' } : res));
  });
}

export function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}
