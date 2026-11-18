// MathMotion — 60s intro video renderer (Canvas + WebAudio + WebCodecs)
// ทุกอย่างอ้างอิง timeline เดียวกัน: 120 BPM → 1 beat = 0.5s, 1 bar = 2s
import { Muxer, ArrayBufferTarget } from './node_modules/mp4-muxer/build/mp4-muxer.mjs';

export const W = 1920, H = 1080, FPS = 30, DUR = 60;
const SHUTTER = 0.5 / FPS; // 180° shutter

// ---------------------------------------------------------------- math
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
// easing แบบ "ความเร็วเป็นเนิน" v ∝ sin^k(πp): ความเร่งต่อเนื่องทุกจุด ไม่มีกระตุกกลางทาง
// k ยิ่งมาก = ความเร็วกระจุกตรงกลาง (เร่งแรงแล้วเบรกนุ่ม)
function bump(k) {
  const N = 2048, tab = new Float32Array(N + 1);
  for (let i = 1; i <= N; i++) tab[i] = tab[i - 1] + Math.pow(Math.sin((Math.PI * (i - 0.5)) / N), k);
  for (let i = 1; i <= N; i++) tab[i] /= tab[N];
  return (p) => { const x = Math.min(1, Math.max(0, p)) * N, i = Math.floor(x); return i >= N ? 1 : tab[i] + (tab[i + 1] - tab[i]) * (x - i); };
}
const E = {
  linear: (p) => p,
  sine: bump(2), // ดริฟต์ช้า ๆ
  cubic: bump(4), // เคลื่อนกล้องปกติ
  quint: bump(8), // whip: เร่งแรงแล้วชะลอ
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
  outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inCubic: (p) => p * p * p,
  outBack: (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
};

// ---------------------------------------------------------------- palette
const C = {
  royal: '#3049d9', blue: '#4f7cff', sky: '#5ec8ff', purple: '#8b5cf6', pink: '#ff6fa8',
  yellow: '#ffd23f', orange: '#ff9f1c', green: '#22c55e', ink: '#1f2a6b', soft: '#5b6699',
};
const FONT_HEAD = 'Mitr', FONT_BODY = 'Prompt';

// ---------------------------------------------------------------- assets
const ASSET_NAMES = [
  'setup', 'lobby', 'phone-lobby-taken', 'phone-lobby-mine', 'countdown', 'question', 'question-paused',
  'phone-choices', 'phone-sent', 'phone-reveal', 'reveal', 'review', 'results-full', 'results-speed-full',
  'tap-000', ...Array.from({ length: 24 }, (_, i) => `tap-${String((i + 1) * 4).padStart(3, '0')}`),
];
const IMG = {};
async function loadAssets() {
  await Promise.all(ASSET_NAMES.map((n) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; res(); };
    im.onerror = () => rej(new Error('missing asset ' + n));
    im.src = `./assets/${n}.png`;
  })));
  await Promise.all([
    document.fonts.load(`600 80px ${FONT_HEAD}`, 'ก MathMotion'),
    document.fonts.load(`500 80px ${FONT_HEAD}`, 'ก'),
    document.fonts.load(`500 40px ${FONT_BODY}`, 'ก'),
    document.fonts.load(`600 40px ${FONT_BODY}`, 'ก'),
  ]);
  await document.fonts.ready;
}

// ---------------------------------------------------------------- camera
// key: { t, x, y, z, e } — e = easing ที่ใช้ "เดินทางมาถึง" key นี้
function camAt(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const e = b.e || 'cubic';
      const p = E[e](prog(t, a.t, b.t));
      let z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), p));
      // เคลื่อนไกล → ถอยกล้องออกเล็กน้อยกลางทาง แล้วซูมกลับ (ผู้ชมไม่หลงทิศ และความเร็วบนจอลดลง)
      if (e === 'cubic' || e === 'quint') {
        const dip = clamp((Math.hypot(b.x - a.x, b.y - a.y) * Math.sqrt(a.z * b.z)) / W * 0.32, 0, 0.55);
        z *= 1 - dip * Math.sin(Math.PI * p);
      }
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z };
    }
  }
  return keys[keys.length - 1];
}

// ---------------------------------------------------------------- timeline
const BAR = 2, BEAT = 0.5;
// tap rush: 24 เฟรม ทุก 1/16 โน้ต (0.125s)
const TAP0 = 37.75, TAP_STEP = 0.125, TAP_N = 25; // 0,4,...,96 แล้ว 100 = ส่ง
const TAP_SENT = 41.0;
const COUNT_TIMES = [26.0, 27.0, 28.0, 28.5, 29.0]; // 5 4 3 2 1 (เร่งขึ้น)
const COUNT_END = 29.5; // หยุดนิ่ง 0.5s ก่อน drop
const CHIP_TIMES = [42.5, 43.5, 44.5];
// hard cuts + จุดสลับภาพทันที (ห้าม motion blur ผสมข้ามจุดเหล่านี้)
const CUTS = [22.0, 30, 34.05, 37.6, 41.0, 42, 53.0, 56];

const ripples = []; // {t, scene, x, y}
const tapRipple = (scene, t, x, y) => ripples.push({ scene, t, x, y });

const SCENES = [
  {
    id: 'logo', start: 0, end: 4, kind: 'logo',
    cam: [{ t: 0, x: 960, y: 540, z: 1 }, { t: 0.25, x: 960, y: 540, z: 1.0 }, { t: 3.7, x: 960, y: 548, z: 1.14, e: 'sine' }],
  },
  {
    id: 'setup', start: 4, end: 12, kind: 'image', img: 'setup',
    cam: [
      { t: 3.6, x: 820, y: 640, z: 0.9 },
      { t: 6.85, x: 2060, y: 600, z: 0.94, e: 'sine' }, // แถวบน: ระดับชั้น → หมวดหมู่ (แพนช้า)
      { t: 7.55, x: 860, y: 1150, z: 0.96, e: 'cubic' },
      { t: 9.25, x: 2040, y: 1150, z: 0.98, e: 'sine' }, // แถวกลาง: ความยาก → เวลา
      { t: 9.9, x: 1440, y: 1560, z: 0.88, e: 'cubic' },
      { t: 11.05, x: 1440, y: 1590, z: 0.98, e: 'sine' }, // รูปแบบการเฉลย
      { t: 11.4, x: 1440, y: 1866, z: 1.55, e: 'quint' }, // พุ่งเข้าปุ่ม
      { t: 12.2, x: 1440, y: 1866, z: 1.66, e: 'sine' },
    ],
  },
  {
    id: 'lobby', start: 12, end: 18, kind: 'image', img: 'lobby',
    cam: [
      { t: 11.8, x: 476, y: 740, z: 1.12 },
      { t: 14.35, x: 476, y: 760, z: 0.96, e: 'sine' },
      { t: 15.0, x: 476, y: 1330, z: 1.22, e: 'cubic' },
      { t: 16.1, x: 520, y: 1350, z: 1.16, e: 'sine' },
      { t: 16.95, x: 2080, y: 470, z: 0.84, e: 'cubic' }, // รายชื่อทีม + ตัวนับ 6/15 ในเฟรมเดียว
      { t: 18.4, x: 2150, y: 440, z: 0.9, e: 'sine' },
    ],
  },
  {
    id: 'phoneLobby', start: 18, end: 24, kind: 'phone', img: (t) => (t < 22.0 ? 'phone-lobby-taken' : 'phone-lobby-mine'),
    cam: [
      { t: 17.6, x: 585, y: 1266, z: 0.40 },
      { t: 18.35, x: 585, y: 1266, z: 0.41, e: 'sine' },
      { t: 19.0, x: 585, y: 520, z: 0.78, e: 'cubic' },
      { t: 20.45, x: 600, y: 560, z: 0.82, e: 'sine' },
      { t: 21.05, x: 585, y: 1180, z: 0.6, e: 'cubic' },
      { t: 21.75, x: 585, y: 1260, z: 0.62, e: 'sine' },
      { t: 22.3, x: 585, y: 1240, z: 0.58, e: 'cubic' },
      { t: 24.4, x: 585, y: 1200, z: 0.52, e: 'sine' },
    ],
  },
  {
    id: 'countdown', start: 24, end: 30, kind: 'image', img: 'countdown',
    cam: [
      { t: 23.6, x: 1440, y: 760, z: 0.62 },
      { t: 25.9, x: 1440, y: 560, z: 0.84, e: 'sine' },
      { t: 29.4, x: 1440, y: 620, z: 0.98, e: 'sine' }, // ค่อย ๆ ดันเข้าระหว่างนับ
      { t: 30, x: 1440, y: 620, z: 0.98, e: 'linear' }, // หยุดนิ่งก่อน drop
    ],
  },
  {
    id: 'question', start: 30, end: 36, kind: 'image', img: (t) => (t < 34.05 ? 'question' : 'question-paused'),
    cam: [
      { t: 30, x: 1440, y: 760, z: 0.84 },
      { t: 30.5, x: 1440, y: 760, z: 0.7, e: 'outCubic' },
      { t: 32.0, x: 1440, y: 790, z: 0.74, e: 'sine' },
      { t: 32.75, x: 2230, y: 400, z: 1.3, e: 'cubic' },
      { t: 33.85, x: 2150, y: 410, z: 1.24, e: 'sine' },
      { t: 34.5, x: 1440, y: 1000, z: 0.78, e: 'cubic' },
      { t: 35.0, x: 1440, y: 1520, z: 1.0, e: 'cubic' },
      { t: 36.4, x: 1440, y: 1600, z: 1.08, e: 'sine' },
    ],
  },
  {
    id: 'tap', start: 36, end: 42, kind: 'phone',
    img: (t) => {
      if (t < 37.6) return 'phone-choices';
      if (t >= TAP_SENT) return 'phone-sent';
      const k = clamp(Math.floor((t - TAP0) / TAP_STEP) + 1, 0, TAP_N - 1);
      return t < TAP0 ? 'tap-000' : `tap-${String(k * 4).padStart(3, '0')}`;
    },
    cam: [
      { t: 35.6, x: 585, y: 1150, z: 0.46 },
      { t: 37.2, x: 585, y: 1180, z: 0.56, e: 'sine' },
      { t: 37.65, x: 585, y: 1150, z: 0.47, e: 'cubic' },
      { t: 40.95, x: 585, y: 1150, z: 0.66, e: 'sine' }, // ช้า ๆ ระหว่างกดรัว
      { t: 41.35, x: 585, y: 980, z: 0.62, e: 'outCubic' },
      { t: 42, x: 585, y: 985, z: 0.63, e: 'sine' },
    ],
  },
  {
    id: 'chips', start: 42, end: 46, kind: 'chips', img: 'phone-reveal',
    cam: [
      { t: 42, x: 600, y: 760, z: 0.7 },
      { t: 42.4, x: 640, y: 800, z: 0.6, e: 'outCubic' },
      { t: 42.95, x: 900, y: 900, z: 0.56, e: 'sine' },
      { t: 43.5, x: 1240, y: 1000, z: 0.5, e: 'cubic' },
      { t: 46.4, x: 1290, y: 1010, z: 0.53, e: 'sine' },
    ],
  },
  {
    id: 'reveal', start: 46, end: 48, kind: 'image', img: 'reveal',
    cam: [
      { t: 45.6, x: 800, y: 700, z: 0.98 },
      { t: 47.0, x: 820, y: 740, z: 1.06, e: 'sine' },
      { t: 47.55, x: 1440, y: 1250, z: 0.82, e: 'cubic' },
      { t: 48.4, x: 1440, y: 1270, z: 0.8, e: 'sine' },
    ],
  },
  {
    id: 'review', start: 48, end: 50, kind: 'image', img: 'review',
    cam: [{ t: 47.6, x: 1440, y: 950, z: 0.68 }, { t: 50.4, x: 1300, y: 800, z: 0.86, e: 'sine' }],
  },
  {
    id: 'results', start: 50, end: 56, kind: 'image', img: (t) => (t < 53.0 ? 'results-full' : 'results-speed-full'),
    cam: [
      { t: 49.6, x: 1441, y: 640, z: 0.74 },
      { t: 51.85, x: 1441, y: 700, z: 0.88, e: 'sine' },
      { t: 52.4, x: 1441, y: 1500, z: 0.74, e: 'cubic' },
      { t: 53.9, x: 1340, y: 1600, z: 0.8, e: 'sine' },
      { t: 54.45, x: 1480, y: 2240, z: 1.25, e: 'cubic' },
      { t: 56.0, x: 1520, y: 2245, z: 1.36, e: 'sine' },
    ],
  },
  {
    id: 'outro', start: 56, end: 60, kind: 'logo', outro: true,
    cam: [{ t: 56, x: 960, y: 540, z: 1 }, { t: 56.25, x: 960, y: 540, z: 1 }, { t: 60, x: 960, y: 545, z: 1.1, e: 'sine' }],
  },
];
const sceneById = Object.fromEntries(SCENES.map((s) => [s.id, s]));

tapRipple('setup', 11.75, 1440, 1866);
tapRipple('phoneLobby', 21.75, 585, 1506);
tapRipple('tap', 37.3, 585, 1260);
for (let i = 0; i < TAP_N; i++) tapRipple('tap', TAP0 + i * TAP_STEP, 585 + (i % 2 ? 60 : -50), 1200 + (i % 3) * 40);
tapRipple('results', 55.1, 1765, 2251);

// transitions ที่รอยต่อแต่ละฉาก
const TRANSITIONS = [
  { at: 4, type: 'zoom', pre: 0.4, post: 0.45 },
  { at: 12, type: 'zoom', pre: 0.25, post: 0.45 },
  { at: 18, type: 'whip', dir: [1, 0], pre: 0.3, post: 0.4 },
  { at: 24, type: 'whip', dir: [1, 0], pre: 0.3, post: 0.4 },
  { at: 30, type: 'cut' },
  { at: 36, type: 'whip', dir: [1, 0], pre: 0.3, post: 0.4 },
  { at: 42, type: 'cut' },
  { at: 46, type: 'whip', dir: [1, 0], pre: 0.3, post: 0.4 },
  { at: 48, type: 'whip', dir: [0, 1], pre: 0.25, post: 0.35 },
  { at: 50, type: 'zoom', pre: 0.3, post: 0.45 },
  { at: 56, type: 'cut' },
];

// คำบรรยายบนจอ (อย่างน้อย ~1.6s ต่อ 3 คำ)
const CAPTIONS = [
  { t0: 4.3, t1: 6.75, badge: '1', color: C.blue, text: 'เลือกระดับชั้น ห้อง และเนื้อหา' },
  { t0: 7.45, t1: 9.25, badge: '2', color: C.purple, text: 'ระดับความยาก · เวลาต่อข้อ' },
  { t0: 9.6, t1: 11.2, badge: '3', color: C.orange, text: 'เลือกรูปแบบการเฉลย' },
  { t0: 12.4, t1: 14.6, badge: '▦', color: C.blue, text: 'สแกน QR เข้าห้องได้ทันที' },
  { t0: 14.75, t1: 16.3, badge: '⏱', color: C.orange, text: 'QR ใช้ได้ 5 นาที' },
  { t0: 16.55, t1: 17.95, badge: '👥', color: C.pink, text: 'รองรับสูงสุด 15 ทีม' },
  { t0: 18.45, t1: 20.6, badge: '✎', color: C.blue, text: 'นักเรียนตั้งชื่อทีมบนมือถือ' },
  { t0: 20.75, t1: 23.7, badge: '🔒', color: C.purple, text: 'เลือกตัวละคร 15 ตัว ห้ามซ้ำกัน' },
  { t0: 24.3, t1: 25.85, badge: '✓', color: C.green, text: 'ทุกทีมพร้อมแข่ง!' },
  { t0: 26.0, t1: 29.4, badge: '5', color: C.orange, text: 'นับถอยหลังเข้าสู่การแข่งขัน' },
  { t0: 30.45, t1: 32.4, badge: '?', color: C.blue, text: 'โจทย์ขึ้นจอใหญ่ 4 ตัวเลือก' },
  { t0: 32.65, t1: 34.1, badge: '⏱', color: C.orange, text: 'จับเวลาทุกข้อ' },
  { t0: 34.3, t1: 35.85, badge: '⏸', color: C.purple, text: 'ครูหยุดเวลา · ข้ามข้อได้' },
  { t0: 36.4, t1: 37.6, badge: '👆', color: C.blue, text: 'เลือกคำตอบ' },
  { t0: 37.75, t1: 40.95, badge: '⚡', color: C.pink, text: 'กดตัวละครรัว ๆ 100 ครั้ง!' },
  { t0: 41.0, t1: 41.95, badge: '✓', color: C.green, text: 'ส่งคำตอบ!' },
  { t0: 42.2, t1: 45.8, badge: '★', color: C.green, text: 'คิดคะแนนให้อัตโนมัติ' },
  { t0: 46.35, t1: 47.9, badge: '✓', color: C.green, text: 'เฉลยทีละข้อ' },
  { t0: 48.3, t1: 49.9, badge: '📖', color: C.blue, text: 'หรือเฉลยทั้งหมดตอนจบ' },
  { t0: 50.4, t1: 52.15, badge: '🏆', color: C.orange, text: 'ประกาศผลบนโพเดียม' },
  { t0: 52.35, t1: 54.2, badge: '▤', color: C.purple, text: 'ตารางคะแนนความถูกต้อง · ความเร็ว' },
  { t0: 54.35, t1: 55.9, badge: '⬇', color: C.green, text: 'Export CSV · Excel' },
];

// ---------------------------------------------------------------- drawing helpers
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

const SYMBOLS = (() => {
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const chars = ['∪', '∩', '⊂', '∈', '∀', '∃', '→', '↔', 'Σ', 'θ', 'π', '√', '∞', '×', '÷', '≠', '+', '%'];
  const cols = [C.blue, C.purple, C.pink, C.orange, C.sky];
  return Array.from({ length: 34 }, (_, i) => ({ ch: chars[i % chars.length], x: rnd() * 2400, y: rnd() * 1400, size: 40 + rnd() * 110, d: 0.25 + rnd() * 0.75, col: cols[i % cols.length], rot: (rnd() - 0.5) * 0.6 }));
})();

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#dff2ff'); g.addColorStop(0.55, '#f3f8ff'); g.addColorStop(1, '#ffeaf3');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 900);
  r.addColorStop(0, 'rgba(139,92,246,0.16)'); r.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}

function drawSymbols(ctx, cam, t, strength = 1) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of SYMBOLS) {
    const px = (((s.x - cam.x * cam.z * s.d * 0.9 + t * 12 * s.d) % 2400) + 2400) % 2400 - 240;
    const py = (((s.y - cam.y * cam.z * s.d * 0.6 + Math.sin(t * 0.7 + s.x) * 14) % 1400) + 1400) % 1400 - 160;
    ctx.globalAlpha = 0.13 * strength * (0.6 + s.d * 0.6);
    ctx.fillStyle = s.col;
    ctx.font = `600 ${s.size * (0.7 + s.d * 0.5)}px ${FONT_HEAD}`;
    ctx.save(); ctx.translate(px, py); ctx.rotate(s.rot + Math.sin(t * 0.5 + s.y) * 0.08); ctx.fillText(s.ch, 0, 0); ctx.restore();
  }
  ctx.restore();
}

function drawPhone(ctx, img) {
  ctx.save();
  ctx.shadowColor = 'rgba(48,73,217,0.35)'; ctx.shadowBlur = 120; ctx.shadowOffsetY = 50;
  rr(ctx, -46, -46, 1170 + 92, 2532 + 92, 190); ctx.fillStyle = '#161a33'; ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, -46, -46, 1170 + 92, 2532 + 92, 190); ctx.lineWidth = 6; ctx.strokeStyle = '#3a4170'; ctx.stroke();
  rr(ctx, 0, 0, 1170, 2532, 150); ctx.clip();
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawLogo(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.font = `600 170px ${FONT_HEAD}`;
  const wMath = ctx.measureText('Math').width, wMotion = ctx.measureText('Motion').width;
  const mark = 230, gap = 50;
  const total = mark + gap + wMath + wMotion;
  const x0 = -total / 2;
  // mark
  ctx.save();
  ctx.shadowColor = 'rgba(79,124,255,0.5)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  const g = ctx.createLinearGradient(x0, -mark / 2, x0 + mark, mark / 2);
  g.addColorStop(0, C.sky); g.addColorStop(0.5, C.blue); g.addColorStop(1, C.purple);
  rr(ctx, x0, -mark / 2, mark, mark, 64); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `500 170px ${FONT_HEAD}`; ctx.fillText('∑', x0 + mark / 2, 6);
  ctx.font = `600 170px ${FONT_HEAD}`; ctx.textAlign = 'left';
  ctx.fillStyle = C.royal; ctx.fillText('Math', x0 + mark + gap, 10);
  ctx.fillStyle = C.purple; ctx.fillText('Motion', x0 + mark + gap + wMath, 10);
  ctx.restore();
}

function drawRipples(ctx, sceneId, t) {
  for (const r of ripples) {
    if (r.scene !== sceneId) continue;
    if (sceneId === 'tap' && t >= TAP_SENT) continue;
    const p = (t - r.t) / 0.45;
    if (p < 0 || p > 1) continue;
    const e = E.outCubic(p);
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.75;
    ctx.beginPath(); ctx.arc(r.x, r.y, 30 + e * 150, 0, Math.PI * 2);
    ctx.lineWidth = 16 * (1 - p) + 2; ctx.strokeStyle = C.blue; ctx.stroke();
    ctx.globalAlpha = (1 - p) * 0.25; ctx.fillStyle = C.sky; ctx.fill();
    ctx.restore();
  }
}

function drawChips(ctx, t) {
  const chips = [
    { y: 640, label: '✅ ตอบถูก', value: '+2', col: C.green, bg: '#dcfce7' },
    { y: 1010, label: '⚡ เร็วอันดับ 1', value: '+1', col: C.orange, bg: '#fff1d6' },
    { y: 1380, label: '⚡ อันดับ 2', value: '+0.5', col: C.pink, bg: '#ffe6f0' },
  ];
  chips.forEach((c, i) => {
    const p = prog(t, CHIP_TIMES[i], CHIP_TIMES[i] + 0.4);
    if (p <= 0) return;
    const s = E.outBack(p);
    ctx.save();
    ctx.translate(1850, c.y);
    ctx.scale(s, s);
    ctx.globalAlpha = clamp(p * 2);
    ctx.shadowColor = 'rgba(48,73,217,0.25)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
    rr(ctx, -560, -150, 1120, 300, 150); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 10; ctx.strokeStyle = c.col; ctx.stroke();
    rr(ctx, 230, -110, 290, 220, 110); ctx.fillStyle = c.bg; ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.font = `600 92px ${FONT_HEAD}`; ctx.textAlign = 'left'; ctx.fillText(c.label, -480, 8);
    ctx.fillStyle = c.col; ctx.font = `600 120px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.fillText(c.value, 375, 10);
    ctx.restore();
  });
}

function drawCountNumbers(ctx, t) {
  for (let i = 0; i < COUNT_TIMES.length; i++) {
    const t0 = COUNT_TIMES[i], t1 = COUNT_TIMES[i + 1] ?? COUNT_END;
    if (t < t0 || t >= t1 + 0.12) continue;
    const pin = prog(t, t0, t0 + 0.22), pout = prog(t, t1 - 0.02, t1 + 0.12);
    const s = lerp(1.7, 1, E.outExpo(pin)) * lerp(1, 0.8, pout);
    ctx.save();
    ctx.globalAlpha = clamp(pin * 3) * (1 - pout);
    ctx.translate(W / 2, 760); ctx.scale(s, s);
    ctx.font = `600 330px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const g = ctx.createLinearGradient(-120, -160, 120, 160);
    g.addColorStop(0, C.yellow); g.addColorStop(0.45, C.orange); g.addColorStop(0.8, C.pink); g.addColorStop(1, C.purple);
    ctx.shadowColor = 'rgba(255,111,168,0.45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    ctx.lineWidth = 22; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.strokeText(String(5 - i), 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = g; ctx.fillText(String(5 - i), 0, 0);
    ctx.restore();
  }
}

function drawLogoScene(ctx, s, t, cam) {
  drawSymbols(ctx, cam, t, 1.3);
  const t0 = s.start;
  const lt = t - t0;
  // shockwave
  const pw = prog(lt, 0, 0.7);
  if (pw > 0 && pw < 1) {
    ctx.save(); ctx.globalAlpha = (1 - pw) * 0.6;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 120 + E.outCubic(pw) * 1100, 0, Math.PI * 2);
    ctx.lineWidth = 40 * (1 - pw) + 4; ctx.strokeStyle = s.outro ? C.orange : C.blue; ctx.stroke(); ctx.restore();
  }
  // burst of math symbols
  const pb = prog(lt, 0, 1.4);
  if (pb < 1) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    SYMBOLS.slice(0, 18).forEach((sym, i) => {
      const a = (i / 18) * Math.PI * 2 + 0.3;
      const d = 430 + E.outExpo(pb) * (420 + sym.d * 480);
      ctx.globalAlpha = (1 - pb) * 0.9;
      ctx.fillStyle = sym.col; ctx.font = `600 ${50 + sym.size * 0.4}px ${FONT_HEAD}`;
      ctx.fillText(sym.ch, W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d * 0.62);
    });
    ctx.restore();
  }
  // logo slam (ปรากฏทันทีที่เฟรมแรก)
  const ps = prog(lt, 0, 0.24);
  let scale = lerp(1.9, 1, E.outExpo(ps));
  if (s.outro) scale *= 1 + 0.05 * Math.exp(-Math.max(0, t - 58) * 7) * (t >= 58 ? 1 : 0);
  drawLogo(ctx, W / 2, H / 2 - 50, scale * 0.82);
  // tagline
  const tag = s.outro ? 'สแกน · ตอบ · กดรัว · ชนะ!' : 'เกมคณิตศาสตร์แข่งสด ในห้องเรียน';
  const tagT0 = s.outro ? 56.6 : 0.6;
  const pt = prog(t, tagT0, tagT0 + 0.45);
  if (pt > 0) {
    ctx.save();
    ctx.globalAlpha = E.outCubic(pt);
    ctx.translate(W / 2, H / 2 + 150 + (1 - E.outCubic(pt)) * 40);
    ctx.font = `600 66px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(tag).width + 110;
    ctx.shadowColor = 'rgba(48,73,217,0.2)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    rr(ctx, -w / 2, -62, w, 124, 62); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = s.outro ? C.purple : C.royal; ctx.fillText(tag, 0, 4);
    ctx.restore();
  }
  if (s.outro) {
    const pu = prog(t, 58.0, 58.4);
    if (pu > 0) {
      ctx.save(); ctx.globalAlpha = E.outCubic(pu);
      ctx.font = `500 44px ${FONT_BODY}`; ctx.textAlign = 'center'; ctx.fillStyle = C.soft;
      ctx.fillText('ครูเปิดจอ · นักเรียนสแกน · เริ่มแข่งได้เลย', W / 2, H / 2 + 290 - (1 - E.outCubic(pu)) * 20);
      ctx.restore();
    }
  }
}

function sceneImage(s, t) {
  const name = typeof s.img === 'function' ? s.img(t) : s.img;
  return IMG[name];
}

// วาดฉากหนึ่ง โดยมี transform ระดับจอ (dx, dy, k) สำหรับ transition
function drawScene(ctx, s, t, xf = { dx: 0, dy: 0, k: 1, alpha: 1 }) {
  if (xf.alpha <= 0) return;
  const cam = camAt(s.cam, t);
  ctx.save();
  ctx.globalAlpha = xf.alpha;
  ctx.translate(W / 2 + xf.dx, H / 2 + xf.dy); ctx.scale(xf.k, xf.k); ctx.translate(-W / 2, -H / 2);
  if (s.kind === 'logo') {
    ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    drawLogoScene(ctx, s, t, cam);
  } else {
    if (s.kind !== 'image') drawSymbols(ctx, cam, t);
    ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    const img = sceneImage(s, t);
    if (s.kind === 'image') {
      ctx.save();
      ctx.shadowColor = 'rgba(48,73,217,0.25)'; ctx.shadowBlur = 80;
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      // ภาพ tab ความเร็วค่อย ๆ จางเข้า
      if (s.id === 'results') {
        const pf = prog(t, 52.85, 53.0);
        if (pf > 0 && pf < 1) { ctx.globalAlpha = xf.alpha * (1 - pf); ctx.drawImage(IMG['results-full'], 0, 0); }
      }
    } else {
      drawPhone(ctx, img);
      if (s.kind === 'chips') drawChips(ctx, t);
    }
    drawRipples(ctx, s.id, t);
  }
  ctx.restore();
  if (s.id === 'countdown') drawCountNumbers(ctx, t);
}

function drawCaptions(ctx, t) {
  for (const c of CAPTIONS) {
    if (t < c.t0 || t > c.t1) continue;
    const pin = E.outBack(prog(t, c.t0, c.t0 + 0.38));
    const pout = E.inCubic(prog(t, c.t1 - 0.22, c.t1));
    ctx.save();
    ctx.font = `600 56px ${FONT_HEAD}`;
    const tw = ctx.measureText(c.text).width;
    const w = tw + 230, h = 116;
    const x = 80, y = H - 96 - h + (1 - pin) * 50 - pout * 24;
    ctx.globalAlpha = clamp(prog(t, c.t0, c.t0 + 0.18)) * (1 - pout);
    ctx.translate(x, y + h / 2); ctx.scale(lerp(0.92, 1, clamp(pin)), lerp(0.92, 1, clamp(pin))); ctx.translate(0, -h / 2);
    ctx.shadowColor = 'rgba(31,42,107,0.28)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    rr(ctx, 0, 0, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 4; ctx.strokeStyle = c.color + '55'; ctx.stroke();
    ctx.beginPath(); ctx.arc(h / 2, h / 2, 40, 0, Math.PI * 2); ctx.fillStyle = c.color; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 42px ${FONT_HEAD}`; ctx.fillText(c.badge, h / 2, h / 2 + 3);
    ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = `600 56px ${FONT_HEAD}`;
    ctx.fillText(c.text, h + 30, h / 2 + 4);
    ctx.restore();
  }
}

function drawFlash(ctx, t) {
  for (const T of [30, 42, 56, 0]) {
    const p = prog(t, T, T + 0.32);
    if (t >= T && p < 1) { ctx.save(); ctx.globalAlpha = (T === 0 || T === 56 ? 0.4 : 0.6) * (1 - E.outCubic(p)); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }
  // ปิดท้าย: จางสู่สีพื้น
  const pe = prog(t, 59.35, 60);
  if (pe > 0) { ctx.save(); ctx.globalAlpha = E.sine(pe); ctx.fillStyle = '#f3f8ff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

function drawVignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, 'rgba(31,42,107,0)'); g.addColorStop(1, 'rgba(31,42,107,0.18)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- compose one instant
function sceneAt(t) {
  return SCENES.find((s) => t >= s.start && t < s.end) || SCENES[SCENES.length - 1];
}

export function drawInstant(ctx, t) {
  drawBackground(ctx);
  const tr = TRANSITIONS.find((x) => x.type !== 'cut' && t >= x.at - x.pre && t < x.at + x.post);
  if (tr) {
    const a = sceneAt(tr.at - 1e-4), b = sceneAt(tr.at);
    const p = prog(t, tr.at - tr.pre, tr.at + tr.post);
    if (tr.type === 'whip') {
      // เร่งออกแรง ๆ แล้วค่อยชะลอเข้า (quint)
      const s = E.quint(p);
      const span = (tr.dir[0] ? W : H) * 1.12;
      drawScene(ctx, a, t, { dx: -tr.dir[0] * s * span, dy: -tr.dir[1] * s * span, k: 1, alpha: 1 });
      drawScene(ctx, b, t, { dx: tr.dir[0] * (1 - s) * span, dy: tr.dir[1] * (1 - s) * span, k: 1, alpha: 1 });
    } else if (tr.type === 'zoom') {
      // ซูมทะลุ: ฉากเก่าพุ่งเข้าหากล้อง ฉากใหม่ค่อย ๆ หดเข้าที่
      const mid = tr.pre / (tr.pre + tr.post);
      const pa = prog(p, 0, mid + 0.12), pb = prog(p, mid - 0.08, 1);
      drawScene(ctx, b, t, { dx: 0, dy: 0, k: lerp(1.9, 1, E.outCubic(pb)), alpha: E.outCubic(clamp(pb * 1.6)) });
      drawScene(ctx, a, t, { dx: 0, dy: 0, k: Math.exp(lerp(0, Math.log(4.5), E.inCubic(pa))), alpha: 1 - E.inCubic(prog(pa, 0.55, 1)) });
    }
  } else {
    drawScene(ctx, sceneAt(t), t);
  }
  drawVignette(ctx);
  drawCaptions(ctx, t);
  drawFlash(ctx, t);
}

// ---------------------------------------------------------------- motion metric → จำนวน sub-frame
function screenPoint(t, wx, wy) {
  const s = sceneAt(t);
  const cam = camAt(s.cam, t);
  return [(wx - cam.x) * cam.z, (wy - cam.y) * cam.z, cam.z];
}
export function motionAt(t) {
  const dt = 1 / FPS;
  const s0 = sceneAt(t), s1 = sceneAt(t + dt);
  let m = 0;
  if (s0 === s1) {
    const c0 = camAt(s0.cam, t), c1 = camAt(s0.cam, t + dt);
    m = Math.hypot((c1.x - c0.x) * c1.z, (c1.y - c0.y) * c1.z) + Math.abs(Math.log(c1.z / c0.z)) * W * 0.5;
  }
  const tr = TRANSITIONS.find((x) => x.type !== 'cut' && t >= x.at - x.pre - dt && t < x.at + x.post);
  if (tr) {
    const pv = (tt) => E[tr.type === 'whip' ? 'quint' : 'inCubic'](prog(tt, tr.at - tr.pre, tr.at + tr.post));
    m += Math.abs(pv(t + dt) - pv(t)) * W * (tr.type === 'whip' ? 1.12 : 2.5);
  }
  return m;
}
void screenPoint;

const scratch = document.createElement('canvas');
scratch.width = W; scratch.height = H;
const sctx = scratch.getContext('2d');

export function renderFrame(ctx, t) {
  const m = motionAt(t);
  const K = clamp(Math.ceil(m / 4), 1, 16);
  if (K === 1) { drawInstant(ctx, t); return K; }
  for (let i = 0; i < K; i++) {
    let st = t + (i / (K - 1) - 0.5) * SHUTTER;
    for (const T of CUTS) { if (t >= T && st < T) st = T; if (t < T && st >= T) st = T - 1e-4; }
    st = clamp(st, 0, DUR - 1e-4);
    drawInstant(sctx, st);
    ctx.globalAlpha = 1 / (i + 1);
    ctx.drawImage(scratch, 0, 0);
  }
  ctx.globalAlpha = 1;
  return K;
}

// ---------------------------------------------------------------- MUSIC (OfflineAudioContext)
const SR = 48000;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [57, 60, 65] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];
const chordAt = (t) => PROG[Math.floor(t / BAR) % 4];
const LEAD = [[0, 76, 2], [2, 76, 1], [3, 79, 1], [4, 81, 2], [6, 79, 2], [8, 76, 2], [10, 74, 2], [12, 72, 4],
  [16, 76, 2], [18, 76, 1], [19, 79, 1], [20, 81, 2], [22, 84, 2], [24, 83, 3], [27, 81, 1], [28, 79, 4]];

export async function renderMusic() {
  const ac = new OfflineAudioContext(2, SR * DUR, SR);
  const master = ac.createGain(); master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
  master.connect(comp); comp.connect(ac.destination);
  master.gain.setValueAtTime(0.9, 59.0); master.gain.linearRampToValueAtTime(0, 60);

  // reverb
  const rev = ac.createConvolver();
  const irLen = SR * 2.2, ir = ac.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
  rev.buffer = ir;
  const revGain = ac.createGain(); revGain.gain.value = 0.32; rev.connect(revGain); revGain.connect(master);

  // ducked bus (sidechain pump) สำหรับ pad/bass/stab
  const duck = ac.createGain(); duck.connect(master); duck.connect(rev);
  const dryRev = (node, amt) => { const g = ac.createGain(); g.gain.value = amt; node.connect(g); g.connect(rev); };

  const noise = ac.createBuffer(1, SR * 2, SR);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const noiseSrc = (t, dur) => { const s = ac.createBufferSource(); s.buffer = noise; s.start(t, Math.random() * 0.5, dur + 0.05); return s; };
  const env = (g, t, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };

  const kick = (t, v = 1) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    env(g, t, 0.003, 0.95 * v, 0.42); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5);
  };
  const snare = (t, v = 0.5) => {
    const n = noiseSrc(t, 0.25), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    env(g, t, 0.002, v, 0.2); n.connect(f); f.connect(g); g.connect(master); dryRev(g, 0.25);
    const o = ac.createOscillator(), og = ac.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    env(og, t, 0.002, v * 0.7, 0.1); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.15);
  };
  const clap = (t, v = 0.42) => {
    for (const off of [0, 0.011, 0.023]) {
      const n = noiseSrc(t + off, 0.2), f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
      env(g, t + off, 0.001, v, off === 0.023 ? 0.18 : 0.03); n.connect(f); f.connect(g); g.connect(master); dryRev(g, 0.35);
    }
  };
  const hat = (t, open = false, v = 0.16) => {
    const n = noiseSrc(t, open ? 0.3 : 0.08), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'highpass'; f.frequency.value = 7500;
    env(g, t, 0.001, v, open ? 0.24 : 0.045); n.connect(f); f.connect(g); g.connect(master);
  };
  const crash = (t, v = 0.32, d = 1.8) => {
    const n = noiseSrc(t, d), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'highpass'; f.frequency.value = 3500;
    env(g, t, 0.003, v, d); n.connect(f); f.connect(g); g.connect(master); dryRev(g, 0.5);
  };
  const saw = (t, freq, dur, v, cutoff = 1200, dest = duck, type = 'sawtooth', detune = [0]) => {
    const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff * 2.2, t); f.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.25, dur));
    for (const dt of detune) { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + 0.3); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    f.connect(g); g.connect(dest);
    return g;
  };
  const bass = (t, m, dur, v = 0.3) => saw(t, midi(m), dur, v, 420);
  const pluck = (t, m, v = 0.07) => { const g = saw(t, midi(m), 0.12, v, 1800, master, 'square'); dryRev(g, 0.6); };
  const stab = (t, tones, v = 0.07) => tones.forEach((m) => saw(t, midi(m + 12), 0.16, v, 2400, duck, 'sawtooth', [-9, 9]));
  const pad = (t, tones, dur, v = 0.05) => tones.forEach((m) => {
    const f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'lowpass'; f.frequency.value = 1500;
    for (const dt of [-12, 0, 12]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + 1.5); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.35); g.gain.setValueAtTime(v, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    f.connect(g); g.connect(duck);
  });
  const lead = (t, m, dur, v = 0.085) => {
    const g = saw(t, midi(m), dur, v, 3200, master, 'square', [-7, 7]); dryRev(g, 0.4);
  };
  const blip = (t, freq, v = 0.25, d = 0.18) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = freq;
    env(g, t, 0.003, v, d); o.connect(g); g.connect(master); dryRev(g, 0.4); o.start(t); o.stop(t + d + 0.05);
  };
  const ding = (t, m, v = 0.22) => { for (const [mul, a] of [[1, 1], [2, 0.4], [3.01, 0.15]]) blip(t, midi(m) * mul, v * a, 0.9); };
  const pop = (t, freq, v = 0.2) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    env(g, t, 0.002, v, 0.07); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.1);
  };
  const riser = (t0, t1, v = 0.22) => {
    const n = ac.createBufferSource(); n.buffer = noise; n.loop = true;
    const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.Q.value = 2.5; f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
    n.connect(f); f.connect(g); g.connect(master); dryRev(g, 0.3); n.start(t0); n.stop(t1 + 0.05);
  };
  const whoosh = (T, v = 0.22, pre = 0.3, post = 0.35) => {
    const t0 = T - pre, n = noiseSrc(t0, pre + post), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t0); f.frequency.exponentialRampToValueAtTime(4200, T); f.frequency.exponentialRampToValueAtTime(700, T + post);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, T); g.gain.exponentialRampToValueAtTime(0.0001, T + post);
    n.connect(f); f.connect(g); g.connect(master); dryRev(g, 0.3);
  };
  const impact = (t, v = 1) => {
    kick(t, 1.1 * v); crash(t, 0.34 * v, 2.2);
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 1.2);
    env(g, t, 0.005, 0.55 * v, 1.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.8);
  };
  const pump = (t0, t1) => { for (let t = t0; t < t1; t += BEAT) { duck.gain.setValueAtTime(0.3, t); duck.gain.linearRampToValueAtTime(1, t + 0.28); } };

  // ---------- arrangement ----------
  const beats = (t0, t1, fn, step = BEAT) => { for (let t = t0; t < t1 - 1e-6; t += step) fn(t); };
  const grooveDrums = (t0, t1, { claps = false, open = false, hats16 = false } = {}) => {
    beats(t0, t1, (t) => kick(t));
    beats(t0, t1, (t) => hat(t + BEAT / 2, open, open ? 0.12 : 0.16));
    if (hats16) beats(t0, t1, (t) => hat(t, false, 0.07), BEAT / 4);
    if (claps) beats(t0 + BEAT, t1, (t) => clap(t), BEAT * 2);
  };
  const bassLine = (t0, t1, step = BEAT / 2) => beats(t0, t1, (t) => { const c = chordAt(t); const i = Math.round((t - t0) / step); bass(t, c.root + (i % 4 === 2 ? 12 : 0), step * 0.85); }, step);
  const arps = (t0, t1, v = 0.06) => beats(t0, t1, (t) => { const c = chordAt(t); const i = Math.round(t / (BEAT / 4)); pluck(t, c.tones[[0, 1, 2, 1][i % 4]] + 12 + (i % 8 >= 4 ? 12 : 0), v); }, BEAT / 4);
  const pads = (t0, t1, v) => beats(t0, t1, (t) => pad(t, chordAt(t).tones, BAR - 0.05, v), BAR);
  const stabs = (t0, t1) => beats(t0, t1, (t) => stab(t + BEAT / 2, chordAt(t).tones), BEAT);
  const leadHook = (t0, bars) => { for (let b = 0; b < bars; b += 2) for (const [st, m, len] of LEAD) { const t = t0 + b * BAR + st * (BEAT / 4); if (t < t0 + bars * BAR) lead(t, m, len * (BEAT / 4) * 0.9); } };

  // 0–4: intro (logo slam ที่ 0)
  impact(0, 1.1); pads(0, 4, 0.045); arps(0.5, 4, 0.035); kick(2, 0.6); kick(3, 0.6); kick(3.5, 0.7);
  riser(2.8, 4.0, 0.16); whoosh(4.0, 0.2, 0.4, 0.45);
  // 4–12: groove A (setup)
  grooveDrums(4, 12); bassLine(4, 12); arps(4, 12); pads(4, 12, 0.03); pump(4, 12);
  beats(11.5, 12, (t) => snare(t, 0.3 + (t - 11.5) * 0.6), BEAT / 4);
  for (const t of [7.2, 9.6]) whoosh(t, 0.06, 0.3, 0.25); // ตามการเคลื่อนกล้อง
  blip(11.4, midi(84), 0.12, 0.2); pop(11.75, 900, 0.25);
  whoosh(12, 0.22, 0.25, 0.45); crash(12, 0.2);
  // 12–24: groove B (lobby + มือถือ)
  grooveDrums(12, 24, { claps: true, open: true }); bassLine(12, 24); stabs(12, 24); pads(12, 24, 0.028); arps(12, 24, 0.03); pump(12, 24);
  for (const t of [14.7, 16.5, 21.05]) whoosh(t, 0.07, 0.35, 0.25);
  ding(16.95, 88, 0.12); pop(21.75, 900, 0.25); ding(22.0, 84, 0.14);
  whoosh(18, 0.22); whoosh(24, 0.22); crash(18, 0.14); crash(24, 0.18);
  // 24–29.5: build + countdown
  grooveDrums(24, 26); bassLine(24, 26);
  beats(26, 27.5, (t) => snare(t, 0.12 + (t - 26) * 0.08), BEAT / 2);
  beats(27.5, 28.75, (t) => snare(t, 0.2 + (t - 27.5) * 0.1), BEAT / 4);
  beats(28.75, COUNT_END, (t) => snare(t, 0.3 + (t - 28.75) * 0.2), BEAT / 8);
  beats(26, COUNT_END, (t) => bass(t, 33, BEAT / 2 * 0.8, 0.22), BEAT / 2);
  riser(26, COUNT_END, 0.26);
  COUNT_TIMES.forEach((t, i) => { blip(t, i === 4 ? 1318.5 : 880, 0.3, 0.25); kick(t, 0.7); });
  // 29.5–30: เงียบ (ช่วงหยุดให้ drop มีพลัง)
  // 30–41: DROP (โจทย์ + มินิเกม)
  impact(30, 1.1);
  grooveDrums(30, 41, { claps: true, hats16: true }); bassLine(30, 41, BEAT / 4); stabs(30, 41); pads(30, 41, 0.03); pump(30, 41);
  leadHook(30, 3); leadHook(36, 2);
  whoosh(32.75, 0.08, 0.3, 0.2); whoosh(34.45, 0.06, 0.3, 0.2);
  blip(34.05, midi(72), 0.16, 0.3); // pause
  whoosh(36, 0.22); crash(36, 0.15);
  pop(37.3, 900, 0.28);
  for (let i = 0; i < TAP_N; i++) pop(TAP0 + i * TAP_STEP, 520 * Math.pow(2, i / 14), 0.24);
  // 41: ส่งคำตอบ! → หยุดสั้น ๆ 1 วินาที
  ding(TAP_SENT, 84, 0.3); ding(TAP_SENT, 88, 0.2); kick(TAP_SENT, 1); crash(TAP_SENT, 0.22, 1.2); pad(TAP_SENT, [57, 60, 64], 0.7, 0.04);
  riser(41.2, 42, 0.14);
  // 42–50: คะแนน + เฉลย
  impact(42, 0.8); ding(42.0, 81, 0.18);
  grooveDrums(42, 50, { claps: true, open: true }); bassLine(42, 50); stabs(42, 50); arps(42, 50, 0.028); pads(42, 50, 0.028); pump(42, 50);
  CHIP_TIMES.forEach((t, i) => ding(t, [84, 88, 91][i], 0.22));
  whoosh(43.5, 0.07, 0.3, 0.2); whoosh(46, 0.22); whoosh(47.55, 0.07, 0.3, 0.2); whoosh(48, 0.2, 0.25, 0.35);
  ding(46.0, 88, 0.12);
  // 50–56: ผลการแข่งขัน
  whoosh(50, 0.2, 0.3, 0.45); crash(50, 0.3);
  grooveDrums(50, 56, { claps: true, hats16: true }); bassLine(50, 56); stabs(50, 56); pads(50, 56, 0.032); pump(50, 56);
  leadHook(50, 3);
  ding(50.25, 91, 0.16); whoosh(52.4, 0.07, 0.3, 0.2); blip(53.0, midi(79), 0.12, 0.2); whoosh(54.45, 0.07, 0.3, 0.2); pop(55.1, 900, 0.28);
  // 56–60: outro
  impact(56, 1.15); pad(56, [55, 60, 64], 3.6, 0.05); arps(56.25, 58, 0.03);
  kick(58, 1); crash(58, 0.3, 2.2); stab(58, [55, 60, 64], 0.09); stab(58, [48, 55, 60], 0.07); ding(58, 84, 0.2);

  return ac.startRendering();
}

// ---------------------------------------------------------------- encode
export async function encodeAll(onProgress, saveChunk) {
  const audio = await renderMusic();
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: { codec: 'opus', numberOfChannels: 2, sampleRate: SR },
  });
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { throw e; } });
  venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 18_000_000, framerate: FPS, latencyMode: 'quality', avc: { format: 'avc' } });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { throw e; } });
  aenc.configure({ codec: 'opus', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });

  const L = audio.getChannelData(0), R = audio.getChannelData(1);
  const CH = 4800;
  for (let i = 0; i < L.length; i += CH) {
    const n = Math.min(CH, L.length - i);
    const data = new Float32Array(n * 2); data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
    aenc.encode(new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data }));
  }

  const out = document.getElementById('out');
  const ctx = out.getContext('2d');
  const total = FPS * DUR;
  const stats = [];
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    const K = renderFrame(ctx, t);
    stats.push(K);
    const frame = new VideoFrame(out, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
    if (f % 30 === 0) await onProgress?.(f, total, K);
  }
  await venc.flush(); await aenc.flush();
  muxer.finalize();
  const buf = new Uint8Array(target.buffer);
  const SZ = 1 << 20;
  for (let i = 0; i < buf.length; i += SZ) {
    let s = ''; const part = buf.subarray(i, i + SZ);
    for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
    await saveChunk(btoa(s), i === 0);
  }
  return { bytes: buf.length, avgSubframes: stats.reduce((a, b) => a + b, 0) / stats.length };
}

// ---------------------------------------------------------------- analysis helpers (สำหรับรีวิว)
export function analyze() {
  const rows = [];
  for (let f = 0; f < FPS * DUR; f++) rows.push(motionAt(f / FPS));
  return rows;
}
export async function audioOnsets() {
  const buf = await renderMusic();
  const L = buf.getChannelData(0);
  const win = SR / 100; const env = [];
  for (let i = 0; i < L.length; i += win) { let s = 0; for (let j = i; j < i + win && j < L.length; j++) s += L[j] * L[j]; env.push(Math.sqrt(s / win)); }
  return env; // RMS ทุก 10ms
}

// ---------------------------------------------------------------- boot
window.MM = { loadAssets, renderFrame, drawInstant, encodeAll, analyze, audioOnsets, W, H, FPS, DUR, sceneById };
loadAssets().then(() => { window.MM_READY = true; }).catch((e) => { window.MM_ERROR = String(e); });
