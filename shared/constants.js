// ค่าคงที่ที่ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และฝั่งหน้าเว็บ

export const GRADES = [
  {
    id: 'm4',
    label: 'ม.4',
    topics: [
      { id: 'sets', label: 'เซต', icon: '∪' },
      { id: 'logic', label: 'ตรรกศาสตร์', icon: '→' },
    ],
  },
  {
    id: 'm5',
    label: 'ม.5',
    topics: [{ id: 'trig', label: 'ฟังก์ชันตรีโกณมิติ', icon: 'θ' }],
  },
  {
    id: 'm6',
    label: 'ม.6',
    topics: [{ id: 'sequences', label: 'ลำดับและอนุกรม', icon: 'Σ' }],
  },
];

export const DIFFICULTIES = [
  { id: 'easy', label: 'ง่าย', count: 5 },
  { id: 'medium', label: 'กลาง', count: 10 },
  { id: 'hard', label: 'ยาก', count: 15 },
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

export const DEFAULT_SETTINGS = {
  difficulty: 'easy',
  timePerQuestion: 300,
};

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

export function findTopic(gradeId, topicId) {
  return findGrade(gradeId)?.topics.find((t) => t.id === topicId) || null;
}

export function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || null;
}

export function speedPoints(rank) {
  return SCORE.speed[rank - 1] ?? 0;
}
