import { useState } from 'react';
import { CHOICE_LABELS, SCORE } from '../../shared/constants.js';
import { Avatar, DifficultyBadge } from '../components/ui.jsx';
import { exportCsv, exportXlsx } from '../lib/export.js';
import { RoomHeader } from './LobbyScreen.jsx';

const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

function Review({ view, onShowResults }) {
  return (
    <>
      <h1 className="section-title">📖 เฉลยคำตอบทั้งหมด</h1>
      <ol className="review-list">
        {view.review.map((q, i) => (
          <li key={i} className="card review-item">
            <header>
              <span className="q-index">ข้อ {i + 1}</span>
              <DifficultyBadge id={q.difficulty} />
              <span className="muted">
                ตอบถูก {q.correctCount}/{view.players.length} คน
              </span>
            </header>
            <p className="review-q">{q.question}</p>
            <div className="review-choices">
              {q.choices.map((c, ci) => (
                <span key={ci} className={ci === q.answer ? 'is-correct' : ''}>
                  <b>{CHOICE_LABELS[ci]}</b> {c}
                  <small>{q.choiceCounts[ci]} คน</small>
                </span>
              ))}
            </div>
            {q.explanation && <p className="explanation">💡 {q.explanation}</p>}
          </li>
        ))}
      </ol>
      <div className="center-row">
        <button className="btn btn-cta btn-xl" onClick={onShowResults}>
          🏆 แสดงผลการแข่งขัน
        </button>
      </div>
    </>
  );
}

function Podium({ rows }) {
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="podium">
      {order.map((r) => (
        <div key={r.id} className={`podium-col rank-${r.rank}`}>
          <Avatar characterId={r.characterId} size={r.rank === 1 ? 120 : 92} />
          <b>{r.name}</b>
          <span className="podium-score">{fmt(r.total)} คะแนน</span>
          <div className="podium-block">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}</div>
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ view, mode }) {
  const { rows } = view.results;
  const key = mode === 'accuracy' ? 'accuracy' : 'speed';
  // อันดับตามโหมดที่เลือก (คะแนนเท่ากันได้อันดับเดียวกัน)
  const sorted = [...rows].sort((a, b) => b[key] - a[key] || a.rank - b.rank);
  const modeRank = new Map();
  sorted.forEach((r, i) => modeRank.set(r.id, i > 0 && r[key] === sorted[i - 1][key] ? modeRank.get(sorted[i - 1].id) : i + 1));
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-name">ผู้เข้าแข่งขัน</th>
            {view.review.map((_, i) => (
              <th key={i}>ข้อ {i + 1}</th>
            ))}
            <th className="col-total">รวม</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
              <tr key={r.id}>
                <td className="col-rank">{modeRank.get(r.id)}</td>
                <td className="col-name">
                  <span className="name-cell">
                    <span>{r.name}</span>
                    <Avatar characterId={r.characterId} size={30} className="avatar-xs" />
                  </span>
                </td>
                {r.perQuestion.map((q, i) => (
                  <td key={i} className={!q.answered ? 'cell-none' : mode === 'accuracy' ? (q.correct ? 'cell-good' : 'cell-bad') : q.speed > 0 ? 'cell-good' : ''}>
                    {mode === 'accuracy' ? (
                      q.answered ? (
                        <>
                          {q.correct ? '✓' : '✗'} {q.accuracy}
                        </>
                      ) : (
                        '—'
                      )
                    ) : q.answered ? (
                      <>
                        {fmt(q.speed)}
                        <small className="rank-tag">#{q.rank}</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
                <td className="col-total">{fmt(r[key])}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ view, onBack }) {
  const [mode, setMode] = useState('accuracy');
  const { rows } = view.results;
  return (
    <>
      <h1 className="section-title">🏆 ผลการแข่งขัน</h1>
      <Podium rows={rows} />

      <div className="card results-card">
        <div className="results-toolbar">
          <div className="segmented" role="tablist">
            <button role="tab" className={mode === 'accuracy' ? 'is-active' : ''} onClick={() => setMode('accuracy')}>
              ✅ คะแนนความถูกต้อง
            </button>
            <button role="tab" className={mode === 'speed' ? 'is-active' : ''} onClick={() => setMode('speed')}>
              ⚡ คะแนนความเร็ว
            </button>
          </div>
          <p className="muted small">
            {mode === 'accuracy'
              ? `ตอบถูก +${SCORE.correct} คะแนน, ตอบผิดหรือไม่ตอบ 0 คะแนน`
              : `ส่งคำตอบเป็นอันดับ 1 +${SCORE.speed[0]}, อันดับ 2 +${SCORE.speed[1]}, อันดับ 3 ขึ้นไป 0`}
          </p>
        </div>
        <ResultsTable view={view} mode={mode} />

        <div className="summary-row">
          {rows.map((r) => (
            <span key={r.id} className="summary-chip">
              <Avatar characterId={r.characterId} size={24} className="avatar-xs" />
              {r.name}: <b>{fmt(r.total)}</b>
              <small>
                ({fmt(r.accuracy)} + ⚡{fmt(r.speed)})
              </small>
            </span>
          ))}
        </div>
      </div>

      <div className="center-row export-row">
        <button className="btn btn-ghost" onClick={onBack}>
          ← ดูเฉลย
        </button>
        <button className="btn btn-primary" onClick={() => exportCsv(view)}>
          ⬇ Export CSV
        </button>
        <button className="btn btn-success" onClick={() => exportXlsx(view)}>
          ⬇ Export Excel (.xlsx)
        </button>
      </div>
    </>
  );
}

export default function FinishedScreen({ view, onLeave }) {
  const [showResults, setShowResults] = useState(false);
  const newGame = () => {
    if (window.confirm('เริ่มสร้างห้องเกมใหม่? (ควร Export ผลคะแนนก่อน)')) onLeave(false);
  };
  return (
    <div className="page finished">
      <RoomHeader
        view={view}
        right={
          <button className="btn btn-ghost btn-sm" onClick={newGame}>
            ＋ เกมใหม่
          </button>
        }
      />
      {showResults ? <Results view={view} onBack={() => setShowResults(false)} /> : <Review view={view} onShowResults={() => setShowResults(true)} />}
    </div>
  );
}
