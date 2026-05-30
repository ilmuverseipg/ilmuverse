// ============================================================
// ILMUVERSE - SERVER UTAMA v2.0
// Node.js + Express + WebSocket + MongoDB
// ============================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================
// TETAPAN TETAP (JANGAN UBAH TANPA KEBENARAN)
// ============================================================
const TELEGRAM_BOT_TOKEN = '8849507122:AAECl_Ms6z6xYcAfO6kBFAyBfjYoIhL6KrI';
const TELEGRAM_CHAT_ID = '707286960';

// ID Kad NFC Tetap — Ganti dengan ID sebenar kad anda
const NFC_KAD_A = ''; // << LETAK ID KAD A DI SINI (contoh: '04A32F11')
const NFC_KAD_B = ''; // << LETAK ID KAD B DI SINI
const NFC_KAD_C = ''; // << LETAK ID KAD C DI SINI

function uidKeJawapan(uid) {
  const u = uid.toUpperCase().trim();
  if (NFC_KAD_A && u === NFC_KAD_A.toUpperCase()) return 'A';
  if (NFC_KAD_B && u === NFC_KAD_B.toUpperCase()) return 'B';
  if (NFC_KAD_C && u === NFC_KAD_C.toUpperCase()) return 'C';
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
  avatar: String, // base64 image atau emoji
  createdAt: { type: Date, default: Date.now }
});

const SoalanSchema = new mongoose.Schema({
  mod: Number,
  tajuk: String,
  kelas: String,
  soalan: [{
    teks: String,
    jawapanA: String, jawapanB: String, jawapanC: String,
    betul: String,
    uidA: String, uidB: String, uidC: String, uidBetul: String
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

const Murid = mongoose.model('Murid', MuridSchema);
const Soalan = mongoose.model('Soalan', SoalanSchema);
const Sesi = mongoose.model('Sesi', SesiSchema);
const Siaran = mongoose.model('Siaran', SiaranSchema);

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
  mod4: { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null }
};

// Label Melayu + English (dari Teachable Machine model)
const MAKANAN_SIHAT_LIST = ['pisang', 'tembikai', 'epal', 'banana', 'watermelon', 'apple'];
const MAKANAN_TAK_SIHAT_LIST = ['air manis', 'sosej', 'sausage', 'drink'];

// Map English label → Malay untuk display
const LABEL_MAP = {
  'apple': 'Epal', 'banana': 'Pisang', 'watermelon': 'Tembikai',
  'sausage': 'Sosej', 'drink': 'Air Minuman'
};
function normLabel(label) {
  const l = (label||'').toLowerCase().trim();
  return LABEL_MAP[l] ? LABEL_MAP[l].toLowerCase() : l;
}

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
wss.on('connection', (ws, req) => {
  const url = req.url;
  console.log(`[WS] Sambungan baru: ${url}`);

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
        // Hasil Teachable Machine dari browser guru — proses terus
        case 'cam_keputusan_tm': await prosesCAMResult({ label: data.label, confidence: data.confidence }); break;
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
  const { mod, murid, soalanId, masa, tajuk: tajukSesi, kelas } = data;

  const soalan = soalanId ? await Soalan.findById(soalanId) : null;
  if (!soalan && mod !== 4) {
    hantarKeGuru({ jenis: 'ralat', mesej: 'Soalan tidak dijumpai' });
    return;
  }

  const tajukFinal = tajukSesi || (soalan ? soalan.tajuk : 'Sesi Mod 4');
  const sesi = new Sesi({
    tajuk: tajukFinal,
    kelas: kelas || (soalan ? soalan.kelas : ''),
    mod,
    keputusan: murid ? murid.map(m => ({ muridId: m._id, nama: m.nama, markah: 0, avatar: m.avatar })) : []
  });
  await sesi.save();

  // Clear mod4 auto-scan timer
  if (gameState.mod4?.autoScanTimer) clearTimeout(gameState.mod4.autoScanTimer);

  gameState = {
    mod, aktif: true,
    soalanSemasa: 0, muridSemasa: 0,
    muridSenarai: murid || [],
    skor: {}, masa: masa || 120, masaAsal: masa || 120,
    soalan: soalan ? soalan.soalan : [],
    sesiId: sesi._id.toString(),
    buzzerAktif: false, giliran: null,
    peluangKedua: false, mod3Seq: 0,
    mod4: { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null }
  };

  if (murid) murid.forEach(m => { gameState.skor[m._id || m.nama] = 0; });

  hantarKeESP32({ jenis: 'set_mod', mod });

  if (mod === 1) mulaTimerMod1();
  else if (mod === 4) {
    // Auto-scan terus bermula
    setTimeout(() => autoScanMod4(), 1500);
  }

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
    if (sisa <= 0) { clearInterval(gameState.timer); tamatMod1(); }
  }, 1000);
}

async function tamatMod1() {
  if (gameState.timer) clearInterval(gameState.timer);
  gameState.aktif = false;

  const ranking = gameState.muridSenarai.map(m => ({
    nama: m.nama, avatar: m.avatar,
    markah: gameState.skor[m._id || m.nama] || 0
  })).sort((a, b) => b.markah - a.markah);

  await Sesi.findByIdAndUpdate(gameState.sesiId, {
    keputusan: ranking.map((r, i) => ({ nama: r.nama, markah: r.markah, avatar: r.avatar, tempat: i + 1 }))
  });

  hantarKeGuru({ jenis: 'mod1_tamat', ranking });
  if (ranking.length > 0) setTimeout(() => hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 }), 2000);
}

async function prosesNFC(uid) {
  if (!gameState.aktif) {
    // Hantar ke guru untuk UI feedback walaupun tiada mod aktif
    hantarKeGuru({ jenis: 'nfc_scan', uid });
    return;
  }
  hantarKeGuru({ jenis: 'nfc_scan', uid });
  const mod = gameState.mod;
  uid = uid.toUpperCase().trim();
  if (mod === 1) prosesNFCMod1(uid);
  else if (mod === 2) prosesNFCMod2(uid);
  else if (mod === 3) prosesNFCMod3(uid);
}

function prosesNFCMod1(uid) {
  const soalanIdx = gameState.soalanSemasa;
  if (soalanIdx >= gameState.soalan.length) return;

  const soalan = gameState.soalan[soalanIdx];
  const murid = gameState.muridSenarai[gameState.muridSemasa];
  if (!murid) return;

  // Guna kad NFC tetap A/B/C
  const jawapanDiberi = uidKeJawapan(uid);
  if (!jawapanDiberi) return;

  const betul = jawapanDiberi === soalan.betul;
  const key = murid._id || murid.nama;

  if (betul) {
    gameState.skor[key] = (gameState.skor[key] || 0) + 1;
    hantarKeESP32({ jenis: 'betul' });
    hantarKeGuru({ jenis: 'jawapan', betul: true, murid: murid.nama, jawapan: jawapanDiberi, markah: gameState.skor[key] });
  } else {
    hantarKeESP32({ jenis: 'salah' });
    hantarKeGuru({ jenis: 'jawapan', betul: false, murid: murid.nama, jawapan: jawapanDiberi });
  }

  gameState.muridSemasa++;
  if (gameState.muridSemasa >= gameState.muridSenarai.length) {
    gameState.muridSemasa = 0;
    gameState.soalanSemasa++;
    if (gameState.soalanSemasa >= gameState.soalan.length) {
      clearInterval(gameState.timer);
      tamatMod1();
      return;
    }
  }
  hantarKeGuru({ jenis: 'state_update', gameState: sanitizeGameState() });
}

function prosesNFCMod2(uid) {
  if (!gameState.giliran) return;

  const soalanIdx = gameState.soalanSemasa;
  if (soalanIdx >= gameState.soalan.length) return;

  const soalan = gameState.soalan[soalanIdx];
  const jawapanDiberi = uidKeJawapan(uid);
  if (!jawapanDiberi) return;

  const betul = jawapanDiberi === soalan.betul;
  const muridSemasa = gameState.giliran;

  if (betul) {
    gameState.skor[muridSemasa] = (gameState.skor[muridSemasa] || 0) + 1;
    hantarKeESP32({ jenis: 'betul' });
    hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 });
    hantarKeGuru({ jenis: 'mod2_betul', murid: muridSemasa, jawapan: jawapanDiberi, markah: gameState.skor[muridSemasa] });
    gameState.giliran = null;
    gameState.peluangKedua = false;
    gameState.soalanSemasa++;
    if (gameState.soalanSemasa >= gameState.soalan.length) { tamatMod2(); return; }
  } else {
    hantarKeESP32({ jenis: 'salah' });
    if (!gameState.peluangKedua) {
      const muridLain = gameState.muridSenarai.find(m => (m._id || m.nama) !== muridSemasa);
      if (muridLain) {
        gameState.giliran = muridLain._id || muridLain.nama;
        gameState.peluangKedua = true;
        hantarKeGuru({ jenis: 'mod2_peluang_kedua', murid: muridLain.nama });
      }
    } else {
      gameState.giliran = null;
      gameState.peluangKedua = false;
      gameState.soalanSemasa++;
      hantarKeGuru({ jenis: 'mod2_kedua_salah' });
      if (gameState.soalanSemasa >= gameState.soalan.length) { tamatMod2(); return; }
    }
  }
  hantarKeGuru({ jenis: 'state_update', gameState: sanitizeGameState() });
}

function prosesMode2PilihMurid(data) {
  gameState.giliran = data.muridId;
  gameState.peluangKedua = false;
  hantarKeGuru({ jenis: 'mod2_giliran', murid: data.muridNama });
  hantarKeESP32({ jenis: 'sedia_jawab' });
}

async function tamatMod2() {
  gameState.aktif = false;
  const ranking = gameState.muridSenarai.map(m => ({
    nama: m.nama, avatar: m.avatar,
    markah: gameState.skor[m._id || m.nama] || 0
  })).sort((a, b) => b.markah - a.markah);
  await Sesi.findByIdAndUpdate(gameState.sesiId, { keputusan: ranking });
  hantarKeGuru({ jenis: 'mod2_tamat', ranking });
  setTimeout(() => hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 }), 1500);
}

function prosesNFCMod3(uid) {
  const idx = gameState.mod3Seq || 0;
  const soalan = gameState.soalan;
  if (!soalan || idx >= soalan.length) return;

  const betul = soalan[idx].uidBetul === uid;
  if (betul) {
    gameState.mod3Seq = idx + 1;
    hantarKeESP32({ jenis: 'betul' });
    hantarKeGuru({ jenis: 'mod3_betul', susunan: idx + 1, jumlah: soalan.length });
    if (gameState.mod3Seq >= soalan.length) {
      hantarKeESP32({ jenis: 'buka_servo', tempoh: 6000 });
      hantarKeGuru({ jenis: 'mod3_tamat' });
      gameState.aktif = false;
    }
  } else {
    hantarKeESP32({ jenis: 'salah' });
    hantarKeGuru({ jenis: 'mod3_salah', susunan: idx + 1 });
  }
}

async function prosesCAMResult(data) {
  if (!gameState.aktif || gameState.mod !== 4) return;

  const { label: rawLabel, confidence } = data;
  const m4 = gameState.mod4;
  const fasa = m4.fasa;

  // Normalize label (English → key Melayu)
  const labelNorm = normLabel(rawLabel);
  const labelDisplay = LABEL_MAP[rawLabel.toLowerCase()] || rawLabel;

  let betul = false;
  if (fasa === 'sihat') {
    betul = MAKANAN_SIHAT_LIST.includes(rawLabel.toLowerCase()) && !m4.sihatDikesan.includes(labelNorm);
  } else {
    betul = MAKANAN_TAK_SIHAT_LIST.includes(rawLabel.toLowerCase()) && !m4.takSihatDikesan.includes(labelNorm);
  }

  hantarKeGuru({ jenis: 'cam_keputusan', label: labelDisplay, labelKey: labelNorm, confidence, betul, kategori: fasa });

  if (betul) {
    hantarKeESP32({ jenis: 'betul' });
    if (fasa === 'sihat') {
      m4.sihatDikesan.push(labelNorm);
      if (m4.sihatDikesan.length >= MAKANAN_SIHAT_LIST.length) {
        // Tukar ke fasa tidak sihat
        m4.fasa = 'tidak_sihat';
        hantarKeGuru({ jenis: 'mod4_tukar_fasa', fasa: 'tidak_sihat' });
        setTimeout(() => autoScanMod4(), 2000);
        return;
      }
    } else {
      m4.takSihatDikesan.push(labelNorm);
      if (m4.takSihatDikesan.length >= MAKANAN_TAK_SIHAT_LIST.length) {
        // Mod4 selesai
        await tamatMod4();
        return;
      }
    }
  } else {
    hantarKeESP32({ jenis: 'salah' });
  }

  // Auto-scan semula selepas 2 saat
  if (gameState.aktif && gameState.mod === 4) {
    m4.autoScanTimer = setTimeout(() => autoScanMod4(), 2500);
  }
}

async function tamatMod4() {
  gameState.aktif = false;
  const murid = gameState.muridSenarai[0];
  const ranking = murid ? [{ nama: murid.nama, avatar: murid.avatar, markah: gameState.mod4.sihatDikesan.length + gameState.mod4.takSihatDikesan.length }] : [];
  await Sesi.findByIdAndUpdate(gameState.sesiId, { keputusan: ranking });
  hantarKeGuru({ jenis: 'mod4_tamat', ranking });
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
    hantarKeGuru({ jenis: 'state_update', gameState: sanitizeGameState() });
  }
}

async function tamatMod(data) {
  if (gameState.timer) clearInterval(gameState.timer);
  if (gameState.mod4?.autoScanTimer) clearTimeout(gameState.mod4.autoScanTimer);
  gameState.aktif = false;
  hantarKeGuru({ jenis: 'mod_tamat' });
}

async function tambahUlasan(data) {
  const { sesiId, muridId, muridNama, komen } = data;
  await Sesi.findByIdAndUpdate(sesiId, {
    $push: { ulasan: { muridId, nama: muridNama, komen, tarikhKomen: new Date() } }
  });
  semuaHantar({ jenis: 'ulasan_baharu', sesiId, muridId, muridNama, komen });
}

// Telegram — guna credentials tetap
async function hantarTelegram(data) {
  const { sesiId } = data;
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
  mesej += `\n✨ _Dihantar oleh sistem ILMUVERSE_`;

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

function sanitizeGameState() {
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
    jumlahSoalan: gameState.soalan ? gameState.soalan.length : 0,
    mod4Fasa: gameState.mod4?.fasa
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

// --- NFC HTTP fallback ---
app.post('/api/nfc', async (req, res) => {
  await prosesNFC(req.body.uid); res.json({ ok: true });
});

// ============================================================
// MULAKAN SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] ILMUVERSE v2.0 berjalan pada port ${PORT}`);
});
