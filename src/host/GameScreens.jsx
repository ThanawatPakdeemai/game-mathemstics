import { CHOICE_LABELS } from '../../shared/constants.js';
import { Avatar, crowd, DifficultyBadge, PausedOverlay, TimerBar } from '../components/ui.jsx';
import { remainingMs, useNow } from '../lib/time.js';
import { RoomHeader } from './LobbyScreen.jsx';

function PauseButton({ view, action }) {
  const paused = view.timer?.paused;
  return paused ? (
    <button className="btn btn-success" onClick={() => action('host:resumeTimer')}>
      ▶ เล่นต่อ
    </button>
  ) : (
    <button className="btn btn-ghost" onClick={() => action('host:pause')}>
      ⏸️ หยุดชั่วคราว
    </button>
  );
}

function confirmFinish(action) {
  if (window.confirm('จบการแข่งขันทันทีและสรุปผล?')) action('host:finish');
}

export function CountdownScreen({ view, offset, action }) {
  const now = useNow(100);
  const left = remainingMs(view.timer, offset, now);
  const n = Math.max(1, Math.ceil(left / 1000));
  const dense = crowd(view.players.length, [96, 64, 48]);

  return (
    <div className="page countdown">
      <RoomHeader view={view} />
      <h1 className="countdown-title">ผู้เข้าแข่งขัน</h1>
      <ul className={`roster ${dense.cls}`}>
        {view.players.map((p, i) => (
          <li key={p.id} className="roster-item pop-in" style={{ animationDelay: `${Math.min(i * 40, 1500)}ms` }}>
            <Avatar characterId={p.characterId} size={dense.size} />
            <b>{p.name}</b>
          </li>
        ))}
      </ul>
      <div className="big-count-wrap">
        <div key={n} className="big-count">
          {n}
        </div>
        <p>เตรียมตัวเข้าสู่การแข่งขัน!</p>
      </div>
      <footer className="action-bar">
        <PauseButton view={view} action={action} />
      </footer>
      {view.timer?.paused && <PausedOverlay />}
    </div>
  );
}

function ChoiceGrid({ question, reveal }) {
  return (
    <div className="choice-grid">
      {question.choices.map((c, i) => {
        let state = '';
        if (reveal) state = i === question.answer ? 'is-correct' : 'is-dim';
        return (
          <div key={i} className={`choice choice-${i} ${state}`}>
            <span className="choice-label">{CHOICE_LABELS[i]}</span>
            <span className="choice-text">{c}</span>
            {reveal && <span className="choice-count">{reveal.choiceCounts[i]} คน</span>}
            {reveal && i === question.answer && <span className="choice-check">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function QuestionHead({ view }) {
  return (
    <div className="q-head">
      <span className="q-index">
        ข้อ {view.questionIndex + 1}
        <small>/{view.totalQuestions}</small>
      </span>
      <DifficultyBadge id={view.question.difficulty} />
      <div className="q-dots">
        {Array.from({ length: view.totalQuestions }).map((_, i) => (
          <span key={i} className={i < view.questionIndex ? 'is-past' : i === view.questionIndex ? 'is-now' : ''} />
        ))}
      </div>
    </div>
  );
}

export function QuestionScreen({ view, offset, action }) {
  const now = useNow(200);
  const left = remainingMs(view.timer, offset, now);
  const q = view.question;
  const dense = crowd(view.players.length, [52, 44, 36]);

  return (
    <div className="page play">
      <RoomHeader view={view} right={<span className="answered-count">✍️ ตอบแล้ว {view.answeredCount}/{view.players.length}</span>} />
      <QuestionHead view={view} />
      <TimerBar remaining={left} duration={view.timer?.duration} paused={view.timer?.paused} />

      <section className="card question-card">
        <p className="question-text">{q.question}</p>
      </section>
      <ChoiceGrid question={q} />

      <ul className={`answer-strip ${dense.cls}`}>
        {view.players.map((p) => (
          <li key={p.id} className={p.answered ? 'is-done' : ''} title={p.name}>
            <Avatar characterId={p.characterId} size={dense.size} />
            {p.answered && <span className="strip-check">✓</span>}
            <small>{p.name}</small>
          </li>
        ))}
      </ul>

      <footer className="action-bar">
        <PauseButton view={view} action={action} />
        {view.isLastQuestion ? (
          <button className="btn btn-danger btn-xl" onClick={() => confirmFinish(action)}>
            🏁 จบเกม
          </button>
        ) : (
          <button className="btn btn-cta btn-xl" onClick={() => action('host:next')}>
            ข้อถัดไป ➜
          </button>
        )}
      </footer>
      {view.timer?.paused && <PausedOverlay />}
    </div>
  );
}

export function RevealScreen({ view, offset, action }) {
  const now = useNow(200);
  const left = remainingMs(view.timer, offset, now);
  const q = view.question;
  const players = [...view.reveal.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const dense = crowd(players.length, [44, 36, 30]);

  return (
    <div className="page play reveal">
      <RoomHeader view={view} />
      <QuestionHead view={view} />

      <section className="card question-card">
        <span className="reveal-tag">เฉลย</span>
        <p className="question-text">{q.question}</p>
        {q.explanation && <p className="explanation">💡 {q.explanation}</p>}
      </section>
      <ChoiceGrid question={q} reveal={view.reveal} />

      <ul className={`reveal-list ${dense.cls}`}>
        {players.map((p) => (
          <li key={p.id} className={!p.answered ? 'is-none' : p.correct ? 'is-correct' : 'is-wrong'}>
            <Avatar characterId={p.characterId} size={dense.size} />
            <b>{p.name}</b>
            <span className="reveal-answer">{p.answered ? CHOICE_LABELS[p.choice] : '—'}</span>
            <span className="reveal-points">
              +{p.accuracy}
              {p.speed > 0 && <em> ⚡+{p.speed}</em>}
            </span>
          </li>
        ))}
      </ul>

      <footer className="action-bar">
        <div className="next-in">
          ข้อถัดไปใน <b>{Math.ceil(left / 1000)}</b> วินาที
        </div>
        <PauseButton view={view} action={action} />
        <button className="btn btn-cta btn-xl" onClick={() => action('host:next')}>
          ข้อถัดไป ➜
        </button>
      </footer>
      {view.timer?.paused && <PausedOverlay />}
    </div>
  );
}
