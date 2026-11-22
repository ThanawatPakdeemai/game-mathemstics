import { useState } from "react";
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  EDUCATION_TIERS,
  findGrade,
  REVEAL_MODES,
  TIME_OPTIONS,
} from "../../shared/constants.js";
import { Brand } from "../components/ui.jsx";

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
  const [topic, setTopic] = useState(null);
  const [difficulty, setDifficulty] = useState(DEFAULT_SETTINGS.difficulty);
  const [timePerQuestion, setTime] = useState(DEFAULT_SETTINGS.timePerQuestion);
  const [revealMode, setRevealMode] = useState(null);
  const [busy, setBusy] = useState(false);

  const gradeInfo = findGrade(grade);
  const tier = EDUCATION_TIERS.find((t) => t.id === tierId);
  const group = tier.groups.find((x) => x.id === groupId) || null;

  const chooseGrade = (g) => {
    setGrade(g.id);
    // ถ้าระดับชั้นมีหมวดเดียว เลือกให้อัตโนมัติ
    setTopic(g.topics.length === 1 ? g.topics[0].id : null);
  };

  const clearGrade = () => {
    setGrade(null);
    setTopic(null);
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

  const missing = [];
  if (!grade) missing.push("ระดับชั้น");
  if (!className.trim()) missing.push("ชื่อห้อง");
  if (!topic) missing.push("หมวดหมู่");
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
      topic,
      difficulty,
      timePerQuestion,
      revealMode,
    });
    setBusy(false);
  };

  return (
    <form className="setup page" onSubmit={submit}>
      <header className="setup-hero">
        <Brand />
        <div>
          <h1>ตั้งค่าห้องเกม</h1>
          <p>เลือกให้ครบทุกขั้นตอน แล้วให้นักเรียนสแกน QR-Code เข้าร่วม</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span>∀</span>
          <span>∩</span>
          <span>θ</span>
          <span>Σ</span>
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
            <span className="ready-legend">
              <span className="ready-dot" aria-hidden="true" />
              มีคลังโจทย์แล้ว
            </span>
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

        <Step n={2} title="เลือกหมวดหมู่การเรียนการสอน" done={Boolean(topic)}>
          {!gradeInfo ? (
            <p className="muted">เลือกระดับชั้นก่อน เพื่อแสดงหมวดหมู่</p>
          ) : gradeInfo.topics.length === 0 ? (
            <p className="muted">
              ยังไม่มีคลังโจทย์สำหรับ {gradeInfo.title} — ตอนนี้มีโจทย์สำหรับ
              ม.4–ม.6
            </p>
          ) : (
            <div className="topic-row">
              {gradeInfo.topics.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`topic-card ${topic === t.id ? "is-active" : ""}`}
                  onClick={() => setTopic(t.id)}
                >
                  <span className="topic-icon">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </Step>

        <Step n={3} title="ระดับความยาก" done={Boolean(difficulty)}>
          <div className="pill-row">
            {DIFFICULTIES.map((d) => (
              <button
                type="button"
                key={d.id}
                className={`pill pill-diff pill-${d.id} ${difficulty === d.id ? "is-active" : ""}`}
                onClick={() => setDifficulty(d.id)}
              >
                {d.label}
                <small>{d.count} ข้อ</small>
              </button>
            ))}
          </div>
        </Step>

        <Step n={4} title="เวลาแต่ละข้อ" done={Boolean(timePerQuestion)}>
          <div className="pill-row">
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
  );
}
