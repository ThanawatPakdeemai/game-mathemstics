// ตรวจสอบไฟล์ชุดโจทย์ (JSON) — ใช้ร่วมกันทั้งเซิร์ฟเวอร์ (คลังโจทย์ในระบบ) และหน้าเว็บ (ครูนำเข้าโจทย์เอง)
import { DIFFICULTIES, findGrade, findTopic } from './constants.js';

export const DIFFICULTY_ORDER = DIFFICULTIES.map((d) => d.id);
/** topic ของชุดโจทย์ที่ครูสร้างเอง */
export const CUSTOM_TOPIC = 'custom';
/** ขนาดไฟล์สูงสุดที่ให้นำเข้า */
export const MAX_IMPORT_BYTES = 1024 * 1024;

const randomId = () => Math.random().toString(36).slice(2, 10);

/**
 * ตรวจสอบโครงสร้างชุดโจทย์ คืนค่า { ok, errors, set } โดย set คือข้อมูลที่ทำความสะอาดแล้ว (เฉพาะข้อที่ถูกต้อง)
 * - custom = false: ไฟล์คลังโจทย์ในระบบ ต้องมี grade/topic ตรงกับ shared/constants.js
 * - custom = true: ไฟล์ที่ครูนำเข้า ต้องมี grade ที่ระบบรู้จัก ส่วน topic จะถูกตั้งเป็น "custom"
 */
export function validateQuestionSet(data, { custom = false } = {}) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['ไฟล์ต้องเป็น JSON object'], set: null };

  const topic = custom ? CUSTOM_TOPIC : data.topic;
  if (custom) {
    if (!findGrade(data.grade)) errors.push(`ไม่รู้จักระดับชั้น "${data.grade ?? ''}" (เช่น m3, m4, p6)`);
  } else if (!findTopic(data.grade, data.topic)) {
    errors.push(`ไม่รู้จัก grade/topic: ${data.grade}/${data.topic}`);
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) errors.push('ต้องมีโจทย์ (questions) อย่างน้อย 1 ข้อ');

  const questions = [];
  (Array.isArray(data.questions) ? data.questions : []).forEach((q, i) => {
    const where = `ข้อที่ ${i + 1}`;
    const qErrors = [];
    if (typeof q?.question !== 'string' || !q.question.trim()) qErrors.push(`${where}: ยังไม่มีข้อความโจทย์`);
    if (!Array.isArray(q?.choices) || q.choices.length !== 4 || q.choices.some((c) => typeof c !== 'string' || !c.trim()))
      qErrors.push(`${where}: ต้องมีตัวเลือก 4 ข้อ และห้ามเว้นว่าง`);
    if (!Number.isInteger(q?.answer) || q.answer < 0 || q.answer > 3) qErrors.push(`${where}: answer (คำตอบที่ถูก) ต้องเป็น 0–3`);
    const difficulty = q?.difficulty ?? 'medium';
    if (!DIFFICULTY_ORDER.includes(difficulty)) qErrors.push(`${where}: difficulty ต้องเป็น ${DIFFICULTY_ORDER.join('/')}`);
    errors.push(...qErrors);
    if (qErrors.length === 0) {
      questions.push({
        id: String(q.id || `${topic}-${randomId()}`),
        difficulty,
        question: q.question.trim(),
        choices: q.choices.map((c) => c.trim()),
        answer: q.answer,
        explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      });
    }
  });

  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : custom ? 'โจทย์ของฉัน' : '';
  const set = { grade: data.grade, topic, title, questions };
  if (custom) set.author = typeof data.author === 'string' ? data.author.trim() : '';
  return { ok: errors.length === 0, errors, set };
}

/** นับจำนวนโจทย์แยกตามระดับความยาก { easy: n, ... } */
export function countByDifficulty(questions) {
  const counts = Object.fromEntries(DIFFICULTY_ORDER.map((d) => [d, 0]));
  for (const q of questions) counts[q.difficulty] = (counts[q.difficulty] || 0) + 1;
  return counts;
}

/** ไฟล์ตัวอย่างให้ครูดาวน์โหลดไปแก้ */
export const QUESTION_SET_TEMPLATE = {
  grade: 'm3',
  title: 'ชื่อชุดโจทย์ของคุณ',
  author: 'ชื่อครูผู้สอน',
  questions: [
    {
      difficulty: 'easy',
      question: 'คำตอบของสมการ x² − 9 = 0 คือข้อใด',
      choices: ['x = 3', 'x = ±3', 'x = 9', 'x = −9'],
      answer: 1,
      explanation: 'x² = 9 จึงได้ x = 3 หรือ −3 (answer คือลำดับตัวเลือกที่ถูก เริ่มนับจาก 0 = ก)',
    },
    {
      difficulty: 'medium',
      question: 'ผลบวกของรากของ x² − 5x + 6 = 0 เท่ากับเท่าใด',
      choices: ['5', '−5', '6', '1'],
      answer: 0,
      explanation: '(x − 2)(x − 3) = 0 ผลบวกรากคือ 5',
    },
  ],
};
