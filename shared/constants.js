// ค่าคงที่ที่ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และฝั่งหน้าเว็บ

/** หมวดหมู่โจทย์ของแต่ละชั้น (ชั้นที่ยังไม่มีในนี้ = ยังไม่มีคลังโจทย์) */
const TOPICS = {
  m4: [
    { id: 'sets', label: 'เซต', icon: '∪' },
    { id: 'logic', label: 'ตรรกศาสตร์', icon: '→' },
  ],
  m5: [{ id: 'trig', label: 'ฟังก์ชันตรีโกณมิติ', icon: 'θ' }],
  m6: [{ id: 'sequences', label: 'ลำดับและอนุกรม', icon: 'Σ' }],
};

/** label = ข้อความบนปุ่ม, title = ชื่อเต็มที่แสดงในห้อง/ไฟล์ Excel */
const g = (id, label, title = label) => ({ id, label, title, topics: TOPICS[id] || [] });
const years = (prefix, label, n, title = label, from = 1) =>
  Array.from({ length: n }, (_, i) => g(`${prefix}${i + from}`, `${label}${i + from}`, `${title}${i + from}`));

/**
 * ระดับการศึกษา › ระดับย่อย › ชั้นปี
 * id ของชั้นปีต้องไม่ซ้ำกัน และ m4/m5/m6 ต้องคงเดิม (ผูกกับไฟล์คลังโจทย์)
 */
export const EDUCATION_TIERS = [
  {
    id: 'basic',
    label: 'การศึกษาขั้นพื้นฐาน',
    groups: [
      {
        id: 'early', label: 'ปฐมวัย', range: 'ศพด. · อนุบาล 1–3', glyph: '★', roomHint: 'เช่น อ.2/1',
        grades: [g('cdc', 'ศพด.', 'ศูนย์พัฒนาเด็กเล็ก'), ...years('k', 'อ.', 3)],
      },
      { id: 'primary', label: 'ประถมศึกษา', range: 'ป.1–6', glyph: '+', roomHint: 'เช่น ป.5/2', grades: years('p', 'ป.', 6) },
      { id: 'lower', label: 'ม.ต้น', range: 'ม.1–3', glyph: 'x', roomHint: 'เช่น ม.2/4', grades: years('m', 'ม.', 3) },
      { id: 'upper', label: 'ม.ปลาย', range: 'ม.4–6 สายสามัญ', glyph: 'θ', roomHint: 'เช่น ม.6/9', grades: years('m', 'ม.', 3, 'ม.', 4) },
      { id: 'voc', label: 'ปวช.', range: 'ม.ปลาย สายอาชีพ', glyph: 'π', roomHint: 'เช่น ปวช.2/1', grades: years('v', 'ปวช.', 3) },
    ],
  },
  {
    id: 'higher',
    label: 'อุดมศึกษา',
    groups: [
      {
        id: 'subdeg', label: 'ต่ำกว่า ป.ตรี', range: 'ปวส. · อนุปริญญา', glyph: '∫', roomHint: 'เช่น ปวส.1 ช่างยนต์',
        grades: [...years('hv', 'ปวส.', 2), g('assoc', 'อนุปริญญา')],
      },
      {
        id: 'bachelor', label: 'ปริญญาตรี', range: 'ปี 1–6', glyph: '∂', roomHint: 'เช่น วิศวะ ปี 1',
        grades: years('b', 'ปี ', 6, 'ปริญญาตรี ปี '),
      },
      {
        id: 'grad', label: 'บัณฑิตศึกษา', range: 'ป.โท · ป.เอก', glyph: '∞', roomHint: 'เช่น ป.โท คณิตศึกษา',
        grades: [g('ms', 'ปริญญาโท'), g('phd', 'ปริญญาเอก')],
      },
    ],
  },
];

/** ทุกชั้นปีแบบแบน: [{ id, label, title, topics, tier, group }] */
export const GRADES = EDUCATION_TIERS.flatMap((t) =>
  t.groups.flatMap((grp) => grp.grades.map((x) => ({ ...x, tier: t.id, group: grp.id }))),
);

export const DIFFICULTIES = [
  { id: 'easy', label: 'ง่าย', count: 5 },
  { id: 'medium', label: 'กลาง', count: 10 },
  { id: 'hard', label: 'ยาก', count: 15 },
  { id: 'veryhard', label: 'ยากมาก', count: 20 },
];

/** เวลาต่อข้อ (วินาที) */
export const TIME_OPTIONS = [
  { seconds: 60, label: '1 นาที' },
  { seconds: 180, label: '3 นาที' },
  { seconds: 300, label: '5 นาที' },
  { seconds: 600, label: '10 นาที' },
];

export const REVEAL_MODES = [
  { id: 'each', label: 'เฉลยคำตอบทีละข้อ' },
  { id: 'end', label: 'เฉลยคำตอบทั้งหมดทีเดียว' },
];

export const MAX_PLAYERS = 15;
export const CHARACTER_COUNT = 15;
export const LOBBY_MS = 5 * 60 * 1000; // อายุ QR-Code / เวลาเลือกตัวละคร
export const START_COUNTDOWN_MS = 5000; // นับถอยหลังก่อนเริ่มแข่ง
export const REVEAL_MS = 10000; // เวลาเฉลยก่อนไปข้อถัดไป
export const TAPS_REQUIRED = 100; // จำนวนครั้งที่ต้องกดตัวละครเพื่อส่งคำตอบ

export const SCORE = {
  correct: 2, // คะแนนความถูกต้อง
  speed: [1, 0.5], // คะแนนความเร็ว อันดับ 1, 2 (อันดับ 3 ขึ้นไป = 0)
};

export const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง'];

export function findGrade(gradeId) {
  return GRADES.find((g) => g.id === gradeId) || null;
}

/** ชื่อเต็มของชั้น สำหรับแสดงในห้อง/Excel */
export function gradeTitle(gradeId) {
  return findGrade(gradeId)?.title || gradeId || '';
}

export function findTopic(gradeId, topicId) {
  return findGrade(gradeId)?.topics.find((t) => t.id === topicId) || null;
}

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || null;
}

export function speedPoints(rank) {
  return SCORE.speed[rank - 1] ?? 0;
}
