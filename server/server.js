// ============================================================
// ILMUVERSE - SERVER UTAMA v2.1 (SYNC FIX)
// Node.js + Express + WebSocket + MongoDB
// ============================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================
// TETAPAN TETAP (JANGAN UBAH TANPA KEBENARAN)
// ============================================================
// [KESELAMATAN] Baca dari .env dahulu. Fallback lama dikekalkan buat masa ini
// supaya tidak pecah kalau .env / env var belum disediakan di Render — tapi
// TUKAR token ini di Telegram (guna /revoke pada BotFather) lepas set env var,
// sebab ia pernah terdedah dalam kod sumber.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8849507122:AAECl_Ms6z6xYcAfO6kBFAyBfjYoIhL6KrI';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '707286960';

const NFC_KAD_A = '5A B2 F3 B1';
const NFC_KAD_B = '47 84 21 25';
const NFC_KAD_C = '45 E7 A5 AB';

function normalizeUID(uid) {
  if (!uid) return '';
  return uid.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().match(/.{1,2}/g)?.join(' ') || uid.toUpperCase().trim();
}

function uidKeJawapan(uid) {
  const u = normalizeUID(uid);
  const a = normalizeUID(NFC_KAD_A);
  const b = normalizeUID(NFC_KAD_B);
  const c = normalizeUID(NFC_KAD_C);
  if (a && u === a) return 'A';
  if (b && u === b) return 'B';
  if (c && u === c) return 'C';
  return null;
}

// ============================================================
// SAMBUNGAN MONGODB
// ============================================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ilmuverse')
  .then(() => console.log('[DB] MongoDB Disambung'))
  .catch(err => console.error('[DB] Ralat:', err));

// ============================================================
// SKEMA MONGODB
// ============================================================
const MuridSchema = new mongoose.Schema({
  nama: String,
  avatar: String,
  kelas: String,
  createdAt: { type: Date, default: Date.now }
});

const KehadiranSchema = new mongoose.Schema({
  kelas: String,
  tarikh: { type: Date, default: Date.now },
  senarai: [{ id: String, nama: String, hadir: Boolean }],
  catatanAt: { type: Date, default: Date.now }
});

const SoalanSchema = new mongoose.Schema({
  mod: Number,
  tajuk: String,
  kelas: String,
  soalan: [{
    teks: String,
    jawapanA: String, jawapanB: String, jawapanC: String,
    betul: String,
    uidA: String, uidB: String, uidC: String, uidBetul: String,
    gambar: String // base64 (Mod 5 — Kuiz Bebas), landskap disyorkan
  }]
});

const SesiSchema = new mongoose.Schema({
  tarikh: { type: Date, default: Date.now },
  tajuk: String,
  kelas: String,
  mod: Number,
  keputusan: [{ muridId: String, nama: String, markah: Number, avatar: String }],
  ulasan: [{ muridId: String, nama: String, komen: String, tarikhKomen: Date }]
});

const SiaranSchema = new mongoose.Schema({
  tajuk: String,
  embedLink: String,
  komen: String,
  tarikhDihantar: { type: Date, default: Date.now }
});

const LatihanSchema = new mongoose.Schema({
  tajuk: String,
  arahan: String,
  kelas: String,
  failNama: String,
  failData: String,
  failJenis: String,
  tarikhHantar: { type: Date, default: Date.now },
  tarikhTutup: Date,
  aktif: { type: Boolean, default: true },
  komen: [{
    nama: String,
    peranan: String,
    teks: String,
    tarikhKomen: { type: Date, default: Date.now }
  }],
  jawapan: [{
    muridId: String,
    muridNama: String,
    kelas: String,
    failNama: String,
    failData: String,
    failJenis: String,
    tarikhHantar: { type: Date, default: Date.now },
    komen: [{
      nama: String,
      peranan: String,
      teks: String,
      tarikhKomen: { type: Date, default: Date.now }
    }],
    statusSemak: { type: String, default: 'belum' },
    markah: { type: Number, default: null }
  }]
});

const Murid = mongoose.model('Murid', MuridSchema);
const Soalan = mongoose.model('Soalan', SoalanSchema);
const Sesi = mongoose.model('Sesi', SesiSchema);
const Siaran = mongoose.model('Siaran', SiaranSchema);
const Kehadiran = mongoose.model('Kehadiran', KehadiranSchema);
const Latihan = mongoose.model('Latihan', LatihanSchema);

// ============================================================
// PENGURUSAN WEBSOCKET
// ============================================================
let clients = {
  esp32: null,
  cam: null,
  guru: [],
  murid: []
};

let gameState = {
  mod: null, aktif: false,
  soalanSemasa: 0, muridSemasa: 0,
  muridSenarai: [], skor: {},
  masa: 0, masaAsal: 0,
  timer: null, sesiId: null,
  soalan: [], giliran: null,
  peluangKedua: false,
  mod3Seq: 0,
  gunaGanjaran: false, // Mod 5 — Kuiz Bebas
  mod4: { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null }
};

const MAKANAN_SIHAT_LIST = ['pisang', 'tembikai', 'epal'];
const MAKANAN_TAK_SIHAT_LIST = ['air manis', 'sosej'];

function hantarKeGuru(data) {
  const msg = JSON.stringify(data);
  clients.guru.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}
function hantarKeMurid(data) {
  const msg = JSON.stringify(data);
  clients.murid.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}
function hantarKeESP32(data) {
  if (clients.esp32 && clients.esp32.readyState === WebSocket.OPEN)
    clients.esp32.send(JSON.stringify(data));
}
function hantarKeCAM(data) {
  if (clients.cam && clients.cam.readyState === WebSocket.OPEN)
    clients.cam.send(JSON.stringify(data));
}
function semuaHantar(data) { hantarKeGuru(data); hantarKeMurid(data); }

function updateStatusPeranti() {
  const status = {
    jenis: 'status_peranti',
    esp32: !!(clients.esp32 && clients.esp32.readyState === WebSocket.OPEN),
    cam: !!(clients.cam && clients.cam.readyState === WebSocket.OPEN)
  };
  hantarKeGuru(status);
}

// ============================================================
// WEBSOCKET EVENTS
// ============================================================
// ============================================================
// [STABILITY FIX] HEARTBEAT — kesan sambungan "zombie"
// Tanpa ping/pong ni, kalau ESP32/CAM putus secara kasar (WiFi drop, bukan
// proper close), server masih anggap ia 'OPEN' sehingga TCP timeout lambat
// berlaku — punca 'detect tapi tak respon'. Ping setiap 15s, terminate kalau
// tak dapat pong sebelum ping seterusnya.
// ============================================================
function heartbeat() { this.isAlive = true; }

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      if (ws === clients.esp32) { clients.esp32 = null; updateStatusPeranti(); console.log('[WS] ESP32 heartbeat timeout — dianggap putus'); }
      else if (ws === clients.cam) { clients.cam = null; updateStatusPeranti(); console.log('[WS] CAM heartbeat timeout — dianggap putus'); }
      else { clients.guru = clients.guru.filter(c => c !== ws); clients.murid = clients.murid.filter(c => c !== ws); }
      return ws.terminate();
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 15000);

wss.on('close', () => clearInterval(heartbeatInterval));

wss.on('connection', (ws, req) => {
  const url = req.url;
  console.log(`[WS] Sambungan baru: ${url}`);
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  ws.on('error', (err) => console.log(`[WS] Ralat (${url}):`, err.message));

  if (url === '/esp32') {
    clients.esp32 = ws;
    console.log('[WS] ESP32 Utama disambung');
    updateStatusPeranti();
    ws.send(JSON.stringify({ jenis: 'sambut', mesej: 'ESP32 Utama bersambung' }));
  } else if (url === '/cam') {
    clients.cam = ws;
    console.log('[WS] ESP32-CAM disambung');
    updateStatusPeranti();
    ws.send(JSON.stringify({ jenis: 'sambut', mesej: 'CAM bersambung' }));
  } else if (url === '/guru') {
    clients.guru.push(ws);
    console.log('[WS] Aplikasi Guru disambung');
    updateStatusPeranti();
    ws.send(JSON.stringify({ jenis: 'game_state', data: gameState }));
  } else if (url === '/murid') {
    clients.murid.push(ws);
    console.log('[WS] Aplikasi Murid disambung');
    // [SYNC FIX] Murid yang baru sambung dapat state semasa supaya sync
    ws.send(JSON.stringify({ jenis: 'game_state', data: sanitizeGameState() }));
  }

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (url === '/esp32') {
      if (data.jenis === 'nfc_scan') await prosesNFC(data.uid);
      else if (data.jenis === 'siap') hantarKeGuru({ jenis: 'esp32_siap' });
    }

    if (url === '/cam') {
      if (data.jenis === 'cam_frame') {
        hantarKeGuru({ jenis: 'cam_frame', data: data.data });
      } else if (data.jenis === 'cam_result') {
        await prosesCAMResult(data);
      }
    }

    if (url === '/guru') {
      switch (data.jenis) {
        case 'mula_mod': await mulaMod(data); break;
        case 'pilih_murid_mode2': prosesMode2PilihMurid(data); break;
        case 'soalan_seterusnya': soalanSeterusnya(); break;
        case 'tamat_mod': tamatMod(data); break;
        case 'buka_ganjaran': hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 }); break;
        case 'flash_cam': hantarKeCAM({ jenis: 'flash', nyala: data.nyala }); break;
        case 'tambah_ulasan': await tambahUlasan(data); break;
        case 'push_telegram': await hantarTelegram(data); break;
        case 'cam_result_browser': await prosesCAMResult(data); break;
      }
    }
  });

  ws.on('close', () => {
    if (url === '/esp32') { clients.esp32 = null; updateStatusPeranti(); }
    else if (url === '/cam') { clients.cam = null; updateStatusPeranti(); }
    else if (url === '/guru') clients.guru = clients.guru.filter(c => c !== ws);
    else if (url === '/murid') clients.murid = clients.murid.filter(c => c !== ws);
    console.log(`[WS] Putus: ${url}`);
  });
});

// ============================================================
// LOGIK MOD
// ============================================================
async function mulaMod(data) {
  const { mod, murid, soalanId, masa, tajuk: tajukSesi, kelas, gunaGanjaran } = data;

  const soalan = soalanId ? await Soalan.findById(soalanId) : null;
  if (!soalan && mod !== 4) {
    hantarKeGuru({ jenis: 'ralat', mesej: 'Soalan tidak dijumpai' });
    return;
  }

  const tajukFinal = tajukSesi || (soalan ? soalan.tajuk : 'Sesi Mod 4');

  // [MOD 5 — KUIZ BEBAS] Data sesi TIDAK disimpan ke dashboard (tiada Sesi
  // dicipta, tiada sesiId) — ikut spesifikasi: kuiz santai/cepat, bukan untuk rekod.
  let sesiId = null;
  if (mod !== 5) {
    const sesi = new Sesi({
      tajuk: tajukFinal,
      kelas: kelas || (soalan ? soalan.kelas : ''),
      mod,
      keputusan: murid ? murid.map(m => ({ muridId: m._id, nama: m.nama, markah: 0, avatar: m.avatar })) : []
    });
    await sesi.save();
    sesiId = sesi._id.toString();
  }

  // Henti timer lama sebelum mulakan mod baharu
  if (gameState.timer) { clearInterval(gameState.timer); gameState.timer = null; }
  if (gameState.mod4?.autoScanTimer) clearTimeout(gameState.mod4.autoScanTimer);
  gameState.aktif = false;

  gameState = {
    mod, aktif: true,
    soalanSemasa: 0, muridSemasa: 0,
    muridSenarai: murid || [],
    skor: {}, masa: masa || 120, masaAsal: masa || 120,
    soalan: soalan ? soalan.soalan : [],
    sesiId,
    buzzerAktif: false, giliran: null,
    peluangKedua: false, mod3Seq: 0,
    gunaGanjaran: !!gunaGanjaran,
    mod4: { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null }
  };

  if (murid) murid.forEach(m => { gameState.skor[String(m._id || m.nama)] = 0; });

  hantarKeESP32({ jenis: 'set_mod', mod });

  if (mod === 1) mulaTimerMod1();
  else if (mod === 4) {
    setTimeout(() => autoScanMod4(), 1500);
  }

  // [SYNC FIX] Hantar 'mod_reset' dulu supaya semua klien reset UI mereka,
  // kemudian hantar 'mod_bermula' dengan state penuh
  semuaHantar({ jenis: 'mod_reset' });
  semuaHantar({ jenis: 'mod_bermula', gameState: sanitizeGameState() });
  console.log(`[GAME] Mod ${mod} bermula — ${tajukFinal}`);
}

function autoScanMod4() {
  if (!gameState.aktif || gameState.mod !== 4) return;
  const fasa = gameState.mod4.fasa;
  hantarKeCAM({ jenis: 'mula_scan', kategori: fasa === 'sihat' ? 'sihat' : 'tidak_sihat' });
}

function mulaTimerMod1() {
  let sisa = gameState.masa;
  if (gameState.timer) clearInterval(gameState.timer);
  hantarKeGuru({ jenis: 'timer_update', sisa });

  gameState.timer = setInterval(() => {
    if (!gameState.aktif) { clearInterval(gameState.timer); return; }
    sisa--;
    gameState.masa = sisa;
    hantarKeGuru({ jenis: 'timer_update', sisa });
    if (sisa <= 0) {
      clearInterval(gameState.timer);
      gameState.timer = null;
      if (gameState.aktif) tamatMod1();
    }
  }, 1000);
}

async function tamatMod1() {
  if (gameState.timer) { clearInterval(gameState.timer); gameState.timer = null; }
  gameState.aktif = false;

  const ranking = gameState.muridSenarai.map(m => ({
    nama: m.nama, avatar: m.avatar,
    markah: gameState.skor[String(m._id || m.nama)] || 0
  })).sort((a, b) => b.markah - a.markah);

  await Sesi.findByIdAndUpdate(gameState.sesiId, {
    keputusan: ranking.map((r, i) => ({ nama: r.nama, markah: r.markah, avatar: r.avatar, tempat: i + 1 }))
  });

  // [SYNC FIX] Hantar mod1_tamat DAN mod_tamat supaya semua klien tahu mod sudah habis
  semuaHantar({ jenis: 'mod1_tamat', ranking });
  semuaHantar({ jenis: 'mod_tamat', mod: 1, ranking });

  if (ranking.length > 0) setTimeout(() => hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 }), 2000);
}

async function prosesNFC(uid) {
  const uidNormal = normalizeUID(uid);
  // [SYNC FIX] Resolve jawapan (A/B/C) dan hantar sekali dengan nfc_scan
  // supaya skrin klien tahu kad yang diimbas mewakili jawapan apa
  const jawapanDiberi = uidKeJawapan(uidNormal);
  console.log(`[NFC] Diterima: "${uid}" => normalize: "${uidNormal}" => jawapan: "${jawapanDiberi}" | Mod: ${gameState.mod} | Aktif: ${gameState.aktif}`);

  hantarKeGuru({
    jenis: 'nfc_scan',
    uid: uidNormal,
    jawapan: jawapanDiberi,    // [SYNC FIX] A/B/C atau null jika tidak dikenali
    dikenali: !!jawapanDiberi  // [SYNC FIX] flag mudah untuk klien
  });

  if (!gameState.aktif) return;

  const mod = gameState.mod;
  if (mod === 1) prosesNFCMod1(uidNormal);
  else if (mod === 2) prosesNFCMod2(uidNormal);
  else if (mod === 3) prosesNFCMod3(uidNormal);
  else if (mod === 5) prosesNFCMod5(uidNormal);
}

function prosesNFCMod1(uid) {
  const soalanIdx = gameState.soalanSemasa;
  if (soalanIdx >= gameState.soalan.length) return;

  const soalan = gameState.soalan[soalanIdx];
  const murid = gameState.muridSenarai[gameState.muridSemasa];
  if (!murid) return;

  const jawapanDiberi = uidKeJawapan(uid);
  if (!jawapanDiberi) return;

  const betul = jawapanDiberi === soalan.betul;
  const key = String(murid._id || murid.nama);

  if (betul) {
    gameState.skor[key] = (gameState.skor[key] || 0) + 1;
    hantarKeESP32({ jenis: 'betul' });
    // [SYNC FIX] Hantar ke semua klien (guru + murid)
    semuaHantar({ jenis: 'jawapan', betul: true, murid: murid.nama, jawapan: jawapanDiberi, markah: gameState.skor[key] });
  } else {
    hantarKeESP32({ jenis: 'salah' });
    // [SYNC FIX] Hantar ke semua klien
    semuaHantar({ jenis: 'jawapan', betul: false, murid: murid.nama, jawapan: jawapanDiberi });
  }

  gameState.muridSemasa++;
  if (gameState.muridSemasa >= gameState.muridSenarai.length) {
    gameState.muridSemasa = 0;
    gameState.soalanSemasa++;
    if (gameState.soalanSemasa >= gameState.soalan.length) {
      if (gameState.timer) { clearInterval(gameState.timer); gameState.timer = null; }
      if (gameState.aktif) tamatMod1();
      return;
    }
  }
  // [SYNC FIX] state_update ke semua klien
  semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
}

function prosesNFCMod2(uid) {
  if (!gameState.giliran) return;

  const soalanIdx = gameState.soalanSemasa;
  if (soalanIdx >= gameState.soalan.length) return;

  const soalan = gameState.soalan[soalanIdx];
  const jawapanDiberi = uidKeJawapan(uid);
  if (!jawapanDiberi) {
    console.log('[MOD2] UID tidak dikenali:', uid, '— semak NFC_KAD_A/B/C');
    return;
  }

  const betul = jawapanDiberi === soalan.betul;
  const muridSemasa = String(gameState.giliran);

  if (betul) {
    gameState.skor[muridSemasa] = (gameState.skor[muridSemasa] || 0) + 1;
    const muridObj = gameState.muridSenarai.find(m => String(m._id || m.nama) === muridSemasa);
    const namaPapar = muridObj ? muridObj.nama : muridSemasa;
    hantarKeESP32({ jenis: 'betul' });
    hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 });
    // [SYNC FIX] Hantar ke semua klien
    semuaHantar({ jenis: 'mod2_betul', murid: namaPapar, jawapan: jawapanDiberi, markah: gameState.skor[muridSemasa] });
    gameState.giliran = null;
    gameState.peluangKedua = false;
    gameState.soalanSemasa++;
    if (gameState.soalanSemasa >= gameState.soalan.length) { tamatMod2(); return; }
  } else {
    hantarKeESP32({ jenis: 'salah' });
    if (!gameState.peluangKedua) {
      const muridLain = gameState.muridSenarai.find(m => String(m._id || m.nama) !== muridSemasa);
      if (muridLain) {
        gameState.giliran = String(muridLain._id || muridLain.nama);
        gameState.peluangKedua = true;
        // [SYNC FIX] Hantar ke semua klien (guru + murid) supaya skrin murid update giliran
        semuaHantar({ jenis: 'mod2_peluang_kedua', murid: muridLain.nama });
        hantarKeESP32({ jenis: 'sedia_jawab' });
      }
    } else {
      gameState.giliran = null;
      gameState.peluangKedua = false;
      gameState.soalanSemasa++;
      // [SYNC FIX] Hantar ke semua klien
      semuaHantar({ jenis: 'mod2_kedua_salah' });
      if (gameState.soalanSemasa >= gameState.soalan.length) { tamatMod2(); return; }
    }
  }
  // [SYNC FIX] state_update ke semua klien
  semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
}

function prosesMode2PilihMurid(data) {
  gameState.giliran = String(data.muridId);
  gameState.peluangKedua = false;
  // [SYNC FIX] Hantar ke semua klien supaya skrin murid tahu siapa giliran
  semuaHantar({ jenis: 'mod2_giliran', murid: data.muridNama });
  hantarKeESP32({ jenis: 'sedia_jawab' });
}

async function tamatMod2() {
  gameState.aktif = false;
  const ranking = gameState.muridSenarai.map(m => ({
    nama: m.nama, avatar: m.avatar,
    markah: gameState.skor[String(m._id || m.nama)] || 0
  })).sort((a, b) => b.markah - a.markah);
  await Sesi.findByIdAndUpdate(gameState.sesiId, { keputusan: ranking });
  // [SYNC FIX] Hantar mod2_tamat DAN mod_tamat
  semuaHantar({ jenis: 'mod2_tamat', ranking });
  semuaHantar({ jenis: 'mod_tamat', mod: 2, ranking });
  setTimeout(() => hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 }), 1500);
}

function prosesNFCMod3(uid) {
  const idx = gameState.mod3Seq || 0;
  const soalan = gameState.soalan;
  if (!soalan || idx >= soalan.length) return;

  const betul = normalizeUID(soalan[idx].uidBetul) === normalizeUID(uid);
  if (betul) {
    gameState.mod3Seq = idx + 1;
    hantarKeESP32({ jenis: 'betul' });
    // [SYNC FIX] Hantar ke semua klien
    semuaHantar({ jenis: 'mod3_betul', susunan: idx + 1, jumlah: soalan.length });
    if (gameState.mod3Seq >= soalan.length) {
      hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 });
      gameState.aktif = false;
      // [SYNC FIX] Hantar mod3_tamat DAN mod_tamat
      semuaHantar({ jenis: 'mod3_tamat' });
      semuaHantar({ jenis: 'mod_tamat', mod: 3 });
    }
  } else {
    hantarKeESP32({ jenis: 'salah' });
    // [SYNC FIX] Hantar ke semua klien
    semuaHantar({ jenis: 'mod3_salah', susunan: idx + 1 });
  }
}

// ============================================================
// MOD 5 — KUIZ BEBAS
// Tiada giliran/senarai murid (cikgu panggil murid bila-bila), tiada skor
// direkod, tiada Sesi disimpan. Setiap soalan ada gambar (opsyenal). Betul =
// imbas kad NFC yang dipadan uidBetul/betul (A/B/C) soalan semasa; salah tak
// bergerak ke soalan lain (cuba lagi). Ganjaran (buka servo 6s) ialah
// tetapan global dipilih sebelum mula — kalau aktif, soalan seterusnya
// tunggu servo tutup dahulu.
// ============================================================
function prosesNFCMod5(uid) {
  if (!gameState.aktif) return;
  const idx = gameState.soalanSemasa;
  const soalan = gameState.soalan[idx];
  if (!soalan) return;

  const jawapanDiberi = uidKeJawapan(uid);
  if (!jawapanDiberi) return;

  const betul = jawapanDiberi === soalan.betul;
  if (betul) {
    hantarKeESP32({ jenis: 'betul' });
    semuaHantar({ jenis: 'mod5_betul', jawapan: jawapanDiberi, gunaGanjaran: gameState.gunaGanjaran });
    if (gameState.gunaGanjaran) {
      hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 });
      setTimeout(() => soalanSeterusnyaMod5(), 6500);
    } else {
      setTimeout(() => soalanSeterusnyaMod5(), 1600);
    }
  } else {
    hantarKeESP32({ jenis: 'salah' });
    semuaHantar({ jenis: 'mod5_salah', jawapan: jawapanDiberi });
  }
}

function soalanSeterusnyaMod5() {
  if (!gameState.aktif || gameState.mod !== 5) return;
  gameState.soalanSemasa++;
  if (gameState.soalanSemasa >= gameState.soalan.length) {
    gameState.aktif = false;
    // Tiada ranking/Sesi — data kuiz bebas sengaja tidak disimpan
    semuaHantar({ jenis: 'mod5_tamat' });
    semuaHantar({ jenis: 'mod_tamat', mod: 5 });
  } else {
    semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
  }
}

async function prosesCAMResult(data) {
  if (!gameState.aktif || gameState.mod !== 4) return;

  const { label, confidence } = data;
  const m4 = gameState.mod4;
  const fasa = m4.fasa;
  const labelLower = (label || '').toLowerCase();

  let betul = false;
  if (fasa === 'sihat') {
    betul = MAKANAN_SIHAT_LIST.includes(labelLower) && !m4.sihatDikesan.includes(labelLower);
  } else {
    betul = MAKANAN_TAK_SIHAT_LIST.includes(labelLower) && !m4.takSihatDikesan.includes(labelLower);
  }

  // [SYNC FIX] Hantar ke semua klien
  semuaHantar({ jenis: 'cam_keputusan', label, confidence, betul, kategori: fasa });

  if (betul) {
    hantarKeESP32({ jenis: 'betul' });
    if (fasa === 'sihat') {
      m4.sihatDikesan.push(labelLower);
      if (m4.sihatDikesan.length >= MAKANAN_SIHAT_LIST.length) {
        m4.fasa = 'tidak_sihat';
        semuaHantar({ jenis: 'mod4_tukar_fasa', fasa: 'tidak_sihat' });
        setTimeout(() => autoScanMod4(), 2000);
        return;
      }
    } else {
      m4.takSihatDikesan.push(labelLower);
      if (m4.takSihatDikesan.length >= MAKANAN_TAK_SIHAT_LIST.length) {
        await tamatMod4();
        return;
      }
    }
  } else {
    hantarKeESP32({ jenis: 'salah' });
  }

  if (gameState.aktif && gameState.mod === 4) {
    m4.autoScanTimer = setTimeout(() => autoScanMod4(), 2500);
  }
}

async function tamatMod4() {
  gameState.aktif = false;
  const murid = gameState.muridSenarai[0];
  const ranking = murid ? [{ nama: murid.nama, avatar: murid.avatar, markah: gameState.mod4.sihatDikesan.length + gameState.mod4.takSihatDikesan.length }] : [];
  await Sesi.findByIdAndUpdate(gameState.sesiId, { keputusan: ranking });
  // [SYNC FIX] Hantar mod4_tamat DAN mod_tamat ke semua klien
  semuaHantar({ jenis: 'mod4_tamat', ranking });
  semuaHantar({ jenis: 'mod_tamat', mod: 4, ranking });
  setTimeout(() => hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 }), 1000);
}

function soalanSeterusnya() {
  if (!gameState.aktif) return;
  gameState.soalanSemasa++;
  gameState.muridSemasa = 0;
  if (gameState.soalanSemasa >= gameState.soalan.length) {
    if (gameState.mod === 1) tamatMod1();
    else if (gameState.mod === 2) tamatMod2();
  } else {
    // [SYNC FIX] Hantar ke semua klien
    semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
  }
}

async function tamatMod(data) {
  if (gameState.timer) { clearInterval(gameState.timer); gameState.timer = null; }
  if (gameState.mod4?.autoScanTimer) clearTimeout(gameState.mod4.autoScanTimer);
  gameState.aktif = false;
  // [SYNC FIX] Hantar ke semua klien (sebelum ini pun dah betul)
  semuaHantar({ jenis: 'mod_tamat', mod: gameState.mod });
}

async function tambahUlasan(data) {
  const { sesiId, muridId, muridNama, komen } = data;
  await Sesi.findByIdAndUpdate(sesiId, {
    $push: { ulasan: { muridId, nama: muridNama, komen, tarikhKomen: new Date() } }
  });
  semuaHantar({ jenis: 'ulasan_baharu', sesiId, muridId, muridNama, komen });
}

async function hantarTelegram(data) {
  const { sesiId, namaCikgu } = data;
  const sesi = await Sesi.findById(sesiId);
  if (!sesi) return;

  const ranking = sesi.keputusan.sort((a, b) => b.markah - a.markah);
  let mesej = `🎓 *LAPORAN PENCAPAIAN ILMUVERSE*\n`;
  mesej += `📅 Tarikh: ${new Date(sesi.tarikh).toLocaleDateString('ms-MY')}\n`;
  if (sesi.kelas) mesej += `🏫 Kelas: *${sesi.kelas}*\n`;
  mesej += `📖 Tajuk: *${sesi.tajuk}*\n`;
  mesej += `🎯 Mod: ${['', 'Kuiz Ramai-ramai', 'Dwi-Padu', 'Susunan Hafalan', 'Imbas AI'][sesi.mod]}\n\n`;
  mesej += `🏆 *KEPUTUSAN:*\n`;
  ranking.forEach((r, i) => {
    const emoji = ['🥇', '🥈', '🥉'][i] || '🎖️';
    mesej += `${emoji} ${r.nama}: *${r.markah} markah*\n`;
  });
  if (sesi.ulasan?.length) {
    mesej += `\n💬 *ULASAN GURU:*\n`;
    sesi.ulasan.forEach(u => { mesej += `• ${u.nama}: _${u.komen}_\n`; });
  }
  const namaGuru = namaCikgu || 'Cikgu';
  mesej += `\n✨ _Dihantar oleh ${namaGuru} menggunakan sistem ILMUVERSE_`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mesej, parse_mode: 'Markdown' })
    });
    const hasil = await res.json();
    hantarKeGuru({ jenis: 'telegram_status', berjaya: hasil.ok });
  } catch (e) {
    hantarKeGuru({ jenis: 'telegram_status', berjaya: false, ralat: e.message });
  }
}

// [SYNC FIX] sanitizeGameState dikemaskini — kini include soalan semasa
// supaya klien boleh papar soalan tanpa fetch berasingan
function sanitizeGameState() {
  const soalanSemasa = gameState.soalan?.[gameState.soalanSemasa] || null;
  return {
    mod: gameState.mod,
    aktif: gameState.aktif,
    soalanSemasa: gameState.soalanSemasa,
    muridSemasa: gameState.muridSemasa,
    muridSenarai: gameState.muridSenarai,
    skor: gameState.skor,
    masa: gameState.masa,
    sesiId: gameState.sesiId,
    giliran: gameState.giliran,
    peluangKedua: gameState.peluangKedua,
    jumlahSoalan: gameState.soalan ? gameState.soalan.length : 0,
    mod4Fasa: gameState.mod4?.fasa,
    gunaGanjaran: gameState.gunaGanjaran || false, // Mod 5
    // [SYNC FIX] Data soalan semasa untuk paparan klien
    soalanData: soalanSemasa ? {
      teks: soalanSemasa.teks,
      jawapanA: soalanSemasa.jawapanA,
      jawapanB: soalanSemasa.jawapanB,
      jawapanC: soalanSemasa.jawapanC,
      gambar: soalanSemasa.gambar || null, // Mod 5 — Kuiz Bebas
      // Nota: 'betul' sengaja tidak dihantar ke murid (keselamatan)
    } : null
  };
}

// ============================================================
// REST API
// ============================================================

// --- MURID ---
app.get('/api/murid', async (req, res) => { res.json(await Murid.find()); });
app.post('/api/murid', async (req, res) => {
  const murid = new Murid(req.body);
  await murid.save(); res.json(murid);
});
app.put('/api/murid/:id', async (req, res) => {
  const m = await Murid.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json(m);
});
app.delete('/api/murid/:id', async (req, res) => {
  await Murid.findByIdAndDelete(req.params.id); res.json({ ok: true });
});

// --- SOALAN ---
app.get('/api/soalan', async (req, res) => { res.json(await Soalan.find()); });
app.post('/api/soalan', async (req, res) => {
  const s = new Soalan(req.body); await s.save(); res.json(s);
});
app.put('/api/soalan/:id', async (req, res) => {
  const s = await Soalan.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json(s);
});
app.delete('/api/soalan/:id', async (req, res) => {
  await Soalan.findByIdAndDelete(req.params.id); res.json({ ok: true });
});

// --- SESI & DASHBOARD ---
app.get('/api/sesi', async (req, res) => {
  res.json(await Sesi.find().sort({ tarikh: -1 }).limit(50));
});
app.get('/api/sesi/:id', async (req, res) => {
  res.json(await Sesi.findById(req.params.id));
});
app.delete('/api/sesi/:id', async (req, res) => {
  await Sesi.findByIdAndDelete(req.params.id); res.json({ ok: true });
});
app.put('/api/sesi/:id/ulasan', async (req, res) => {
  const { muridId, muridNama, komen } = req.body;
  const sesi = await Sesi.findByIdAndUpdate(req.params.id, {
    $push: { ulasan: { muridId, nama: muridNama, komen, tarikhKomen: new Date() } }
  }, { new: true });
  semuaHantar({ jenis: 'ulasan_baharu', sesiId: req.params.id, muridId, muridNama, komen });
  res.json(sesi);
});

// --- SIARAN ---
app.get('/api/siaran', async (req, res) => {
  res.json(await Siaran.find().sort({ tarikhDihantar: -1 }));
});
app.post('/api/siaran', async (req, res) => {
  const s = new Siaran(req.body); await s.save();
  semuaHantar({ jenis: 'siaran_baharu', data: s }); res.json(s);
});
app.put('/api/siaran/:id', async (req, res) => {
  const s = await Siaran.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json(s);
});
app.delete('/api/siaran/:id', async (req, res) => {
  await Siaran.findByIdAndDelete(req.params.id); res.json({ ok: true });
});

// --- KEHADIRAN ---
app.get('/api/kehadiran', async (req, res) => {
  const query = {};
  if (req.query.kelas) query.kelas = req.query.kelas;
  if (req.query.tarikh) {
    const t = new Date(req.query.tarikh);
    const esok = new Date(t); esok.setDate(esok.getDate() + 1);
    query.tarikh = { $gte: t, $lt: esok };
  }
  const data = await Kehadiran.find(query).sort({ tarikh: -1 });
  res.json(data);
});
app.post('/api/kehadiran', async (req, res) => {
  const { kelas, tarikh, senarai } = req.body;
  const tarikhObj = new Date(tarikh);
  const esok = new Date(tarikhObj); esok.setDate(esok.getDate() + 1);
  const sedia = await Kehadiran.findOne({ kelas, tarikh: { $gte: tarikhObj, $lt: esok } });
  let rekod;
  if (sedia) {
    rekod = await Kehadiran.findByIdAndUpdate(sedia._id, { senarai, catatanAt: new Date() }, { new: true });
  } else {
    rekod = new Kehadiran({ kelas, tarikh: tarikhObj, senarai });
    await rekod.save();
  }
  res.json(rekod);
});

// --- TELEGRAM KEHADIRAN ---
app.post('/api/telegram-kehadiran', async (req, res) => {
  const { mesej } = req.body;
  if (!mesej) return res.json({ ok: false, error: 'Tiada mesej' });
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mesej, parse_mode: 'Markdown' })
    });
    const hasil = await r.json();
    res.json({ ok: hasil.ok });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// --- NFC HTTP fallback ---
app.post('/api/nfc', async (req, res) => {
  await prosesNFC(req.body.uid); res.json({ ok: true });
});

// ============================================================
// REST API — LATIHAN
// ============================================================

app.get('/api/latihan', async (req, res) => {
  const query = {};
  if (req.query.kelas) query.$or = [{ kelas: req.query.kelas }, { kelas: '' }, { kelas: null }];
  const data = await Latihan.find(query)
    .sort({ tarikhHantar: -1 })
    .select('-jawapan.failData -failData');
  res.json(data);
});

app.get('/api/latihan/:id', async (req, res) => {
  try {
    const l = await Latihan.findById(req.params.id).select('-jawapan.failData');
    res.json(l);
  } catch(e) { res.status(404).json({ error: 'Tidak dijumpai' }); }
});

app.get('/api/latihan/:id/fail', async (req, res) => {
  try {
    const l = await Latihan.findById(req.params.id).select('failData failJenis failNama');
    if (!l || !l.failData) return res.status(404).json({ error: 'Fail tidak ada' });
    const buf = Buffer.from(l.failData.split(',')[1] || l.failData, 'base64');
    res.set('Content-Type', l.failJenis || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${l.failNama || 'latihan'}"`);
    res.send(buf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/latihan', async (req, res) => {
  try {
    const { tajuk, arahan, kelas, failNama, failData, failJenis, tarikhTutup } = req.body;
    const l = new Latihan({ tajuk, arahan, kelas: kelas||'', failNama, failData, failJenis, tarikhTutup: tarikhTutup ? new Date(tarikhTutup) : null });
    await l.save();
    semuaHantar({ jenis: 'latihan_baharu', data: { _id: l._id, tajuk: l.tajuk, kelas: l.kelas, tarikhHantar: l.tarikhHantar } });
    res.json({ ...l.toObject(), failData: undefined });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/latihan/:id', async (req, res) => {
  try {
    const { tajuk, arahan, kelas, tarikhTutup, aktif } = req.body;
    const update = { tajuk, arahan, kelas, aktif };
    if (tarikhTutup !== undefined) update.tarikhTutup = tarikhTutup ? new Date(tarikhTutup) : null;
    const l = await Latihan.findByIdAndUpdate(req.params.id, update, { new: true }).select('-failData -jawapan.failData');
    res.json(l);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/latihan/:id', async (req, res) => {
  await Latihan.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.post('/api/latihan/:id/komen', async (req, res) => {
  try {
    const { nama, peranan, teks } = req.body;
    const l = await Latihan.findByIdAndUpdate(req.params.id, {
      $push: { komen: { nama, peranan, teks, tarikhKomen: new Date() } }
    }, { new: true }).select('-failData -jawapan.failData');
    semuaHantar({ jenis: 'latihan_komen_baharu', latihanId: req.params.id, komen: { nama, peranan, teks } });
    res.json(l);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/latihan/:id/jawapan', async (req, res) => {
  try {
    const { muridId, muridNama, kelas, failNama, failData, failJenis } = req.body;
    const latihan = await Latihan.findById(req.params.id);
    if (!latihan) return res.status(404).json({ error: 'Latihan tidak dijumpai' });

    const idx = latihan.jawapan.findIndex(j => j.muridId === muridId || j.muridNama === muridNama);
    if (idx >= 0) {
      latihan.jawapan[idx].failNama = failNama;
      latihan.jawapan[idx].failData = failData;
      latihan.jawapan[idx].failJenis = failJenis;
      latihan.jawapan[idx].tarikhHantar = new Date();
      latihan.jawapan[idx].statusSemak = 'belum';
      latihan.jawapan[idx].markah = null;
    } else {
      latihan.jawapan.push({ muridId, muridNama, kelas, failNama, failData, failJenis, tarikhHantar: new Date() });
    }
    await latihan.save();
    hantarKeGuru({ jenis: 'jawapan_baharu', latihanId: req.params.id, muridNama, kelas });
    res.json({ ok: true, mesej: 'Jawapan berjaya dihantar!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/latihan/:id/jawapan/:jawapanId/fail', async (req, res) => {
  try {
    const l = await Latihan.findById(req.params.id);
    const j = l?.jawapan?.id(req.params.jawapanId);
    if (!j || !j.failData) return res.status(404).json({ error: 'Fail tidak ada' });
    const buf = Buffer.from(j.failData.split(',')[1] || j.failData, 'base64');
    res.set('Content-Type', j.failJenis || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${j.failNama || 'jawapan'}"`);
    res.send(buf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/latihan/:id/jawapan/:jawapanId/komen', async (req, res) => {
  try {
    const { nama, peranan, teks } = req.body;
    const l = await Latihan.findById(req.params.id);
    const j = l?.jawapan?.id(req.params.jawapanId);
    if (!j) return res.status(404).json({ error: 'Jawapan tidak dijumpai' });
    j.komen.push({ nama, peranan, teks, tarikhKomen: new Date() });
    await l.save();
    semuaHantar({ jenis: 'jawapan_komen_baharu', latihanId: req.params.id, jawapanId: req.params.jawapanId, nama, peranan, teks });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/latihan/:id/jawapan/:jawapanId/status', async (req, res) => {
  try {
    const { status, markah } = req.body;
    const l = await Latihan.findById(req.params.id);
    const j = l?.jawapan?.id(req.params.jawapanId);
    if (!j) return res.status(404).json({ error: 'Jawapan tidak dijumpai' });

    if (status) j.statusSemak = status;
    if (markah !== undefined && markah !== null) {
      j.markah = markah;
      j.statusSemak = 'disemak';
    }

    await l.save();

    semuaHantar({
      jenis: 'markah_dikemaskini',
      latihanId: req.params.id,
      jawapanId: req.params.jawapanId,
      muridId: j.muridId,
      muridNama: j.muridNama,
      markah: j.markah
    });

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/latihan/:id/jawapan', async (req, res) => {
  try {
    const l = await Latihan.findById(req.params.id).select('-jawapan.failData -failData');
    res.json(l?.jawapan || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// MULAKAN SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] ILMUVERSE v2.1 berjalan pada port ${PORT}`);
});
