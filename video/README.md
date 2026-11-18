# MathMotion — วิดีโอแนะนำ 60 วินาที

เรนเดอร์ทั้งหมดใน Chromium (Canvas + WebAudio + WebCodecs) ไม่ต้องใช้ ffmpeg

```bash
npm install
# 1) ถ่ายภาพหน้าจอจริงของแอป (ต้องรันเซิร์ฟเวอร์เกมก่อน)
(cd .. && npm run build && PORT=3099 PUBLIC_URL=https://mathmotion.app node server/index.js) &
node capture.mjs
# 2) รีวิว / เรนเดอร์
node make.mjs analyze      # ความลื่นของกล้อง + จังหวะเสียงตรงรอยตัด
node make.mjs sheet 0.5    # contact sheet ทุก 0.5 วินาที
node make.mjs              # → out/mathmotion-intro.mp4 (1080p30, H.264 + Opus)
node verify.mjs            # ถอดรหัสทุกเฟรม/เสียงของไฟล์จริงเพื่อตรวจ
```

- Timeline/กล้อง/คำบรรยาย/ดนตรี อยู่ใน `render.js` (120 BPM: 1 บาร์ = 2 วินาที)
- กล้องใช้ easing แบบความเร็ว sin^k (ความเร่งต่อเนื่อง ไม่กระตุก) และถอยกล้องออกเล็กน้อยระหว่างการเคลื่อนที่ไกล
- Motion blur = เฉลี่ย sub-frame (1–16 ภาพตามความเร็วกล้อง, shutter 180°)
