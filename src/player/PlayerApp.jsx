import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CHOICE_LABELS } from '../../shared/constants.js';
import { socket, emitAsync } from '../lib/socket.js';
import { remainingMs, useNow, withOffset } from '../lib/time.js';
import { Avatar, Brand, ConnectionBanner, PausedOverlay, SubjectMascots, TimerBar, Toast } from '../components/ui.jsx';
import PlayerLobby from './PlayerLobby.jsx';
import TapGame from './TapGame.jsx';

const SESSION_KEY = 'mathmotion-player';
let pendingJoin = null;
const loadSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};
const saveSession = (s) => {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

function JoinForm({ error, onJoin }) {
  const [code, setCode] = useState('');
  return (
    <div className="center-screen">
      <SubjectMascots count={4} />
      <div className="card join-card">
        <Brand />
        <h1>เข้าร่วมเกม</h1>
        {error && <p className="error-text">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onJoin(code.trim());
          }}
        >
          <input
            className="code-input"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="รหัสห้อง 6 หลัก"
          />
          <button className="btn btn-cta btn-block" disabled={code.length !== 6}>
            เข้าร่วม
          </button>
        </form>
        <p className="muted small">หรือสแกน QR-Code บนจอของคุณครู</p>
      </div>
    </div>
  );
}

function QuestionPlay({ view, offset, emitAnswer }) {
  const now = useNow(200);
  const left = remainingMs(view.timer, offset, now);
  const [choice, setChoice] = useState(null);
  const [sending, setSending] = useState(false);
  const qIndex = view.questionIndex;

  useEffect(() => {
    setChoice(null);
    setSending(false);
  }, [qIndex]);

  const q = view.question;
  const paused = view.timer?.paused;

  if (view.myAnswer) {
    return (
      <div className="m-screen m-sent">
        <TimerBar compact remaining={left} duration={view.timer?.duration} paused={paused} />
        <div className="sent-card pop-in">
          <Avatar characterId={view.me.characterId} size={140} className="bounce" />
          <h2>ส่งคำตอบแล้ว!</h2>
          <p>
            คุณตอบ <b className="sent-choice">{CHOICE_LABELS[view.myAnswer.choice]}</b> เป็นลำดับที่ <b>{view.myAnswer.rank}</b>
          </p>
          <p className="muted">รอเพื่อน ๆ และคุณครู…</p>
        </div>
        {paused && <PausedOverlay text="คุณครูหยุดเวลาชั่วคราว" />}
      </div>
    );
  }

  return (
    <div className="m-screen">
      <div className="m-qhead">
        <span className="q-index">
          ข้อ {qIndex + 1}
          <small>/{view.totalQuestions}</small>
        </span>
        <TimerBar compact remaining={left} duration={view.timer?.duration} paused={paused} />
      </div>

      {choice == null ? (
        <>
          <p className="m-question">{q.question}</p>
          <div className="m-choices">
            {q.choices.map((c, i) => (
              <button key={i} className={`choice choice-${i}`} onClick={() => setChoice(i)}>
                <span className="choice-label">{CHOICE_LABELS[i]}</span>
                <span className="choice-text">{c}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <TapGame
          key={qIndex}
          characterId={view.me.characterId}
          choice={choice}
          choiceText={q.choices[choice]}
          disabled={paused || sending}
          onChangeChoice={() => setChoice(null)}
          onComplete={async () => {
            setSending(true);
            const ok = await emitAnswer(choice);
            if (!ok) setSending(false);
          }}
        />
      )}
      {paused && <PausedOverlay text="คุณครูหยุดเวลาชั่วคราว" />}
    </div>
  );
}

function RevealView({ view }) {
  const s = view.myScore;
  const q = view.question;
  return (
    <div className="m-screen m-reveal">
      <div className={`reveal-banner ${!s?.answered ? 'is-none' : s.correct ? 'is-correct' : 'is-wrong'} pop-in`}>
        <div className="reveal-emoji">{!s?.answered ? '⏰' : s.correct ? '🎉' : '😅'}</div>
        <h2>{!s?.answered ? 'ไม่ได้ตอบทันเวลา' : s.correct ? 'ถูกต้อง!' : 'ยังไม่ถูกนะ'}</h2>
        <p>
          เฉลย: <b>{CHOICE_LABELS[q.answer]}</b> {q.choices[q.answer]}
        </p>
        <div className="points-row">
          <span>✅ +{s?.accuracy ?? 0}</span>
          <span>⚡ +{fmt(s?.speed ?? 0)}</span>
        </div>
      </div>
      <p className="muted center">รอข้อถัดไป…</p>
    </div>
  );
}

function FinalView({ view }) {
  const me = view.final?.me;
  return (
    <div className="m-screen m-final">
      <h1>🏁 จบการแข่งขัน!</h1>
      {me && (
        <div className="card final-card pop-in">
          <Avatar characterId={me.characterId} size={120} className="bounce" />
          <b className="final-name">{me.name}</b>
          <div className="final-rank">
            อันดับ <b>{me.rank}</b> จาก {view.final.totalPlayers}
          </div>
          <div className="final-scores">
            <div>
              <small>ความถูกต้อง</small>
              <b>{fmt(me.accuracy)}</b>
            </div>
            <div>
              <small>ความเร็ว</small>
              <b>{fmt(me.speed)}</b>
            </div>
            <div className="is-total">
              <small>รวม</small>
              <b>{fmt(me.total)}</b>
            </div>
          </div>
          <p className="muted">
            ตอบถูก {me.correctCount}/{view.totalQuestions} ข้อ
          </p>
        </div>
      )}
      <div className="mini-podium">
        {view.final?.podium.map((p) => (
          <div key={p.id}>
            <span>{p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉'}</span>
            <Avatar characterId={p.characterId} size={36} />
            <b>{p.name}</b>
            <small>{fmt(p.total)}</small>
          </div>
        ))}
      </div>
      <p className="muted center">ดูผลการแข่งขันทั้งหมดได้ที่จอของคุณครู</p>
    </div>
  );
}

export default function PlayerApp() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(true);
  const [ended, setEnded] = useState('');
  const [toast, setToast] = useState('');
  const joinedRef = useRef(false);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const join = useCallback(async (joinCode) => {
    const session = loadSession();
    const payload = joinCode
      ? { code: joinCode, token: session?.token }
      : session
        ? { roomId: session.roomId, token: session.token }
        : null;
    if (!payload) {
      setJoining(false);
      return;
    }
    setJoining(true);
    // กันการ join ซ้ำพร้อมกัน (เช่น StrictMode เรียก effect สองครั้ง)
    const key = JSON.stringify(payload);
    if (pendingJoin?.key !== key) pendingJoin = { key, promise: emitAsync('player:join', payload) };
    const res = await pendingJoin.promise;
    if (pendingJoin?.key === key) pendingJoin = null;
    setJoining(false);
    if (res.error) {
      setError(res.error);
      joinedRef.current = false;
      return;
    }
    joinedRef.current = true;
    setError('');
    setEnded('');
    saveSession({ roomId: res.roomId, token: res.token });
  }, []);

  useEffect(() => {
    const onState = (view) => setState(withOffset(view));
    const onClosed = () => {
      saveSession(null);
      setEnded('คุณครูปิดห้องเกมแล้ว');
      setState(null);
    };
    const onKicked = () => {
      saveSession(null);
      setEnded('คุณถูกนำออกจากห้องเกม');
      setState(null);
    };
    // เชื่อมต่อใหม่ (เช่น ล็อกหน้าจอ) → กลับเข้าห้องเดิมด้วย token
    const onConnect = () => {
      if (joinedRef.current) join(null);
    };
    socket.on('state', onState);
    socket.on('room:closed', onClosed);
    socket.on('kicked', onKicked);
    socket.on('connect', onConnect);
    join(code || null);
    return () => {
      socket.off('state', onState);
      socket.off('room:closed', onClosed);
      socket.off('kicked', onKicked);
      socket.off('connect', onConnect);
    };
  }, [code, join]);

  const emitAnswer = useCallback(
    async (choice) => {
      const res = await emitAsync('player:answer', choice);
      if (res.error) {
        notify(res.error);
        return false;
      }
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
      return true;
    },
    [notify],
  );

  const view = state?.view;
  let screen;

  if (ended) {
    screen = (
      <div className="center-screen">
        <div className="card join-card">
          <Brand />
          <h2>{ended}</h2>
          <button className="btn btn-primary" onClick={() => { setEnded(''); navigate('/join'); }}>
            เข้าร่วมห้องอื่น
          </button>
        </div>
      </div>
    );
  } else if (joining && !view) {
    screen = <div className="center-screen loading">กำลังเข้าร่วมห้อง…</div>;
  } else if (!view || !view.me) {
    screen = <JoinForm error={error} onJoin={(c) => navigate(`/join/${c}`)} />;
  } else {
    switch (view.status) {
      case 'lobby':
        screen = <PlayerLobby view={view} offset={state.offset} notify={notify} />;
        break;
      case 'countdown':
        screen = <CountdownMobile view={view} offset={state.offset} />;
        break;
      case 'question':
        screen = <QuestionPlay view={view} offset={state.offset} emitAnswer={emitAnswer} />;
        break;
      case 'reveal':
        screen = <RevealView view={view} />;
        break;
      case 'finished':
        screen = <FinalView view={view} />;
        break;
      default:
        screen = <div className="center-screen">ห้องเกมถูกปิดแล้ว</div>;
    }
  }

  return (
    <div className="app player">
      <ConnectionBanner />
      {view?.me && (
        <header className="m-top">
          <Brand small />
          <span className="m-me">
            <Avatar characterId={view.me.characterId} size={28} placeholder="?" />
            {view.me.name || 'ยังไม่ตั้งชื่อ'}
          </span>
        </header>
      )}
      {screen}
      <Toast message={toast} />
    </div>
  );
}

function CountdownMobile({ view, offset }) {
  const now = useNow(100);
  const n = Math.max(1, Math.ceil(remainingMs(view.timer, offset, now) / 1000));
  return (
    <div className="m-screen center">
      <Avatar characterId={view.me.characterId} size={160} className="bounce" />
      <h2>{view.me.name}</h2>
      <p>เตรียมพร้อม!</p>
      <div key={n} className="big-count big-count-sm">
        {n}
      </div>
      {view.timer?.paused && <PausedOverlay text="คุณครูหยุดเวลาชั่วคราว" />}
    </div>
  );
}
