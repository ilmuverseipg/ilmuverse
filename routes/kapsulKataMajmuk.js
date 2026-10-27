// ============================================================
// KAPSUL KATA MAJMUK (Mod 08) - SEMAKAN JAWAPAN KUMPULAN
// ------------------------------------------------------------
// Halaman:
//   public/kapsul-kata-majmuk.html  (pengurusan jawapan + gambar 800x800)
//   public/kapsul-skrin.html        (skrin depan PC/TV)
//   public/kapsul-telefon.html      (telefon guru)
//
// Aliran satu kumpulan:
//   pilih -> ambil (4 gambar kapsul) -> imbas (TV: "MENGIMBAS JAWAPAN")
//   -> dedah (kapsul 1..4 satu demi satu: BETUL / TIDAK TEPAT + gambar
//   perkataan 1 + perkataan 2 = kata majmuk) -> tamat ("TERIMA KASIH!")
//
// Gambar kamera murid HANYA dalam memori (tidak ke MongoDB / cakera) dan
// dipadam bila kumpulan seterusnya dipilih, bilik terbiar 30 minit, atau
// sudah 3 jam. Jawapan & gambar 800x800 guru disimpan dalam MongoDB.
// ============================================================
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const { isAuthed } = require('../middleware/siteAuth');
const { KapsulSet, KapsulGambar } = require('../models/KapsulSet');

const MAX_FOTO = 8 * 1024 * 1024;      // satu gambar kamera
const MAX_GAMBAR = 3 * 1024 * 1024;    // satu gambar 800x800 guru
const MAX_BILIK = 40;
const IDLE_MS = 30 * 60 * 1000;
const FOTO_TTL_MS = 3 * 60 * 60 * 1000;
const JENIS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SLOT = new Set(['1', '2', 'k']);

// ------------------------------------------------------------
// JAWAPAN ASAL (Langkah 1 "Misi Farmasi Jujur" - 6 set x 4 kapsul)
// [perkataan 1, perkataan 2, emoji 1, emoji 2, emoji kata majmuk]
// ------------------------------------------------------------
const ASAL = [
  [['berus', 'gigi', '🖌️', '🦷', '🪥'], ['ubat', 'gigi', '💊', '🦷', '🧴'], ['bilik', 'air', '🚪', '💧', '🚿'], ['air', 'kosong', '💧', '⭕', '🚰']],
  [['bilik', 'rawatan', '🚪', '🩺', '🏥'], ['air', 'suam', '💧', '♨️', '☕'], ['botol', 'ubat', '🧴', '💊', '💊'], ['kertas', 'tisu', '📄', '🧻', '🧻']],
  [['buku', 'cerita', '📕', '🧚', '📖'], ['kaca', 'mata', '🔍', '👁️', '👓'], ['meja', 'tulis', '🪑', '✍️', '📝'], ['lampu', 'meja', '💡', '🪑', '💡']],
  [['anak', 'tangga', '👶', '🪜', '🪜'], ['kerusi', 'roda', '🪑', '⚙️', '🦽'], ['beg', 'duit', '👜', '💵', '👛'], ['jam', 'tangan', '⏰', '✋', '⌚']],
  [['ubat', 'batuk', '💊', '🤧', '🧴'], ['sapu', 'tangan', '🧹', '✋', '🧣'], ['bilik', 'tidur', '🚪', '😴', '🛏️'], ['kain', 'selimut', '🧵', '🛌', '🛌']],
  [['surat', 'cuti', '✉️', '🏖️', '📝'], ['beg', 'sekolah', '👜', '🏫', '🎒'], ['kipas', 'angin', '🌀', '💨', '🌀'], ['botol', 'air', '🧴', '💧', '🧴']],
];
const NAMA_ASAL = ['Kumpulan 1', 'Kumpulan 2', 'Kumpulan 3', 'Kumpulan 4', 'Kumpulan 5', 'Kumpulan 6'];
function setAsal(n) {
  return { kumpulan: n, nama: NAMA_ASAL[n - 1], jawapan: ASAL[n - 1].map(([k1, k2, e1, e2, ek]) => ({ k1, k2, km: `${k1} ${k2}`, e1, e2, ek, g1: 0, g2: 0, gk: 0 })) };
}
const dbSedia = () => KapsulSet.db && KapsulSet.db.readyState === 1;

async function semuaSet() {
  const out = [];
  let ada = [];
  if (dbSedia()) { try { ada = await KapsulSet.find({}).lean(); } catch (e) { ada = []; } }
  for (let n = 1; n <= 6; n++) {
    const d = ada.find((x) => x.kumpulan === n);
    const s = d ? { kumpulan: n, nama: d.nama || NAMA_ASAL[n - 1], jawapan: (d.jawapan || []).slice(0, 4) } : setAsal(n);
    while (s.jawapan.length < 4) s.jawapan.push({ k1: '', k2: '', km: '', e1: '', e2: '', ek: '', g1: 0, g2: 0, gk: 0 });
    out.push(s);
  }
  return out;
}

// ------------------------------------------------------------
// BILIK (memori sahaja)
// ------------------------------------------------------------
const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }
function bilikBaru(kunci) { return { kunci, paparan: new Set(), telefon: new Set(), fasa: 'pilih', kumpulan: 0, foto: [null, null, null, null], keputusan: null, padanan: [0, 1, 2, 3], idx: 0, selesai: {}, sunyiSejak: Date.now(), versi: 0 }; }
function padamFoto(b) { b.foto = [null, null, null, null]; }
function keadaan(b) {
  return {
    jenis: 'keadaan', fasa: b.fasa, kumpulan: b.kumpulan, idx: b.idx, versi: b.versi,
    foto: b.foto.map((f) => (f ? f.v : 0)), keputusan: b.keputusan, padanan: b.padanan,
    selesai: b.selesai, paparan: b.paparan.size, telefon: b.telefon.size,
  };
}
function siar(b) { b.versi++; const k = keadaan(b); hantar(b.paparan, k); hantar(b.telefon, k); }
function kemasBilangan(b) { hantar(b.paparan, { jenis: 'bilangan', telefon: b.telefon.size }); hantar(b.telefon, { jenis: 'bilangan', paparan: b.paparan.size }); }

setInterval(() => {
  const now = Date.now();
  for (const [kod, b] of bilik) {
    if (b.foto.some((f) => f && now - f.t > FOTO_TTL_MS)) { padamFoto(b); if (['ambil', 'imbas', 'dedah', 'tamat'].includes(b.fasa)) b.fasa = 'pilih'; siar(b); }
    if (!b.paparan.size && !b.telefon.size && now - b.sunyiSejak > IDLE_MS) bilik.delete(kod);
  }
}, 60 * 1000).unref();

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
      if (b.paparan.size) return tutup(4001, 'kod sedang digunakan');
      const s = b.selesai; b = bilikBaru(kunci); b.selesai = s; bilik.set(kod, b);
    }
    if (!b) { if (bilik.size >= MAX_BILIK) return tutup(4002, 'terlalu banyak bilik'); b = bilikBaru(kunci); bilik.set(kod, b); }
  } else {
    if (!isAuthed(req)) return tutup(4003, 'perlu log masuk');
    if (!b || !b.paparan.size) return tutup(4004, 'skrin tidak dijumpai');
  }
  ws._kapsul = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  kemasBilangan(b);
}

function mesej(ws, d) {
  const k = ws._kapsul; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (k.peranan !== 'telefon') return;
  switch (d.jenis) {
    case 'kumpulan': {
      const n = parseInt(d.n, 10); if (!(n >= 1 && n <= 6)) return;
      padamFoto(b); b.kumpulan = n; b.fasa = 'ambil'; b.keputusan = null; b.padanan = [0, 1, 2, 3]; b.idx = 0;
      siar(b); break;
    }
    case 'deploy':
      if (b.fasa !== 'ambil' && b.fasa !== 'imbas') return;
      if (b.foto.some((f) => !f)) { try { ws.send(JSON.stringify({ jenis: 'ralat', mesej: 'Gambar belum lengkap 4 kapsul.' })); } catch (e) {} return; }
      b.fasa = 'imbas'; b.keputusan = null; siar(b); break;
    case 'markah': {
      if (b.fasa !== 'imbas' && b.fasa !== 'dedah') return;
      const kp = Array.isArray(d.keputusan) && d.keputusan.length === 4 ? d.keputusan.map((x) => x === true) : null;
      const pd = Array.isArray(d.padanan) && d.padanan.length === 4 ? d.padanan.map((x) => Math.max(0, Math.min(3, parseInt(x, 10) || 0))) : [0, 1, 2, 3];
      if (!kp || d.keputusan.some((x) => typeof x !== 'boolean')) return;
      b.keputusan = kp; b.padanan = pd; b.fasa = 'dedah'; b.idx = 0; siar(b); break;
    }
    case 'seterusnya':
      if (b.fasa !== 'dedah') return;
      if (b.idx < 3) b.idx++;
      else { b.fasa = 'tamat'; b.selesai[b.kumpulan] = { betul: b.keputusan.filter(Boolean).length, jumlah: 4, t: Date.now() }; }
      siar(b); break;
    case 'sebelum':
      if (b.fasa === 'dedah' && b.idx > 0) { b.idx--; siar(b); }
      else if (b.fasa === 'tamat') { b.fasa = 'dedah'; b.idx = 3; siar(b); }
      break;
    case 'kembali': // ke senarai kumpulan (gambar dipadam)
      padamFoto(b); b.fasa = 'pilih'; b.kumpulan = 0; b.keputusan = null; b.idx = 0; siar(b); break;
    case 'ambilSemula': // kembali ke peringkat ambil gambar untuk kumpulan yang sama
      if (!b.kumpulan) return; b.fasa = 'ambil'; b.keputusan = null; b.idx = 0; siar(b); break;
    case 'resetMarkah':
      b.selesai = {}; siar(b); break;
  }
}

function putus(ws) {
  const k = ws._kapsul; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  kemasBilangan(b);
}

// ------------------------------------------------------------
// HTTP
// ------------------------------------------------------------
function perluLogMasuk(req, res, next) { if (!isAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' }); next(); }
const bersih = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function pasang(app) {
  const rawFoto = express.raw({ type: [...JENIS], limit: MAX_FOTO });
  const rawGambar = express.raw({ type: [...JENIS], limit: MAX_GAMBAR });

  // ---- foto kamera (memori sahaja) ----
  app.post('/api/kapsul/:kod/foto/:i', perluLogMasuk, rawFoto, (req, res) => {
    const b = bilik.get(req.params.kod), i = parseInt(req.params.i, 10);
    if (!kodSah(req.params.kod) || !b) return res.status(404).json({ ok: false, mesej: 'Skrin TV tidak dijumpai. Semak kod bilik.' });
    if (!(i >= 0 && i <= 3)) return res.status(400).json({ ok: false, mesej: 'Nombor kapsul tidak sah.' });
    if (b.fasa !== 'ambil' && b.fasa !== 'imbas') return res.status(409).json({ ok: false, mesej: 'Pilih kumpulan dahulu.' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!JENIS.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    b.vf = (b.vf || 0) + 1; // versi naik setiap muat naik (elak cache lama)
    b.foto[i] = { buf: req.body, type, v: b.vf, t: Date.now() };
    hantar(b.paparan, { jenis: 'foto', i, v: b.foto[i].v, ada: b.foto.filter(Boolean).length });
    res.json({ ok: true, v: b.foto[i].v, ada: b.foto.filter(Boolean).length });
  });
  app.get('/api/kapsul/:kod/foto/:i', (req, res) => {
    const b = bilik.get(req.params.kod), i = parseInt(req.params.i, 10);
    // skrin TV guna kunci rahsia; telefon guru (sudah log masuk) juga boleh lihat
    if (!b || !(safeEqual(b.kunci, req.query.kunci) || isAuthed(req)) || !(i >= 0 && i <= 3)) return res.status(404).end();
    const f = b.foto[i]; if (!f) return res.status(204).end();
    res.set({ 'Content-Type': f.type, 'Cache-Control': 'no-store', 'X-Versi': String(f.v) }); res.send(f.buf);
  });

  // ---- set jawapan (MongoDB) ----
  app.get('/api/kapsul/set', perluLogMasuk, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, db: dbSedia(), set: await semuaSet() });
  });
  app.put('/api/kapsul/set/:n', perluLogMasuk, express.json({ limit: '64kb' }), async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (!(n >= 1 && n <= 6)) return res.status(400).json({ ok: false, mesej: 'Kumpulan tidak sah.' });
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    const lama = (await semuaSet())[n - 1];
    const j = Array.isArray(req.body && req.body.jawapan) ? req.body.jawapan.slice(0, 4) : [];
    if (j.length !== 4) return res.status(400).json({ ok: false, mesej: 'Perlu tepat 4 kapsul.' });
    const jawapan = j.map((x, i) => {
      const k1 = bersih(x.k1, 40), k2 = bersih(x.k2, 40);
      return { k1, k2, km: bersih(x.km, 80) || `${k1} ${k2}`.trim(), e1: bersih(x.e1, 16), e2: bersih(x.e2, 16), ek: bersih(x.ek, 16), g1: lama.jawapan[i].g1 || 0, g2: lama.jawapan[i].g2 || 0, gk: lama.jawapan[i].gk || 0 };
    });
    const nama = bersih(req.body.nama, 40) || NAMA_ASAL[n - 1];
    await KapsulSet.findOneAndUpdate({ kumpulan: n }, { kumpulan: n, nama, jawapan }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ ok: true, set: (await semuaSet())[n - 1] });
  });
  app.post('/api/kapsul/set/:n/asal', perluLogMasuk, async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (!(n >= 1 && n <= 6)) return res.status(400).json({ ok: false });
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    await KapsulSet.deleteOne({ kumpulan: n });
    await KapsulGambar.deleteMany({ kunci: new RegExp(`^${n}-`) });
    res.json({ ok: true, set: (await semuaSet())[n - 1] });
  });

  // ---- gambar 800x800 guru (MongoDB) ----
  const kunciG = (p) => `${parseInt(p.n, 10)}-${parseInt(p.i, 10)}-${p.s}`;
  const sahG = (p) => { const n = parseInt(p.n, 10), i = parseInt(p.i, 10); return n >= 1 && n <= 6 && i >= 0 && i <= 3 && SLOT.has(p.s); };
  app.post('/api/kapsul/gambar/:n/:i/:s', perluLogMasuk, rawGambar, async (req, res) => {
    if (!sahG(req.params)) return res.status(400).json({ ok: false, mesej: 'Slot tidak sah.' });
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!JENIS.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    const n = parseInt(req.params.n, 10), i = parseInt(req.params.i, 10), s = req.params.s, v = Date.now() % 1e9;
    await KapsulGambar.findOneAndUpdate({ kunci: kunciG(req.params) }, { kunci: kunciG(req.params), jenis: type, data: req.body, v }, { upsert: true });
    // pastikan dokumen set wujud, kemudian tanda versi gambar
    const set = (await semuaSet())[n - 1];
    set.jawapan[i]['g' + s] = v;
    await KapsulSet.findOneAndUpdate({ kumpulan: n }, { kumpulan: n, nama: set.nama, jawapan: set.jawapan }, { upsert: true });
    res.json({ ok: true, v });
  });
  app.delete('/api/kapsul/gambar/:n/:i/:s', perluLogMasuk, async (req, res) => {
    if (!sahG(req.params)) return res.status(400).json({ ok: false });
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    const n = parseInt(req.params.n, 10), i = parseInt(req.params.i, 10), s = req.params.s;
    await KapsulGambar.deleteOne({ kunci: kunciG(req.params) });
    const set = (await semuaSet())[n - 1]; set.jawapan[i]['g' + s] = 0;
    await KapsulSet.findOneAndUpdate({ kumpulan: n }, { kumpulan: n, nama: set.nama, jawapan: set.jawapan }, { upsert: true });
    res.json({ ok: true });
  });
  app.get('/api/kapsul/gambar/:n/:i/:s', perluLogMasuk, async (req, res) => {
    if (!sahG(req.params) || !dbSedia()) return res.status(404).end();
    const g = await KapsulGambar.findOne({ kunci: kunciG(req.params) }).lean();
    if (!g) return res.status(404).end();
    res.set({ 'Content-Type': g.jenis || 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.send(Buffer.from(g.data.buffer || g.data));
  });

  app.use('/api/kapsul', (err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, mesej: 'Gambar terlalu besar.' });
    next(err);
  });
}

module.exports = { pasang, sambung, mesej, putus };
