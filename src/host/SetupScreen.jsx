import { useState } from 'react';
import { DEFAULT_SETTINGS, DIFFICULTIES, GRADES, REVEAL_MODES, TIME_OPTIONS } from '../../shared/constants.js';
import { Brand } from '../components/ui.jsx';

function Step({ n, title, done, children }) {
  return (
    <section className={`card step ${done ? 'is-done' : ''}`}>
      <header className="step-head">
        <span className="step-num">{done ? '✓' : n}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export default function SetupScreen({ onCreate }) {
  const [grade, setGrade] = useState(null);
  const [className, setClassName] = useState('');
  const [topic, setTopic] = useState(null);
  const [difficulty, setDifficulty] = useState(DEFAULT_SETTINGS.difficulty);
  const [timePerQuestion, setTime] = useState(DEFAULT_SETTINGS.timePerQuestion);
  const [revealMode, setRevealMode] = useState(null);
  const [busy, setBusy] = useState(false);

  const gradeInfo = GRADES.find((g) => g.id === grade);

  const chooseGrade = (g) => {
    setGrade(g.id);
    // ถ้าระดับชั้นมีหมวดเดียว เลือกให้อัตโนมัติ
    setTopic(g.topics.length === 1 ? g.topics[0].id : null);
  };

  const missing = [];
  if (!grade) missing.push('ระดับชั้น');
  if (!className.trim()) missing.push('ชื่อห้อง');
  if (!topic) missing.push('หมวดหมู่');
  if (!difficulty) missing.push('ระดับความยาก');
  if (!timePerQuestion) missing.push('เวลาแต่ละข้อ');
  if (!revealMode) missing.push('รูปแบบการเฉลย');
  const ready = missing.length === 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    await onCreate({ grade, className, topic, difficulty, timePerQuestion, revealMode });
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
        <Step n={1} title="เลือกระดับชั้น" done={grade && className.trim()}>
          <div className="pill-row">
            {GRADES.map((g) => (
              <button
                type="button"
                key={g.id}
                className={`pill pill-lg ${grade === g.id ? 'is-active' : ''}`}
                onClick={() => chooseGrade(g)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>ชื่อห้อง</span>
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="เช่น ม.6/9"
              maxLength={30}
            />
          </label>
        </Step>

        <Step n={2} title="เลือกหมวดหมู่การเรียนการสอน" done={Boolean(topic)}>
          {!gradeInfo ? (
            <p className="muted">เลือกระดับชั้นก่อน เพื่อแสดงหมวดหมู่</p>
          ) : (
            <div className="topic-row">
              {gradeInfo.topics.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`topic-card ${topic === t.id ? 'is-active' : ''}`}
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
                className={`pill pill-diff pill-${d.id} ${difficulty === d.id ? 'is-active' : ''}`}
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
                className={`pill ${timePerQuestion === t.seconds ? 'is-active' : ''}`}
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
              <label key={m.id} className={`radio-card ${revealMode === m.id ? 'is-active' : ''}`}>
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
                    {m.id === 'each'
                      ? 'เฉลยหลังจบแต่ละข้อ นับถอยหลัง 10 วินาทีก่อนข้อถัดไป'
                      : 'ไม่เฉลยระหว่างเกม แสดงเฉลยทั้งหมดหลังจบทุกข้อ'}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </Step>
      </div>

      <footer className="setup-footer">
        {!ready && <p className="muted">ยังไม่ได้เลือก: {missing.join(', ')}</p>}
        <button type="submit" className="btn btn-cta btn-xl" disabled={!ready || busy}>
          🎮 สร้างห้องเกม
        </button>
      </footer>
    </form>
  );
}
