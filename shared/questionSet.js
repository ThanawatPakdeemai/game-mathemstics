// ตรวจสอบไฟล์ชุดโจทย์ (JSON) — ใช้ร่วมกันทั้งเซิร์ฟเวอร์ (คลังโจทย์ในระบบ) และหน้าเว็บ (ครูนำเข้าโจทย์เอง)
import { DIFFICULTIES, SUBJECTS, findGrade, findSubject, findTopic } from './constants.js';

export const DIFFICULTY_ORDER = DIFFICULTIES.map((d) => d.id);
/** topic ของชุดโจทย์ที่ครูสร้างเอง */
export const CUSTOM_TOPIC = 'custom';
/** ขนาดไฟล์สูงสุดที่ให้นำเข้า */
export const MAX_IMPORT_BYTES = 1024 * 1024;
/** ขีดจำกัดของไฟล์ที่ครูนำเข้า (ส่งไปเซิร์ฟเวอร์ตอนสร้างห้อง) */
export const LIMITS = { questions: 200, question: 1000, choice: 300, explanation: 1000, title: 80, author: 60 };
/** ระดับความยากพิเศษสำหรับชุดที่นำเข้า: ใช้ทุกข้อตามลำดับในไฟล์ */
export const ALL_QUESTIONS = 'all';

const randomId = () => Math.random().toString(36).slice(2, 10);

/**
 * ตรวจสอบโครงสร้างชุดโจทย์ คืนค่า { ok, errors, set } โดย set คือข้อมูลที่ทำความสะอาดแล้ว (เฉพาะข้อที่ถูกต้อง)
 * - custom = false: ไฟล์คลังโจทย์ในระบบ ต้องมี grade/topic ตรงกับ shared/constants.js
 * - custom = true: ไฟล์ที่ครูนำเข้า ไม่บังคับ grade/subject (ถ้าใส่ต้องเป็นค่าที่ระบบรู้จัก) ส่วน topic จะถูกตั้งเป็น "custom"
 */
export function validateQuestionSet(data, { custom = false } = {}) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['ไฟล์ต้องเป็น JSON object'], set: null };

  const topic = custom ? CUSTOM_TOPIC : data.topic;
  const has = (v) => v !== undefined && v !== null && v !== '';
  if (custom) {
    if (has(data.grade) && !findGrade(data.grade)) errors.push(`ไม่รู้จักระดับชั้น "${data.grade}" (เช่น m3, m4, v1 หรือลบบรรทัด grade ออก)`);
    if (has(data.subject) && !findSubject(data.subject))
      errors.push(`ไม่รู้จักวิชา "${data.subject}" (ใช้ได้: ${SUBJECTS.map((x) => x.id).join(', ')})`);
  } else if (!findTopic(data.grade, data.topic)) {
    errors.push(`ไม่รู้จัก grade/topic: ${data.grade}/${data.topic}`);
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) errors.push('ต้องมีโจทย์ (questions) อย่างน้อย 1 ข้อ');
  else if (custom && data.questions.length > LIMITS.questions) errors.push(`โจทย์มีได้ไม่เกิน ${LIMITS.questions} ข้อต่อไฟล์ (ไฟล์นี้มี ${data.questions.length} ข้อ)`);

  const questions = [];
  (Array.isArray(data.questions) ? data.questions : []).forEach((q, i) => {
    const where = `ข้อที่ ${i + 1}`;
    const qErrors = [];
    if (typeof q?.question !== 'string' || !q.question.trim()) qErrors.push(`${where}: ยังไม่มีข้อความโจทย์`);
    else if (custom && q.question.length > LIMITS.question) qErrors.push(`${where}: ข้อความโจทย์ยาวเกิน ${LIMITS.question} ตัวอักษร`);
    if (!Array.isArray(q?.choices) || q.choices.length !== 4 || q.choices.some((c) => typeof c !== 'string' || !c.trim()))
      qErrors.push(`${where}: ต้องมีตัวเลือก 4 ข้อ และห้ามเว้นว่าง`);
    else if (custom && q.choices.some((c) => c.length > LIMITS.choice)) qErrors.push(`${where}: ตัวเลือกยาวเกิน ${LIMITS.choice} ตัวอักษร`);
    if (!Number.isInteger(q?.answer) || q.answer < 0 || q.answer > 3) qErrors.push(`${where}: answer (คำตอบที่ถูก) ต้องเป็น 0–3`);
    const difficulty = q?.difficulty ?? 'medium';
    if (!DIFFICULTY_ORDER.includes(difficulty)) qErrors.push(`${where}: difficulty ต้องเป็น ${DIFFICULTY_ORDER.join('/')}`);
    errors.push(...qErrors);
    if (qErrors.length === 0) {
      questions.push({
        id: custom ? `${topic}-${i + 1}` : String(q.id || `${topic}-${randomId()}`),
        difficulty,
        question: q.question.trim(),
        choices: q.choices.map((c) => c.trim()),
        answer: q.answer,
        explanation: typeof q.explanation === 'string' ? q.explanation.trim().slice(0, LIMITS.explanation) : '',
      });
    }
  });

  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, LIMITS.title) : custom ? 'โจทย์ของฉัน' : '';
  const set = { grade: data.grade, topic, title, questions };
  if (custom) {
    set.grade = findGrade(data.grade) ? data.grade : null;
    set.subject = findSubject(data.subject) ? data.subject : null;
    set.author = typeof data.author === 'string' ? data.author.trim().slice(0, LIMITS.author) : '';
  }
  return { ok: errors.length === 0, errors, set };
}

/** นับจำนวนโจทย์แยกตามระดับความยาก { easy: n, ... } */
export function countByDifficulty(questions) {
  const counts = Object.fromEntries(DIFFICULTY_ORDER.map((d) => [d, 0]));
  for (const q of questions) counts[q.difficulty] = (counts[q.difficulty] || 0) + 1;
  return counts;
}

/** ไฟล์ตัวอย่างให้ครูดาวน์โหลดไปแก้ (ใช้ได้ทุกวิชา: เปลี่ยน subject เป็น thai, math, english, science, history, literature, other) */
export const QUESTION_SET_TEMPLATE = {
  subject: 'science',
  grade: 'm3',
  title: 'ชื่อชุดโจทย์ของคุณ',
  author: 'ชื่อครูผู้สอน',
  questions: [
    {
      difficulty: 'easy',
      question: 'น้ำบริสุทธิ์เดือดที่อุณหภูมิกี่องศาเซลเซียส (ที่ระดับน้ำทะเล)',
      choices: ['0 °C', '50 °C', '100 °C', '120 °C'],
      answer: 2,
      explanation: 'answer คือลำดับตัวเลือกที่ถูก เริ่มนับจาก 0 = ก, 1 = ข, 2 = ค, 3 = ง',
    },
    {
      difficulty: 'medium',
      question: 'ข้อใดเป็นสารประกอบ',
      choices: ['ออกซิเจน (O₂)', 'น้ำ (H₂O)', 'ทองคำ (Au)', 'เหล็ก (Fe)'],
      answer: 1,
      explanation: 'น้ำเกิดจากธาตุไฮโดรเจนและออกซิเจนรวมกันทางเคมี',
    },
  ],
};
