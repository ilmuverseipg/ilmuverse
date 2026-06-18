// ============================================================
// ILMUVERSE - SERVER UTAMA v2.2 (COMPLETE FULL VERSION)
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
const TELEGRAM_BOT_TOKEN = '8849507122:AAECl_Ms6z6xYcAfO6kBFAyBfjYoIhL6KrI';
const TELEGRAM_CHAT_ID = '707286960';

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
  .then(() => console.log('[DB] MongoDB Disambung Mulus'))
  .catch(err => console.error('[DB] Ralat Sambungan Mongoose:', err));

// ============================================================
// SKEMA MONGODB (ALL CORE SCHEMAS PRESERVED)
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
// PENGURUSAN STATE GLOBAL & WEBSOCKET CORRIDOR
// ============================================================
let clients = { guru: [], murid: [], paparan: [], esp32: [] };
let gameState = {
  aktif: false,
  mod: 0, // Default ke standby mod
  tajukSesi: '',
  kelas: '',
  soalan: [],
  soalanSemasa: 0,
  muridSenarai: [],
  sesiId: null,
  buzzerAktif: false,
  giliran: null,
  peluangKedua: false,
  mod3Seq: 0,
  mod4: { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null }
};

function semuaHantar(data) {
  const msg = JSON.stringify(data);
  [...clients.guru, ...clients.murid, ...clients.paparan, ...clients.esp32].forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function sanitizeGameState() {
  const soalanSemasaData = gameState.soalan && gameState.soalan[gameState.soalanSemasa] ? {
    teks: gameState.soalan[gameState.soalanSemasa].teks,
    jawapanA: gameState.soalan[gameState.soalanSemasa].jawapanA,
    jawapanB: gameState.soalan[gameState.soalanSemasa].jawapanB,
    jawapanC: gameState.soalan[gameState.soalanSemasa].jawapanC
  } : null;

  return {
    aktif: gameState.aktif,
    mod: gameState.mod,
    tajukSesi: gameState.tajukSesi,
    kelas: gameState.kelas,
    soalanSemasa: gameState.soalanSemasa,
    jumlahSoalan: gameState.soalan ? gameState.soalan.length : 0,
    soalanData: soalanSemasaData,
    muridSenarai: gameState.muridSenarai,
    buzzerAktif: gameState.buzzerAktif,
    giliran: gameState.giliran,
    peluangKedua: gameState.peluangKedua,
    mod3Seq: gameState.mod3Seq,
    mod4: { fasa: gameState.mod4.fasa, sihatDikesan: gameState.mod4.sihatDikesan, takSihatDikesan: gameState.mod4.takSihatDikesan }
  };
}

wss.on('connection', (ws, req) => {
  const url = req.url;
  if (url === '/guru') {
    clients.guru.push(ws);
    console.log('[WS] Aplikasi Guru disambung');
    ws.send(JSON.stringify({ jenis: 'state_update', gameState: sanitizeGameState() }));
  } else if (url === '/murid') {
    clients.murid.push(ws);
    console.log('[WS] Aplikasi Murid disambung');
    ws.send(JSON.stringify({ jenis: 'state_update', gameState: sanitizeGameState() }));
  } else if (url === '/paparan') {
    clients.paparan.push(ws);
    console.log('[WS] Paparan Utama disambung');
    ws.send(JSON.stringify({ jenis: 'state_update', gameState: sanitizeGameState() }));
  } else if (url === '/esp32') {
    clients.esp32.push(ws);
    console.log('[WS] Peranti ESP32 disambung');
    // Sinkronisasikan keadaan asal mod ke ESP32 sebaik disambung
    ws.send(JSON.stringify({ jenis: 'set_mod', mod: gameState.mod }));
  }

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // [FIX] SINKRONISASI PERTUKARAN MOD SECARA TOTAL TERMASUK LCD ESP32
      if (data.jenis === 'tukar_mod' || data.jenis === 'set_mod') {
        const targetMod = Number(data.mod);
        gameState.mod = targetMod;
        gameState.buzzerAktif = false;
        gameState.giliran = null;
        gameState.peluangKedua = false;
        if (targetMod === 4) {
          gameState.mod4 = { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null };
        }
        semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
        semuaHantar({ jenis: 'set_mod', mod: targetMod });
        console.log(`[WS] Pertukaran Sistem Berjaya diselaraskan ke Mod: ${targetMod}`);
      }

      else if (data.jenis === 'mula_sesi') {
        const dbSoalan = await Soalan.findById(data.soalanId);
        if (!dbSoalan) return;
        
        const dbMurid = await Murid.find({ kelas: data.kelas });
        const muridSenarai = dbMurid.map(m => ({
          muridId: m._id.toString(),
          nama: m.nama,
          avatar: m.avatar,
          markah: 0,
          statusMod1: 'belum',
          jawapanMod1: null
        }));

        const targetModNum = Number(data.mod);
        const sesi = new Sesi({
          tajuk: dbSoalan.tajuk,
          kelas: data.kelas,
          mod: targetModNum,
          keputusan: muridSenarai.map(m => ({ muridId: m.muridId, nama: m.nama, markah: 0, avatar: m.avatar }))
        });
        await sesi.save();

        gameState = {
          aktif: true,
          mod: targetModNum,
          tajukSesi: dbSoalan.tajuk,
          kelas: data.kelas,
          soalan: dbSoalan.soalan,
          soalanSemasa: 0,
          muridSenarai: muridSenarai,
          sesiId: sesi._id.toString(),
          buzzerAktif: (targetModNum === 2),
          giliran: null,
          peluangKedua: false,
          mod3Seq: 0,
          mod4: { fasa: 'sihat', sihatDikesan: [], takSihatDikesan: [], autoScanTimer: null }
        };
        semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
        semuaHantar({ jenis: 'set_mod', mod: targetModNum });
      }

      else if (data.jenis === 'tamat_sesi') {
        if (gameState.sesiId) {
          await Sesi.findByIdAndUpdate(gameState.sesiId, {
            keputusan: gameState.muridSenarai.map(m => ({ muridId: m.muridId, nama: m.nama, markah: m.markah, avatar: m.avatar }))
          });
        }
        gameState.aktif = false;
        gameState.mod = 0; // Kembalikan ke standby
        semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
        semuaHantar({ jenis: 'set_mod', mod: 0 });
        semuaHantar({ jenis: 'sesi_tamat_klien' });
      }

      else if (data.jenis === 'soalan_seterusnya') {
        if (gameState.soalanSemasa < gameState.soalan.length - 1) {
          gameState.soalanSemasa++;
          gameState.giliran = null;
          gameState.peluangKedua = false;
          gameState.buzzerAktif = (gameState.mod === 2);
          gameState.muridSenarai.forEach(m => {
            m.statusMod1 = 'belum';
            m.jawapanMod1 = null;
          });
          semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
          semuaHantar({ jenis: 'sedia_jawab' });
        } else {
          semuaHantar({ jenis: 'soalan_habis' });
        }
      }

      else if (data.jenis === 'soalan_sebelumnya') {
        if (gameState.soalanSemasa > 0) {
          gameState.soalanSemasa--;
          gameState.giliran = null;
          gameState.peluangKedua = false;
          gameState.buzzerAktif = (gameState.mod === 2);
          gameState.muridSenarai.forEach(m => {
            m.statusMod1 = 'belum';
            m.jawapanMod1 = null;
          });
          semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
          semuaHantar({ jenis: 'sedia_jawab' });
        }
      }

      // [FIX] MOD 2 - PELUANG KEDUA UNLOCK ENGINE
      else if (data.jenis === 'peluang_kedua') {
        gameState.peluangKedua = true;
        gameState.giliran = null;       // Mengosongkan giliran tersekat sebelumnya
        gameState.buzzerAktif = true;    // Mengaktifkan semula keupayaan buzzer perkakasan
        semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
        semuaHantar({ jenis: 'sedia_jawab' }); 
        semuaHantar({ jenis: 'bunyi_peluang_kedua' });
        console.log("[MOD 2] Isyarat Peluang Kedua berjaya di-broadcast ke perkakasan.");
      }

      else if (data.jenis === 'pilih_murid_mod2') {
        if (gameState.mod === 2 && gameState.buzzerAktif && !gameState.giliran) {
          gameState.giliran = String(data.muridId);
          gameState.buzzerAktif = false;
          semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
          semuaHantar({ jenis: 'bunyi_buzzer_pantas', nama: data.nama });
        }
      }

      else if (data.jenis === 'guru_nilai_mod2') {
        if (gameState.mod === 2 && gameState.giliran) {
          const mIdx = gameState.muridSenarai.findIndex(m => m.muridId === gameState.giliran);
          if (mIdx >= 0) {
            if (data.hasil === 'betul') {
              gameState.muridSenarai[mIdx].markah += gameState.peluangKedua ? 5 : 10;
              semuaHantar({ jenis: 'bunyi_betul' });
              semuaHantar({ jenis: 'betul' });
              gameState.giliran = null;
              gameState.peluangKedua = false;
              gameState.buzzerAktif = false;
            } else {
              semuaHantar({ jenis: 'bunyi_salah' });
              semuaHantar({ jenis: 'salah' });
              gameState.giliran = null;
              gameState.buzzerAktif = false; 
            }
            if (gameState.sesiId) {
              await Sesi.findByIdAndUpdate(gameState.sesiId, {
                keputusan: gameState.muridSenarai.map(m => ({ muridId: m.muridId, nama: m.nama, markah: m.markah, avatar: m.avatar }))
              });
            }
          }
          semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
        }
      }

      else if (data.jenis === 'nfc_scan') {
        const uidNormal = normalizeUID(data.uid);
        semuaHantar({ jenis: 'nfc_scan', uid: uidNormal }); // Sampaikan salinan asal ke semua kliens
        if (gameState.aktif) {
          if (gameState.mod === 1) prosesNFCMod1(uidNormal);
          else if (gameState.mod === 2) prosesNFCMod2(uidNormal);
          else if (gameState.mod === 3) prosesNFCMod3(uidNormal);
        }
      }

    } catch (e) {
      console.error('[WS ERROR]', e);
    }
  });

  ws.on('close', () => {
    clients.guru = clients.guru.filter(c => c !== ws);
    clients.murid = clients.murid.filter(c => c !== ws);
    clients.paparan = clients.paparan.filter(c => c !== ws);
    clients.esp32 = clients.esp32.filter(c => c !== ws);
  });
});

// ============================================================
// LOGIK PROSES NFC UTAMA
// ============================================================
function prosesNFCMod1(uid) {
  const soalanIdx = gameState.soalanSemasa;
  if (!gameState.soalan || soalanIdx >= gameState.soalan.length) return;
  const soalan = gameState.soalan[soalanIdx];

  let pilihanJawapan = null;
  if (uidKeJawapan(uid)) {
    pilihanJawapan = uidKeJawapan(uid);
  } else if (normalizeUID(uid) === normalizeUID(soalan.uidA)) pilihanJawapan = 'A';
  else if (normalizeUID(uid) === normalizeUID(soalan.uidB)) pilihanJawapan = 'B';
  else if (normalizeUID(uid) === normalizeUID(soalan.uidC)) pilihanJawapan = 'C';

  if (!pilihanJawapan) return;

  if (gameState.giliran) {
    const idx = gameState.muridSenarai.findIndex(m => m.muridId === gameState.giliran);
    if (idx >= 0 && gameState.muridSenarai[idx].statusMod1 !== 'siap') {
      gameState.muridSenarai[idx].jawapanMod1 = pilihanJawapan;
      gameState.muridSenarai[idx].statusMod1 = 'siap';
      
      const betul = soalan.betul ? soalan.betul.toUpperCase() : 'A';
      if (pilihanJawapan === betul) {
        gameState.muridSenarai[idx].markah += 10;
        semuaHantar({ jenis: 'bunyi_betul' });
        semuaHantar({ jenis: 'betul' });
      } else {
        semuaHantar({ jenis: 'bunyi_salah' });
        semuaHantar({ jenis: 'salah' });
      }
      
      gameState.giliran = null; // [FIX] Bebaskan serta-merta token giliran scan
      semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
    }
  } else {
    const idx = gameState.muridSenarai.findIndex(m => m.statusMod1 === 'belum');
    if (idx >= 0) {
      gameState.muridSenarai[idx].jawapanMod1 = pilihanJawapan;
      gameState.muridSenarai[idx].statusMod1 = 'siap';
      const betul = soalan.betul ? soalan.betul.toUpperCase() : 'A';
      if (pilihanJawapan === betul) {
        gameState.muridSenarai[idx].markah += 10;
        semuaHantar({ jenis: 'betul' });
      } else {
        semuaHantar({ jenis: 'salah' });
      }
      semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
    }
  }
}

function prosesNFCMod2(uid) {
  if (!gameState.buzzerAktif || gameState.giliran) return;
  const idx = Math.floor(Math.random() * gameState.muridSenarai.length);
  if (gameState.muridSenarai[idx]) {
    gameState.giliran = gameState.muridSenarai[idx].muridId;
    gameState.buzzerAktif = false;
    semuaHantar({ jenis: 'state_update', gameState: sanitizeGameState() });
    semuaHantar({ jenis: 'bunyi_buzzer_pantas', nama: gameState.muridSenarai[idx].nama });
  }
}

function prosesNFCMod3(uid) {
  semuaHantar({ jenis: 'nfc_mod3_diterima', uid: uid });
}

// ============================================================
// ALL ORIGINAL REST ENDPOINTS (PRESERVED FULL COMPLETENESS)
// ============================================================
app.get('/api/murid', async (req, res) => {
  try { res.json(await Murid.find().sort({ createdAt: -1 })); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/murid', async (req, res) => {
  try { const m = new Murid(req.body); await m.save(); res.json(m); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/murid/:id', async (req, res) => {
  try { res.json(await Murid.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/murid/:id', async (req, res) => {
  try { await Murid.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/soalan', async (req, res) => {
  try { res.json(await Soalan.find()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/soalan', async (req, res) => {
  try { const s = new Soalan(req.body); await s.save(); res.json(s); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/soalan/:id', async (req, res) => {
  try { res.json(await Soalan.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/soalan/:id', async (req, res) => {
  try { await Soalan.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sesi', async (req, res) => {
  try { res.json(await Sesi.find().sort({ tarikh: -1 })); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sesi/:id', async (req, res) => {
  try { await Sesi.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/latihan', async (req, res) => {
  try {
    const { tajuk, arahan, kelas, failNama, failData, failJenis, tarikhTutup } = req.body;
    const l = new Latihan({ tajuk, arahan, kelas, failNama, failData, failJenis, tarikhTutup });
    await l.save();
    semuaHantar({ jenis: 'latihan_baharu', latihan: l });
    res.json(l);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/latihan', async (req, res) => {
  try { res.json(await Latihan.find().sort({ tarikhHantar: -1 })); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/latihan/:id', async (req, res) => {
  try { res.json(await Latihan.findById(req.params.id)); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/latihan/:id', async (req, res) => {
  try { res.json(await Latihan.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/latihan/:id', async (req, res) => {
  try { await Latihan.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/latihan/:id/komen', async (req, res) => {
  try {
    const { nama, peranan, teks } = req.body;
    const l = await Latihan.findById(req.params.id);
    if (!l) return res.status(404).json({ error: 'Tidak dijumpai' });
    l.komen.push({ nama, peranan, teks });
    await l.save();
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
      latihan.jawapan.push({ muridId, muridNama, kelas, failNama, failData, failJenis, statusSemak: 'belum' });
    }
    await latihan.save();
    res.json(latihan);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`[SERVER RUNNING] Ilmuverse Server v2.2 active on port ${process.env.PORT || 3000}`);
});
