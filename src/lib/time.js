import { useEffect, useState } from 'react';

/** เวลาปัจจุบันที่อัปเดตทุก interval ms */
export function useNow(interval = 200) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

/** เวลาที่เหลือ (ms) ของตัวจับเวลาจากเซิร์ฟเวอร์ โดยชดเชยความต่างของนาฬิกา */
export function remainingMs(timer, offset, now) {
  if (!timer) return 0;
  if (timer.paused || !timer.endsAt) return timer.remaining;
  return Math.max(0, timer.endsAt - (now + offset));
}

export function untilMs(endsAt, offset, now) {
  return Math.max(0, endsAt - (now + offset));
}

export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** ใช้กับ state จากเซิร์ฟเวอร์: เก็บ offset ของนาฬิกาไว้คู่กับ view */
export function withOffset(view) {
  return { view, offset: view.serverNow - Date.now() };
}
