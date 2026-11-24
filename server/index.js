import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room, STATUS, sanitizeSettings } from './game.js';
import { loadQuestionBank } from './questionBank.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const summary = loadQuestionBank();
console.log('[questions] โหลดคลังโจทย์:', summary.map((s) => `${s.key}=${s.total}`).join(', '));

const app = express();
const server = http.createServer(app);
// ไฟล์โจทย์ที่ครูนำเข้าจำกัด 1 MB จึงเผื่อขนาดข้อความ socket ไว้ 2 MB
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 2e6 });

/** @type {Map<string, Room>} */
const rooms = new Map();
/** code -> roomId */
const codes = new Map();

function generateCode() {
  let code;
  do code = String(Math.floor(100000 + Math.random() * 900000));
  while (codes.has(code));
  return code;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// ---------- HTTP ----------
app.get('/api/info', (_req, res) => {
  res.json({ lanIps: lanAddresses(), port: PORT, publicUrl: process.env.PUBLIC_URL || null });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ---------- Broadcast ----------
// รวมการเปลี่ยนแปลงที่เกิดติด ๆ กันใน 40ms เป็นการส่งรอบเดียว
// (ห้อง 50 คน: นักเรียนพิมพ์ชื่อ/เลือกตัวละครพร้อมกัน จะไม่ส่ง state ซ้ำหลายสิบรอบ)
const BROADCAST_MS = 40;
const pendingBroadcast = new Set();

function broadcast(room) {
  if (pendingBroadcast.has(room.id)) return;
  pendingBroadcast.add(room.id);
  setTimeout(() => {
    pendingBroadcast.delete(room.id);
    const ids = io.sockets.adapter.rooms.get(room.id);
    if (!ids) return;
    let hostView;
    const shared = {};
    for (const sid of ids) {
      const socket = io.sockets.sockets.get(sid);
      if (!socket) continue;
      if (socket.data.role === 'host') socket.emit('state', (hostView ??= room.hostView()));
      else if (socket.data.role === 'player') socket.emit('state', room.playerView(socket.data.playerId, shared));
    }
  }, BROADCAST_MS);
}

function createRoom(settings, customQuestions) {
  const room = new Room(settings, {
    onChange: (r) => {
      // อัปเดตรหัสห้องเมื่อสร้าง QR ใหม่
      for (const [c, id] of codes) if (id === r.id && c !== r.code) codes.delete(c);
      if (r.status === STATUS.LOBBY) codes.set(r.code, r.id);
      else codes.delete(r.code);
      broadcast(r);
    },
    generateCode,
    customQuestions,
  });
  rooms.set(room.id, room);
  codes.set(room.code, room.id);
  return room;
}

function playerSocketCount(room, playerId) {
  const ids = io.sockets.adapter.rooms.get(room.id) || new Set();
  let n = 0;
  for (const sid of ids) {
    const s = io.sockets.sockets.get(sid);
    if (s?.data.role === 'player' && s.data.playerId === playerId) n++;
  }
  return n;
}

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  const hostRoom = () => {
    const room = rooms.get(socket.data.roomId);
    return socket.data.role === 'host' && room ? room : null;
  };
  const playerRoom = () => {
    const room = rooms.get(socket.data.roomId);
    return socket.data.role === 'player' && room ? room : null;
  };

  // ----- ครู -----
  socket.on('host:create', (raw, ack) => {
    const { settings, customQuestions, errors } = sanitizeSettings(raw);
    if (errors) return reply(ack, { error: errors.join(', ') });
    const room = createRoom(settings, customQuestions);
    if (room.questions.length === 0) {
      rooms.delete(room.id);
      codes.delete(room.code);
      room.close();
      return reply(ack, { error: 'ยังไม่มีโจทย์ในหมวดนี้' });
    }
    socket.data = { role: 'host', roomId: room.id };
    socket.join(room.id);
    reply(ack, { roomId: room.id, hostToken: room.hostToken });
    broadcast(room);
  });

  socket.on('host:resume', ({ roomId, hostToken } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room || room.hostToken !== hostToken || room.status === STATUS.CLOSED) return reply(ack, { error: 'ไม่พบห้องเกม' });
    socket.data = { role: 'host', roomId: room.id };
    socket.join(room.id);
    reply(ack, { ok: true });
    broadcast(room);
  });

  const hostAction = (event, fn) =>
    socket.on(event, (arg, ack) => {
      if (typeof arg === 'function') [arg, ack] = [undefined, arg];
      const room = hostRoom();
      if (!room) return reply(ack, { error: 'ไม่พบห้องเกม' });
      reply(ack, fn(room, arg) || {});
    });

  hostAction('host:renewQr', (room) => room.renewQr());
  hostAction('host:start', (room) => room.start());
  hostAction('host:pause', (room) => room.pause());
  hostAction('host:resumeTimer', (room) => room.resume());
  hostAction('host:next', (room) => room.next());
  hostAction('host:finish', (room) => room.finish());
  hostAction('host:kick', (room, playerId) => {
    room.removePlayer(playerId);
    const ids = io.sockets.adapter.rooms.get(room.id) || new Set();
    for (const sid of ids) {
      const s = io.sockets.sockets.get(sid);
      if (s?.data.playerId === playerId) {
        s.emit('kicked');
        s.leave(room.id);
        s.data = {};
      }
    }
  });
  hostAction('host:leave', (room) => {
    socket.leave(room.id);
    socket.data = {};
  });
  hostAction('host:cancel', (room) => {
    room.close();
    io.to(room.id).emit('room:closed');
    io.in(room.id).socketsLeave(room.id);
    codes.delete(room.code);
    rooms.delete(room.id);
  });

  // ----- นักเรียน -----
  socket.on('player:join', ({ code, roomId, token } = {}, ack) => {
    let room = roomId ? rooms.get(roomId) : rooms.get(codes.get(String(code || '').trim()));
    let player = null;

    if (room && token) player = room.findPlayerByToken(token);
    if (!player && !room && token && code) {
      // รหัสห้องอาจเปลี่ยนเพราะครูสร้าง QR ใหม่ — หาโดยใช้ token
      for (const r of rooms.values()) if ((player = r.findPlayerByToken(token))) { room = r; break; }
    }
    if (!room || room.status === STATUS.CLOSED) return reply(ack, { error: 'ไม่พบห้องเกม หรือ QR-Code หมดอายุแล้ว' });

    if (!player) {
      const res = room.addPlayer();
      if (res.error) return reply(ack, { error: res.error });
      player = res.player;
    }

    player.connected = true;
    socket.data = { role: 'player', roomId: room.id, playerId: player.id };
    socket.join(room.id);
    reply(ack, { roomId: room.id, playerId: player.id, token: player.token });
    room.touch();
  });

  socket.on('player:name', (name) => {
    const room = playerRoom();
    room?.setName(socket.data.playerId, name);
  });

  socket.on('player:character', (characterId, ack) => {
    const room = playerRoom();
    if (!room) return reply(ack, { error: 'ไม่พบห้องเกม' });
    reply(ack, room.pickCharacter(socket.data.playerId, characterId));
  });

  socket.on('player:answer', (choice, ack) => {
    const room = playerRoom();
    if (!room) return reply(ack, { error: 'ไม่พบห้องเกม' });
    reply(ack, room.submitAnswer(socket.data.playerId, choice));
  });

  socket.on('player:leave', () => {
    const room = playerRoom();
    if (!room) return;
    socket.leave(room.id);
    room.removePlayer(socket.data.playerId);
    socket.data = {};
  });

  socket.on('disconnect', () => {
    const room = playerRoom();
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (p && playerSocketCount(room, p.id) === 0) {
      p.connected = false;
      room.touch();
    }
  });
});

// ลบห้องที่ไม่ได้ใช้งานนานเกิน 3 ชั่วโมง
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const room of rooms.values()) {
    if (room.status === STATUS.CLOSED || room.updatedAt < cutoff) {
      room.close();
      codes.delete(room.code);
      rooms.delete(room.id);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 QuizMotion server พร้อมใช้งานที่ http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`   ในวง LAN: http://${ip}:${PORT}`);
});
