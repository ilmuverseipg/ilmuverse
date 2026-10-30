// ============================================================
// KLINIK KATA MAJMUK - SATU QR UNTUK SEMUA LANGKAH
// ------------------------------------------------------------
// public/klinik-tv.html      : skrin TV memuatkan semua sistem (satu kod bilik)
// public/klinik-telefon.html : telefon guru imbas QR sekali, tukar langkah
//
// Bilik ini hanya menyimpan langkah yang sedang dipaparkan di TV. Setiap
// sistem (Kapsul, Suntik, Sijil, Pemasa) guna kod bilik yang SAMA di laluan
// WebSocket masing-masing, jadi telefon tidak perlu imbas QR lagi.
// ============================================================
const crypto = require('crypto');
const WebSocket = require('ws');
const { isKMAuthed } = require('../middleware/siteAuth');
const kelas = require('./kelasKM');

const MAX_BILIK = 40;
const IDLE_MS = 30 * 60 * 1000;
const LANGKAH = ['utama', 'jantung', 'kapsul', 'tulang', 'galeri', 'suntik', 'sijil', 'mata'];

const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }
const bilikBaru = (kunci) => ({ kunci, paparan: new Set(), telefon: new Set(), aktif: 'utama', papan: null, versi: 0, sunyiSejak: Date.now() });
const keadaan = (b) => ({ jenis: 'keadaan', kini: Date.now(), aktif: b.aktif, papan: b.papan, versi: b.versi, paparan: b.paparan.size, telefon: b.telefon.size });
function siar(b) { b.versi++; const k = keadaan(b); hantar(b.paparan, k); hantar(b.telefon, k); }

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
    if (!isKMAuthed(req)) return tutup(4003, 'perlu log masuk');
    if (!b || !b.paparan.size) return tutup(4004, 'skrin tidak dijumpai');
  }
  ws._klinik = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  siar(b);
}

function mesej(ws, d) {
  const k = ws._klinik; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (d.jenis === 'pilih' && LANGKAH.includes(d.aktif)) { b.aktif = d.aktif; b.papan = null; siar(b); }
  else if (d.jenis === 'tutupPapan') { b.papan = null; if (d.menu) b.aktif = 'utama'; siar(b); }
  else if (d.jenis === 'podium') { b.aktif = 'mata'; b.papan = null; siar(b); hantar(b.paparan, { jenis: 'podium', t: Date.now() }); }
}

// ------------------------------------------------------------
// PAPAN MATA selepas setiap aktiviti
// Dipanggil oleh sistem (Kapsul / Sijil / Suntik / Pemasa) yang berkongsi
// kod bilik dengan Klinik. TV papar papan mata selepas 'tunda' ms; butang
// Seterusnya aktif selepas 5 saat.
// ------------------------------------------------------------
function papan(kod, info) {
  const b = bilik.get(String(kod)); if (!b || !info) return;
  const tambah = new Array(6).fill(0).map((_, g) => Math.round(Number(info.tambah && info.tambah[g]) || 0));
  b.papan = { id: Date.now(), label: String(info.label || '').slice(0, 60), ik: String(info.ik || '🏆').slice(0, 4), tambah, nota: String(info.nota || '').slice(0, 120), mulaPada: Date.now() + Math.max(0, Math.min(15000, info.tunda || 0)) };
  siar(b);
}
// Bila nama / mata kumpulan berubah, beritahu semua skrin Klinik supaya muat semula.
kelas.dengar((v) => { for (const b of bilik.values()) { hantar(b.paparan, { jenis: 'kelas', versi: v }); hantar(b.telefon, { jenis: 'kelas', versi: v }); } });

function putus(ws) {
  const k = ws._klinik; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  siar(b);
}

module.exports = { sambung, mesej, putus, papan };
