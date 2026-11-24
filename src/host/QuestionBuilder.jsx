import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHOICE_LABELS,
  DIFFICULTIES,
  EDUCATION_TIERS,
  SUBJECTS,
} from "../../shared/constants.js";
import {
  countByDifficulty,
  LIMITS,
  MAX_IMPORT_BYTES,
  validateQuestionSet,
} from "../../shared/questionSet.js";
import { downloadJson, Modal, readFile } from "./QuestionSetDialogs.jsx";

/*
 * ฟอร์มสร้างโจทย์ของครู → ดาวน์โหลดเป็นไฟล์ .json (รูปแบบเดียวกับที่ "นำเข้าโจทย์" รับ)
 * ร่างงานบันทึกในเบราว์เซอร์อัตโนมัติ ปิดหน้าต่างแล้วกลับมาทำต่อได้ (เฉพาะเครื่องนี้)
 */

const DRAFT_KEY = "quizmotion-builder-draft";

let keySeq = 0;
const newKey = () => `q${Date.now().toString(36)}${keySeq++}`;

const blankQuestion = (difficulty = "easy") => ({
  key: newKey(),
  difficulty,
  question: "",
  choices: ["", "", "", ""],
  answer: null,
  explanation: "",
});

const blankDraft = (subject = "", grade = "") => ({
  title: "",
  author: "",
  subject,
  grade,
  questions: [blankQuestion()],
});

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return d && Array.isArray(d.questions) && d.questions.length ? d : null;
  } catch {
    return null;
  }
}

function saveDraft(d) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* โหมดส่วนตัว/พื้นที่เต็ม — ข้ามไป */
  }
}

/** แปลงไฟล์ JSON (อาจยังไม่สมบูรณ์) เป็นร่างที่แก้ไขได้ */
function draftFromFile(data) {
  const levels = DIFFICULTIES.map((d) => d.id);
  const list = Array.isArray(data?.questions) ? data.questions : [];
  return {
    title: typeof data?.title === "string" ? data.title : "",
    author: typeof data?.author === "string" ? data.author : "",
    subject: SUBJECTS.some((s) => s.id === data?.subject) ? data.subject : "",
    grade: typeof data?.grade === "string" ? data.grade : "",
    questions: (list.length ? list : [{}])
      .slice(0, LIMITS.questions)
      .map((q) => ({
        key: newKey(),
        difficulty: levels.includes(q?.difficulty) ? q.difficulty : "easy",
        question: typeof q?.question === "string" ? q.question : "",
        choices: [0, 1, 2, 3].map((i) =>
          typeof q?.choices?.[i] === "string" ? q.choices[i] : "",
        ),
        answer:
          Number.isInteger(q?.answer) && q.answer >= 0 && q.answer <= 3
            ? q.answer
            : null,
        explanation: typeof q?.explanation === "string" ? q.explanation : "",
      })),
  };
}

/** ร่าง → ข้อมูลไฟล์ .json ที่จะดาวน์โหลด */
function toFileData(d) {
  return {
    ...(d.subject ? { subject: d.subject } : {}),
    ...(d.grade ? { grade: d.grade } : {}),
    title: d.title.trim() || "โจทย์ของฉัน",
    author: d.author.trim(),
    questions: d.questions.map((q) => ({
      difficulty: q.difficulty,
      question: q.question.trim(),
      choices: q.choices.map((c) => c.trim()),
      answer: q.answer,
      ...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}),
    })),
  };
}

/** สิ่งที่ยังต้องแก้ในแต่ละข้อ */
function issuesOf(q) {
  const out = [];
  if (!q.question.trim()) out.push("ยังไม่มีข้อความโจทย์");
  else if (q.question.length > LIMITS.question)
    out.push(`โจทย์ยาวเกิน ${LIMITS.question} ตัวอักษร`);
  const empty = q.choices.filter((c) => !c.trim()).length;
  if (empty) out.push(`ตัวเลือกยังว่าง ${empty} ช่อง`);
  if (q.choices.some((c) => c.length > LIMITS.choice))
    out.push(`ตัวเลือกยาวเกิน ${LIMITS.choice} ตัวอักษร`);
  if (q.answer == null) out.push("ยังไม่ได้เลือกคำตอบที่ถูก");
  return out;
}

const hasContent = (d) =>
  d.title.trim() ||
  d.questions.some((q) => q.question.trim() || q.choices.some((c) => c.trim()));

const safeFileName = (title) =>
  `${(title.trim() || "โจทย์ของฉัน").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60)}.json`;

export default function QuestionBuilder({
  open,
  onClose,
  onUse,
  defaultSubject,
  defaultGrade,
}) {
  const [draft, setDraft] = useState(() => loadDraft() || blankDraft());
  const [current, setCurrent] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);
  const questionRef = useRef(null);

  // เปิดครั้งแรกโดยยังไม่มีร่าง: ตั้งวิชา/ชั้นตามที่เลือกไว้ในหน้าตั้งค่าห้อง
  useEffect(() => {
    if (!open) return;
    setDraft((d) =>
      hasContent(d)
        ? d
        : {
            ...d,
            subject: d.subject || defaultSubject || "",
            grade: d.grade || defaultGrade || "",
          },
    );
    setNotice("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => saveDraft(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  const qs = draft.questions;
  const idx = Math.min(current, qs.length - 1);
  const q = qs[idx];
  const issues = useMemo(() => qs.map(issuesOf), [qs]);
  const problemCount = issues.filter((x) => x.length).length;
  const metaIssues = draft.subject ? [] : ["ยังไม่ได้เลือกวิชา"];
  const ready = problemCount === 0 && metaIssues.length === 0;
  const counts = countByDifficulty(qs);

  const setMeta = (field, value) => setDraft((d) => ({ ...d, [field]: value }));
  const updateQ = (patch) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((x, i) =>
        i === idx ? { ...x, ...patch } : x,
      ),
    }));
  const setChoice = (ci, value) =>
    updateQ({ choices: q.choices.map((c, i) => (i === ci ? value : c)) });

  const goTo = (i) => {
    setCurrent(i);
    requestAnimationFrame(() => questionRef.current?.focus());
  };

  const addQuestion = () => {
    if (qs.length >= LIMITS.questions) return;
    setDraft((d) => ({
      ...d,
      questions: [
        ...d.questions.slice(0, idx + 1),
        blankQuestion(q.difficulty),
        ...d.questions.slice(idx + 1),
      ],
    }));
    goTo(idx + 1);
  };

  const duplicate = () => {
    if (qs.length >= LIMITS.questions) return;
    setDraft((d) => ({
      ...d,
      questions: [
        ...d.questions.slice(0, idx + 1),
        { ...q, key: newKey(), choices: [...q.choices] },
        ...d.questions.slice(idx + 1),
      ],
    }));
    goTo(idx + 1);
  };

  const remove = () => {
    const filled = q.question.trim() || q.choices.some((c) => c.trim());
    if (filled && !window.confirm(`ลบข้อที่ ${idx + 1}?`)) return;
    setDraft((d) => ({
      ...d,
      questions:
        d.questions.length === 1
          ? [blankQuestion()]
          : d.questions.filter((_, i) => i !== idx),
    }));
    setCurrent(Math.max(0, idx - (idx === qs.length - 1 ? 1 : 0)));
  };

  const move = (dir) => {
    const to = idx + dir;
    if (to < 0 || to >= qs.length) return;
    setDraft((d) => {
      const list = [...d.questions];
      [list[idx], list[to]] = [list[to], list[idx]];
      return { ...d, questions: list };
    });
    setCurrent(to);
  };

  const startOver = () => {
    if (hasContent(draft) && !window.confirm("ล้างโจทย์ทั้งหมดและเริ่มชุดใหม่?"))
      return;
    setDraft(blankDraft(defaultSubject || "", defaultGrade || ""));
    setCurrent(0);
    setShowIssues(false);
  };

  const openFile = async (file) => {
    if (!file) return;
    fileRef.current.value = "";
    if (file.size > MAX_IMPORT_BYTES) return setNotice("ไฟล์ใหญ่เกิน 1 MB");
    let data;
    try {
      data = JSON.parse(await readFile(file));
    } catch {
      return setNotice("อ่านไฟล์ไม่ได้ ไฟล์ต้องเป็น JSON ที่ถูกต้อง");
    }
    if (hasContent(draft) && !window.confirm("แทนที่โจทย์ที่กำลังทำอยู่ด้วยไฟล์นี้?"))
      return;
    setDraft(draftFromFile(data));
    setCurrent(0);
    setShowIssues(true);
    setNotice(`เปิด “${file.name}” แล้ว แก้ไขต่อได้เลย`);
  };

  const download = () => {
    if (!ready) {
      setShowIssues(true);
      if (
        !window.confirm(
          "โจทย์ยังไม่ครบ ไฟล์นี้จะยังนำเข้าเกมไม่ได้ ดาวน์โหลดเก็บไว้ทำต่อก่อนไหม?",
        )
      )
        return;
    }
    downloadJson(toFileData(draft), safeFileName(draft.title));
    setNotice("ดาวน์โหลดแล้ว เก็บไฟล์ไว้ใช้ครั้งต่อไปได้เลย");
  };

  const useNow = () => {
    setShowIssues(true);
    if (!ready) return;
    const res = validateQuestionSet(toFileData(draft), { custom: true });
    if (!res.ok) return setNotice(res.errors[0]);
    onUse({ ...res.set, fileName: "สร้างในหน้าเว็บ" });
    onClose();
  };

  const firstProblem = issues.findIndex((x) => x.length);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="สร้างโจทย์ของฉัน"
      className="modal-builder"
      closeOnBackdrop={false}
      actions={
        <div className="builder-head-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            tabIndex={-1}
            onChange={(e) => openFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => fileRef.current?.click()}
          >
            เปิดไฟล์เดิมมาแก้
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={startOver}
          >
            เริ่มชุดใหม่
          </button>
        </div>
      }
    >
      <div className="builder">
        {/* ---------- ซ้าย: ข้อมูลชุด + รายการข้อ ---------- */}
        <aside className="builder-side">
          <label className="b-field">
            <span>ชื่อชุดโจทย์</span>
            <input
              value={draft.title}
              maxLength={LIMITS.title}
              placeholder="เช่น คำราชาศัพท์ บทที่ 2"
              onChange={(e) => setMeta("title", e.target.value)}
            />
          </label>
          <div className="b-row">
            <label className="b-field">
              <span>วิชา</span>
              <select
                value={draft.subject}
                aria-invalid={showIssues && !draft.subject}
                onChange={(e) => setMeta("subject", e.target.value)}
              >
                <option value="">— เลือกวิชา —</option>
                {SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="b-field">
              <span>ระดับชั้น (ไม่บังคับ)</span>
              <select
                value={draft.grade}
                onChange={(e) => setMeta("grade", e.target.value)}
              >
                <option value="">— ไม่ระบุ —</option>
                {EDUCATION_TIERS.flatMap((t) => t.groups).map((grp) => (
                  <optgroup key={grp.id} label={grp.label}>
                    {grp.grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          <label className="b-field">
            <span>ผู้สร้าง (ไม่บังคับ)</span>
            <input
              value={draft.author}
              maxLength={LIMITS.author}
              placeholder="ชื่อครูผู้สอน"
              onChange={(e) => setMeta("author", e.target.value)}
            />
          </label>

          <div className="b-list-head">
            <b>โจทย์ {qs.length} ข้อ</b>
            <span className="b-counts">
              {DIFFICULTIES.map((d) => (
                <span
                  key={d.id}
                  className={`badge badge-${d.id}`}
                  title={d.label}
                >
                  {d.label} {counts[d.id]}
                </span>
              ))}
            </span>
          </div>
          <ol className="b-list">
            {qs.map((x, i) => (
              <li key={x.key}>
                <button
                  type="button"
                  aria-current={i === idx ? "true" : undefined}
                  className={`b-item ${i === idx ? "is-current" : ""} ${
                    showIssues && issues[i].length ? "has-issue" : ""
                  }`}
                  onClick={() => goTo(i)}
                >
                  <span className={`b-num dot-${x.difficulty}`}>{i + 1}</span>
                  <span className="b-item-text">
                    {x.question.trim() || <i className="muted">ยังไม่มีโจทย์</i>}
                  </span>
                  {issues[i].length === 0 ? (
                    <span className="b-ok" aria-label="ครบแล้ว">
                      ✓
                    </span>
                  ) : (
                    showIssues && (
                      <span className="b-warn" aria-label="ยังไม่ครบ">
                        !
                      </span>
                    )
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn btn-ghost btn-sm b-add"
            onClick={addQuestion}
            disabled={qs.length >= LIMITS.questions}
          >
            ＋ เพิ่มข้อ
          </button>
        </aside>

        {/* ---------- ขวา: แก้ไขข้อที่เลือก ---------- */}
        <section className="builder-main" aria-label={`ข้อที่ ${idx + 1}`}>
          <header className="b-q-head">
            <h3>
              ข้อที่ {idx + 1}
              <small> / {qs.length}</small>
            </h3>
            <div className="b-tools">
              <button
                type="button"
                className="icon-btn"
                title="เลื่อนขึ้น"
                aria-label="เลื่อนขึ้น"
                disabled={idx === 0}
                onClick={() => move(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                title="เลื่อนลง"
                aria-label="เลื่อนลง"
                disabled={idx === qs.length - 1}
                onClick={() => move(1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={duplicate}
                disabled={qs.length >= LIMITS.questions}
              >
                ทำซ้ำ
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm b-del"
                onClick={remove}
              >
                ลบข้อนี้
              </button>
            </div>
          </header>

          <div className="b-diff" role="radiogroup" aria-label="ระดับความยาก">
            {DIFFICULTIES.map((d) => (
              <button
                type="button"
                key={d.id}
                role="radio"
                aria-checked={q.difficulty === d.id}
                className={`pill pill-${d.id} ${q.difficulty === d.id ? "is-active" : ""}`}
                onClick={() => updateQ({ difficulty: d.id })}
              >
                {d.label}
              </button>
            ))}
          </div>

          <label className="b-field">
            <span>โจทย์</span>
            <textarea
              ref={questionRef}
              rows={3}
              value={q.question}
              maxLength={LIMITS.question}
              placeholder="พิมพ์คำถาม…"
              aria-invalid={showIssues && !q.question.trim()}
              onChange={(e) => updateQ({ question: e.target.value })}
            />
          </label>

          <div className="b-field">
            <span>ตัวเลือก — กดตัวอักษรเพื่อเลือกคำตอบที่ถูก</span>
            <div className="b-choices">
              {q.choices.map((c, ci) => (
                <div
                  key={ci}
                  className={`b-choice choice-${ci} ${q.answer === ci ? "is-correct" : ""}`}
                >
                  <button
                    type="button"
                    className="b-choice-label"
                    aria-pressed={q.answer === ci}
                    aria-label={`ตั้ง ${CHOICE_LABELS[ci]} เป็นคำตอบที่ถูก`}
                    onClick={() => updateQ({ answer: ci })}
                  >
                    {q.answer === ci ? "✓" : CHOICE_LABELS[ci]}
                  </button>
                  <input
                    value={c}
                    maxLength={LIMITS.choice}
                    placeholder={`ตัวเลือก ${CHOICE_LABELS[ci]}`}
                    aria-label={`ตัวเลือก ${CHOICE_LABELS[ci]}`}
                    aria-invalid={showIssues && !c.trim()}
                    onChange={(e) => setChoice(ci, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="b-field">
            <span>คำอธิบายเฉลย (ไม่บังคับ)</span>
            <textarea
              rows={2}
              value={q.explanation}
              maxLength={LIMITS.explanation}
              placeholder="แสดงตอนเฉลย เช่น เหตุผลของคำตอบ"
              onChange={(e) => updateQ({ explanation: e.target.value })}
            />
          </label>

          {showIssues && issues[idx].length > 0 && (
            <p className="b-issue" role="alert">
              ข้อนี้ยังไม่ครบ: {issues[idx].join(" · ")}
            </p>
          )}

          <div className="b-nav">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={idx === 0}
              onClick={() => goTo(idx - 1)}
            >
              ← ข้อก่อนหน้า
            </button>
            {idx === qs.length - 1 ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={addQuestion}
                disabled={qs.length >= LIMITS.questions}
              >
                ＋ เพิ่มข้อถัดไป
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => goTo(idx + 1)}
              >
                ข้อถัดไป →
              </button>
            )}
          </div>
        </section>
      </div>

      <footer className="builder-foot">
        <div className="b-status" aria-live="polite">
          {notice ? (
            <span>{notice}</span>
          ) : ready ? (
            <span className="b-ready">✓ ครบทุกข้อ พร้อมดาวน์โหลด</span>
          ) : showIssues ? (
            <span className="b-not-ready">
              {[...metaIssues, problemCount && `ยังไม่ครบ ${problemCount} ข้อ`]
                .filter(Boolean)
                .join(" · ")}
              {firstProblem >= 0 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => goTo(firstProblem)}
                >
                  ไปข้อที่ {firstProblem + 1}
                </button>
              )}
            </span>
          ) : (
            <span className="muted">บันทึกร่างอัตโนมัติในเครื่องนี้</span>
          )}
        </div>
        <button type="button" className="btn btn-ghost" onClick={download}>
          ⬇ ดาวน์โหลด .json
        </button>
        <button type="button" className="btn btn-primary" onClick={useNow}>
          ใช้ในเกมนี้เลย
        </button>
      </footer>
    </Modal>
  );
}
