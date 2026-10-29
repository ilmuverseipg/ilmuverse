// ============================================================
// PEMASA JANTUNG (6 pesakit = 6 kumpulan)
// ------------------------------------------------------------
// Halaman:
//   public/pemasa-jantung.html  (skrin TV: 6 monitor ECG + pemasa besar)
//   public/pemasa-telefon.html  (alat kawalan guru)
//
// Aliran:
//   sedia  : guru tetapkan tugasan & masa
//   jalan  : pembuka "CEPAT SIAPKAN" + 3-2-1 (INTRO_MS) kemudian masa berjalan.
//            Kumpulan yang siap -> guru tekan kumpulan itu = pesakit SELAMAT
//            (masa siap direkod). Yang lain terus dikira masa.
//   jeda   : masa berhenti (STOP), tekan GO untuk sambung
//   tamat  : masa habis -> pesakit yang belum diselamatkan FLATLINE (meninggal),
//            atau semua kumpulan siap lebih awal = semua selamat.
//            "Mula semula" muncul selepas 4 saat.
// Pelayan memegang masa supaya TV & telefon sentiasa sama. Memori sahaja.
// ============================================================
const crypto = require('crypto');
const WebSocket = require('ws');
const { isKMAuthed } = require('../middleware/siteAuth');

const BIL_K = 6;
const MAX_BILIK = 40;
const IDLE_MS = 30 * 60 * 1000;
const INTRO_MS = 4600;

const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const bersih = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }

function kosong(b) {
  b.fasa = 'sedia'; b.baki = b.tempoh * 1000; b.jumlah = b.tempoh * 1000;
  b.mulaPada = 0; b.tamatPada = 0; b.tamatSejak = 0; b.semuaSelamat = false;
  b.selamat = new Array(BIL_K).fill(null); // ms masa diambil, atau null
  clearTimeout(b.pemasa); b.pemasa = null;
}
function bilikBaru(kunci) {
  const b = { kunci, paparan: new Set(), telefon: new Set(), versi: 0, sunyiSejak: Date.now(), tugasan: 'Lembaran kerja kata majmuk', tempoh: 300, pusingan: 0, pemasa: null };
  kosong(b); return b;
}
// baki masa (ms) pada saat ini
function bakiKini(b, now = Date.now()) {
  if (b.fasa === 'jalan') return Math.max(0, b.tamatPada - Math.max(now, b.mulaPada));
  if (b.fasa === 'tamat') return 0;
  return b.baki;
}
function keadaan(b) {
  return {
    jenis: 'keadaan', kini: Date.now(), fasa: b.fasa, tugasan: b.tugasan, tempoh: b.tempoh, jumlah: b.jumlah,
    baki: b.baki, mulaPada: b.mulaPada, tamatPada: b.tamatPada, tamatSejak: b.tamatSejak,
    selamat: b.selamat, semuaSelamat: b.semuaSelamat, pusingan: b.pusingan,
    versi: b.versi, paparan: b.paparan.size, telefon: b.telefon.size,
  };
}
function siar(b) { b.versi++; const k = keadaan(b); hantar(b.paparan, k); hantar(b.telefon, k); }
function kemasBilangan(b) { hantar(b.paparan, { jenis: 'bilangan', telefon: b.telefon.size }); hantar(b.telefon, { jenis: 'bilangan', paparan: b.paparan.size }); }

function tamatkan(b, semua) {
  clearTimeout(b.pemasa); b.pemasa = null;
  b.fasa = 'tamat'; b.tamatSejak = Date.now(); b.semuaSelamat = !!semua; b.baki = 0;
  siar(b);
}
function jadual(b) {
  clearTimeout(b.pemasa); b.pemasa = null;
  if (b.fasa !== 'jalan') return;
  const lagi = b.tamatPada - Date.now();
  b.pemasa = setTimeout(() => { if (b.fasa === 'jalan' && Date.now() >= b.tamatPada - 20) tamatkan(b, false); else jadual(b); }, Math.max(0, lagi) + 15);
}

setInterval(() => {
  const now = Date.now();
  for (const [kod, b] of bilik) if (!b.paparan.size && !b.telefon.size && now - b.sunyiSejak > IDLE_MS) { clearTimeout(b.pemasa); bilik.delete(kod); }
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
    if (b && !safeEqual(b.kunci, kunci)) { if (b.paparan.size) return tutup(4001, 'kod sedang digunakan'); clearTimeout(b.pemasa); b = bilikBaru(kunci); bilik.set(kod, b); }
    if (!b) { if (bilik.size >= MAX_BILIK) return tutup(4002, 'terlalu banyak bilik'); b = bilikBaru(kunci); bilik.set(kod, b); }
  } else {
    if (!isKMAuthed(req)) return tutup(4003, 'perlu log masuk');
    if (!b || !b.paparan.size) return tutup(4004, 'skrin tidak dijumpai');
  }
  ws._jantung = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  kemasBilangan(b);
}

function mesej(ws, d) {
  const k = ws._jantung; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send(JSON.stringify({ jenis: 'pong', kini: Date.now() })); } catch (e) {} return; }
  // TV (ada kunci) dan telefon guru kedua-duanya boleh mengawal.
  const now = Date.now();
  const g = parseInt(d.g, 10), gSah = g >= 0 && g < BIL_K;
  switch (d.jenis) {
    case 'tetap': { // tugasan & masa (hanya semasa sedia)
      if (b.fasa !== 'sedia') return;
      if (typeof d.tugasan === 'string') b.tugasan = bersih(d.tugasan, 60);
      const t = parseInt(d.tempoh, 10);
      if (Number.isFinite(t)) b.tempoh = Math.max(10, Math.min(99 * 60 + 59, t));
      b.baki = b.jumlah = b.tempoh * 1000;
      siar(b); break;
    }
    case 'mula': // GO
      if (b.fasa === 'sedia') {
        b.baki = b.jumlah = b.tempoh * 1000; b.selamat = new Array(BIL_K).fill(null);
        b.fasa = 'jalan'; b.mulaPada = now + INTRO_MS; b.tamatPada = b.mulaPada + b.baki; b.pusingan++;
      } else if (b.fasa === 'jeda') {
        b.fasa = 'jalan'; b.mulaPada = now; b.tamatPada = now + b.baki;
      } else return;
      jadual(b); siar(b); break;
    case 'jeda': // STOP
      if (b.fasa !== 'jalan' || now < b.mulaPada) return;
      b.baki = bakiKini(b, now); b.fasa = 'jeda'; clearTimeout(b.pemasa); b.pemasa = null;
      siar(b); break;
    case 'tambah': { // tambah masa
      if (b.fasa !== 'jalan' && b.fasa !== 'jeda') return;
      const ms = Math.max(10, Math.min(600, parseInt(d.saat, 10) || 30)) * 1000;
      b.jumlah += ms; if (b.fasa === 'jalan') { b.tamatPada += ms; jadual(b); } else b.baki += ms;
      siar(b); break;
    }
    case 'selamat': { // kumpulan siap = pesakit selamat (tekan sekali lagi untuk batal)
      if ((b.fasa !== 'jalan' && b.fasa !== 'jeda') || !gSah) return;
      if (b.fasa === 'jalan' && now < b.mulaPada) return;
      if (b.selamat[g] != null) b.selamat[g] = null;
      else b.selamat[g] = Math.max(0, b.jumlah - bakiKini(b, now));
      if (b.selamat.every((x) => x != null)) return tamatkan(b, true);
      siar(b); break;
    }
    case 'semula': // kembali ke tetapan (kekalkan tugasan & masa)
      if (b.fasa === 'tamat' && now - b.tamatSejak < 3500) return; // tunggu animasi tamat
      kosong(b); siar(b); break;
  }
}

function putus(ws) {
  const k = ws._jantung; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  kemasBilangan(b);
}

module.exports = { sambung, mesej, putus };
