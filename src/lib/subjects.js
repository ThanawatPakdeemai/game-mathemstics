// รูปตัวละครประจำวิชา (ย่อจาก schoolsubjects-characters/ เป็น WebP 360px ใน src/assets/subjects/)
import { SUBJECTS } from '../../shared/constants.js';

const files = import.meta.glob('../assets/subjects/*.webp', { eager: true, import: 'default' });
const art = (name) => files[`../assets/subjects/${name}.webp`];

/** ตัวละครหลักของแต่ละวิชา (ใช้บนการ์ดเลือกวิชา) */
const SUBJECT_ART = {
  thai: 'Thai_Women',
  math: 'Math_Man',
  english: 'Eng_Man',
  science: 'Sci_Man',
  history: 'HistoryMap_Man',
  literature: 'Literature_Man',
};

export const SUBJECT_LIST = SUBJECTS.map((s) => ({ ...s, art: art(SUBJECT_ART[s.id]) || null }));

export const subjectArt = (id) => art(SUBJECT_ART[id]) || null;

/** ตัวละครทั้งหมดสำหรับตกแต่งขอบจอ */
export const MASCOTS = [
  { name: 'Math_Man', label: 'คณิตศาสตร์' },
  { name: 'Thai_Women', label: 'ภาษาไทย' },
  { name: 'Eng_Man', label: 'ภาษาอังกฤษ' },
  { name: 'Sci_Man', label: 'วิทยาศาสตร์' },
  { name: 'HistoryMap_Man', label: 'ประวัติศาสตร์' },
  { name: 'Literature_Money', label: 'วรรณกรรม' },
  { name: 'Thai_Man', label: 'ภาษาไทย' },
  { name: 'HistoryGPS_Man', label: 'ประวัติศาสตร์' },
  { name: 'Literature_Giant', label: 'วรรณกรรม' },
  { name: 'Literature_Man', label: 'วรรณกรรม' },
].map((m) => ({ ...m, url: art(m.name) }));
