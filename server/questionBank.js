// คลังโจทย์: โหลดไฟล์ JSON ทุกไฟล์ใน server/data/questions
//
// รูปแบบไฟล์ (ใช้กับการ import โจทย์เองในอนาคตด้วย):
// {
//   "grade": "m4",            // id ชั้นปีใน EDUCATION_TIERS (shared/constants.js)
//   "topic": "sets",          // ต้องตรงกับ topic ใน shared/constants.js
//   "title": "เซต",
//   "questions": [
//     {
//       "id": "sets-001",              // ไม่บังคับ (ระบบสร้างให้)
//       "difficulty": "easy",          // easy | medium | hard | veryhard
//       "question": "ข้อความโจทย์",
//       "choices": ["ก", "ข", "ค", "ง"], // ต้องมี 4 ตัวเลือก
//       "answer": 0,                   // index ของคำตอบที่ถูก (0-3)
//       "explanation": "คำอธิบาย"       // ไม่บังคับ
//     }
//   ]
// }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_QUESTIONS, DIFFICULTY_ORDER, validateQuestionSet } from '../shared/questionSet.js';

export { validateQuestionSet };

const QUESTIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'questions');

/** key -> Map(id -> question) */
const bank = new Map();
const keyOf = (grade, topic) => `${grade}:${topic}`;

function addToBank(set) {
  const key = keyOf(set.grade, set.topic);
  if (!bank.has(key)) bank.set(key, new Map());
  const pool = bank.get(key);
  for (const q of set.questions) pool.set(q.id, q);
  return pool.size;
}

export function loadQuestionBank() {
  bank.clear();
  const files = fs.readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
      const { ok, errors, set } = validateQuestionSet(data);
      if (!ok) console.warn(`[questions] ${file}:`, errors.join('; '));
      addToBank(set);
    } catch (err) {
      console.warn(`[questions] อ่านไฟล์ ${file} ไม่ได้:`, err.message);
    }
  }
  return questionBankSummary();
}

export function questionBankSummary() {
  return [...bank.entries()].map(([key, pool]) => {
    const counts = { easy: 0, medium: 0, hard: 0, veryhard: 0 };
    for (const q of pool.values()) counts[q.difficulty]++;
    return { key, total: pool.size, ...counts };
  });
}

/**
 * (เตรียมไว้สำหรับอนาคต) นำเข้าโจทย์จาก JSON ที่ครูเตรียมเอง
 * - ตรวจสอบรูปแบบ แล้วเพิ่มเข้าคลังโจทย์ทันที
 * - ถ้า persist = true จะบันทึกเป็นไฟล์ custom-*.json เพื่อให้คงอยู่หลังรีสตาร์ท
 * ยังไม่ได้ผูกกับหน้าเว็บ — เมื่อต้องการใช้ ให้เพิ่ม route เช่น POST /api/questions/import
 */
export function importQuestionSet(json, { persist = false } = {}) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const result = validateQuestionSet(data);
  if (!result.ok) return { ok: false, errors: result.errors };
  const total = addToBank(result.set);
  if (persist) {
    const file = `custom-${result.set.grade}-${result.set.topic}-${Date.now()}.json`;
    fs.writeFileSync(path.join(QUESTIONS_DIR, file), JSON.stringify(result.set, null, 2));
  }
  return { ok: true, imported: result.set.questions.length, total };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PREFERENCE = {
  easy: ['easy', 'medium', 'hard', 'veryhard'],
  medium: ['medium', 'easy', 'hard', 'veryhard'],
  hard: ['hard', 'veryhard', 'medium', 'easy'],
  veryhard: ['veryhard', 'hard', 'medium', 'easy'],
};

/** เลือกโจทย์จากระดับที่ตรงก่อน แล้วค่อยเติมจากระดับใกล้เคียง เรียงจากง่ายไปยาก */
function pickByDifficulty(pool, difficulty, count) {
  const picked = [];
  for (const level of PREFERENCE[difficulty] || DIFFICULTY_ORDER) {
    for (const q of shuffle(pool.filter((p) => p.difficulty === level))) {
      if (picked.length >= count) break;
      picked.push(q);
    }
  }
  return picked.sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty));
}

const toRoomQuestion = (q, order = [0, 1, 2, 3]) => ({
  id: q.id,
  difficulty: q.difficulty,
  question: q.question,
  choices: order.map((i) => q.choices[i]),
  answer: order.indexOf(q.answer),
  explanation: q.explanation,
});

/** สุ่มโจทย์จากคลังในระบบ และสลับลำดับตัวเลือก ก ข ค ง ให้ทุกครั้ง */
export function pickQuestions(grade, topic, difficulty, count) {
  const pool = [...(bank.get(keyOf(grade, topic))?.values() || [])];
  return pickByDifficulty(pool, difficulty, count).map((q) => toRoomQuestion(q, shuffle([0, 1, 2, 3])));
}

/**
 * เลือกโจทย์จากชุดที่ครูนำเข้า (ใช้เฉพาะห้องนั้น ไม่เข้าคลัง)
 * - difficulty = "all": ใช้ทุกข้อตามลำดับในไฟล์
 * - ไม่สลับตัวเลือก เพราะครูอาจเขียนตัวเลือกแบบ "ถูกทั้งข้อ ก และ ข"
 */
export function pickCustomQuestions(questions, difficulty, count) {
  const list = difficulty === ALL_QUESTIONS ? questions : pickByDifficulty(questions, difficulty, count);
  return list.map((q) => toRoomQuestion(q));
}
