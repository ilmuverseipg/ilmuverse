// ============================================================
// WAD KECEMASAN (Mod 10) - SUNTIKAN KATA MAJMUK BERTEMA INTEGRITI
// ------------------------------------------------------------
// Halaman:
//   public/wad-kecemasan.html  (pengurusan soalan & nama kumpulan)
//   public/wad-skrin.html      (skrin TV: wad 6 katil)
//   public/wad-telefon.html    (alat kawalan guru)
//
// Semua kumpulan dapat soalan yang SAMA. Aliran:
//   sedia  : kumpulan siap -> guru "kunci" jawapan (langsir katil tertutup)
//   dedah  : untuk setiap maksud ->
//              soalan    TV suntik & dedah jawapan, murid angkat Kad Jujur
//              rawat     guru tanda kumpulan yang angkat ✓ -> pesakit pulih
//              audit     (pilihan) roda pilih 1 kumpulan, guru semak poster
//              auditSiap pengakuan jujur = ⭐ Lencana Jujur,
//                        pengakuan tidak tepat = pesakit demam semula
//   tamat  : papan "Pesakit Sembuh" & "Doktor Paling Jujur"
// Tiada gambar kamera. Keadaan bilik hanya dalam memori.
// ============================================================
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const { isKMAuthed: isAuthed } = require('../middleware/siteAuth'); // kata laluan ATAU avatar Klinik Kata Majmuk
const { urlGambar } = require('./kmGambar');
const { WadSet } = require('../models/WadSet');
const kelas = require('./kelasKM');   // mata kumpulan (papan mata)
const klinik = require('./klinikKM'); // papan mata di skrin Klinik (satu QR)

const BIL_K = 6;
const MAX_BILIK = 40;
const IDLE_MS = 30 * 60 * 1000;

// ---- soalan asal: Set 1 Langkah 2 (Suntikan Kata Majmuk) ----
const ASAL = {
  kumpulan: ['Kumpulan 1', 'Kumpulan 2', 'Kumpulan 3', 'Kumpulan 4', 'Kumpulan 5', 'Kumpulan 6'],
  soalan: [
    { maksud: 'bekas untuk susu bayi', k1: 'botol', k2: 'susu', km: 'botol susu', e1: '🧴', e2: '🥛', ek: '🍼' },
    { maksud: 'lampu kecil yang boleh dibawa', k1: 'lampu', k2: 'suluh', km: 'lampu suluh', e1: '💡', e2: '🔦', ek: '🔦' },
    { maksud: 'bekas untuk membuang sampah', k1: 'tong', k2: 'sampah', km: 'tong sampah', e1: '🛢️', e2: '🗑️', ek: '🗑️' },
    { maksud: 'kain sokongan untuk tangan yang cedera', k1: 'anduh', k2: 'tangan', km: 'anduh tangan', e1: '🎗️', e2: '✋', ek: '🩹' },
  ],
};
const dbSedia = () => WadSet.db && WadSet.db.readyState === 1;
async function bacaSet() {
  let d = null;
  if (dbSedia()) { try { d = await WadSet.findOne({ kunci: 'utama' }).lean(); } catch (e) { d = null; } }
  const kumpulan = ASAL.kumpulan.map((n, i) => (d && d.kumpulan && d.kumpulan[i]) || n);
  const soalan = d && d.soalan && d.soalan.length ? d.soalan : ASAL.soalan;
  return { kumpulan, soalan: soalan.map((s) => ({ ...s })) };
}
const papar = (set) => ({ ...set, soalan: set.soalan.map((s) => ({ ...s, u1: urlGambar(s.k1), u2: urlGambar(s.k2), uk: urlGambar(s.km) })) });

// ------------------------------------------------------------
// BILIK (memori sahaja)
// ------------------------------------------------------------
const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const bersih = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }
function kosong(b) {
  b.fasa = 'sedia'; b.kunciK = new Array(BIL_K).fill(0); b.idx = 0; b.langkah = 'soalan';
  b.betul = []; b.bintang = new Array(BIL_K).fill(0); b.audit = []; b.bilSoalan = 4;
}
function bilikBaru(kunci) { const b = { kunci, paparan: new Set(), telefon: new Set(), versi: 0, sunyiSejak: Date.now() }; kosong(b); return b; }
function keadaan(b) {
  return {
    jenis: 'keadaan', fasa: b.fasa, kunciK: b.kunciK, idx: b.idx, langkah: b.langkah, betul: b.betul,
    bintang: b.bintang, audit: b.audit, bilSoalan: b.bilSoalan, versi: b.versi, paparan: b.paparan.size, telefon: b.telefon.size,
  };
}
function siar(b) { b.versi++; const k = keadaan(b); hantar(b.paparan, k); hantar(b.telefon, k); }
function kemasBilangan(b) { hantar(b.paparan, { jenis: 'bilangan', telefon: b.telefon.size }); hantar(b.telefon, { jenis: 'bilangan', paparan: b.paparan.size }); }

setInterval(() => {
  const now = Date.now();
  for (const [kod, b] of bilik) if (!b.paparan.size && !b.telefon.size && now - b.sunyiSejak > IDLE_MS) bilik.delete(kod);
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
    if (b && !safeEqual(b.kunci, kunci)) { if (b.paparan.size) return tutup(4001, 'kod sedang digunakan'); b = bilikBaru(kunci); bilik.set(kod, b); }
    if (!b) { if (bilik.size >= MAX_BILIK) return tutup(4002, 'terlalu banyak bilik'); b = bilikBaru(kunci); bilik.set(kod, b); }
  } else {
    if (!isAuthed(req)) return tutup(4003, 'perlu log masuk');
    if (!b || !b.paparan.size) return tutup(4004, 'skrin tidak dijumpai');
  }
  ws._wad = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  kemasBilangan(b);
}

function mesej(ws, d) {
  const k = ws._wad; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (k.peranan !== 'telefon') return;
  const g = parseInt(d.g, 10), gSah = g >= 0 && g < BIL_K;
  switch (d.jenis) {
    case 'kunci': // kunci / buka kunci jawapan satu kumpulan
      if (b.fasa !== 'sedia' || !gSah) return;
      if (b.kunciK[g]) b.kunciK[g] = 0; else b.kunciK[g] = Math.max(0, ...b.kunciK) + 1;
      siar(b); break;
    case 'mula': {
      if (b.fasa !== 'sedia') return;
      const n = Math.max(1, Math.min(10, parseInt(d.bilSoalan, 10) || 4));
      b.bilSoalan = n; b.fasa = 'dedah'; b.idx = 0; b.langkah = 'soalan';
      b.betul = Array.from({ length: n }, () => new Array(BIL_K).fill(false)); b.audit = new Array(n).fill(null);
      siar(b); break;
    }
    case 'tanda': // kumpulan yang angkat Kad Jujur hijau ✓
      if (b.fasa !== 'dedah' || b.langkah !== 'soalan') return;
      if (!Array.isArray(d.betul) || d.betul.length !== BIL_K) return;
      b.betul[b.idx] = d.betul.map((x) => x === true); b.langkah = 'rawat'; siar(b); break;
    case 'audit': { // roda pilih satu kumpulan secara rawak
      if (b.fasa !== 'dedah' || b.langkah !== 'rawat') return;
      const pilih = crypto.randomInt(BIL_K);
      b.audit[b.idx] = { g: pilih, hasil: null, putaran: 3 + crypto.randomInt(3) };
      b.langkah = 'audit'; siar(b); break;
    }
    case 'hasilAudit': {
      if (b.fasa !== 'dedah' || b.langkah !== 'audit' || !b.audit[b.idx]) return;
      const a = b.audit[b.idx]; a.hasil = d.jujur === true ? 'jujur' : 'tidakTepat';
      if (a.hasil === 'jujur') b.bintang[a.g]++;
      else b.betul[b.idx][a.g] = !b.betul[b.idx][a.g]; // pengakuan tidak tepat: keputusan dibetulkan
      b.langkah = 'auditSiap'; siar(b); break;
    }
    case 'seterusnya':
      if (b.fasa !== 'dedah' || (b.langkah !== 'rawat' && b.langkah !== 'auditSiap')) return;
      if (b.idx < b.bilSoalan - 1) { b.idx++; b.langkah = 'soalan'; }
      else {
        b.fasa = 'tamat';
        // mata: jawapan betul + bintang Lencana Jujur
        const m = new Array(BIL_K).fill(0).map((_, g) => b.betul.reduce((a, row) => a + (row && row[g] ? 1 : 0), 0) + (b.bintang[g] || 0));
        kelas.rekod('suntik', 'Semak & Suntik', m);
        klinik.papan(k.kod, { label: 'Semak & Suntik', ik: '💉', tambah: m, nota: 'Jawapan betul + ⭐ Lencana Jujur', tunda: 8000 });
      }
      siar(b); break;
    case 'ulang':
      kosong(b); kelas.buang('suntik'); siar(b); break;
  }
}

function putus(ws) {
  const k = ws._wad; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  kemasBilangan(b);
}

// ------------------------------------------------------------
// HTTP: soalan (MongoDB)
// ------------------------------------------------------------
function perluLogMasuk(req, res, next) { if (!isAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' }); next(); }
function pasang(app) {
  app.get('/api/wad/set', perluLogMasuk, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, db: dbSedia(), set: papar(await bacaSet()) });
  });
  app.put('/api/wad/set', perluLogMasuk, express.json({ limit: '64kb' }), async (req, res) => {
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    const s = Array.isArray(req.body && req.body.soalan) ? req.body.soalan.slice(0, 10) : [];
    if (s.length < 1) return res.status(400).json({ ok: false, mesej: 'Perlu sekurang-kurangnya 1 soalan.' });
    const soalan = s.map((x) => {
      const k1 = bersih(x.k1, 40), k2 = bersih(x.k2, 40);
      return { maksud: bersih(x.maksud, 140), k1, k2, km: bersih(x.km, 80) || `${k1} ${k2}`.trim(), e1: bersih(x.e1, 16), e2: bersih(x.e2, 16), ek: bersih(x.ek, 16) };
    });
    if (soalan.some((x) => !x.maksud || !x.k1 || !x.k2)) return res.status(400).json({ ok: false, mesej: 'Isi maksud, perkataan 1 dan perkataan 2 untuk setiap soalan.' });
    const kumpulan = ASAL.kumpulan.map((n, i) => bersih(req.body.kumpulan && req.body.kumpulan[i], 30) || n);
    await WadSet.findOneAndUpdate({ kunci: 'utama' }, { kunci: 'utama', kumpulan, soalan }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ ok: true, set: papar(await bacaSet()) });
  });
  app.post('/api/wad/set/asal', perluLogMasuk, async (req, res) => {
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    await WadSet.deleteOne({ kunci: 'utama' });
    res.json({ ok: true, set: papar(await bacaSet()) });
  });
}

module.exports = { pasang, sambung, mesej, putus };
