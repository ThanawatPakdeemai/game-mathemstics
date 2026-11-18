// ตรวจไฟล์ MP4 ที่ได้: demux ด้วย mp4box แล้วถอดรหัสทุก sample ด้วย WebCodecs
// node verify.mjs → out/verify-frames.png + รายงานจำนวนเฟรม/เสียง
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const FILE = path.join(ROOT, 'out', 'mathmotion-intro.mp4');
const srv = http.createServer((req, res) => {
  const DIST = path.join(ROOT, 'node_modules/mp4box/dist');
  const f = path.join(DIST, path.basename(req.url));
  const hit = req.url === '/v.mp4' ? [FILE, 'video/mp4'] : req.url.endsWith('.mjs') && fs.existsSync(f) ? [f, 'text/javascript'] : null;
  if (!hit) { res.setHeader('content-type', 'text/html'); return res.end('<canvas id=c width=1920 height=1080></canvas>'); }
  res.setHeader('content-type', hit[1]);
  fs.createReadStream(hit[0]).pipe(res);
}).listen(3178);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:3178/');
const report = await page.evaluate(async () => {
  const MP4Box = await import('/mp4box.all.mjs');
  const buf = await (await fetch('/v.mp4')).arrayBuffer();
  const file = MP4Box.createFile();
  const tracks = {};
  const samples = { video: [], audio: [] };
  let info;
  file.onReady = (i) => {
    info = i;
    for (const t of i.tracks) { tracks[t.type] = t; file.setExtractionOptions(t.id, t.type, { nbSamples: 1e6 }); }
    file.start();
  };
  file.onSamples = (id, type, s) => samples[type].push(...s);
  buf.fileStart = 0;
  file.appendBuffer(buf);
  file.flush();

  // avcC description
  const vt = file.getTrackById(tracks.video.id);
  let desc;
  for (const e of vt.mdia.minf.stbl.stsd.entries) {
    const box = e.avcC;
    if (box) { const ds = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN); box.write(ds); desc = new Uint8Array(ds.buffer, 8); }
  }

  // decode all video samples; grab chosen frames
  const want = [0.1, 4.2, 9.0, 13.0, 21.5, 26.6, 30.6, 33.2, 39.2, 41.5, 44.8, 47.0, 50.6, 53.5, 55.2, 57.5].map((t) => Math.round(t * 30));
  const sheet = document.getElementById('c'); const sc = sheet.getContext('2d');
  let decoded = 0, errors = 0; const ts = [];
  const vdec = new VideoDecoder({
    output: (f) => {
      const idx = Math.round(f.timestamp / (1e6 / 30));
      ts.push(f.timestamp);
      const k = want.indexOf(idx);
      if (k >= 0) sc.drawImage(f, (k % 4) * 480, Math.floor(k / 4) * 270, 480, 270);
      decoded++; f.close();
    },
    error: () => errors++,
  });
  vdec.configure({ codec: tracks.video.codec, codedWidth: tracks.video.video.width, codedHeight: tracks.video.video.height, description: desc });
  for (const s of samples.video) {
    vdec.encodeQueueSize;
    vdec.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: (s.cts * 1e6) / s.timescale, duration: (s.duration * 1e6) / s.timescale, data: s.data }));
    while (vdec.decodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
  }
  await vdec.flush();

  // decode audio → RMS per 10ms
  const at = tracks.audio;
  const aDesc = (() => { const e = file.getTrackById(at.id).mdia.minf.stbl.stsd.entries[0]; const d = e.dOps; if (!d) return undefined; const ds = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN); d.write(ds); const u = new Uint8Array(ds.buffer, 8); const head = new Uint8Array(8 + u.length); head.set([79, 112, 117, 115, 72, 101, 97, 100]); head.set(u, 8); head[8] = 1; return head; })();
  const pcm = []; let aerr = 0;
  const adec = new AudioDecoder({
    output: (a) => { const n = a.numberOfFrames; const d = new Float32Array(n); a.copyTo(d, { planeIndex: 0, format: 'f32-planar' }); pcm.push({ t: a.timestamp / 1e6, d }); a.close(); },
    error: () => aerr++,
  });
  // หมายเหตุ: dOps ใน MP4 เป็น big-endian แต่ OpusHead ต้องเป็น little-endian — สเตอริโอไม่ต้องส่ง description
  void aDesc;
  adec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
  for (const s of samples.audio) {
    adec.decode(new EncodedAudioChunk({ type: 'key', timestamp: (s.cts * 1e6) / s.timescale, duration: (s.duration * 1e6) / s.timescale, data: s.data }));
    while (adec.decodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0));
  }
  await adec.flush();
  const rmsAt = (t0, t1) => { let s = 0, n = 0; for (const c of pcm) { for (let i = 0; i < c.d.length; i++) { const t = c.t + i / 48000; if (t >= t0 && t < t1) { s += c.d[i] ** 2; n++; } } } return Math.sqrt(s / Math.max(n, 1)); };
  // หา transient ใหญ่ที่สุดในช่วงเวลา (เทียบกับ timeline ที่ตั้งใจ)
  const envOf = () => { const e = new Map(); for (const c of pcm) for (let i = 0; i < c.d.length; i += 1) { const k = Math.floor((c.t + i / 48000) * 100); e.set(k, (e.get(k) || 0) + c.d[i] ** 2); } return e; };
  const env = envOf();
  const onset = (t0, t1) => { let best = 0, at = 0; for (let k = Math.round(t0 * 100); k < t1 * 100; k++) { const r = (env.get(k) || 0) / ((env.get(k - 3) || 0) + 1e-3); if (r > best) { best = r; at = k / 100; } } return at; };
  const onsets = { first: pcm[0]?.t, impact0: onset(0, 0.5), drop30: onset(29.6, 30.6), sent41: onset(40.7, 41.4), hit56: onset(55.7, 56.6), hit58: onset(57.7, 58.5) };
  const audioSeconds = pcm.reduce((a, c) => a + c.d.length, 0) / 48000;

  ts.sort((a, b) => a - b);
  let gaps = 0; for (let i = 1; i < ts.length; i++) if (Math.abs(ts[i] - ts[i - 1] - 1e6 / 30) > 2000) gaps++;
  return {
    duration: info.duration / info.timescale,
    videoCodec: tracks.video.codec, audioCodec: tracks.audio.codec,
    videoSamples: samples.video.length, decoded, errors, timestampGaps: gaps,
    onsets,
    audioOutputs: pcm.length,
    audioTable: { n: samples.audio.length, firstCts: samples.audio[0]?.cts, timescale: samples.audio[0]?.timescale, durs: [...new Set(samples.audio.map((x) => x.duration))], lastCts: samples.audio.at(-1)?.cts, editList: JSON.stringify(file.getTrackById(tracks.audio.id).edts?.elst?.entries || null), mediaTime: tracks.audio.movie_duration },
    audioSeconds: audioSeconds.toFixed(2), audioErrors: aerr,
    rms: { pause_29_6: rmsAt(29.6, 29.95).toFixed(4), drop_30_0: rmsAt(30.0, 30.15).toFixed(4), taps_39: rmsAt(38.8, 39.6).toFixed(4), end_59_9: rmsAt(59.85, 60).toFixed(4) },
    sheet: sheet.toDataURL('image/png'),
  };
});
fs.writeFileSync(path.join(ROOT, 'out', 'verify-frames.png'), Buffer.from(report.sheet.split(',')[1], 'base64'));
delete report.sheet;
console.log(report);
await browser.close();
srv.close();
