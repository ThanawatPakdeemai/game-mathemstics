# MathMotion 🎮

เกมคณิตศาสตร์ออนไลน์ในห้องเรียน: คุณครูเปิดจอผ่านโปรเจคเตอร์ นักเรียนใช้มือถือสแกน QR-Code เข้าร่วมแบบ real-time (Socket.IO)

## วิธีรัน

```bash
npm install

# โหมดพัฒนา (เซิร์ฟเวอร์ :3000 + หน้าเว็บ :5173)
npm run dev
# เปิดหน้าครูที่ http://localhost:5173

# โหมดใช้งานจริง (พอร์ตเดียว :3000)
npm run build
npm start
# เปิดหน้าครูที่ http://localhost:3000
```

- มือถือนักเรียนต้องต่อ **Wi-Fi เดียวกับเครื่องครู** — QR-Code จะใช้ IP ในวง LAN ของเครื่องให้อัตโนมัติ
- ลิงก์ที่ใช้ใน QR ตอน deploy ตั้งไว้ใน `.env.production` (`PUBLIC_URL` / `VITE_PUBLIC_URL` = https://game-mathemstics.vercel.app) — ไม่มีผลกับ `npm run dev`
- ถ้าเครื่องครูเปิด firewall ต้องอนุญาตพอร์ต 5173 (dev) หรือ 3000 (production)
- ทดสอบหลายผู้เล่นบนเครื่องเดียว: ใช้หน้าต่าง incognito/คนละเบราว์เซอร์ (แต่ละเบราว์เซอร์จำผู้เล่นไว้ 1 คน เพื่อให้กลับเข้าห้องเดิมได้เมื่อหลุด)

## Deploy (หน้าเว็บบน Vercel + เซิร์ฟเวอร์เกมแยก)

Vercel โฮสต์ได้เฉพาะหน้าเว็บ (static) — **รันเซิร์ฟเวอร์ Socket.IO ไม่ได้** จึงต้องแยกเป็น 2 ส่วน:

1. **เซิร์ฟเวอร์เกม** — deploy repo นี้บนบริการที่รัน Node ค้างไว้ได้ (Render / Railway / Fly.io)
   - Build: `npm install && npm run build` · Start: `npm start`
2. **หน้าเว็บ (Vercel)** — ใส่ URL ของเซิร์ฟเวอร์จากข้อ 1 ใน `.env.production`:
   ```
   VITE_SERVER_URL=https://your-game-server.onrender.com
   ```
   แล้ว deploy ใหม่ (`vercel.json` ตั้ง rewrite ไว้แล้ว ลิงก์ `/join/xxxxxx` จึงเปิดตรงได้)

หรือจะใช้แค่เซิร์ฟเวอร์จากข้อ 1 อย่างเดียวก็ได้ (มันเสิร์ฟหน้าเว็บด้วย) — ให้เปลี่ยน `PUBLIC_URL`/`VITE_PUBLIC_URL` เป็นโดเมนของเซิร์ฟเวอร์นั้นแทน

## โครงสร้าง

```
shared/constants.js        ค่าตั้งต้น: ระดับชั้น/หมวด, ความยาก, เวลา, คะแนน, จำนวนกด 100 ครั้ง
server/index.js            Express + Socket.IO (event ของครูและนักเรียน)
server/game.js             ตรรกะห้องเกม: lobby, ตัวจับเวลา (pause ได้), ให้คะแนน, สรุปผล
server/questionBank.js     โหลด/ตรวจสอบ/สุ่มโจทย์ + importQuestionSet() สำหรับอนาคต
server/data/questions/     คลังโจทย์ JSON (AI สร้าง): ม.4 เซต, ม.4 ตรรกศาสตร์, ม.5 ตรีโกณ, ม.6 ลำดับและอนุกรม
src/host/                  หน้าจอครู: ตั้งค่า → QR/ล็อบบี้ → นับถอยหลัง → โจทย์ → เฉลย → สรุปผล/Export
src/player/                หน้าจอนักเรียน: ชื่อ + เลือกตัวละคร → ตอบ → มินิเกมกด 100 ครั้ง → ผลคะแนน
racing-characters-15/      รูปตัวละคร 15 ตัว
```

## กติกาคะแนน

| ประเภท | เงื่อนไข | คะแนน |
|---|---|---|
| ความถูกต้อง | ตอบถูก | +2 |
| ความถูกต้อง | ตอบผิด / ไม่ทันเวลา | 0 |
| ความเร็ว | ส่งคำตอบ (กดครบ 100 ครั้ง) เป็นลำดับที่ 1 | +1 |
| ความเร็ว | ลำดับที่ 2 | +0.5 |
| ความเร็ว | ลำดับที่ 3 ขึ้นไป / ไม่ทันเวลา | 0 |

ปรับค่าได้ที่ `SCORE` และ `TAPS_REQUIRED` ใน `shared/constants.js`

## เพิ่มโจทย์เอง (รูปแบบ JSON)

วางไฟล์ `.json` ไว้ใน `server/data/questions/` แล้วรีสตาร์ทเซิร์ฟเวอร์ (ระบบรวมกับโจทย์เดิมให้อัตโนมัติ)

```json
{
  "grade": "m4",
  "topic": "sets",
  "title": "เซต",
  "questions": [
    {
      "id": "my-001",
      "difficulty": "easy",
      "question": "ให้ A = {1, 2} จำนวนสับเซตของ A คือ",
      "choices": ["2", "3", "4", "8"],
      "answer": 2,
      "explanation": "2² = 4"
    }
  ]
}
```

- `grade`: `m4` | `m5` | `m6`, `topic`: `sets` | `logic` | `trig` | `sequences`
- `difficulty`: `easy` | `medium` | `hard`, `answer`: index ของคำตอบที่ถูก (0 = ก … 3 = ง)
- ระบบสลับลำดับตัวเลือกให้ทุกเกม
- ฟังก์ชัน `importQuestionSet(json, { persist })` ใน `server/questionBank.js` เตรียมไว้สำหรับทำปุ่ม import บนหน้าเว็บในอนาคต
# game-mathemstics
