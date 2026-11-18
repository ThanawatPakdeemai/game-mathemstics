import { CHOICE_LABELS, DIFFICULTIES, GRADES } from '../../shared/constants.js';
import { characterById } from './characters.js';

function meta(view) {
  const s = view.settings;
  const grade = GRADES.find((g) => g.id === s.grade)?.label || s.grade;
  const diff = DIFFICULTIES.find((d) => d.id === s.difficulty)?.label || s.difficulty;
  return { grade, diff, topic: s.topicLabel, className: s.className };
}

function fileBase(view) {
  const m = meta(view);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `MathMotion_${m.className}_${m.topic}_${date}`.replace(/[\\/:*?"<>|\s]+/g, '_');
}

/** แถวสรุปคะแนน: 1 แถวต่อผู้เล่น */
function summaryRows(view) {
  const { rows } = view.results;
  const qCount = view.review.length;
  const header = ['อันดับ', 'ชื่อ', 'ตัวละคร'];
  for (let i = 0; i < qCount; i++) header.push(`ข้อ ${i + 1} คำตอบ`, `ข้อ ${i + 1} ความถูกต้อง`, `ข้อ ${i + 1} ความเร็ว`);
  header.push('ตอบถูก (ข้อ)', 'รวมคะแนนความถูกต้อง', 'รวมคะแนนความเร็ว', 'คะแนนรวม');

  const body = rows.map((r) => {
    const row = [r.rank, r.name, characterById(r.characterId)?.name || ''];
    r.perQuestion.forEach((q) => row.push(q.answered ? CHOICE_LABELS[q.choice] : '-', q.accuracy, q.speed));
    row.push(r.correctCount, r.accuracy, r.speed, r.total);
    return row;
  });
  return [header, ...body];
}

function scoreTable(view, key) {
  const { rows } = view.results;
  const header = ['อันดับ', 'ชื่อ', ...view.review.map((_, i) => `ข้อ ${i + 1}`), 'รวม'];
  const body = rows.map((r) => [r.rank, r.name, ...r.perQuestion.map((q) => q[key]), r[key]]);
  return [header, ...body];
}

function questionRows(view) {
  const header = ['ข้อ', 'โจทย์', 'ก', 'ข', 'ค', 'ง', 'เฉลย', 'ตอบ (คน)', 'ตอบถูก (คน)', 'คำอธิบาย'];
  const body = view.review.map((q, i) => [
    i + 1,
    q.question,
    ...q.choices,
    CHOICE_LABELS[q.answer],
    q.answeredCount,
    q.correctCount,
    q.explanation || '',
  ]);
  return [header, ...body];
}

function infoRows(view) {
  const m = meta(view);
  return [
    ['MathMotion — สรุปผลการแข่งขัน'],
    ['ห้อง', m.className],
    ['ระดับชั้น', m.grade],
    ['หมวดหมู่', m.topic],
    ['ระดับความยาก', m.diff],
    ['จำนวนข้อ', view.review.length],
    ['วันที่', new Date().toLocaleString('th-TH')],
  ];
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(view) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = summaryRows(view).map((r) => r.map(escape).join(',')).join('\r\n');
  // BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${fileBase(view)}.csv`);
}

export async function exportXlsx(view) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (rows, name, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add(summaryRows(view), 'สรุปคะแนน', [8, 22, 16]);
  add(scoreTable(view, 'accuracy'), 'คะแนนความถูกต้อง', [8, 22]);
  add(scoreTable(view, 'speed'), 'คะแนนความเร็ว', [8, 22]);
  add(questionRows(view), 'โจทย์และเฉลย', [6, 50, 16, 16, 16, 16, 8, 10, 12, 40]);
  add(infoRows(view), 'ข้อมูลห้อง', [16, 30]);
  XLSX.writeFile(wb, `${fileBase(view)}.xlsx`);
}
