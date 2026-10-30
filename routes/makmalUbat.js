// ============================================================
// MAKMAL UBAT AJAIB (Langkah 2 Aktiviti 1) - permainan genggam tangan
// ------------------------------------------------------------
// public/makmal-ubat.html : TV (MediaPipe tangan / tetikus / sentuh)
// 5 soalan: 3 cantum PERKATAAN + 2 cantum GAMBAR menjadi kata majmuk.
// Tiada markah. Guru boleh ubah soalan & muat naik gambar sendiri.
//
//   GET    /api/makmal/set           soalan (+ URL gambar)
//   PUT    /api/makmal/set           { soalan: [5] }
//   POST   /api/makmal/set/asal      kembali ke soalan asal
//   POST   /api/makmal/gambar/:k     gambar guru (k = "<i>-<slot>", slot: k1|k2|km|p1|p2)
//   DELETE /api/makmal/gambar/:k
//   GET    /api/makmal/gambar/:k
// ============================================================
const express = require('express');
const mongoose = require('mongoose');
const { isKMAuthed } = require('../middleware/siteAuth');
const { urlGambar } = require('./kmGambar');

const SoalanSchema = new mongoose.Schema({
  jenis: { type: String, default: 'perkataan' }, // perkataan | gambar
  k1: String, k2: String, km: String, p1: String, p2: String, maksud: String,
  gv: { type: Object, default: {} }, // versi gambar guru per slot
}, { _id: false });
const MakmalSet = mongoose.models.MakmalSet || mongoose.model('MakmalSet', new mongoose.Schema({ kunci: { type: String, default: 'utama', unique: true }, soalan: [SoalanSchema] }, { timestamps: true }));
const MakmalGambar = mongoose.models.MakmalGambar || mongoose.model('MakmalGambar', new mongoose.Schema({ k: { type: String, unique: true }, data: Buffer, type: String, v: Number }, { timestamps: true }));

const ASAL = [
  { jenis: 'perkataan', k1: 'botol', k2: 'ubat', km: 'botol ubat', p1: 'susu', p2: 'kotak', maksud: 'bekas untuk menyimpan ubat cecair' },
  { jenis: 'perkataan', k1: 'kerusi', k2: 'roda', km: 'kerusi roda', p1: 'meja', p2: 'lampu', maksud: 'kerusi beroda untuk pesakit yang tidak dapat berjalan' },
  { jenis: 'perkataan', k1: 'jarum', k2: 'suntik', km: 'jarum suntik', p1: 'sabun', p2: 'kertas', maksud: 'alat doktor untuk memasukkan ubat ke dalam badan' },
  { jenis: 'gambar', k1: 'ubat', k2: 'gigi', km: 'ubat gigi', p1: 'sabun', p2: 'mata', maksud: 'pes untuk membersihkan gigi' },
  { jenis: 'gambar', k1: 'lampu', k2: 'suluh', km: 'lampu suluh', p1: 'kipas', p2: 'kain', maksud: 'lampu kecil yang dipegang untuk menyuluh' },
];
const SLOT = ['k1', 'k2', 'km', 'p1', 'p2'];
const JENIS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const bersih = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const dbSedia = () => MakmalSet.db && MakmalSet.db.readyState === 1;
const kSah = (k) => /^[0-4]-(k1|k2|km|p1|p2)$/.test(String(k || ''));

let memori = null; // jika MongoDB belum sedia
const gambar = new Map();
async function bacaSet() {
  let d = null;
  if (dbSedia()) { try { d = await MakmalSet.findOne({ kunci: 'utama' }).lean(); } catch (e) {} }
  const s = (d && d.soalan && d.soalan.length === 5) ? d.soalan : (memori || ASAL);
  return s.map((x) => ({ ...x, gv: x.gv || {} }));
}
function papar(soalan) {
  return soalan.map((x, i) => {
    const u = {};
    SLOT.forEach((sl) => { u[sl] = x.gv && x.gv[sl] ? `/api/makmal/gambar/${i}-${sl}?v=${x.gv[sl]}` : urlGambar(sl === 'km' ? x.km : x[sl]); });
    return { ...x, u };
  });
}
async function simpanSet(soalan) {
  memori = soalan;
  if (dbSedia()) await MakmalSet.findOneAndUpdate({ kunci: 'utama' }, { kunci: 'utama', soalan }, { upsert: true, setDefaultsOnInsert: true });
}

function perlu(req, res, next) { if (!isKMAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' }); next(); }
function pasang(app) {
  app.get('/api/makmal/set', perlu, async (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, db: dbSedia(), soalan: papar(await bacaSet()) }); });
  app.put('/api/makmal/set', perlu, express.json({ limit: '32kb' }), async (req, res) => {
    const lama = await bacaSet();
    const s = Array.isArray(req.body && req.body.soalan) ? req.body.soalan.slice(0, 5) : [];
    if (s.length !== 5) return res.status(400).json({ ok: false, mesej: 'Perlu tepat 5 soalan.' });
    const soalan = s.map((x, i) => {
      const k1 = bersih(x.k1, 30), k2 = bersih(x.k2, 30);
      return { jenis: x.jenis === 'gambar' ? 'gambar' : 'perkataan', k1, k2, km: bersih(x.km, 60) || `${k1} ${k2}`.trim(), p1: bersih(x.p1, 30), p2: bersih(x.p2, 30), maksud: bersih(x.maksud, 120), gv: (lama[i] && lama[i].gv) || {} };
    });
    if (soalan.some((x) => !x.k1 || !x.k2 || !x.p1 || !x.p2)) return res.status(400).json({ ok: false, mesej: 'Isi perkataan 1, perkataan 2 dan 2 pengganggu untuk setiap soalan.' });
    await simpanSet(soalan);
    res.json({ ok: true, soalan: papar(soalan) });
  });
  app.post('/api/makmal/set/asal', perlu, async (req, res) => {
    memori = null; gambar.clear();
    if (dbSedia()) { await MakmalSet.deleteOne({ kunci: 'utama' }); await MakmalGambar.deleteMany({}); }
    res.json({ ok: true, soalan: papar(await bacaSet()) });
  });
  const raw = express.raw({ type: [...JENIS], limit: 1.5 * 1024 * 1024 });
  app.post('/api/makmal/gambar/:k', perlu, raw, async (req, res) => {
    const k = req.params.k, type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!kSah(k)) return res.status(400).json({ ok: false, mesej: 'Slot tidak sah.' });
    if (!JENIS.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    const v = Date.now(), [i, sl] = k.split('-');
    gambar.set(k, { buf: req.body, type, v });
    if (dbSedia()) { try { await MakmalGambar.findOneAndUpdate({ k }, { k, data: req.body, type, v }, { upsert: true }); } catch (e) {} }
    const s = await bacaSet(); s[+i].gv = { ...(s[+i].gv || {}), [sl]: v }; await simpanSet(s);
    res.json({ ok: true, soalan: papar(s) });
  });
  app.delete('/api/makmal/gambar/:k', perlu, async (req, res) => {
    const k = req.params.k; if (!kSah(k)) return res.status(400).json({ ok: false });
    const [i, sl] = k.split('-'); gambar.delete(k);
    if (dbSedia()) { try { await MakmalGambar.deleteOne({ k }); } catch (e) {} }
    const s = await bacaSet(); const gv = { ...(s[+i].gv || {}) }; delete gv[sl]; s[+i].gv = gv; await simpanSet(s);
    res.json({ ok: true, soalan: papar(s) });
  });
  app.get('/api/makmal/gambar/:k', perlu, async (req, res) => {
    const k = req.params.k; if (!kSah(k)) return res.status(404).end();
    let f = gambar.get(k);
    if (!f && dbSedia()) { try { const d = await MakmalGambar.findOne({ k }).lean(); if (d && d.data) { f = { buf: Buffer.from(d.data.buffer || d.data), type: d.type, v: d.v }; gambar.set(k, f); } } catch (e) {} }
    if (!f) return res.status(404).end();
    res.set({ 'Content-Type': f.type, 'Cache-Control': 'private, max-age=86400' }); res.send(f.buf);
  });
}
module.exports = { pasang };
