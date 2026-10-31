// ============================================================
// SIJIL KELAHIRAN KATA MAJMUK (Mod 09) - SEMAKAN SUSUN AYAT
// ------------------------------------------------------------
// Halaman:
//   public/sijil-kelahiran.html  (pengurusan jawapan 6 set x 4 bahagian)
//   public/sijil-skrin.html      (skrin depan PC/TV)
//   public/sijil-telefon.html    (telefon guru)
//
// Aliran satu sijil:
//   pilih set -> ambil (1 gambar sijil) -> semak (TV: "MENYEMAK SIJIL",
//   guru tanda 4 bahagian pada telefon) -> dedah (bahagian 1..4: kad
//   perkataan bercampur terbang menyusun ayat betul, cop DIDAFTARKAN /
//   TIDAK TEPAT; zoom gambar pada telefon diikut oleh TV) -> tamat.
//
// Gambar kamera HANYA dalam memori (tidak ke MongoDB / cakera) dan dipadam
// bila set lain dipilih, kembali ke senarai, bilik terbiar 30 minit atau
// selepas 3 jam. Jawapan disimpan dalam MongoDB (koleksi sijilsets).
// ============================================================
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const { urlGambar } = require('./kmGambar');
const { ramPenuh } = require('./storan');
const kelas = require('./kelasKM');   // mata kumpulan (papan mata)
const klinik = require('./klinikKM'); // papan mata di skrin Klinik (satu QR)
const rekodSijil = (b, n) => { const m = new Array(6).fill(0); m[n - 1] = (b.selesai[n] || []).reduce((a, r) => a + (r.betul || 0), 0); kelas.rekod(`sijil:${n}`, 'Semak & Cop Sijil', m); };
const { isKMAuthed: isAuthed } = require('../middleware/siteAuth'); // kata laluan ATAU avatar Klinik Kata Majmuk
const { SijilSet } = require('../models/SijilSet');

const MAX_FOTO = 10 * 1024 * 1024;
const MAX_BILIK = 40;
const IDLE_MS = 30 * 60 * 1000;
const FOTO_TTL_MS = 3 * 60 * 60 * 1000;
const JENIS = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ------------------------------------------------------------
// JAWAPAN ASAL - sama dengan 6 prompt Sijil Kelahiran (susun ayat)
// [k1, k2, e1, e2, ek, kad bercampur (seperti dicetak), ayat betul]
// ------------------------------------------------------------
const ASAL = [
  [
    ['sarung', 'tangan', '👝', '✋', '🧤', 'memakai / sarung tangan. / Doktor / itu', 'Doktor itu memakai sarung tangan.'],
    ['topeng', 'muka', '🎭', '🙂', '😷', 'kerana / topeng muka / batuk. / Ali / memakai', 'Ali memakai topeng muka kerana batuk.'],
    ['doktor', 'gigi', '🧑‍⚕️', '🦷', '😁', 'gigi / saya. / Doktor gigi / memeriksa', 'Doktor gigi memeriksa gigi saya.'],
    ['kedai', 'ubat', '🏪', '💊', '🏥', 'di / kedai ubat. / membeli / Ibu / ubat', 'Ibu membeli ubat di kedai ubat.'],
  ],
  [
    ['botol', 'susu', '🧴', '🥛', '🍼', 'botol susu. / dari / Adik / susu / minum', 'Adik minum susu dari botol susu.'],
    ['sabun', 'mandi', '🧼', '🛁', '🧼', 'menggunakan / sabun mandi. / mandi / Saya', 'Saya mandi menggunakan sabun mandi.'],
    ['gigi', 'susu', '🦷', '🥛', '👶', 'sudah / tercabut. / adik / Gigi susu', 'Gigi susu adik sudah tercabut.'],
    ['ubat', 'mata', '💧', '👁️', '💧', 'pada / ubat mata / saya. / Doktor / mata / meletakkan', 'Doktor meletakkan ubat mata pada mata saya.'],
  ],
  [
    ['jarum', 'suntik', '🪡', '💪', '💉', 'memegang / jarum suntik. / itu / Jururawat', 'Jururawat itu memegang jarum suntik.'],
    ['baju', 'doktor', '👕', '🧑‍⚕️', '🥼', 'berwarna / itu / putih. / Baju doktor', 'Baju doktor itu berwarna putih.'],
    ['klinik', 'gigi', '🏥', '🦷', '🦷', 'klinik gigi / semalam. / Kami / ke / pergi', 'Kami pergi ke klinik gigi semalam.'],
    ['doktor', 'haiwan', '🧑‍⚕️', '🐱', '🐶', 'kucing / saya. / Doktor haiwan / merawat', 'Doktor haiwan merawat kucing saya.'],
  ],
  [
    ['tong', 'sampah', '🛢️', '🍂', '🗑️', 'dalam / Saya / tong sampah. / tisu / membuang / ke', 'Saya membuang tisu ke dalam tong sampah.'],
    ['ubat', 'nyamuk', '💊', '🦟', '🌀', 'pada / malam. / ubat nyamuk / Ibu / waktu / memasang', 'Ibu memasang ubat nyamuk pada waktu malam.'],
    ['tisu', 'basah', '🧻', '💧', '🧻', 'tisu basah. / tangan / Kakak / dengan / mengelap', 'Kakak mengelap tangan dengan tisu basah.'],
    ['ubat', 'luka', '🧴', '🤕', '🩹', 'lutut / ubat luka / adik. / Ibu / pada / menyapu', 'Ibu menyapu ubat luka pada lutut adik.'],
  ],
  [
    ['katil', 'hospital', '🛏️', '🏥', '🛌', 'atas / katil hospital. / di / Datuk / berbaring', 'Datuk berbaring di atas katil hospital.'],
    ['kotak', 'tisu', '📦', '🧻', '🤧', 'di / meja. / itu / Kotak tisu / atas / diletakkan', 'Kotak tisu itu diletakkan di atas meja.'],
    ['baju', 'pesakit', '👕', '🤒', '👘', 'berwarna / baju pesakit / biru. / Pesakit / memakai / itu', 'Pesakit itu memakai baju pesakit berwarna biru.'],
    ['bilik', 'menunggu', '🚪', '⏳', '🪑', 'di / bilik menunggu. / duduk / Kami', 'Kami duduk di bilik menunggu.'],
  ],
  [
    ['lampu', 'suluh', '💡', '✨', '🔦', 'dengan / mulut / lampu suluh. / Doktor / saya / menyuluh', 'Doktor menyuluh mulut saya dengan lampu suluh.'],
    ['mesin', 'timbang', '⚙️', '⚖️', '⚖️', 'atas / mesin timbang. / berdiri / Saya / di', 'Saya berdiri di atas mesin timbang.'],
    ['ubat', 'cacing', '💊', '🪱', '💊', 'di / sekolah. / ubat cacing / Murid / makan', 'Murid makan ubat cacing di sekolah.'],
    ['kerusi', 'roda', '🪑', '🛞', '🦽', 'kerusi roda. / di / Datuk / atas / duduk', 'Datuk duduk di atas kerusi roda.'],
  ],
];
const namaAsal = (n) => 'Set ' + n;
function setAsal(n) {
  return { kumpulan: n, nama: namaAsal(n), bahagian: ASAL[n - 1].map(([k1, k2, e1, e2, ek, kad, ayat]) => ({ k1, k2, km: `${k1} ${k2}`, e1, e2, ek, kad, ayat })) };
}
const dbSedia = () => SijilSet.db && SijilSet.db.readyState === 1;
async function semuaSet() {
  let ada = [];
  if (dbSedia()) { try { ada = await SijilSet.find({}).lean(); } catch (e) { ada = []; } }
  const out = [];
  for (let n = 1; n <= 6; n++) {
    const d = ada.find((x) => x.kumpulan === n);
    const s = d ? { kumpulan: n, nama: d.nama || namaAsal(n), bahagian: (d.bahagian || []).slice(0, 4) } : setAsal(n);
    while (s.bahagian.length < 4) s.bahagian.push({ k1: '', k2: '', km: '', e1: '', e2: '', ek: '', kad: '', ayat: '' });
    out.push(s);
  }
  return out;
}

// Tambah URL gambar asal (public/img/km) untuk paparan sahaja - tidak disimpan.
const papar = (s) => ({ ...s, bahagian: s.bahagian.map((j) => ({ ...j, u1: urlGambar(j.k1), u2: urlGambar(j.k2), uk: urlGambar(j.km) })) });
async function semuaSetPapar() { return (await semuaSet()).map(papar); }

// Susun kad bercampur mengikut ayat betul. Pulangkan null jika tidak padan.
function susunKad(kadTeks, ayat) {
  const kad = String(kadTeks || '').split('/').map((s) => s.trim()).filter(Boolean);
  const a = String(ayat || '').trim().replace(/\s+/g, ' ');
  const guna = new Array(kad.length).fill(false), out = [];
  let p = 0;
  while (p < a.length) {
    while (a[p] === ' ') p++;
    if (p >= a.length) break;
    let pilih = -1;
    kad.forEach((k, i) => {
      if (guna[i] || !a.startsWith(k, p)) return;
      const lepas = a[p + k.length];
      if (lepas !== undefined && lepas !== ' ') return;
      if (pilih < 0 || k.length > kad[pilih].length) pilih = i;
    });
    if (pilih < 0) return null;
    guna[pilih] = true; out.push(kad[pilih]); p += kad[pilih].length;
  }
  return guna.every(Boolean) ? out : null;
}

// ------------------------------------------------------------
// BILIK (memori sahaja)
// ------------------------------------------------------------
const bilik = new Map();
const kodSah = (k) => /^\d{4,6}$/.test(String(k || ''));
const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const bersih = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, a, z) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(z, v)) : a; };
function hantar(set, obj) { const m = JSON.stringify(obj); set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } }); }
function bilikBaru(kunci) { return { kunci, paparan: new Set(), telefon: new Set(), fasa: 'pilih', kumpulan: 0, murid: '', foto: null, vf: 0, pandangan: null, keputusan: null, idx: 0, selesai: {}, sunyiSejak: Date.now(), versi: 0 }; }
function padamFoto(b) { b.foto = null; b.pandangan = null; }
function keadaan(b) {
  return {
    jenis: 'keadaan', fasa: b.fasa, kumpulan: b.kumpulan, murid: b.murid, idx: b.idx, versi: b.versi,
    foto: b.foto ? { v: b.foto.v, w: b.foto.w, h: b.foto.h } : null, pandangan: b.pandangan,
    keputusan: b.keputusan, selesai: b.selesai, paparan: b.paparan.size, telefon: b.telefon.size,
  };
}
function siar(b) { b.versi++; const k = keadaan(b); hantar(b.paparan, k); hantar(b.telefon, k); }
function kemasBilangan(b) { hantar(b.paparan, { jenis: 'bilangan', telefon: b.telefon.size }); hantar(b.telefon, { jenis: 'bilangan', paparan: b.paparan.size }); }

setInterval(() => {
  const now = Date.now();
  for (const [kod, b] of bilik) {
    if (b.foto && now - b.foto.t > FOTO_TTL_MS) { padamFoto(b); if (b.fasa !== 'pilih') b.fasa = 'pilih'; siar(b); }
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
  ws._sijil = { kod, peranan };
  b[peranan].add(ws);
  try { ws.send(JSON.stringify(keadaan(b))); } catch (e) {}
  kemasBilangan(b);
}

function mesej(ws, d) {
  const k = ws._sijil; if (!k || !d || typeof d !== 'object') return;
  const b = bilik.get(k.kod); if (!b) return;
  if (d.jenis === 'ping') { try { ws.send('{"jenis":"pong"}'); } catch (e) {} return; }
  if (k.peranan !== 'telefon') return;
  switch (d.jenis) {
    case 'kumpulan': {
      const n = parseInt(d.n, 10); if (!(n >= 1 && n <= 6)) return;
      padamFoto(b); b.kumpulan = n; b.murid = ''; b.fasa = 'ambil'; b.keputusan = null; b.idx = 0; siar(b); break;
    }
    case 'murid':
      b.murid = bersih(d.nama, 30); siar(b); break;
    case 'deploy':
      if (b.fasa !== 'ambil') return;
      if (!b.foto) { try { ws.send(JSON.stringify({ jenis: 'ralat', mesej: 'Ambil gambar sijil dahulu.' })); } catch (e) {} return; }
      if (typeof d.nama === 'string') b.murid = bersih(d.nama, 30);
      b.fasa = 'semak'; b.keputusan = null; siar(b); break;
    case 'markah': {
      if (b.fasa !== 'semak' && b.fasa !== 'dedah') return;
      if (!Array.isArray(d.keputusan) || d.keputusan.length !== 4 || d.keputusan.some((x) => typeof x !== 'boolean')) return;
      b.keputusan = d.keputusan.slice(); b.fasa = 'dedah'; b.idx = 0; siar(b); break;
    }
    case 'seterusnya':
      if (b.fasa !== 'dedah') return;
      if (b.idx < 3) b.idx++;
      else {
        b.fasa = 'tamat';
        const rek = { betul: b.keputusan.filter(Boolean).length, murid: b.murid, t: Date.now() };
        (b.selesai[b.kumpulan] = b.selesai[b.kumpulan] || []).push(rek);
        if (b.selesai[b.kumpulan].length > 30) b.selesai[b.kumpulan].shift();
        rekodSijil(b, b.kumpulan);
        // papan markah hanya selepas KESEMUA 6 kumpulan selesai (tidak selepas setiap kumpulan)
        const siapSemua = [1, 2, 3, 4, 5, 6].every((n) => b.selesai[n] && b.selesai[n].length);
        if (siapSemua) {
          const t = [1, 2, 3, 4, 5, 6].map((n) => b.selesai[n].reduce((x, r) => x + (r.betul || 0), 0));
          klinik.papan(k.kod, { label: 'Semak & Cop Sijil', ik: '📜', tambah: t, nota: '1 mata untuk setiap ayat BETUL', tunda: 2200 });
        }
      }
      siar(b); break;
    case 'sebelum':
      if (b.fasa === 'dedah' && b.idx > 0) { b.idx--; siar(b); }
      else if (b.fasa === 'tamat') {
        const s = b.selesai[b.kumpulan]; if (s && s.length) s.pop();
        rekodSijil(b, b.kumpulan);
        b.fasa = 'dedah'; b.idx = 3; siar(b);
      }
      break;
    case 'ambilSemula':
      if (!b.kumpulan) return; b.fasa = 'ambil'; b.keputusan = null; b.idx = 0; siar(b); break;
    case 'sijilBaru': // murid lain dalam set yang sama
      if (!b.kumpulan) return; padamFoto(b); b.murid = ''; b.fasa = 'ambil'; b.keputusan = null; b.idx = 0; siar(b); break;
    case 'kembali':
      padamFoto(b); b.fasa = 'pilih'; b.kumpulan = 0; b.murid = ''; b.keputusan = null; b.idx = 0; siar(b); break;
    case 'resetMarkah':
      b.selesai = {}; kelas.buang('sijil:'); siar(b); break;
    case 'pandangan': {
      if (!b.foto || Number(d.v) !== b.foto.v) return;
      const x0 = num(d.x0, 0, 1), y0 = num(d.y0, 0, 1), x1 = num(d.x1, 0, 1), y1 = num(d.y1, 0, 1);
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      b.pandangan = { v: b.foto.v, x0, y0, x1, y1 };
      hantar(b.paparan, { jenis: 'pandangan', ...b.pandangan });
      break;
    }
  }
}

function putus(ws) {
  const k = ws._sijil; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  if (!b.paparan.size && !b.telefon.size) b.sunyiSejak = Date.now();
  kemasBilangan(b);
}

// ------------------------------------------------------------
// HTTP
// ------------------------------------------------------------
function perluLogMasuk(req, res, next) { if (!isAuthed(req)) return res.status(401).json({ ok: false, mesej: 'Sila log masuk semula.' }); next(); }

function pasang(app) {
  const rawFoto = express.raw({ type: [...JENIS], limit: MAX_FOTO });

  // ---- gambar sijil (memori sahaja) ----
  app.post('/api/sijil/:kod/foto', perluLogMasuk, rawFoto, (req, res) => {
    const b = bilik.get(req.params.kod);
    if (!kodSah(req.params.kod) || !b) return res.status(404).json({ ok: false, mesej: 'Skrin TV tidak dijumpai. Semak kod bilik.' });
    if (b.fasa !== 'ambil') return res.status(409).json({ ok: false, mesej: 'Pilih set dahulu.' });
    if (ramPenuh()) return res.status(507).json({ ok: false, mesej: 'Pelayan penuh (RAM). Tunggu sebentar atau tutup skrin yang tidak digunakan, kemudian cuba lagi.' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!JENIS.has(type) || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, mesej: 'Fail gambar tidak sah.' });
    b.vf++;
    b.foto = { buf: req.body, type, v: b.vf, t: Date.now(), w: parseInt(req.headers['x-lebar'], 10) || 0, h: parseInt(req.headers['x-tinggi'], 10) || 0 };
    b.pandangan = null;
    siar(b);
    res.json({ ok: true, v: b.foto.v });
  });
  app.get('/api/sijil/:kod/foto', (req, res) => {
    const b = bilik.get(req.params.kod);
    if (!b || !(safeEqual(b.kunci, req.query.kunci) || isAuthed(req))) return res.status(404).end();
    if (!b.foto) return res.status(204).end();
    res.set({ 'Content-Type': b.foto.type, 'Cache-Control': 'no-store', 'X-Versi': String(b.foto.v) }); res.send(b.foto.buf);
  });

  // ---- jawapan (MongoDB) ----
  app.get('/api/sijil/set', perluLogMasuk, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, db: dbSedia(), set: await semuaSetPapar() });
  });
  app.put('/api/sijil/set/:n', perluLogMasuk, express.json({ limit: '64kb' }), async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (!(n >= 1 && n <= 6)) return res.status(400).json({ ok: false, mesej: 'Set tidak sah.' });
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    const j = Array.isArray(req.body && req.body.bahagian) ? req.body.bahagian.slice(0, 4) : [];
    if (j.length !== 4) return res.status(400).json({ ok: false, mesej: 'Perlu tepat 4 bahagian.' });
    const bahagian = j.map((x) => {
      const k1 = bersih(x.k1, 40), k2 = bersih(x.k2, 40);
      return { k1, k2, km: bersih(x.km, 80) || `${k1} ${k2}`.trim(), e1: bersih(x.e1, 16), e2: bersih(x.e2, 16), ek: bersih(x.ek, 16), kad: bersih(x.kad, 200), ayat: bersih(x.ayat, 200).replace(/\s+/g, ' ') };
    });
    const salah = bahagian.findIndex((x) => !susunKad(x.kad, x.ayat));
    if (salah >= 0) return res.status(400).json({ ok: false, mesej: `Bahagian ${salah + 1}: kad perkataan tidak sepadan dengan ayat betul.` });
    await SijilSet.findOneAndUpdate({ kumpulan: n }, { kumpulan: n, nama: bersih(req.body.nama, 40) || namaAsal(n), bahagian }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ ok: true, set: (await semuaSetPapar())[n - 1] });
  });
  app.post('/api/sijil/set/:n/asal', perluLogMasuk, async (req, res) => {
    const n = parseInt(req.params.n, 10);
    if (!(n >= 1 && n <= 6)) return res.status(400).json({ ok: false });
    if (!dbSedia()) return res.status(503).json({ ok: false, mesej: 'Pangkalan data belum bersambung.' });
    await SijilSet.deleteOne({ kumpulan: n });
    res.json({ ok: true, set: (await semuaSetPapar())[n - 1] });
  });

  app.use('/api/sijil', (err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, mesej: 'Gambar terlalu besar.' });
    next(err);
  });
}

module.exports = { pasang, sambung, mesej, putus, susunKad, ASAL };
