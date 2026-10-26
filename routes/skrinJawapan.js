// ============================================================
// SKRIN JAWAPAN - TELEFON GURU -> SKRIN DEPAN (PC / TV)
// ------------------------------------------------------------
// Halaman:
//   public/skrin-jawapan.html          (skrin depan - PC/TV)
//   public/skrin-jawapan-telefon.html  (telefon guru - kamera & zoom)
//
// Aliran:
//   1. Skrin depan sambung WS /skrin-jawapan?bilik=1234&peranan=paparan&kunci=<rahsia>
//      lalu paparkan kod bilik + QR.
//   2. Telefon imbas QR -> log masuk (kata laluan tapak) -> sambung WS
//      /skrin-jawapan?bilik=1234&peranan=telefon
//   3. Guru ambil gambar, tekan DEPLOY -> telefon POST gambar (JPEG) ke
//      /api/skrin-jawapan/:kod/gambar -> server simpan dlm MEMORI sahaja
//      (SATU gambar sebilik; gambar baru terus ganti gambar lama) -> skrin
//      depan diberitahu & muat turun gambar baru.
//   4. Zoom / gerak / penunjuk pada telefon -> {jenis:'pandangan'} melalui
//      WS -> skrin depan ikut serta-merta.
//
// Tiada apa-apa disimpan dalam MongoDB atau cakera. Gambar dipadam bila:
//   - gambar baru di-deploy (ganti), atau guru tekan "Kosongkan Skrin",
//   - bilik tiada sesiapa bersambung selama 30 minit, atau
//   - gambar sudah berusia lebih 3 jam.
// ============================================================
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const { isAuthed } = require('../middleware/siteAuth');

const MAX_BYTES = 12 * 1024 * 1024;       // had saiz satu gambar
const MAX_BILIK = 60;                     // had bilangan bilik serentak
const IDLE_MS = 30 * 60 * 1000;           // padam bilik kosong selepas 30 minit
const IMG_TTL_MS = 3 * 60 * 60 * 1000;    // gambar paling lama 3 jam
const JENIS_GAMBAR = new Set(['image/jpeg', 'image/png', 'image/webp']);

const bilik = new Map(); // kod -> { kunci, paparan:Set, telefon:Set, gambar, pandangan, tirai, sunyiSejak }

const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function hantar(set, obj) {
  const m = JSON.stringify(obj);
  set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } });
}
function ringkasGambar(g) { return g ? { v: g.v, w: g.w || 0, h: g.h || 0, t: g.t } : null; }
function keadaan(b) {
  return { jenis: 'keadaan', gambar: ringkasGambar(b.gambar), pandangan: b.pandangan, tirai: b.tirai, paparan: b.paparan.size, telefon: b.telefon.size };
}
function kemasBilangan(b) {
  hantar(b.paparan, { jenis: 'bilangan', telefon: b.telefon.size });
  hantar(b.telefon, { jenis: 'bilangan', paparan: b.paparan.size });
}
function padamGambar(b) { b.gambar = null; b.pandangan = null; b.tirai = false; }

// Bersihkan bilik terbiar & gambar lama setiap minit
setInterval(() => {
  const now = Date.now();
  for (const [kod, b] of bilik) {
    if (b.gambar && now - b.gambar.t > IMG_TTL_MS) { padamGambar(b); hantar(b.paparan, keadaan(b)); hantar(b.telefon, keadaan(b)); }
    if (!b.paparan.size && !b.telefon.size && now - b.sunyiSejak > IDLE_MS) bilik.delete(kod);
  }
}, 60 * 1000).unref();

// ------------------------------------------------------------
// WEBSOCKET
// ------------------------------------------------------------
function sambung(ws, req) {
  const q = new URL(req.url, 'http://x').searchParams;
  const kod = String(q.get('bilik') || '');
  const peranan = q.get('peranan') === 'telefon' ? 'telefon' : 'paparan';
  const tutup = (c, r) => { try { ws.close(c, r); } catch (e) {} };
  if (!kodSah(kod)) return tutup(4000, 'kod bilik tidak sah');

  let b = bilik.get(kod);
  if (peranan === 'paparan') {
    const kunci = String(q.get('kunci') || '');
    if (kunci.length < 16 || kunci.length > 64) return tutup(4000, 'kunci tidak sah');
    if (b && !safeEqual(b.kunci, kunci)) {
      // Kod ini milik skrin lain yang masih aktif -> skrin baru perlu pilih kod lain
      if (b.paparan.size) return tutup(4001, 'kod sedang digunakan');
      b.kunci = kunci; padamGambar(b);
    }
    if (!b) {
      if (bilik.size >= MAX_BILIK) return tutup(4002, 'terlalu banyak bilik');
      b = { kunci, paparan: new Set(), telefon: new Set(), gambar: null, pandangan: null, tirai: false, sunyiSejak: Date.now() };
      bilik.set(kod, b);
    }
  } else {
    // Telefon mesti sudah log masuk (kuki kata laluan tapak)
    if (!isAuthed(req)) return tutup(4003, 'perlu log masuk');
    if (!b || !b.paparan.size) return tutup(4004, 'skrin tidak dijumpai');
  }
  ws._skrin = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  kemasBilangan(b);
}

const num = (v, a, z) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(z, v)) : a; };

function mesej(ws, data) {
  const k = ws._skrin; if (!k || !data || typeof data !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (data.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (k.peranan !== 'telefon') return;
  switch (data.jenis) {
    case 'pandangan': {
      if (!b.gambar || Number(data.v) !== b.gambar.v) return;
      // Kawasan gambar yang kelihatan di telefon (0..1) + penunjuk (pilihan)
      const x0 = num(data.x0, 0, 1), y0 = num(data.y0, 0, 1), x1 = num(data.x1, 0, 1), y1 = num(data.y1, 0, 1);
      if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
      const p = data.p && typeof data.p === 'object' ? { x: num(data.p.x, 0, 1), y: num(data.p.y, 0, 1) } : null;
      b.pandangan = { v: b.gambar.v, x0, y0, x1, y1, p };
      hantar(b.paparan, { jenis: 'pandangan', ...b.pandangan });
      break;
    }
    case 'tirai':
      b.tirai = !!data.on;
      hantar(b.paparan, { jenis: 'tirai', on: b.tirai });
      hantar(b.telefon, { jenis: 'tirai', on: b.tirai });
      break;
    case 'kosong':
      padamGambar(b);
      hantar(b.paparan, keadaan(b)); hantar(b.telefon, keadaan(b));
      break;
  }
}

function putus(ws) {
  const k = ws._skrin; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  kemasBilangan(b);
}

// ------------------------------------------------------------
// HTTP: muat naik & muat turun gambar
// ------------------------------------------------------------
function pasang(app) {
  const raw = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_BYTES });

  // Telefon -> server (DEPLOY). Ganti terus gambar lama.
  app.post('/api/skrin-jawapan/:kod/gambar', (req, res, next) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' });
    next();
  }, raw, (req, res) => {
    const kod = req.params.kod, b = bilik.get(kod);
    if (!kodSah(kod) || !b) return res.status(404).json({ ok: false, mesej: 'Skrin depan tidak dijumpai. Semak kod bilik.' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!JENIS_GAMBAR.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    const v = (b.gambar ? b.gambar.v : 0) + 1;
    b.gambar = { buf: req.body, type, v, t: Date.now(), w: parseInt(req.headers['x-lebar'], 10) || 0, h: parseInt(req.headers['x-tinggi'], 10) || 0 };
    b.pandangan = null; b.tirai = false;
    hantar(b.paparan, { jenis: 'gambar', ...ringkasGambar(b.gambar) });
    hantar(b.telefon, { jenis: 'gambar', ...ringkasGambar(b.gambar) });
    res.json({ ok: true, v, paparan: b.paparan.size });
  });

  // Server -> skrin depan (perlu kunci rahsia skrin itu)
  app.get('/api/skrin-jawapan/:kod/gambar', (req, res) => {
    const b = bilik.get(req.params.kod);
    if (!b || !safeEqual(b.kunci, req.query.kunci)) return res.status(404).end();
    if (!b.gambar) return res.status(204).end();
    res.set({ 'Content-Type': b.gambar.type, 'Cache-Control': 'no-store', 'X-Versi': String(b.gambar.v) });
    res.send(b.gambar.buf);
  });

  // Ralat saiz/format daripada express.raw -> mesej mesra
  app.use('/api/skrin-jawapan', (err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, mesej: 'Gambar terlalu besar.' });
    next(err);
  });
}

module.exports = { pasang, sambung, mesej, putus };
