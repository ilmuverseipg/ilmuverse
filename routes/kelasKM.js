// ============================================================
// KELAS KATA MAJMUK - nama 6 kumpulan, gambar kumpulan & PAPAN MATA
// ------------------------------------------------------------
// Dikongsi oleh semua sistem kata majmuk (Kapsul, Sijil, Suntik, Pemasa):
//   - nama kumpulan untuk paparan & SUARA
//   - mata automatik bila aktiviti tamat + mata guru (+/-)
//
// API (kata laluan ATAU avatar Klinik Kata Majmuk):
//   GET    /api/kelas                 ringkasan (nama, gambar, jumlah, rekod)
//   PUT    /api/kelas/nama            { nama: [6] }
//   POST   /api/kelas/mata            { g, delta }   mata guru
//   POST   /api/kelas/reset           kosongkan semua mata (nama kekal)
//   POST   /api/kelas/gambar/:g       gambar kumpulan (raw jpeg/png/webp, <= 1.5 MB)
//   DELETE /api/kelas/gambar/:g
//   GET    /api/kelas/gambar/:g
//   GET    /api/hidup                 ping ringan (tiada log masuk) supaya pelayan tidak tidur
//
// Disimpan dalam memori DAN MongoDB (jika bersambung). Jika MongoDB terputus,
// sistem tetap berjalan dari memori dan menyimpan semula bila MongoDB kembali.
// ============================================================
const express = require('express');
const { isKMAuthed } = require('../middleware/siteAuth');
const { KelasKM, KelasGambar } = require('../models/KelasKM');

const BIL = 6;
const ASAL = ['HELANG', 'MERAK', 'NURI', 'GARUDA', 'GAGAK', 'ENGGANG']; // ikut Set 1..6
const SUSUNAN_LAMA = 'GARUDA,GAGAK,ENGGANG,NURI,MERAK,HELANG'; // susunan sebelum ini -> tukar sekali kepada susunan baharu
const JENIS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_GAMBAR = 1.5 * 1024 * 1024;
const bersih = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const dbSedia = () => KelasKM.db && KelasKM.db.readyState === 1;
const angka = (x) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.max(-999, Math.min(9999, n)) : 0; };

let K = { nama: ASAL.slice(), gv: new Array(BIL).fill(0), rekod: [] };
let dimuat = false, kotor = false, versi = 1, simpanT = null;
const gambar = new Map(); // g -> { buf, type, v }
const pendengar = new Set();

function ubah() { versi++; kotor = true; jadualSimpan(); pendengar.forEach((fn) => { try { fn(versi); } catch (e) {} }); }
function jadualSimpan() { clearTimeout(simpanT); simpanT = setTimeout(simpan, 400); }
async function simpan() {
  if (!dbSedia() || !kotor) return;
  kotor = false;
  try { await KelasKM.findOneAndUpdate({ kunci: 'utama' }, { kunci: 'utama', nama: K.nama, gv: K.gv, rekod: K.rekod }, { upsert: true, setDefaultsOnInsert: true }); }
  catch (e) { kotor = true; console.log('[kelas] gagal simpan:', e.message); }
}
async function muat() {
  if (dimuat || !dbSedia()) return;
  try {
    const d = await KelasKM.findOne({ kunci: 'utama' }).lean();
    dimuat = true;
    if (d) {
      const memori = K.rekod; // rekod yang dibuat sebelum MongoDB sedia
      K.nama = ASAL.map((n, i) => { const x = d.nama && d.nama[i]; return x && x !== 'Kumpulan ' + (i + 1) ? x : n; }); // nama lama 'Kumpulan n' -> nama burung
      if (K.nama.join(',') === SUSUNAN_LAMA) K.nama = ASAL.slice();
      K.gv = ASAL.map((n, i) => (d.gv && d.gv[i]) || 0);
      K.rekod = (d.rekod || []).map((r) => ({ id: r.id, label: r.label, mata: (r.mata || []).slice(0, BIL).concat(new Array(BIL).fill(0)).slice(0, BIL), t: r.t || 0 }));
      memori.forEach((r) => { const i = K.rekod.findIndex((x) => x.id === r.id); if (i >= 0) K.rekod[i] = r; else K.rekod.push(r); });
      versi++;
      if (memori.length) { kotor = true; jadualSimpan(); }
    } else if (kotor) jadualSimpan();
  } catch (e) { console.log('[kelas] gagal muat:', e.message); }
}
// Cuba muat / simpan semula secara berkala (MongoDB mungkin bersambung lewat).
setInterval(() => { if (!dimuat) muat(); else if (kotor) simpan(); }, 15 * 1000).unref();

const jumlah = () => { const j = new Array(BIL).fill(0); K.rekod.forEach((r) => r.mata.forEach((m, g) => { if (g < BIL) j[g] += m || 0; })); return j; };
const nama = (g) => K.nama[g] || ASAL[g];
function ringkas() {
  return { ok: true, db: dbSedia(), versi, kumpulan: K.nama.map((n, g) => ({ nama: n, gv: K.gv[g] || 0 })), jumlah: jumlah(), rekod: K.rekod.slice(-40).reverse() };
}

// ---- dipanggil oleh sistem lain ----
// rekod(id, label, mata[6]): ganti rekod dengan id yang sama (semakan semula tidak berganda)
function rekod(id, label, mata) {
  if (!id) return;
  const m = new Array(BIL).fill(0).map((_, g) => angka(mata && mata[g]));
  const r = { id: String(id).slice(0, 80), label: bersih(label, 60), mata: m, t: Date.now() };
  const i = K.rekod.findIndex((x) => x.id === r.id);
  if (i >= 0) K.rekod[i] = r; else K.rekod.push(r);
  if (K.rekod.length > 400) K.rekod.splice(0, K.rekod.length - 400);
  ubah();
}
function buang(awalan) { const n = K.rekod.length; K.rekod = K.rekod.filter((r) => !r.id.startsWith(awalan)); if (K.rekod.length !== n) ubah(); }
const dengar = (fn) => { pendengar.add(fn); return () => pendengar.delete(fn); };

// ---- HTTP ----
function perlu(req, res, next) { if (!isKMAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' }); next(); }
function pasang(app) {
  app.get('/api/hidup', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, t: Date.now() }); });

  app.get('/api/kelas', perlu, async (req, res) => {
    await muat();
    res.set('Cache-Control', 'no-store');
    res.json(ringkas());
  });
  app.put('/api/kelas/nama', perlu, express.json({ limit: '8kb' }), async (req, res) => {
    await muat();
    const n = Array.isArray(req.body && req.body.nama) ? req.body.nama : [];
    K.nama = ASAL.map((asal, g) => bersih(n[g], 30) || asal);
    ubah(); await simpan();
    res.json(ringkas());
  });
  app.post('/api/kelas/mata', perlu, express.json({ limit: '2kb' }), async (req, res) => {
    await muat();
    const g = parseInt(req.body && req.body.g, 10), d = angka(req.body && req.body.delta);
    if (!(g >= 0 && g < BIL) || !d) return res.status(400).json({ ok: false, mesej: 'Data tidak sah.' });
    let r = K.rekod.find((x) => x.id === 'manual');
    if (!r) { r = { id: 'manual', label: 'Mata guru', mata: new Array(BIL).fill(0), t: Date.now() }; K.rekod.push(r); }
    r.mata[g] = angka((r.mata[g] || 0) + d); r.t = Date.now();
    ubah();
    res.json(ringkas());
  });
  app.post('/api/kelas/reset', perlu, async (req, res) => {
    await muat();
    K.rekod = []; ubah(); await simpan();
    res.json(ringkas());
  });

  const raw = express.raw({ type: [...JENIS], limit: MAX_GAMBAR });
  app.post('/api/kelas/gambar/:g', perlu, raw, async (req, res) => {
    await muat();
    const g = parseInt(req.params.g, 10);
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!(g >= 0 && g < BIL)) return res.status(400).json({ ok: false, mesej: 'Kumpulan tidak sah.' });
    if (!JENIS.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    const v = Date.now();
    gambar.set(g, { buf: req.body, type, v });
    K.gv[g] = v;
    if (dbSedia()) { try { await KelasGambar.findOneAndUpdate({ g }, { g, data: req.body, type, v }, { upsert: true }); } catch (e) { console.log('[kelas] gagal simpan gambar:', e.message); } }
    ubah();
    res.json(ringkas());
  });
  app.delete('/api/kelas/gambar/:g', perlu, async (req, res) => {
    await muat();
    const g = parseInt(req.params.g, 10);
    if (!(g >= 0 && g < BIL)) return res.status(400).json({ ok: false });
    gambar.delete(g); K.gv[g] = 0;
    if (dbSedia()) { try { await KelasGambar.deleteOne({ g }); } catch (e) {} }
    ubah();
    res.json(ringkas());
  });
  app.get('/api/kelas/gambar/:g', perlu, async (req, res) => {
    const g = parseInt(req.params.g, 10);
    if (!(g >= 0 && g < BIL)) return res.status(404).end();
    let f = gambar.get(g);
    if (!f && dbSedia()) {
      try { const d = await KelasGambar.findOne({ g }).lean(); if (d && d.data) { f = { buf: Buffer.from(d.data.buffer || d.data), type: d.type, v: d.v }; gambar.set(g, f); } } catch (e) {}
    }
    if (!f) return res.status(404).end();
    res.set({ 'Content-Type': f.type, 'Cache-Control': 'private, max-age=86400' });
    res.send(f.buf);
  });
}

module.exports = { pasang, rekod, buang, dengar, nama, jumlah, ringkas, muat };
