import { useState } from "react";
import {
  DIFFICULTIES,
  EDUCATION_TIERS,
  findGrade,
  findSubject,
  MAX_PLAYERS,
  REVEAL_MODES,
  TIME_OPTIONS,
  topicsFor,
} from "../../shared/constants.js";
import {
  ALL_QUESTIONS,
  countByDifficulty,
  CUSTOM_TOPIC,
} from "../../shared/questionSet.js";
import { Brand } from "../components/ui.jsx";
import { SUBJECT_LIST } from "../lib/subjects.js";
import QuestionBuilder from "./QuestionBuilder.jsx";
import { ImportDialog } from "./QuestionSetDialogs.jsx";

function Step({ n, title, done, aside, children }) {
  return (
    <section className={`card step ${done ? "is-done" : ""}`}>
      <header className="step-head">
        <span className="step-num">{done ? "✓" : n}</span>
        <h2>{title}</h2>
        {aside && <span className="step-aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

export default function SetupScreen({ onCreate }) {
  const [tierId, setTierId] = useState("basic");
  const [groupId, setGroupId] = useState("upper");
  const [grade, setGrade] = useState(null);
  const [className, setClassName] = useState("");
  const [subject, setSubject] = useState(null);
  const [topic, setTopic] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [timePerQuestion, setTime] = useState(null);
  const [revealMode, setRevealMode] = useState(null);
  const [busy, setBusy] = useState(false);
  // ชุดโจทย์ที่ครูนำเข้าเอง (ใช้ชั่วคราวเฉพาะห้องนี้)
  const [customSet, setCustomSet] = useState(null);
  const [dialog, setDialog] = useState(null); // 'import' | 'create' | null

  const gradeInfo = findGrade(grade);
  const tier = EDUCATION_TIERS.find((t) => t.id === tierId);
  const group = tier.groups.find((x) => x.id === groupId) || null;

  const isCustom = topic === CUSTOM_TOPIC;
  const bankTopics = grade && subject ? topicsFor(grade, subject) : [];
  const subjectInfo = findSubject(subject);

  // เลือกหมวดใหม่ตามชั้น/วิชา: ถ้ามีหมวดเดียวเลือกให้อัตโนมัติ (ยกเว้นกำลังใช้ชุดที่นำเข้า)
  const resetTopic = (gradeId, subjectId) => {
    if (isCustom) return;
    const list = gradeId && subjectId ? topicsFor(gradeId, subjectId) : [];
    setTopic(list.length === 1 ? list[0].id : null);
  };

  const chooseGrade = (g) => {
    setGrade(g.id);
    resetTopic(g.id, subject);
  };

  const clearGrade = () => {
    setGrade(null);
    if (!isCustom) setTopic(null);
  };

  const chooseSubject = (id) => {
    setSubject(id);
    if (isCustom && customSet?.subject && customSet.subject !== id)
      setTopic(null);
    else if (!isCustom) resetTopic(grade, id);
  };

  /** นำเข้าไฟล์สำเร็จ → เลือกชุดนี้ให้เลย และตั้งวิชา/ชั้นตามไฟล์ (ถ้ามี) */
  const applyImport = (set) => {
    setCustomSet(set);
    setTopic(CUSTOM_TOPIC);
    if (set.subject) setSubject(set.subject);
    else if (!subject) setSubject("other");
    const g = findGrade(set.grade);
    if (g && !grade) {
      setTierId(g.tier);
      setGroupId(g.group);
      setGrade(g.id);
    }
  };

  const removeImport = () => {
    setCustomSet(null);
    if (!isCustom) return;
    const list = grade && subject ? topicsFor(grade, subject) : [];
    setTopic(list.length === 1 ? list[0].id : null);
    if (difficulty === ALL_QUESTIONS) setDifficulty(null);
  };

  const chooseTier = (t) => {
    if (t.id === tierId) return;
    setTierId(t.id);
    setGroupId(null);
    clearGrade();
  };

  const chooseGroup = (grp) => {
    if (grp.id === groupId) return;
    setGroupId(grp.id);
    if (grp.grades.length === 1) chooseGrade(grp.grades[0]);
    else clearGrade();
  };

  const gradeSummary =
    gradeInfo && group
      ? `${tier.label} › ${group.label} › ${gradeInfo.label}`
      : null;

  const customCounts = customSet
    ? countByDifficulty(customSet.questions)
    : null;

  const missing = [];
  if (!grade) missing.push("ระดับชั้น");
  if (!className.trim()) missing.push("ชื่อห้อง");
  if (!subject) missing.push("วิชา");
  if (!topic) missing.push("ชุดโจทย์");
  if (!difficulty) missing.push("ระดับความยาก");
  if (!timePerQuestion) missing.push("เวลาแต่ละข้อ");
  if (!revealMode) missing.push("รูปแบบการเฉลย");
  const ready = missing.length === 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    await onCreate({
      grade,
      className,
      subject,
      topic,
      difficulty,
      timePerQuestion,
      revealMode,
      // ส่งชุดที่นำเข้าไปกับห้องนี้ครั้งเดียว — สร้างห้องใหม่ต้องนำเข้าอีกครั้ง
      ...(isCustom && customSet
        ? {
            customSet: {
              subject: customSet.subject,
              title: customSet.title,
              author: customSet.author,
              questions: customSet.questions,
            },
          }
        : {}),
    });
    setBusy(false);
  };

  return (
    <>
      <form className="setup page" onSubmit={submit}>
        <header className="setup-hero">
          <Brand />
          <div className="hero-title">
            <h1>ตั้งค่าห้องเกม</h1>
            <p>
              เกมตอบคำถามแข่งความเร็ว ใช้ได้ทุกวิชา ·{" "}
              <span className="nowrap">
                เข้าร่วมด้วย QR-Code สูงสุด {MAX_PLAYERS} คน
              </span>
            </p>
          </div>
          <div className="hero-actions">
            {customSet ? (
              <div className="custom-chip">
                <span className="custom-chip-text">
                  <strong>
                    {customSet.title} · {customSet.questions.length} ข้อ
                  </strong>
                  <small>ชั่วคราว · หายเมื่อจบเกม</small>
                </span>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => setDialog("import")}
                >
                  เปลี่ยนไฟล์
                </button>
                <button
                  type="button"
                  className="chip-btn chip-remove"
                  aria-label="เอาชุดโจทย์ของฉันออก"
                  onClick={removeImport}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDialog("import")}
              >
                <span aria-hidden="true">⇩</span> นำเข้าโจทย์ (.json)
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDialog("create")}
            >
              <span aria-hidden="true">＋</span> สร้างโจทย์ของฉัน
            </button>
          </div>
        </header>

        <div className="setup-grid">
          <Step
            n={1}
            title="เลือกระดับชั้น"
            done={grade && className.trim()}
            aside={gradeSummary}
          >
            <div className="tier-tabs" role="group" aria-label="ระดับการศึกษา">
              {EDUCATION_TIERS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  aria-pressed={tierId === t.id}
                  className={`tier-tab ${tierId === t.id ? "is-active" : ""}`}
                  onClick={() => chooseTier(t)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="sub-label">ระดับย่อย</p>
            <div className="level-grid">
              {tier.groups.map((grp, i) => (
                <button
                  type="button"
                  key={grp.id}
                  aria-pressed={groupId === grp.id}
                  className={`level-card ${groupId === grp.id ? "is-active" : ""}`}
                  onClick={() => chooseGroup(grp)}
                >
                  <span
                    className={`level-glyph glyph-${i % 5}`}
                    aria-hidden="true"
                  >
                    {grp.glyph}
                  </span>
                  <span className="level-text">
                    <b>{grp.label}</b>
                    <small>{grp.range}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="sub-label-row">
              <p className="sub-label">
                ชั้นปี{group ? ` · ${group.label}` : ""}
              </p>
              {subject && grade && (
                <span className="ready-legend">
                  {bankTopics.length === 0 ? (
                    <span className="not-ready-dot " aria-hidden="true" />
                  ) : (
                    <span className="ready-dot " aria-hidden="true" />
                  )}
                  {/* <span className="ready-dot" aria-hidden="true" /> */}
                  {bankTopics.length === 0
                    ? "ยังไม่มีคลังโจทย์ในระบบ"
                    : "มีคลังโจทย์ในระบบ"}
                </span>
              )}
            </div>
            {!group ? (
              <p className="muted">เลือกระดับย่อยก่อน เพื่อแสดงชั้นปี</p>
            ) : (
              <div className="pill-row">
                {group.grades.map((g) => (
                  <button
                    type="button"
                    key={g.id}
                    aria-pressed={grade === g.id}
                    className={`pill pill-grade ${grade === g.id ? "is-active" : ""}`}
                    onClick={() => chooseGrade(g)}
                    title={
                      g.topics.length ? `${g.title} (มีคลังโจทย์แล้ว)` : g.title
                    }
                  >
                    {g.label}
                    {g.topics.length > 0 && (
                      <span
                        className="ready-dot ready-dot-pill"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}

            <label className="field">
              <span>ชื่อห้อง</span>
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder={group?.roomHint || "เช่น ม.6/9"}
                maxLength={30}
              />
            </label>
          </Step>

          <Step
            n={2}
            title="เลือกวิชาและชุดโจทย์"
            done={Boolean(subject && topic)}
            aside={subjectInfo?.label}
          >
            <div className="subject-grid" role="group" aria-label="วิชา">
              {SUBJECT_LIST.map((sub) => (
                <button
                  type="button"
                  key={sub.id}
                  aria-pressed={subject === sub.id}
                  className={`subject-card subject-${sub.id} ${subject === sub.id ? "is-active" : ""}`}
                  onClick={() => chooseSubject(sub.id)}
                >
                  <span className="subject-art" aria-hidden="true">
                    {sub.art ? (
                      <img src={sub.art} alt="" draggable={false} />
                    ) : (
                      <span className="subject-glyph">{sub.glyph}</span>
                    )}
                  </span>
                  <span className="subject-name">{sub.label}</span>
                </button>
              ))}
            </div>

            {customSet && (
              <>
                <p className="sub-label">ชุดโจทย์ที่นำเข้า</p>
                <button
                  type="button"
                  aria-pressed={isCustom}
                  className={`topic-card topic-custom ${isCustom ? "is-active" : ""}`}
                  onClick={() => {
                    setTopic(CUSTOM_TOPIC);
                    if (customSet.subject) setSubject(customSet.subject);
                  }}
                >
                  <span className="topic-icon" aria-hidden="true">
                    ⇩
                  </span>
                  <span className="topic-text">
                    <span>{customSet.title}</span>
                    <small>
                      {customSet.questions.length} ข้อ
                      {customSet.subject &&
                        ` · ${findSubject(customSet.subject)?.label}`}
                      {customSet.author && ` · ${customSet.author}`}
                    </small>
                  </span>
                  <span className="temp-tag">ชั่วคราว</span>
                </button>
              </>
            )}

            {subject && (
              <>
                <p className="sub-label">
                  คลังโจทย์ในระบบ{gradeInfo ? ` · ${gradeInfo.title}` : ""}
                </p>
                {!gradeInfo ? (
                  <p className="muted">เลือกระดับชั้นก่อน เพื่อแสดงหมวดหมู่</p>
                ) : bankTopics.length === 0 ? (
                  <div className="empty-bank">
                    <p>
                      ยังไม่มีคลังโจทย์{subjectInfo.label}สำหรับ{" "}
                      {gradeInfo.title}
                      <br />
                      <span className="muted small">
                        ใช้โจทย์ของคุณเองได้ เนื้อหาตรงกับที่สอนในห้อง
                      </span>
                    </p>
                    {!customSet && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setDialog("import")}
                      >
                        ⇩ นำเข้าโจทย์ (.json)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="topic-row">
                    {bankTopics.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        aria-pressed={topic === t.id}
                        className={`topic-card ${topic === t.id ? "is-active" : ""}`}
                        onClick={() => {
                          setTopic(t.id);
                          if (difficulty === ALL_QUESTIONS) setDifficulty(null);
                        }}
                      >
                        <span className="topic-icon">{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {!subject && (
              <p className="muted sub-hint">
                เลือกวิชาที่สอน เพื่อแสดงชุดโจทย์
              </p>
            )}
          </Step>

          <Step n={3} title="ระดับความยาก" done={Boolean(difficulty)}>
            <div className="pill-row diff-row">
              {DIFFICULTIES.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  className={`pill pill-diff pill-${d.id} ${difficulty === d.id ? "is-active" : ""}`}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                  <small>
                    {isCustom
                      ? `${Math.min(d.count, customSet.questions.length)} ข้อ · ในไฟล์มี ${customCounts[d.id]}`
                      : `${d.count} ข้อ`}
                  </small>
                </button>
              ))}
              {isCustom && (
                <button
                  type="button"
                  className={`pill pill-diff pill-all ${difficulty === ALL_QUESTIONS ? "is-active" : ""}`}
                  onClick={() => setDifficulty(ALL_QUESTIONS)}
                >
                  ทั้งชุด
                  <small>{customSet.questions.length} ข้อ ตามลำดับในไฟล์</small>
                </button>
              )}
            </div>
            {isCustom && difficulty && difficulty !== ALL_QUESTIONS && (
              <p className="muted small step-note">
                ถ้าระดับที่เลือกมีโจทย์ไม่พอ
                ระบบจะเติมจากระดับใกล้เคียงในไฟล์เดียวกัน
              </p>
            )}
          </Step>

          <Step n={4} title="เวลาแต่ละข้อ" done={Boolean(timePerQuestion)}>
            <div className="pill-row time-row">
              {TIME_OPTIONS.map((t) => (
                <button
                  type="button"
                  key={t.seconds}
                  className={`pill ${timePerQuestion === t.seconds ? "is-active" : ""}`}
                  onClick={() => setTime(t.seconds)}
                >
                  ⏱ {t.label}
                </button>
              ))}
            </div>
          </Step>

          <Step n={5} title="รูปแบบการเฉลย" done={Boolean(revealMode)}>
            <div className="radio-col" role="radiogroup">
              {REVEAL_MODES.map((m) => (
                <label
                  key={m.id}
                  className={`radio-card ${revealMode === m.id ? "is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="revealMode"
                    value={m.id}
                    checked={revealMode === m.id}
                    onChange={() => setRevealMode(m.id)}
                  />
                  <span className="radio-dot" />
                  <span>
                    <b>{m.label}</b>
                    <small>
                      {m.id === "each"
                        ? "เฉลยหลังจบแต่ละข้อ นับถอยหลัง 10 วินาทีก่อนข้อถัดไป"
                        : "ไม่เฉลยระหว่างเกม แสดงเฉลยทั้งหมดหลังจบทุกข้อ"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </Step>
        </div>

        <footer className="setup-footer">
          {!ready && (
            <p className="muted">ยังไม่ได้เลือก: {missing.join(", ")}</p>
          )}
          <button
            type="submit"
            className="btn btn-cta btn-xl"
            disabled={!ready || busy}
          >
            🎮 สร้างห้องเกม
          </button>
        </footer>
      </form>

      <ImportDialog
        open={dialog === "import"}
        onClose={() => setDialog(null)}
        onImport={applyImport}
      />
      <QuestionBuilder
        open={dialog === "create"}
        onClose={() => setDialog(null)}
        onUse={applyImport}
        defaultSubject={subject}
        defaultGrade={grade}
      />
    </>
  );
}
