// เล่นเกมจริง 1 รอบ (ครู 1 + มือถือ 6 เครื่อง) แล้วถ่ายภาพทุกฟีเจอร์เพื่อใช้ในวิดีโอ
// ต้องรันเซิร์ฟเวอร์ก่อน: (cd .. && npm run build && PORT=3099 PUBLIC_URL=https://mathmotion.app node server/index.js)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:3099';
const OUT = new URL('./assets/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
.backdrop span{opacity:.07}.toast{display:none!important}`;
const TAP_CSS = `.tap-pop{display:none!important}
.wiggle-l{transform:translateX(-16px) rotate(-11deg) scale(.9,1.06)!important}
.wiggle-r{transform:translateX(16px) rotate(11deg) scale(.9,1.06)!important}`;

const TEAMS = [
  { name: 'ทีมแมวส้ม', char: 0 },
  { name: 'ทีมนักคณิต', char: 1 },
  { name: 'ทีมสายฟ้า', char: 7 },
  { name: 'ทีมดาวเหนือ', char: 4 },
  { name: 'ทีมจรวด', char: 10 },
  { name: 'ทีมอินฟินิตี้', char: 14 },
];

const browser = await chromium.launch();
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}${name}.png`, ...opts });
  console.log('📸', name);
};
const freeze = (page, extra = '') => page.addStyleTag({ content: FREEZE + extra });

// ---------- ครู: ตั้งค่า ----------
const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
host.on('dialog', (d) => d.accept());
await host.goto(BASE);
await host.waitForLoadState('networkidle');
await freeze(host);
await shot(host, 'setup-empty');
await host.getByRole('button', { name: 'ม.4' }).click();
await host.getByPlaceholder('เช่น ม.6/9').fill('ม.4/2');
await host.getByRole('button', { name: /เซต/ }).click();
await host.getByRole('button', { name: /3 นาที/ }).click();
await host.getByText('เฉลยคำตอบทีละข้อ').click();
await host.locator('input').first().blur();
await shot(host, 'setup', { fullPage: true });
await host.getByRole('button', { name: /สร้างห้องเกม/ }).click();
await host.waitForSelector('.qr-card');
await freeze(host);
await shot(host, 'lobby-empty');

// ---------- นักเรียน ----------
const joinPath = new URL(await host.locator('.join-url').innerText()).pathname;
const phones = [];
for (const team of TEAMS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + joinPath);
  await page.waitForSelector('.carousel');
  await freeze(page, TAP_CSS);
  phones.push({ page, team });
}

// โทรศัพท์เครื่องแรก: ก่อนเลือก (ตัวละครที่ 1 ถูกจองโดยทีมนักคณิต)
const p0 = phones[0].page;
const p1 = phones[1].page;
await p1.getByPlaceholder('ชื่อตัวแทนกลุ่มหรือนักเรียน').fill(TEAMS[1].name);
await p1.locator('.carousel-nav.next').click();
await p1.waitForTimeout(500);
await p1.getByRole('button', { name: 'เลือกตัวละครนี้' }).click();
await p0.getByPlaceholder('ชื่อตัวแทนกลุ่มหรือนักเรียน').fill(TEAMS[0].name);
await p0.locator('.carousel-nav.next').click();
await p0.waitForTimeout(600);
await p0.locator('input').first().blur();
await shot(p0, 'phone-lobby-taken');
await p0.locator('.carousel-nav.prev').click();
await p0.waitForTimeout(600);
await p0.getByRole('button', { name: 'เลือกตัวละครนี้' }).click();
await p0.waitForTimeout(300);
await shot(p0, 'phone-lobby-mine');

// ทีมที่เหลือเลือกผ่าน socket ของหน้าเว็บ (เร็วกว่าเลื่อน carousel)
for (const { page, team } of phones.slice(2)) {
  await page.getByPlaceholder('ชื่อตัวแทนกลุ่มหรือนักเรียน').fill(team.name);
  for (let i = 0; i < team.char; i++) await page.locator('.carousel-nav.next').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'เลือกตัวละครนี้' }).click();
}
await host.waitForTimeout(800);
await shot(host, 'lobby');

// ---------- เริ่มเกม ----------
await host.getByRole('button', { name: /เริ่มเกม/ }).click();
await host.waitForSelector('.roster');
await freeze(host, '.big-count-wrap{visibility:hidden}');
await shot(host, 'countdown');
await p0.waitForSelector('.big-count');
await freeze(p0, '.big-count{visibility:hidden}');
await shot(p0, 'phone-countdown');
await host.waitForSelector('.question-card', { timeout: 10000 });
await host.waitForTimeout(300);

async function tapAnswer(page, choice, { frames = false } = {}) {
  await page.locator('.m-choices .choice').nth(choice).click();
  const target = page.locator('.tap-target');
  await target.waitFor();
  if (frames) await shot(page, 'tap-000');
  for (let i = 1; i <= 100; i++) {
    await target.dispatchEvent('pointerdown', { clientX: 195, clientY: 420 });
    if (frames && i % 4 === 0 && i < 100) await shot(page, `tap-${String(i).padStart(3, '0')}`);
  }
  await page.waitForSelector('.sent-card');
}

// ข้อ 1: แต่ละทีมเลือกคนละคำตอบ → มีอย่างน้อย 1 ทีมตอบถูกแน่นอน
await shot(p0, 'phone-choices');
await tapAnswer(phones[2].page, 0);
await tapAnswer(phones[1].page, 1);
await tapAnswer(p0, 2, { frames: true });
await shot(p0, 'phone-sent');
await host.waitForTimeout(500);
await shot(host, 'question');
await tapAnswer(phones[3].page, 3);
await tapAnswer(phones[4].page, 2);

// พักชั่วคราว
await host.getByRole('button', { name: /หยุดชั่วคราว/ }).click();
await host.waitForSelector('.paused-overlay');
await shot(host, 'question-paused');
await host.getByRole('button', { name: /เล่นต่อ/ }).click();

await host.getByRole('button', { name: /ข้อถัดไป/ }).click();
await host.waitForSelector('.reveal-list');
await shot(host, 'reveal');
const correct = await host.locator('.choice.is-correct .choice-label').innerText();
const correctIdx = ['ก', 'ข', 'ค', 'ง'].indexOf(correct.trim());
// choice ที่แต่ละทีมเลือกในข้อ 1 → หาทีมที่ตอบถูก
const phoneByChoice = { 0: 2, 1: 1, 2: 0, 3: 3 };
await shot(phones[phoneByChoice[correctIdx]].page, 'phone-reveal');

// ข้อ 2-5: ตอบแบบสุ่มให้คะแนนหลากหลาย
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rnd = (n) => Math.floor(rand() * n);
for (let q = 1; q < 5; q++) {
  await host.getByRole('button', { name: /ข้อถัดไป/ }).click(); // เฉลย → ข้อถัดไป
  await host.waitForSelector('.answer-strip');
  const order = [...phones.keys()].sort(() => rand() - 0.5).slice(0, 5);
  for (const i of order) await tapAnswer(phones[i].page, rnd(3) === 0 ? rnd(4) : 0);
  await host.waitForTimeout(300);
  if (q < 4) {
    await host.getByRole('button', { name: /ข้อถัดไป/ }).click(); // จบข้อ → เฉลย
    await host.waitForSelector('.reveal-list');
  } else {
    await host.getByRole('button', { name: /จบเกม/ }).click();
  }
}
await host.waitForSelector('.review-list');
await host.waitForTimeout(500);
await shot(host, 'review');
await shot(host, 'review-full', { fullPage: true });
await shot(p0, 'phone-final', { fullPage: true });
await host.getByRole('button', { name: /แสดงผลการแข่งขัน/ }).click();
await host.waitForSelector('.podium');
await shot(host, 'results-full', { fullPage: true });
await host.getByRole('tab', { name: /ความเร็ว/ }).click();
await shot(host, 'results-speed-full', { fullPage: true });

await browser.close();
console.log('done');
