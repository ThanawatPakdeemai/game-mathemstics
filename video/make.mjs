// node make.mjs            → out/mathmotion-intro.mp4
// node make.mjs sheet      → out/sheet-*.png (contact sheets ทุก 0.5s สำหรับรีวิว)
// node make.mjs stills 1.2,3.4 → out/stills/*.png
// node make.mjs analyze    → วิเคราะห์ความลื่นของกล้อง + จังหวะเสียง
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const [mode = 'encode', arg] = process.argv.slice(2);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
await page.route('http://localhost/**', (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
});
await page.goto('http://localhost/index.html');
await page.waitForFunction(() => window.MM_READY || window.MM_ERROR, null, { timeout: 60000 });
const err = await page.evaluate(() => window.MM_ERROR);
if (err) throw new Error(err);

const saveDataUrl = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

if (mode === 'stills') {
  fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });
  for (const t of arg.split(',').map(Number)) {
    const url = await page.evaluate((t) => { const c = document.getElementById('out'); MM.renderFrame(c.getContext('2d'), t); return c.toDataURL('image/png'); }, t);
    saveDataUrl(path.join(OUT, 'stills', `t${t.toFixed(2).padStart(5, '0')}.png`), url);
  }
  console.log('stills saved');
} else if (mode === 'sheet') {
  const step = Number(arg) || 0.5;
  const urls = await page.evaluate(async (step) => {
    const c = document.getElementById('out'), ctx = c.getContext('2d');
    const tw = 384, th = 216, cols = 5, rows = 6, per = cols * rows;
    const times = []; for (let t = 0; t < MM.DUR; t += step) times.push(+t.toFixed(3));
    const out = [];
    for (let s = 0; s < times.length; s += per) {
      const sheet = document.createElement('canvas'); sheet.width = tw * cols; sheet.height = th * rows;
      const sc = sheet.getContext('2d'); sc.fillStyle = '#000'; sc.fillRect(0, 0, sheet.width, sheet.height);
      times.slice(s, s + per).forEach((t, i) => {
        MM.renderFrame(ctx, t);
        const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
        sc.drawImage(c, x, y, tw - 2, th - 2);
        sc.fillStyle = 'rgba(0,0,0,.7)'; sc.fillRect(x, y, 70, 28); sc.fillStyle = '#fff'; sc.font = '20px monospace'; sc.fillText(t.toFixed(2), x + 4, y + 21);
      });
      out.push(sheet.toDataURL('image/png'));
    }
    return out;
  }, step);
  urls.forEach((u, i) => saveDataUrl(path.join(OUT, `sheet-${i + 1}.png`), u));
  console.log(`${urls.length} sheets`);
} else if (mode === 'analyze') {
  const { motion, env } = await page.evaluate(async () => ({ motion: MM.analyze(), env: await MM.audioOnsets() }));
  const FPS = 30;
  // 1) ความลื่น: การเปลี่ยนความเร็วแบบกระชากระหว่างเฟรม (ไม่นับรอยตัดที่ตั้งใจ)
  const cuts = [4, 12, 18, 24, 30, 36, 42, 46, 48, 50, 56];
  // หาเฉพาะ "กระตุก" จริง: jerk ที่โดดขึ้นมาเดี่ยว ๆ เทียบกับเฟรมข้างเคียง (ความเร่งไม่ต่อเนื่อง)
  const jerk = motion.map((_, f) => (f < 2 || f >= motion.length - 1 ? 0 : motion[f + 1] - 2 * motion[f] + motion[f - 1]));
  const jerks = [];
  for (let f = 3; f < motion.length - 3; f++) {
    const t = f / FPS;
    if (cuts.some((c) => Math.abs(t - c) < 0.5)) continue;
    const around = (Math.abs(jerk[f - 2]) + Math.abs(jerk[f + 2])) / 2;
    if (Math.abs(jerk[f]) > 8 && Math.abs(jerk[f]) > 3 * around + 4) jerks.push({ t: t.toFixed(2), speed: motion[f].toFixed(1), jerk: jerk[f].toFixed(1) });
  }
  const peaks = [];
  for (let f = 1; f < motion.length - 1; f++) if (motion[f] > 60 && motion[f] >= motion[f - 1] && motion[f] > motion[f + 1]) peaks.push(`${(f / FPS).toFixed(2)}s:${motion[f].toFixed(0)}`);
  console.log('fast-move peaks (px/frame):', peaks.join('  '));
  console.log('peak speed px/frame:', Math.max(...motion).toFixed(1));
  console.log('slow-motion stalls (speed <0.15 for >0.6s outside planned holds):');
  let run = 0;
  for (let f = 0; f < motion.length; f++) { if (motion[f] < 0.15) run++; else { if (run > 18) console.log(`  ${((f - run) / FPS).toFixed(2)}–${(f / FPS).toFixed(2)}s`); run = 0; } }
  console.log('jerk spikes:', jerks.length ? jerks : 'none');
  // 2) เสียง: หา transient ใกล้รอยตัดทุกจุด
  const near = (T) => { let best = 0, at = 0; for (let i = Math.round((T - 0.06) * 100); i <= Math.round((T + 0.06) * 100); i++) if (env[i] > best) { best = env[i]; at = i / 100; } const before = env.slice(Math.round((T - 0.3) * 100), Math.round((T - 0.1) * 100)); return { at, rise: best / (Math.max(...before, 1e-4)) }; };
  console.log('audio hits at cuts/beats (time → peak time, rise ×):');
  for (const T of [0, 4, 12, 18, 24, 26, 27, 28, 28.5, 29, 30, 36, 37.75, 41, 42, 42.5, 43.5, 44.5, 46, 48, 50, 56, 58]) {
    const r = near(T); console.log(`  ${T.toFixed(2)} → ${r.at.toFixed(2)}  ×${r.rise.toFixed(1)}`);
  }
  const silent = env.slice(2950, 2995);
  console.log('29.5–29.95 pause RMS max:', Math.max(...silent).toFixed(4), ' vs drop RMS:', Math.max(...env.slice(3000, 3020)).toFixed(4));
} else {
  const file = path.join(OUT, 'mathmotion-intro.mp4');
  let fd;
  await page.exposeFunction('saveChunk', (b64, first) => {
    if (first) fd = fs.openSync(file, 'w');
    fs.writeSync(fd, Buffer.from(b64, 'base64'));
  });
  await page.exposeFunction('progress', (f, total, K) => process.stdout.write(`\r  frame ${f}/${total}  (sub-frames ${K})   `));
  const t0 = Date.now();
  const res = await page.evaluate(() => MM.encodeAll(window.progress, window.saveChunk));
  fs.closeSync(fd);
  console.log(`\n✅ ${file}  ${(res.bytes / 1e6).toFixed(1)} MB  avg sub-frames ${res.avgSubframes.toFixed(2)}  in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
