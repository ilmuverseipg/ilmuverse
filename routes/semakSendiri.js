// ============================================================
// SEMAKAN KEDUA · GALERI BUKTI (Langkah 2 - Suntikan Kata Majmuk)
// ------------------------------------------------------------
// Halaman:
//   public/galeri-skrin.html   (skrin TV)
//   public/galeri-telefon.html (alat kawalan guru)
//
// Semua kumpulan dapat lembaran yang SAMA (soalan dari Semak & Suntik).
// Aliran:
//   gambar : kamera telefon ambil gambar Kumpulan 1 -> 6 berturut-turut (bingkai + grid)
//   soalan : untuk setiap soalan ->
//              semak  TV papar gambar + kata majmuk (tiada suara AI; murid baca sendiri);
//                     guru tanda setiap kumpulan di telefon (TV belum tunjuk cop)
//              dedah  TV papar lembaran 6 kumpulan; cop HIJAU "BETUL" / MERAH "TIDAK TEPAT"
//                     keluar satu demi satu
//            kemudian soalan seterusnya
//   tamat  : jumlah betul setiap kumpulan masuk Papan Mata.
// Gambar kamera disimpan dalam MEMORI sahaja dan dipadam bila main semula / 3 jam.
// ============================================================
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const { isKMAuthed } = require('../middleware/siteAuth');
const { ramPenuh } = require('./storan');
const kelas = require('./kelasKM');
const klinik = require('./klinikKM');

const BIL_K = 6;
const MAX_BILIK = 40;
const IDLE_MS = 30 * 60 * 1000;
const FOTO_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_FOTO = 10 * 1024 * 1024;
const JENIS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const num = (v, a, b) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a; };
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }

function kosong(b) {
  b.fasa = 'gambar'; b.idx = 0; b.langkah = 'semak'; b.bilSoalan = b.bilSoalan || 4;
  b.markah = []; // markah[idx][g] = true | false | null
  b.foto = new Array(BIL_K).fill(null);
  b.fokus = -1; b.pandangan = null; b.mata = null; b.pusingan = (b.pusingan || 0) + 1;
}
function bilikBaru(kunci, kod) { const b = { kunci, kod, paparan: new Set(), telefon: new Set(), versi: 0, vf: 0, sunyiSejak: Date.now() }; kosong(b); return b; }
function keadaan(b) {
  return {
    jenis: 'keadaan', fasa: b.fasa, idx: b.idx, langkah: b.langkah, bilSoalan: b.bilSoalan, markah: b.markah,
    foto: b.foto.map((f) => (f ? f.v : 0)), fokus: b.fokus, pandangan: b.pandangan, mata: b.mata, pusingan: b.pusingan,
    versi: b.versi, paparan: b.paparan.size, telefon: b.telefon.size,
  };
}
function siar(b) { b.versi++; const k = keadaan(b); hantar(b.paparan, k); hantar(b.telefon, k); }
function kemasBilangan(b) { hantar(b.paparan, { jenis: 'bilangan', telefon: b.telefon.size }); hantar(b.telefon, { jenis: 'bilangan', paparan: b.paparan.size }); }

setInterval(() => {
  const now = Date.now();
  for (const [kod, b] of bilik) {
    if (!b.paparan.size && !b.telefon.size && now - b.sunyiSejak > IDLE_MS) { bilik.delete(kod); continue; }
    let ubah = false; b.foto.forEach((f, g) => { if (f && now - f.t > FOTO_TTL_MS) { b.foto[g] = null; ubah = true; } });
    if (ubah) siar(b);
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
    if (b && !safeEqual(b.kunci, kunci)) { if (b.paparan.size) return tutup(4001, 'kod sedang digunakan'); b = bilikBaru(kunci, kod); bilik.set(kod, b); }
    if (!b) { if (bilik.size >= MAX_BILIK) return tutup(4002, 'terlalu banyak bilik'); b = bilikBaru(kunci, kod); bilik.set(kod, b); }
  } else {
    if (!isKMAuthed(req)) return tutup(4003, 'perlu log masuk');
    if (!b || !b.paparan.size) return tutup(4004, 'skrin tidak dijumpai');
  }
  ws._galeri = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  kemasBilangan(b);
}

const kiraMata = (b) => new Array(BIL_K).fill(0).map((_, g) => b.markah.reduce((a, row) => a + (row && row[g] === true ? 1 : 0), 0));
const LANGKAH = ['semak', 'dedah']; // semak: TV papar gambar + kata majmuk, guru tanda di telefon · dedah: cop keluar satu demi satu

function mesej(ws, d) {
  const k = ws._galeri; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (k.peranan !== 'telefon') return;
  const g = parseInt(d.g, 10), gSah = g >= 0 && g < BIL_K;
  switch (d.jenis) {
    case 'mula': // gambar -> soalan 1 (semak)
      if (b.fasa !== 'gambar') return;
      b.bilSoalan = Math.round(num(d.bilSoalan, 1, 10)) || 4;
      b.markah = Array.from({ length: b.bilSoalan }, () => new Array(BIL_K).fill(null));
      b.fasa = 'soalan'; b.idx = 0; b.langkah = 'semak'; b.fokus = -1; b.pandangan = null; siar(b); break;
    case 'keGambar': // kembali ambil / ambil semula gambar
      if (b.fasa !== 'soalan') return;
      b.fasa = 'gambar'; b.fokus = -1; b.pandangan = null; siar(b); break;
    case 'teruskan': // kembali ke soalan selepas ambil semula gambar
      if (b.fasa !== 'gambar' || !b.markah.length) return;
      b.fasa = 'soalan'; siar(b); break;
    case 'seterusnya': { // semak -> dedah -> soalan berikutnya
      if (b.fasa !== 'soalan') return;
      const i = LANGKAH.indexOf(b.langkah);
      b.fokus = -1; b.pandangan = null;
      if (i < LANGKAH.length - 1) b.langkah = LANGKAH[i + 1];
      else if (b.idx < b.bilSoalan - 1) { b.idx++; b.langkah = 'semak'; }
      else { b.mata = kiraMata(b); b.fasa = 'tamat';
        kelas.rekod(`semakKedua:${b.kod}:${b.pusingan}`, 'Galeri Bukti', b.mata);
        klinik.papan(b.kod, { label: 'Galeri Bukti', ik: '📸', tambah: b.mata, nota: '1 mata untuk setiap jawapan BETUL', tunda: 6000 }); }
      siar(b); break;
    }
    case 'sebelum': {
      if (b.fasa === 'tamat') { b.fasa = 'soalan'; b.langkah = 'dedah'; siar(b); return; }
      if (b.fasa !== 'soalan') return;
      const i = LANGKAH.indexOf(b.langkah); b.fokus = -1; b.pandangan = null;
      if (i > 0) b.langkah = LANGKAH[i - 1];
      else if (b.idx > 0) { b.idx--; b.langkah = 'dedah'; }
      siar(b); break;
    }
    case 'tanda': // guru tanda satu kumpulan: true = BETUL, false = TIDAK TEPAT, null = padam
      if (b.fasa !== 'soalan' || !gSah || !b.markah[b.idx]) return;
      b.markah[b.idx][g] = d.betul === true ? true : d.betul === false ? false : null; siar(b); break;
    case 'fokus': // besarkan satu lembaran di TV (-1 = kembali)
      if (b.fasa !== 'gambar' && !(b.fasa === 'soalan' && b.langkah === 'dedah')) return;
      b.fokus = gSah ? g : -1; b.pandangan = null; siar(b); break;
    case 'pandangan': { // zoom dari telefon -> TV ikut
      if (!gSah || b.fokus !== g || !b.foto[g] || Number(d.v) !== b.foto[g].v) return;
      const x0 = num(d.x0, 0, 1), y0 = num(d.y0, 0, 1), x1 = num(d.x1, 0, 1), y1 = num(d.y1, 0, 1);
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      b.pandangan = { g, v: b.foto[g].v, x0, y0, x1, y1 };
      hantar(b.paparan, { jenis: 'pandangan', ...b.pandangan });
      break;
    }
    case 'ulang':
      kosong(b); siar(b); break;
  }
}

function putus(ws) {
  const k = ws._galeri; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  kemasBilangan(b);
}

// ---- foto lembaran (memori sahaja) ----
function pasang(app) {
  const raw = express.raw({ type: [...JENIS], limit: MAX_FOTO });
  app.post('/api/galeri/:kod/foto/:g', (req, res, next) => { if (!isKMAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' }); next(); }, raw, (req, res) => {
    const b = bilik.get(req.params.kod), g = parseInt(req.params.g, 10);
    if (!b) return res.status(404).json({ ok: false, mesej: 'Skrin TV tidak dijumpai. Semak kod bilik.' });
    if (!(g >= 0 && g < BIL_K)) return res.status(400).json({ ok: false, mesej: 'Kumpulan tidak sah.' });
    if (ramPenuh()) return res.status(507).json({ ok: false, mesej: 'Pelayan penuh (RAM). Tunggu sebentar, kemudian cuba lagi.' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!JENIS.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    b.vf++;
    b.foto[g] = { buf: req.body, type, v: b.vf, t: Date.now() };
    siar(b);
    res.json({ ok: true, v: b.vf });
  });
  app.get('/api/galeri/:kod/foto/:g', (req, res) => {
    const b = bilik.get(req.params.kod), g = parseInt(req.params.g, 10);
    if (!b || !(safeEqual(b.kunci, req.query.kunci) || isKMAuthed(req)) || !(g >= 0 && g < BIL_K)) return res.status(404).end();
    const f = b.foto[g]; if (!f) return res.status(204).end();
    res.set({ 'Content-Type': f.type, 'Cache-Control': 'no-store', 'X-Versi': String(f.v) }); res.send(f.buf);
  });
}

module.exports = { pasang, sambung, mesej, putus };
