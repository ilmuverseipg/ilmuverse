// ============================================================
// SEMAK SENDIRI · GALERI BUKTI (Langkah 2 - Suntikan, tema integriti)
// ------------------------------------------------------------
// Halaman:
//   public/galeri-skrin.html   (skrin TV)
//   public/galeri-telefon.html (alat kawalan guru)
//
// Semua kumpulan dapat lembaran yang SAMA (soalan dari Semak & Suntik).
// Aliran:
//   jawab  : kumpulan siapkan lembaran
//   dedah  : TV dedah jawapan satu demi satu -> kumpulan tanda lembaran SENDIRI (pen merah)
//   galeri : telefon ambil gambar lembaran setiap kumpulan + markah yang DIISYTIHAR.
//            TV papar Galeri Bukti (6 lembaran sebelah-menyebelah). Guru boleh
//            besarkan & zoom mana-mana lembaran - TV ikut.
//   audit  : roda pilih satu kumpulan secara rawak, kelas semak bersama.
//            Isytihar sama dengan sebenar = ⭐ Lencana Jujur (+2 mata);
//            tidak sama = markah isytihar dibatalkan (0).
//   tamat  : mata masuk Papan Mata.
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
const BONUS_JUJUR = 2;
const JENIS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const num = (v, a, b) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a; };
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }

function kosong(b) {
  b.fasa = 'jawab'; b.idx = 0; b.bilSoalan = b.bilSoalan || 4;
  b.isytihar = new Array(BIL_K).fill(null);
  b.foto = new Array(BIL_K).fill(null);
  b.fokus = -1; b.pandangan = null; b.audit = []; b.mata = null; b.pusingan = (b.pusingan || 0) + 1;
}
function bilikBaru(kunci, kod) { const b = { kunci, kod, paparan: new Set(), telefon: new Set(), versi: 0, vf: 0, sunyiSejak: Date.now() }; kosong(b); return b; }
function keadaan(b) {
  return {
    jenis: 'keadaan', fasa: b.fasa, idx: b.idx, bilSoalan: b.bilSoalan, isytihar: b.isytihar,
    foto: b.foto.map((f) => (f ? f.v : 0)), fokus: b.fokus, pandangan: b.pandangan, audit: b.audit, mata: b.mata, pusingan: b.pusingan,
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

function kiraMata(b) {
  return b.isytihar.map((n, g) => {
    const a = b.audit.filter((x) => x.g === g && x.hasil);
    if (a.some((x) => x.hasil === 'tidak')) return 0; // isytihar tidak jujur -> dibatalkan
    return (n || 0) + (a.some((x) => x.hasil === 'jujur') ? BONUS_JUJUR : 0);
  });
}

function mesej(ws, d) {
  const k = ws._galeri; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (k.peranan !== 'telefon') return;
  const g = parseInt(d.g, 10), gSah = g >= 0 && g < BIL_K;
  switch (d.jenis) {
    case 'mula': // jawab -> dedah jawapan
      if (b.fasa !== 'jawab') return;
      b.bilSoalan = Math.round(num(d.bilSoalan, 1, 10)) || 4; b.fasa = 'dedah'; b.idx = 0; siar(b); break;
    case 'soalan':
      if (b.fasa !== 'dedah') return;
      b.idx = Math.round(num(d.idx, 0, b.bilSoalan - 1)); siar(b); break;
    case 'keGaleri':
      if (b.fasa !== 'dedah' && b.fasa !== 'audit') return;
      b.fasa = 'galeri'; b.fokus = -1; b.pandangan = null; siar(b); break;
    case 'keDedah':
      if (b.fasa !== 'galeri') return;
      b.fasa = 'dedah'; b.fokus = -1; siar(b); break;
    case 'isytihar': // markah yang diisytihar kumpulan sendiri
      if ((b.fasa !== 'galeri' && b.fasa !== 'dedah') || !gSah) return;
      b.isytihar[g] = d.n === null ? null : Math.round(num(d.n, 0, b.bilSoalan)); siar(b); break;
    case 'fokus': // besarkan satu lembaran di TV (-1 = kembali ke galeri)
      if (b.fasa !== 'galeri' && b.fasa !== 'audit') return;
      b.fokus = gSah ? g : -1; b.pandangan = null; siar(b); break;
    case 'pandangan': { // zoom dari telefon -> TV ikut
      if (!gSah || b.fokus !== g || !b.foto[g] || Number(d.v) !== b.foto[g].v) return;
      const x0 = num(d.x0, 0, 1), y0 = num(d.y0, 0, 1), x1 = num(d.x1, 0, 1), y1 = num(d.y1, 0, 1);
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      b.pandangan = { g, v: b.foto[g].v, x0, y0, x1, y1 };
      hantar(b.paparan, { jenis: 'pandangan', ...b.pandangan });
      break;
    }
    case 'audit': { // roda rawak: kumpulan yang sudah isytihar & belum diaudit diutamakan
      if (b.fasa !== 'galeri') return;
      const ada = b.isytihar.map((n, i) => i).filter((i) => b.isytihar[i] != null);
      if (!ada.length) { try { ws.send(JSON.stringify({ jenis: 'ralat', mesej: 'Isytihar markah sekurang-kurangnya satu kumpulan dahulu.' })); } catch (e) {} return; }
      const belum = ada.filter((i) => !b.audit.some((a) => a.g === i));
      const calon = belum.length ? belum : ada;
      const pilih = calon[crypto.randomInt(calon.length)];
      b.audit.push({ g: pilih, hasil: null, putaran: 3 + crypto.randomInt(3), id: Date.now() });
      b.fasa = 'audit'; b.fokus = pilih; b.pandangan = null; siar(b); break;
    }
    case 'hasilAudit': {
      if (b.fasa !== 'audit') return;
      const a = b.audit[b.audit.length - 1]; if (!a || a.hasil) return;
      a.hasil = d.jujur === true ? 'jujur' : 'tidak'; siar(b); break;
    }
    case 'tamat': {
      if (b.fasa !== 'galeri' && b.fasa !== 'audit') return;
      b.mata = kiraMata(b); b.fasa = 'tamat'; b.fokus = -1;
      kelas.rekod(`semakSendiri:${b.kod}:${b.pusingan}`, 'Semak Sendiri', b.mata);
      klinik.papan(b.kod, { label: 'Semak Sendiri · Galeri Bukti', ik: '📸', tambah: b.mata, nota: `Markah isytihar + ⭐ Lencana Jujur (+${BONUS_JUJUR})`, tunda: 6000 });
      siar(b); break;
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
    if (b.fasa === 'jawab' || b.fasa === 'dedah') { b.fasa = 'galeri'; b.fokus = -1; }
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
