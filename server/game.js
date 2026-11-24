// ตรรกะของห้องเกม — เซิร์ฟเวอร์เป็นผู้ควบคุมเวลาและคะแนนทั้งหมด
import crypto from 'node:crypto';
import {
  CHARACTER_COUNT,
  LOBBY_MS,
  MAX_PLAYERS,
  REVEAL_MS,
  SCORE,
  START_COUNTDOWN_MS,
  findDifficulty,
  findGrade,
  findSubject,
  findTopic,
  speedPoints,
} from '../shared/constants.js';
import { ALL_QUESTIONS, CUSTOM_TOPIC, validateQuestionSet } from '../shared/questionSet.js';
import { pickCustomQuestions, pickQuestions } from './questionBank.js';

// ชื่อสุ่มสำหรับคนที่ไม่ได้ตั้งชื่อ (มีมากกว่าจำนวนผู้เล่นสูงสุด)
const RANDOM_NAMES = [
  'ทีมสายฟ้า', 'ทีมจรวด', 'ทีมดาวเหนือ', 'ทีมเสือดาว', 'ทีมพายุ', 'ทีมอินฟินิตี้', 'ทีมนกฮูก', 'ทีมมังกร',
  'ทีมเทอร์โบ', 'ทีมกาแล็กซี', 'ทีมดาวหาง', 'ทีมอุกกาบาต', 'ทีมเหยี่ยว', 'ทีมโลมา', 'ทีมแพนด้า', 'ทีมช้างน้อย',
  'ทีมกระต่าย', 'ทีมนกยูง', 'ทีมสิงโต', 'ทีมหมีขาว', 'ทีมเพนกวิน', 'ทีมฉลาม', 'ทีมจิงโจ้', 'ทีมยีราฟ',
  'ทีมผึ้งงาน', 'ทีมผีเสื้อ', 'ทีมหิ่งห้อย', 'ทีมดอกบัว', 'ทีมทานตะวัน', 'ทีมต้นกล้า', 'ทีมภูเขาไฟ', 'ทีมคลื่นลม',
  'ทีมสายรุ้ง', 'ทีมพระจันทร์', 'ทีมดวงอาทิตย์', 'ทีมเมฆขาว', 'ทีมหิมะ', 'ทีมเพชร', 'ทีมมรกต', 'ทีมทับทิม',
  'ทีมไพลิน', 'ทีมนักบิน', 'ทีมนักสำรวจ', 'ทีมนักประดิษฐ์', 'ทีมนักอ่าน', 'ทีมนักกวี', 'ทีมนักคิด', 'ทีมอัจฉริยะ',
  'ทีมสปีดสตาร์', 'ทีมไฟแรง', 'ทีมกล้าหาญ', 'ทีมยิ้มสู้', 'ทีมพลังบวก', 'ทีมเต็มร้อย', 'ทีมแชมป์', 'ทีมดาวรุ่ง',
];

const token = () => crypto.randomBytes(16).toString('hex');
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const STATUS = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  QUESTION: 'question',
  REVEAL: 'reveal',
  FINISHED: 'finished',
  CLOSED: 'closed',
};

/** ตัวจับเวลาที่หยุดชั่วคราว/เล่นต่อได้ */
class PausableTimer {
  constructor() {
    this.handle = null;
    this.endsAt = null;
    this.remaining = 0;
    this.duration = 0;
    this.paused = false;
    this.onDone = null;
  }
  start(ms, onDone) {
    this.clear();
    this.duration = ms;
    this.remaining = ms;
    this.onDone = onDone;
    this.paused = false;
    this.#arm();
  }
  #arm() {
    this.endsAt = Date.now() + this.remaining;
    this.handle = setTimeout(() => {
      this.handle = null;
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    }, this.remaining);
  }
  pause() {
    if (!this.handle || this.paused) return false;
    clearTimeout(this.handle);
    this.handle = null;
    this.remaining = Math.max(0, this.endsAt - Date.now());
    this.paused = true;
    return true;
  }
  resume() {
    if (!this.paused || !this.onDone) return false;
    this.paused = false;
    this.#arm();
    return true;
  }
  clear() {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    this.onDone = null;
    this.paused = false;
    this.endsAt = null;
  }
  get active() {
    return Boolean(this.handle || this.paused);
  }
  snapshot() {
    if (!this.active) return null;
    return {
      endsAt: this.paused ? null : this.endsAt,
      remaining: this.paused ? this.remaining : Math.max(0, this.endsAt - Date.now()),
      duration: this.duration,
      paused: this.paused,
    };
  }
}

export class Room {
  constructor(settings, { onChange, generateCode, customQuestions = null }) {
    this.id = crypto.randomUUID();
    this.hostToken = token();
    this.settings = settings;
    this.onChange = onChange;
    this.generateCode = generateCode;
    this.code = generateCode();
    this.status = STATUS.LOBBY;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    /** @type {Map<string, {id,token,name,characterId,connected,joinedAt,autoName,autoCharacter}>} */
    this.players = new Map();
    const count = findDifficulty(settings.difficulty)?.count ?? 0;
    // ชุดโจทย์ที่ครูนำเข้าอยู่ในห้องนี้เท่านั้น — ไม่เข้าคลัง และหายไปพร้อมห้องเมื่อปิดเกม
    this.questions = customQuestions
      ? pickCustomQuestions(customQuestions, settings.difficulty, count)
      : pickQuestions(settings.grade, settings.topic, settings.difficulty, count);
    this.currentIndex = -1;
    /** answers[questionIndex] = Map(playerId -> {choice, correct, rank, elapsedMs}) */
    this.answers = this.questions.map(() => new Map());
    this.questionStartedAt = 0;

    this.lobbyEndsAt = 0;
    this.qrExpired = false;
    this.lobbyTimer = null;
    this.timer = new PausableTimer();
    this.startLobbyTimer();
  }

  touch() {
    this.updatedAt = Date.now();
    this.onChange(this);
  }

  // ---------- Lobby ----------
  startLobbyTimer() {
    clearTimeout(this.lobbyTimer);
    this.qrExpired = false;
    this.lobbyEndsAt = Date.now() + LOBBY_MS;
    this.lobbyTimer = setTimeout(() => this.expireLobby(), LOBBY_MS);
  }

  expireLobby() {
    if (this.status !== STATUS.LOBBY) return;
    this.qrExpired = true;
    // หมดเวลาเลือกตัวละคร → สุ่มให้คนที่ยังไม่เลือก
    for (const p of this.players.values()) this.autoAssign(p, { name: false });
    this.touch();
  }

  /** สร้าง QR-Code ใหม่ (รหัสห้องใหม่ + เวลาใหม่ 5 นาที) ผู้เล่นเดิมยังอยู่ */
  renewQr() {
    if (this.status !== STATUS.LOBBY) return { error: 'เกมเริ่มไปแล้ว' };
    const oldCode = this.code;
    this.code = this.generateCode();
    this.startLobbyTimer();
    this.touch();
    return { oldCode };
  }

  takenCharacters() {
    const taken = {};
    for (const p of this.players.values()) if (p.characterId != null) taken[p.characterId] = p.id;
    return taken;
  }

  addPlayer() {
    if (this.status !== STATUS.LOBBY) return { error: 'เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้' };
    if (this.qrExpired) return { error: 'QR-Code หมดอายุแล้ว กรุณาให้คุณครูสร้างใหม่' };
    if (this.players.size >= MAX_PLAYERS) return { error: `ห้องเต็มแล้ว (${MAX_PLAYERS} คน)` };
    const player = {
      id: crypto.randomUUID().slice(0, 8),
      token: token(),
      name: '',
      characterId: null,
      connected: true,
      joinedAt: Date.now(),
      autoName: false,
      autoCharacter: false,
    };
    this.players.set(player.id, player);
    this.touch();
    return { player };
  }

  findPlayerByToken(t) {
    for (const p of this.players.values()) if (p.token === t) return p;
    return null;
  }

  setName(playerId, name) {
    const p = this.players.get(playerId);
    if (!p || this.status !== STATUS.LOBBY) return;
    p.name = String(name || '').trim().slice(0, 30);
    p.autoName = false;
    this.touch();
  }

  pickCharacter(playerId, characterId) {
    const p = this.players.get(playerId);
    if (!p) return { error: 'ไม่พบผู้เล่น' };
    if (this.status !== STATUS.LOBBY) return { error: 'เกมเริ่มแล้ว' };
    if (characterId === null) {
      p.characterId = null;
      this.touch();
      return {};
    }
    if (!Number.isInteger(characterId) || characterId < 0 || characterId >= CHARACTER_COUNT)
      return { error: 'ตัวละครไม่ถูกต้อง' };
    const owner = this.takenCharacters()[characterId];
    if (owner && owner !== playerId) return { error: 'มีคนเลือกตัวละครนี้แล้ว' };
    p.characterId = characterId;
    p.autoCharacter = false;
    this.touch();
    return {};
  }

  removePlayer(playerId) {
    if (this.status !== STATUS.LOBBY) return;
    this.players.delete(playerId);
    this.touch();
  }

  autoAssign(p, { name = true, character = true } = {}) {
    if (character && p.characterId == null) {
      const taken = this.takenCharacters();
      const free = [...Array(CHARACTER_COUNT).keys()].filter((i) => taken[i] == null);
      if (free.length) {
        p.characterId = pickRandom(free);
        p.autoCharacter = true;
      }
    }
    if (name && !p.name) {
      const used = new Set([...this.players.values()].map((x) => x.name));
      const free = RANDOM_NAMES.filter((n) => !used.has(n));
      p.name = free.length ? pickRandom(free) : `ผู้เล่น ${this.players.size}`; // กันไว้กรณีชื่อสุ่มหมด
      p.autoName = true;
    }
  }

  // ---------- Game flow ----------
  start() {
    if (this.status !== STATUS.LOBBY) return { error: 'เกมเริ่มไปแล้ว' };
    if (this.players.size === 0) return { error: 'ยังไม่มีผู้เข้าร่วม' };
    if (this.questions.length === 0) return { error: 'ไม่มีโจทย์ในหมวดนี้' };
    clearTimeout(this.lobbyTimer);
    for (const p of this.players.values()) this.autoAssign(p);
    this.status = STATUS.COUNTDOWN;
    this.timer.start(START_COUNTDOWN_MS, () => this.goToQuestion(0));
    this.touch();
    return {};
  }

  goToQuestion(index) {
    this.currentIndex = index;
    this.status = STATUS.QUESTION;
    this.questionStartedAt = Date.now();
    this.pausedTotal = 0;
    this.timer.start(this.settings.timePerQuestion * 1000, () => this.endQuestion());
    this.touch();
  }

  get isLastQuestion() {
    return this.currentIndex >= this.questions.length - 1;
  }

  /** จบข้อปัจจุบัน (หมดเวลา, ครูกด Next, หรือทุกคนตอบครบ) */
  endQuestion() {
    if (this.status !== STATUS.QUESTION) return;
    this.timer.clear();
    if (this.isLastQuestion) return this.finish();
    if (this.settings.revealMode === 'each') {
      this.status = STATUS.REVEAL;
      this.timer.start(REVEAL_MS, () => this.goToQuestion(this.currentIndex + 1));
      this.touch();
    } else {
      this.goToQuestion(this.currentIndex + 1);
    }
  }

  next() {
    if (this.status === STATUS.QUESTION) return this.endQuestion();
    if (this.status === STATUS.REVEAL) {
      this.timer.clear();
      return this.goToQuestion(this.currentIndex + 1);
    }
    if (this.status === STATUS.COUNTDOWN) {
      this.timer.clear();
      return this.goToQuestion(0);
    }
  }

  finish() {
    if (this.status === STATUS.FINISHED || this.status === STATUS.CLOSED) return;
    this.timer.clear();
    clearTimeout(this.lobbyTimer);
    this.status = STATUS.FINISHED;
    this.finishedAt = Date.now();
    this.touch();
  }

  pause() {
    if (![STATUS.COUNTDOWN, STATUS.QUESTION, STATUS.REVEAL].includes(this.status)) return;
    if (this.timer.pause()) {
      this.pauseStartedAt = Date.now();
      this.touch();
    }
  }

  resume() {
    if (this.timer.resume()) {
      if (this.status === STATUS.QUESTION && this.pauseStartedAt) this.pausedTotal += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = null;
      this.touch();
    }
  }

  close() {
    this.timer.clear();
    clearTimeout(this.lobbyTimer);
    this.status = STATUS.CLOSED;
    this.touch();
  }

  submitAnswer(playerId, choice) {
    if (this.status !== STATUS.QUESTION) return { error: 'หมดเวลาตอบข้อนี้แล้ว' };
    if (this.timer.paused) return { error: 'คุณครูหยุดเวลาชั่วคราว' };
    if (!this.players.has(playerId)) return { error: 'ไม่พบผู้เล่น' };
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return { error: 'คำตอบไม่ถูกต้อง' };
    const answers = this.answers[this.currentIndex];
    if (answers.has(playerId)) return { error: 'ส่งคำตอบข้อนี้แล้ว' };
    const q = this.questions[this.currentIndex];
    answers.set(playerId, {
      choice,
      correct: choice === q.answer,
      rank: answers.size + 1,
      elapsedMs: Date.now() - this.questionStartedAt - (this.pausedTotal || 0),
    });
    const everyone = [...this.players.keys()].every((id) => answers.has(id));
    if (everyone) this.endQuestion();
    else this.touch();
    return {};
  }

  // ---------- Scoring ----------
  scoreFor(playerId, qIndex) {
    const a = this.answers[qIndex]?.get(playerId);
    if (!a) return { answered: false, choice: null, correct: false, accuracy: 0, speed: 0, rank: null, elapsedMs: null };
    return {
      answered: true,
      choice: a.choice,
      correct: a.correct,
      accuracy: a.correct ? SCORE.correct : 0,
      speed: speedPoints(a.rank),
      rank: a.rank,
      elapsedMs: a.elapsedMs,
    };
  }

  /** คะแนนรวมของผู้เล่นทุกคน เรียงตามคะแนนรวม */
  results() {
    const playedCount = this.status === STATUS.FINISHED ? this.questions.length : Math.max(0, this.currentIndex + 1);
    const rows = [...this.players.values()].map((p) => {
      const perQuestion = this.questions.map((_, i) => this.scoreFor(p.id, i));
      const accuracy = perQuestion.reduce((s, x) => s + x.accuracy, 0);
      const speed = perQuestion.reduce((s, x) => s + x.speed, 0);
      return {
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        perQuestion,
        correctCount: perQuestion.filter((x) => x.correct).length,
        accuracy,
        speed,
        total: accuracy + speed,
      };
    });
    rows.sort((a, b) => b.total - a.total || b.accuracy - a.accuracy || a.name.localeCompare(b.name, 'th'));
    let lastTotal = null;
    let lastRank = 0;
    rows.forEach((r, i) => {
      if (r.total !== lastTotal) lastRank = i + 1;
      r.rank = lastRank;
      lastTotal = r.total;
    });
    return { rows, playedCount };
  }

  // ---------- Views ----------
  publicPlayers() {
    return [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        connected: p.connected,
        answered: this.status === STATUS.QUESTION ? this.answers[this.currentIndex].has(p.id) : false,
      }));
  }

  baseView() {
    const s = this.settings;
    return {
      roomId: this.id,
      code: this.code,
      status: this.status,
      settings: {
        ...s,
        topicLabel: s.topicLabel || findTopic(s.grade, s.topic)?.label || '',
        subjectLabel: findSubject(s.subject)?.label || '',
      },
      serverNow: Date.now(),
      lobbyEndsAt: this.lobbyEndsAt,
      qrExpired: this.qrExpired,
      timer: this.timer.snapshot(),
      questionIndex: this.currentIndex,
      totalQuestions: this.questions.length,
      isLastQuestion: this.isLastQuestion,
      players: this.publicPlayers(),
      maxPlayers: MAX_PLAYERS,
    };
  }

  questionPayload(i, withAnswer) {
    const q = this.questions[i];
    if (!q) return null;
    return {
      index: i,
      difficulty: q.difficulty,
      question: q.question,
      choices: q.choices,
      ...(withAnswer ? { answer: q.answer, explanation: q.explanation } : {}),
    };
  }

  hostView() {
    const view = this.baseView();
    const showAnswer = this.status === STATUS.REVEAL;
    if (this.currentIndex >= 0 && this.status !== STATUS.FINISHED) {
      view.question = this.questionPayload(this.currentIndex, showAnswer);
      view.answeredCount = this.answers[this.currentIndex].size;
      if (showAnswer) {
        view.reveal = {
          choiceCounts: [0, 1, 2, 3].map((c) => [...this.answers[this.currentIndex].values()].filter((a) => a.choice === c).length),
          players: this.publicPlayers().map((p) => ({ ...p, ...this.scoreFor(p.id, this.currentIndex) })),
        };
      }
    }
    if (this.status === STATUS.FINISHED) {
      view.review = this.questions.map((_, i) => ({
        ...this.questionPayload(i, true),
        choiceCounts: [0, 1, 2, 3].map((c) => [...this.answers[i].values()].filter((a) => a.choice === c).length),
        correctCount: [...this.answers[i].values()].filter((a) => a.correct).length,
        answeredCount: this.answers[i].size,
      }));
      view.results = this.results();
    }
    return view;
  }

  /**
   * มุมมองของผู้เล่นแต่ละคน — shared คือแคชที่ใช้ร่วมกันในการ broadcast รอบเดียว
   * (ห้อง 50 คน จะไม่ต้องคำนวณรายชื่อ/ผลคะแนนซ้ำ 50 รอบ)
   */
  playerView(playerId, shared = {}) {
    const view = { ...(shared.base ??= this.baseView()) };
    const me = this.players.get(playerId);
    view.me = me ? { id: me.id, name: me.name, characterId: me.characterId, autoName: me.autoName, autoCharacter: me.autoCharacter } : null;
    view.takenCharacters = shared.taken ??= this.takenCharacters();
    if (this.currentIndex >= 0 && this.status !== STATUS.FINISHED) {
      const showAnswer = this.status === STATUS.REVEAL;
      view.question = this.questionPayload(this.currentIndex, showAnswer);
      const mine = this.answers[this.currentIndex].get(playerId);
      view.myAnswer = mine ? { choice: mine.choice, rank: mine.rank, ...(showAnswer ? { correct: mine.correct } : {}) } : null;
      if (showAnswer) view.myScore = this.scoreFor(playerId, this.currentIndex);
    }
    if (this.status === STATUS.FINISHED) {
      const { rows } = (shared.results ??= this.results());
      view.final = {
        me: rows.find((r) => r.id === playerId) || null,
        podium: (shared.podium ??= rows.slice(0, 3).map(({ id, name, characterId, total, rank }) => ({ id, name, characterId, total, rank }))),
        totalPlayers: rows.length,
      };
    }
    return view;
  }
}

/**
 * ตรวจค่าที่ครูส่งมาตอนสร้างห้อง
 * คืนค่า { settings, customQuestions } หรือ { errors }
 */
export function sanitizeSettings(raw) {
  const s = raw || {};
  const isCustom = s.topic === CUSTOM_TOPIC;
  const time = Number(s.timePerQuestion);
  const errors = [];
  let custom = null;

  const bankTopic = isCustom ? null : findTopic(s.grade, s.topic);
  if (!findGrade(s.grade)) errors.push('กรุณาเลือกระดับชั้น');
  if (!isCustom && !bankTopic) errors.push('กรุณาเลือกหมวดหมู่');
  if (isCustom) {
    const res = validateQuestionSet(s.customSet, { custom: true });
    if (!res.ok) errors.push('ชุดโจทย์ที่นำเข้าไม่ถูกต้อง กรุณานำเข้าไฟล์ใหม่');
    else custom = res.set;
  }
  const difficulty = isCustom && s.difficulty === ALL_QUESTIONS ? { id: ALL_QUESTIONS } : findDifficulty(s.difficulty);
  const subject = isCustom
    ? findSubject(s.subject) || findSubject(custom?.subject) || findSubject('other')
    : findSubject(bankTopic?.subject);

  if (!String(s.className || '').trim()) errors.push('กรุณากรอกชื่อห้อง');
  if (!difficulty) errors.push('กรุณาเลือกระดับความยาก');
  if (![60, 180, 300, 600].includes(time)) errors.push('กรุณาเลือกเวลาแต่ละข้อ');
  if (!['each', 'end'].includes(s.revealMode)) errors.push('กรุณาเลือกรูปแบบการเฉลย');
  if (errors.length) return { errors };
  return {
    settings: {
      grade: s.grade,
      className: String(s.className).trim().slice(0, 30),
      subject: subject?.id || 'other',
      topic: s.topic,
      ...(custom ? { topicLabel: custom.title, author: custom.author } : {}),
      difficulty: difficulty.id,
      timePerQuestion: time,
      revealMode: s.revealMode,
    },
    customQuestions: custom?.questions || null,
  };
}
