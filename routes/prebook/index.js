// ============================================================
// TEMPAHAN DRIVER (PRE-BOOK) - 2 DRIVER + 2 BOT TELEGRAM
// ------------------------------------------------------------
// Halaman awam (TANPA kata laluan, untuk pelanggan):
//   /tempah            -> pilih driver
//   /tempah/perempuan  -> driver perempuan  -> Bot Telegram 1
//   /tempah/lelaki     -> driver lelaki     -> Bot Telegram 2
//
// Fail HTML disimpan dalam private/prebook/ (bukan public/), dan modul ini
// didaftarkan SEBELUM pintu kata laluan. Pemegang pautan ini tidak boleh
// masuk ke halaman lain Ilmuverse.
//
// Env var di Render:
//   PREBOOK_P_TOKEN, PREBOOK_P_NAMA, PREBOOK_P_WA   (driver perempuan)
//   PREBOOK_L_TOKEN, PREBOOK_L_NAMA, PREBOOK_L_WA   (driver lelaki)
// Chat ID driver didaftarkan automatik bila driver tekan /start pada bot.
// ============================================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const M = require('./masa');
const { klien, mulaPolling } = require('./telegram');
const Tempahan = require('../../models/PrebookTempahan');
const Tetapan = require('../../models/PrebookTetapan');

const num = (v, d) => (v !== undefined && v !== '' && !isNaN(Number(v)) ? Number(v) : d);
const C = {
  SLOT_MINIT: num(process.env.PREBOOK_SLOT_MINIT, 60),
  TEMPAH_AWAL_JAM: num(process.env.PREBOOK_TEMPAH_AWAL_JAM, 3),
  HARI_KE_DEPAN: num(process.env.PREBOOK_HARI_KE_DEPAN, 14),
  AUTO_BATAL_JAM: num(process.env.PREBOOK_AUTO_BATAL_JAM, 2),
  BATAL_MIN_JAM: num(process.env.PREBOOK_BATAL_MIN_JAM, 2),
  INGATAN_MINIT: num(process.env.PREBOOK_INGATAN_MINIT, 60),
};

const DRIVERS = {
  perempuan: {
    id: 'perempuan',
    nama: process.env.PREBOOK_P_NAMA || 'Driver Perempuan',
    label: 'Khas Penumpang Perempuan',
    penumpang: 'perempuan',
    token: process.env.PREBOOK_P_TOKEN || '',
    chatEnv: process.env.PREBOOK_P_CHAT_ID || '',
    wa: (process.env.PREBOOK_P_WA || '').replace(/\D/g, ''),
    prefix: 'P',
  },
  lelaki: {
    id: 'lelaki',
    nama: process.env.PREBOOK_L_NAMA || 'Driver Lelaki',
    label: 'Khas Penumpang Lelaki',
    penumpang: 'lelaki',
    token: process.env.PREBOOK_L_TOKEN || '',
    chatEnv: process.env.PREBOOK_L_CHAT_ID || '',
    wa: (process.env.PREBOOK_L_WA || '').replace(/\D/g, ''),
    prefix: 'L',
  },
};

const JADUAL_ASAL = {
  isnin: [{ mula: '17:00', tamat: '22:00' }],
  selasa: [{ mula: '17:00', tamat: '22:00' }],
  rabu: [{ mula: '17:00', tamat: '22:00' }],
  khamis: [{ mula: '17:00', tamat: '22:00' }],
  jumaat: [{ mula: '14:30', tamat: '22:00' }],
  sabtu: [{ mula: '08:00', tamat: '22:00' }],
  ahad: [{ mula: '08:00', tamat: '22:00' }],
};

const AKTIF = ['menunggu', 'disahkan'];
const STATUS = {
  menunggu: '⏳ Menunggu pengesahan',
  disahkan: '✅ Disahkan',
  ditolak: '❌ Ditolak',
  selesai: '🏁 Selesai',
  batal_pelanggan: '🚫 Dibatalkan oleh pelanggan',
  batal_driver: '🚫 Dibatalkan oleh driver',
  batal_auto: '⌛ Batal automatik (tiada jawapan)',
};

// ---------------- Simpanan (memori + MongoDB) ----------------
const S = { tempahan: [], tetapan: {} };
let sedia = null;

function muat() {
  sedia = (async () => {
    const dariTarikh = M.tambahHari(M.hariIni(), -60);
    S.tempahan = await Tempahan.find({ tarikh: { $gte: dariTarikh } }).lean();
    for (const id of Object.keys(DRIVERS)) {
      let t = await Tetapan.findOne({ driver: id }).lean();
      if (!t) t = (await Tetapan.create({ driver: id, jadual: JADUAL_ASAL, tutup: [] })).toObject();
      if (!t.jadual || !Object.keys(t.jadual).length) t.jadual = JSON.parse(JSON.stringify(JADUAL_ASAL));
      S.tetapan[id] = { jadual: t.jadual, tutup: t.tutup || [], chatId: t.chatId || '' };
    }
    console.log(`[PREBOOK] Dimuatkan ${S.tempahan.length} tempahan`);
  })().catch((e) => {
    console.error('[PREBOOK] Gagal muat data:', e.message);
    sedia = null;
    throw e;
  });
  return sedia;
}
async function pastiSedia() {
  if (!sedia) muat();
  return sedia;
}

function simpanT(t) {
  const { _id, ...isi } = t;
  return Tempahan.updateOne({ kod: t.kod }, { $set: isi }, { upsert: true }).catch((e) =>
    console.error('[PREBOOK] simpan tempahan:', e.message)
  );
}
function simpanTetapan(id) {
  const t = S.tetapan[id];
  return Tetapan.updateOne({ driver: id }, { $set: { jadual: t.jadual, tutup: t.tutup, chatId: t.chatId } }, { upsert: true }).catch((e) =>
    console.error('[PREBOOK] simpan tetapan:', e.message)
  );
}
const chatId = (id) => DRIVERS[id].chatEnv || S.tetapan[id]?.chatId || '';

// ---------------- Slot ----------------
function senaraiSlot(id, tarikh) {
  const tt = S.tetapan[id];
  if (tt.tutup.includes(tarikh)) return { tutup: true, slot: [] };
  const julat = tt.jadual[M.namaHari(tarikh)] || [];
  const minEpoch = Date.now() + C.TEMPAH_AWAL_JAM * 3600e3;
  const diambil = new Set(
    S.tempahan.filter((t) => t.driver === id && t.tarikh === tarikh && AKTIF.includes(t.status)).map((t) => t.masa)
  );
  const slot = [];
  for (const { mula, tamat } of julat) {
    for (let m = M.keMinit(mula); m + C.SLOT_MINIT <= M.keMinit(tamat); m += C.SLOT_MINIT) {
      const masa = M.dariMinit(m);
      const lepas = M.keEpoch(tarikh, masa) < minEpoch;
      slot.push({ masa, papar: M.paparMasa(masa), ada: !diambil.has(masa) && !lepas, sebab: diambil.has(masa) ? 'penuh' : lepas ? 'lepas' : null });
    }
  }
  slot.sort((a, b) => a.masa.localeCompare(b.masa));
  return { tutup: false, slot };
}

function senaraiTarikh(id) {
  const mula = M.hariIni();
  return Array.from({ length: C.HARI_KE_DEPAN }, (_, i) => {
    const tarikh = M.tambahHari(mula, i);
    const { tutup, slot } = senaraiSlot(id, tarikh);
    return { tarikh, hari: M.HARI_PAPAR[M.indeksHari(tarikh)], tutup, bilAda: slot.filter((s) => s.ada).length };
  });
}

function slotMasihAda(id, tarikh, masa) {
  if (!M.sahTarikh(tarikh) || !M.sahMasa(masa)) return false;
  const terakhir = M.tambahHari(M.hariIni(), C.HARI_KE_DEPAN - 1);
  if (tarikh < M.hariIni() || tarikh > terakhir) return false;
  const s = senaraiSlot(id, tarikh).slot.find((x) => x.masa === masa);
  return !!(s && s.ada);
}

// ---------------- Telegram ----------------
const tg = {};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function teksTempahan(t) {
  const wa = t.telefon.replace(/^0/, '60');
  return [
    `<b>🚗 TEMPAHAN ${esc(t.kod)}</b>`,
    `Status: <b>${STATUS[t.status] || t.status}</b>`,
    '',
    `📅 ${M.paparTarikh(t.tarikh)}`,
    `🕐 ${M.paparMasa(t.masa)}`,
    `👤 ${esc(t.nama)} (${t.penumpang} orang)`,
    `📞 <a href="https://wa.me/${wa}">${esc(t.telefon)}</a> (tekan untuk WhatsApp)`,
    `📍 Ambil: ${esc(t.ambil)}`,
    `🏁 Ke: ${esc(t.destinasi)}`,
    `🔁 ${t.jenis === 'pergi-balik' ? 'Pergi-balik' + (t.masaBalik ? ` (balik: ${esc(t.masaBalik)})` : '') : 'Sehala'}`,
    t.catatan ? `📝 ${esc(t.catatan)}` : null,
  ].filter((x) => x !== null).join('\n');
}

function butang(t) {
  if (t.status === 'menunggu')
    return [[{ text: '✅ Sahkan', callback_data: `sah:${t.kod}` }, { text: '❌ Tolak', callback_data: `tolak:${t.kod}` }]];
  if (t.status === 'disahkan')
    return [[{ text: '🏁 Selesai', callback_data: `siap:${t.kod}` }, { text: '🚫 Batal', callback_data: `batal:${t.kod}` }]];
  return [];
}

async function hantar(id, teks, extra = {}) {
  if (!tg[id] || !chatId(id)) return null;
  try {
    return await tg[id].call('sendMessage', { chat_id: chatId(id), text: teks, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  } catch (e) {
    console.error(`[PREBOOK ${id}] hantar:`, e.message);
    return null;
  }
}

async function kemaskiniMesej(t) {
  if (!tg[t.driver] || !chatId(t.driver) || !t.tgMsgId) return;
  try {
    await tg[t.driver].call('editMessageText', {
      chat_id: chatId(t.driver),
      message_id: t.tgMsgId,
      text: teksTempahan(t),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: butang(t) },
    });
  } catch (e) {
    if (!String(e.message).includes('not modified')) console.error('[PREBOOK] edit:', e.message);
  }
}

async function hantarTempahanBaru(t) {
  const m = await hantar(t.driver, '🔔 <b>TEMPAHAN BARU!</b>\n\n' + teksTempahan(t), { reply_markup: { inline_keyboard: butang(t) } });
  if (m) {
    t.tgMsgId = m.message_id;
    simpanT(t);
  }
}

function ringkasan(senarai, tajuk) {
  if (!senarai.length) return `<b>${tajuk}</b>\nTiada tempahan.`;
  return (
    `<b>${tajuk}</b>\n\n` +
    senarai
      .sort((a, b) => (a.tarikh + a.masa).localeCompare(b.tarikh + b.masa))
      .map((t) => `• <b>${t.kod}</b> ${M.paparTarikh(t.tarikh)} ${M.paparMasa(t.masa)}\n   ${esc(t.nama)} | ${esc(t.ambil)} → ${esc(t.destinasi)}\n   ${STATUS[t.status]}`)
      .join('\n\n')
  );
}

function teksJadual(id) {
  const j = S.tetapan[id].jadual;
  const hari = ['isnin', 'selasa', 'rabu', 'khamis', 'jumaat', 'sabtu', 'ahad'];
  const baris = hari.map((h) => {
    const x = j[h] || [];
    return `${h.charAt(0).toUpperCase() + h.slice(1)}: ${x.length ? x.map((y) => `${y.mula}-${y.tamat}`).join(', ') : 'TUTUP'}`;
  });
  const tutup = S.tetapan[id].tutup.filter((t) => t >= M.hariIni()).sort();
  return '<b>📆 JADUAL MINGGUAN</b>\n' + baris.join('\n') + '\n\n<b>🚫 Tarikh ditutup:</b>\n' + (tutup.length ? tutup.map((t) => '• ' + M.paparTarikh(t)).join('\n') : 'Tiada');
}

const BANTUAN = `<b>📋 SENARAI ARAHAN</b>

<b>Tempahan</b>
/hariini - tempahan hari ini
/esok - tempahan esok
/senarai - semua tempahan akan datang
/cari KOD - lihat satu tempahan

<b>Jadual</b>
/jadual - lihat jadual mingguan
/slot 2026-11-20 - slot kosong tarikh itu
/tutup 2026-11-20 - tutup satu hari (cuti/kelas)
/buka 2026-11-20 - buka semula hari itu

<b>Ubah jadual mingguan</b>
/setjadual isnin 17:00-22:00
/setjadual sabtu 08:00-12:00 14:00-22:00
/setjadual rabu tutup`;

async function urusUpdate(id, u) {
  await pastiSedia();
  const d = DRIVERS[id];
  const balas = (teks, extra) => hantar(id, teks, extra);

  // ----- Butang inline -----
  if (u.callback_query) {
    const q = u.callback_query;
    const jawab = (text) => tg[id].call('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (String(q.message?.chat?.id) !== String(chatId(id))) return jawab();
    const [aksi, kod] = String(q.data || '').split(':');
    const t = S.tempahan.find((x) => x.driver === id && x.kod === kod);
    if (!t) return jawab('Tempahan tidak dijumpai');
    const p = {
      sah: ['menunggu', 'disahkan', 'Tempahan disahkan ✅'],
      tolak: ['menunggu', 'ditolak', 'Tempahan ditolak'],
      siap: ['disahkan', 'selesai', 'Perjalanan selesai 🏁'],
      batal: ['disahkan', 'batal_driver', 'Tempahan dibatalkan'],
    }[aksi];
    t.tgMsgId = q.message.message_id;
    if (!p || t.status !== p[0]) {
      await jawab(`Status sekarang: ${STATUS[t.status]}`);
      return kemaskiniMesej(t);
    }
    t.status = p[1];
    t.dikemaskini = Date.now();
    simpanT(t);
    await jawab(p[2]);
    return kemaskiniMesej(t);
  }

  // ----- Arahan teks -----
  const msg = u.message;
  if (!msg || typeof msg.text !== 'string') return;
  const teks = msg.text.trim().replace(/^(\/\w+)@\w+/, '$1');
  const [arahan, ...arg] = teks.split(/\s+/);
  const cmd = arahan.toLowerCase();

  // Daftar driver: orang pertama yang tekan /start menjadi pemilik bot.
  if (!chatId(id)) {
    if (cmd === '/start' || cmd === '/daftar') {
      S.tetapan[id].chatId = String(msg.chat.id);
      await simpanTetapan(id);
      return balas(`✅ Anda kini didaftarkan sebagai <b>${esc(d.nama)}</b> (${esc(d.label)}).\nSemua tempahan akan dihantar ke sini.\n\n` + BANTUAN);
    }
    return tg[id].call('sendMessage', { chat_id: msg.chat.id, text: 'Tekan /start untuk daftar sebagai driver.' }).catch(() => {});
  }
  if (String(msg.chat.id) !== String(chatId(id))) {
    return tg[id].call('sendMessage', { chat_id: msg.chat.id, text: 'Maaf, bot ini khas untuk driver sahaja.' }).catch(() => {});
  }

  const milik = () => S.tempahan.filter((t) => t.driver === id);
  const hariIni = M.hariIni();

  switch (cmd) {
    case '/start':
    case '/bantuan':
    case '/help':
      return balas(`Assalamualaikum ${esc(d.nama)} 👋\nBot tempahan <b>${esc(d.label)}</b> aktif.\n\n` + BANTUAN);
    case '/hariini':
      return balas(ringkasan(milik().filter((t) => t.tarikh === hariIni && [...AKTIF, 'selesai'].includes(t.status)), '📅 TEMPAHAN HARI INI'));
    case '/esok': {
      const e = M.tambahHari(hariIni, 1);
      return balas(ringkasan(milik().filter((t) => t.tarikh === e && AKTIF.includes(t.status)), '📅 TEMPAHAN ESOK'));
    }
    case '/senarai':
      return balas(ringkasan(milik().filter((t) => t.tarikh >= hariIni && AKTIF.includes(t.status)), '📋 TEMPAHAN AKAN DATANG'));
    case '/cari': {
      const t = milik().find((x) => x.kod === String(arg[0] || '').toUpperCase());
      if (!t) return balas('Kod tidak dijumpai. Format: /cari PABC12');
      const m = await balas(teksTempahan(t), { reply_markup: { inline_keyboard: butang(t) } });
      if (m) {
        t.tgMsgId = m.message_id;
        simpanT(t);
      }
      return;
    }
    case '/jadual':
      return balas(teksJadual(id));
    case '/slot': {
      const tarikh = arg[0] || hariIni;
      if (!M.sahTarikh(tarikh)) return balas('Format: /slot 2026-11-20');
      const { tutup, slot } = senaraiSlot(id, tarikh);
      if (tutup) return balas(`${M.paparTarikh(tarikh)}: <b>DITUTUP</b>`);
      if (!slot.length) return balas(`${M.paparTarikh(tarikh)}: tiada waktu kerja dalam jadual.`);
      const ikon = { penuh: '🔴', lepas: '⚪' };
      return balas(`<b>${M.paparTarikh(tarikh)}</b>\n` + slot.map((s) => `${s.ada ? '🟢' : ikon[s.sebab]} ${s.papar}`).join('\n') + '\n\n🟢 kosong  🔴 ditempah  ⚪ dah lepas/terlalu dekat');
    }
    case '/tutup': {
      if (!arg.length || !arg.every(M.sahTarikh)) return balas('Format: /tutup 2026-11-20 (boleh lebih dari satu tarikh)');
      const tt = S.tetapan[id].tutup;
      for (const t of arg) if (!tt.includes(t)) tt.push(t);
      await simpanTetapan(id);
      const ada = milik().filter((t) => arg.includes(t.tarikh) && AKTIF.includes(t.status));
      return balas(
        `🚫 Ditutup: ${arg.map(M.paparTarikh).join(', ')}` +
          (ada.length ? `\n\n⚠️ Ada ${ada.length} tempahan aktif pada tarikh ini. Sila hubungi pelanggan:\n` + ada.map((t) => `• ${t.kod} ${esc(t.nama)} ${esc(t.telefon)}`).join('\n') : '')
      );
    }
    case '/buka': {
      if (!arg.length || !arg.every(M.sahTarikh)) return balas('Format: /buka 2026-11-20');
      S.tetapan[id].tutup = S.tetapan[id].tutup.filter((t) => !arg.includes(t));
      await simpanTetapan(id);
      return balas(`✅ Dibuka semula: ${arg.map(M.paparTarikh).join(', ')}`);
    }
    case '/setjadual': {
      const hari = (arg[0] || '').toLowerCase();
      const julatTeks = arg.slice(1).map((x) => x.toLowerCase());
      if (!M.HARI.includes(hari) || !julatTeks.length)
        return balas('Format:\n/setjadual isnin 17:00-22:00\n/setjadual sabtu 08:00-12:00 14:00-22:00\n/setjadual rabu tutup');
      const jadual = { ...S.tetapan[id].jadual };
      if (julatTeks[0] === 'tutup') jadual[hari] = [];
      else {
        const julat = [];
        for (const b of julatTeks) {
          const [mula, tamat] = b.split('-');
          if (!M.sahMasa(mula || '') || !M.sahMasa(tamat || '') || M.keMinit(tamat) <= M.keMinit(mula))
            return balas(`Masa tidak sah: ${esc(b)}\nContoh betul: 17:00-22:00`);
          julat.push({ mula, tamat });
        }
        jadual[hari] = julat.sort((a, b) => a.mula.localeCompare(b.mula));
      }
      S.tetapan[id].jadual = jadual;
      await simpanTetapan(id);
      return balas('✅ Jadual dikemas kini.\n\n' + teksJadual(id));
    }
    default:
      return balas('Arahan tidak dikenali. Tekan /bantuan untuk senarai arahan.');
  }
}

function mulaBot(app) {
  const baseUrl = (process.env.PREBOOK_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  for (const [id, d] of Object.entries(DRIVERS)) {
    if (!d.token) {
      console.log(`[PREBOOK ${id}] Tiada token bot (PREBOOK_${d.prefix}_TOKEN) - notifikasi Telegram dimatikan.`);
      continue;
    }
    tg[id] = klien(d.token);
    const onUpdate = (u) => urusUpdate(id, u);

    // Laluan webhook (sentiasa didaftarkan; hanya digunakan bila ada URL awam)
    app.post(`/api/prebook/tg/${id}`, (req, res) => {
      if (req.get('X-Telegram-Bot-Api-Secret-Token') !== tg[id].rahsia) return res.sendStatus(403);
      res.sendStatus(200);
      onUpdate(req.body || {}).catch((e) => console.error(`[PREBOOK ${id}] update:`, e.message));
    });

    tg[id]
      .call('setMyCommands', {
        commands: [
          { command: 'hariini', description: 'Tempahan hari ini' },
          { command: 'esok', description: 'Tempahan esok' },
          { command: 'senarai', description: 'Semua tempahan akan datang' },
          { command: 'jadual', description: 'Lihat jadual mingguan' },
          { command: 'slot', description: 'Slot kosong (cth: /slot 2026-11-20)' },
          { command: 'tutup', description: 'Tutup tarikh (cth: /tutup 2026-11-20)' },
          { command: 'buka', description: 'Buka semula tarikh' },
          { command: 'setjadual', description: 'Ubah jadual (cth: /setjadual isnin 17:00-22:00)' },
          { command: 'bantuan', description: 'Senarai arahan' },
        ],
      })
      .catch(() => {});

    if (baseUrl) {
      tg[id]
        .call('setWebhook', {
          url: `${baseUrl}/api/prebook/tg/${id}`,
          secret_token: tg[id].rahsia,
          allowed_updates: ['message', 'callback_query'],
        })
        .then(() => console.log(`[PREBOOK ${id}] Webhook aktif: ${baseUrl}/api/prebook/tg/${id}`))
        .catch((e) => console.error(`[PREBOOK ${id}] setWebhook gagal:`, e.message));
    } else {
      mulaPolling(tg[id], onUpdate, id);
      console.log(`[PREBOOK ${id}] Bot aktif (polling)`);
    }
  }
}

// ---------------- Tugas berkala ----------------
async function tugasBerkala() {
  if (!sedia) return;
  try {
    await sedia;
  } catch {
    return;
  }
  const sekarang = Date.now();
  for (const t of S.tempahan) {
    const ep = M.keEpoch(t.tarikh, t.masa);
    if (t.status === 'menunggu' && (sekarang - t.dibuat > C.AUTO_BATAL_JAM * 3600e3 || ep < sekarang)) {
      t.status = 'batal_auto';
      t.dikemaskini = sekarang;
      simpanT(t);
      kemaskiniMesej(t);
      hantar(t.driver, `⌛ <b>${t.kod}</b> dibatalkan automatik kerana tiada jawapan dalam ${C.AUTO_BATAL_JAM} jam.`);
    }
    if (t.status === 'disahkan' && !t.ingatan && ep > sekarang && ep - sekarang <= C.INGATAN_MINIT * 60e3) {
      t.ingatan = true;
      simpanT(t);
      hantar(t.driver, `⏰ <b>PERINGATAN</b> - perjalanan dalam ${Math.round((ep - sekarang) / 60e3)} minit\n\n` + teksTempahan(t));
    }
  }
}

// ---------------- Laluan web ----------------
const DIR = path.join(__dirname, '../../private/prebook');

function janaKod(prefix) {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let kod;
  do kod = prefix + Array.from(crypto.randomBytes(5), (b) => huruf[b % huruf.length]).join('');
  while (S.tempahan.some((t) => t.kod === kod));
  return kod;
}
const normalTelefon = (s) => String(s || '').replace(/[\s-]/g, '').replace(/^\+?60/, '0');
const sahTelefon = (s) => /^01\d{8,9}$/.test(s);
const teks = (v, max) => String(v ?? '').trim().slice(0, max);

const kiraanIP = new Map();
function hadIP(ip) {
  const now = Date.now();
  const l = (kiraanIP.get(ip) || []).filter((t) => now - t < 3600e3);
  if (l.length >= 5) return false;
  l.push(now);
  kiraanIP.set(ip, l);
  return true;
}

function ringkasAwam(t) {
  return {
    kod: t.kod,
    driver: t.driver,
    status: t.status,
    statusPapar: STATUS[t.status],
    tarikh: M.paparTarikh(t.tarikh),
    masa: M.paparMasa(t.masa),
    ambil: t.ambil,
    destinasi: t.destinasi,
    bolehBatal: AKTIF.includes(t.status) && M.keEpoch(t.tarikh, t.masa) - Date.now() > C.BATAL_MIN_JAM * 3600e3,
  };
}

function pasang(app) {
  const r = express.Router();
  const halaman = (fail) => (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.sendFile(path.join(DIR, fail));
  };
  r.get('/tempah', halaman('index.html'));
  r.get('/tempah/perempuan', halaman('tempah.html'));
  r.get('/tempah/lelaki', halaman('tempah.html'));
  r.get('/tempah/aset/style.css', (req, res) => res.sendFile(path.join(DIR, 'style.css')));
  r.get('/tempah/aset/app.js', (req, res) => res.sendFile(path.join(DIR, 'app.js')));

  // Pastikan data dimuatkan sebelum API digunakan
  r.use('/api/prebook', async (req, res, next) => {
    try {
      await pastiSedia();
      next();
    } catch {
      res.status(503).json({ ralat: 'Sistem sedang dimulakan. Cuba lagi sebentar.' });
    }
  });

  const driverDari = (req, res) => {
    const d = DRIVERS[req.params.driver];
    if (!d) res.status(404).json({ ralat: 'Driver tidak dijumpai' });
    return d;
  };

  r.get('/api/prebook/driver/:driver', (req, res) => {
    const d = driverDari(req, res);
    if (!d) return;
    res.json({ id: d.id, nama: d.nama, label: d.label, penumpang: d.penumpang, wa: d.wa, tempahAwalJam: C.TEMPAH_AWAL_JAM, batalMinJam: C.BATAL_MIN_JAM });
  });

  r.get('/api/prebook/tarikh/:driver', (req, res) => {
    const d = driverDari(req, res);
    if (d) res.json(senaraiTarikh(d.id));
  });

  r.get('/api/prebook/slot/:driver', (req, res) => {
    const d = driverDari(req, res);
    if (!d) return;
    const tarikh = String(req.query.tarikh || '');
    if (!M.sahTarikh(tarikh)) return res.status(400).json({ ralat: 'Tarikh tidak sah' });
    res.json({ tarikh, papar: M.paparTarikh(tarikh), ...senaraiSlot(d.id, tarikh) });
  });

  r.post('/api/prebook/tempah/:driver', async (req, res) => {
    const d = driverDari(req, res);
    if (!d) return;
    const b = req.body || {};
    if (b.laman) return res.json({ ok: true, kod: 'X' }); // perangkap bot spam
    if (!hadIP(req.headers['x-forwarded-for']?.split(',')[0] || req.ip)) return res.status(429).json({ ralat: 'Terlalu banyak tempahan. Cuba lagi sebentar.' });

    const t = {
      nama: teks(b.nama, 60),
      telefon: normalTelefon(b.telefon),
      tarikh: teks(b.tarikh, 10),
      masa: teks(b.masa, 5),
      penumpang: Math.max(1, Math.min(4, parseInt(b.penumpang, 10) || 1)),
      ambil: teks(b.ambil, 200),
      destinasi: teks(b.destinasi, 200),
      jenis: b.jenis === 'pergi-balik' ? 'pergi-balik' : 'sehala',
      masaBalik: teks(b.masaBalik, 40),
      catatan: teks(b.catatan, 300),
    };
    const ralat = [];
    if (t.nama.length < 2) ralat.push('Nama diperlukan');
    if (!sahTelefon(t.telefon)) ralat.push('No. telefon tidak sah (contoh: 0123456789)');
    if (!t.ambil) ralat.push('Lokasi ambil diperlukan');
    if (!t.destinasi) ralat.push('Destinasi diperlukan');
    if (b.akuan !== true) ralat.push(`Sila sahkan anda penumpang ${d.penumpang}`);
    if (ralat.length) return res.status(400).json({ ralat: ralat.join('. ') });

    if (!slotMasihAda(d.id, t.tarikh, t.masa))
      return res.status(409).json({ ralat: 'Maaf, slot ini baru sahaja diambil atau sudah tidak tersedia. Sila pilih slot lain.' });
    const ganda = S.tempahan.find((x) => x.driver === d.id && x.telefon === t.telefon && x.tarikh === t.tarikh && AKTIF.includes(x.status));
    if (ganda) return res.status(409).json({ ralat: `Anda sudah ada tempahan pada hari ini (kod ${ganda.kod}).` });

    Object.assign(t, { kod: janaKod(d.prefix), driver: d.id, status: 'menunggu', dibuat: Date.now(), dikemaskini: Date.now(), ingatan: false });
    S.tempahan.push(t);
    await simpanT(t);
    hantarTempahanBaru(t);
    res.json({ ok: true, kod: t.kod, tarikh: M.paparTarikh(t.tarikh), masa: M.paparMasa(t.masa) });
  });

  const cariKod = (kod) => S.tempahan.find((x) => x.kod === String(kod).toUpperCase().trim());

  r.get('/api/prebook/status/:kod', (req, res) => {
    const t = cariKod(req.params.kod);
    if (!t) return res.status(404).json({ ralat: 'Kod tempahan tidak dijumpai' });
    res.json(ringkasAwam(t));
  });

  r.post('/api/prebook/batal/:kod', async (req, res) => {
    const t = cariKod(req.params.kod);
    if (!t || normalTelefon(req.body?.telefon) !== t.telefon) return res.status(404).json({ ralat: 'Kod atau no. telefon tidak sepadan' });
    if (!ringkasAwam(t).bolehBatal)
      return res.status(400).json({ ralat: `Tempahan hanya boleh dibatalkan sekurang-kurangnya ${C.BATAL_MIN_JAM} jam sebelum perjalanan. Sila hubungi driver.` });
    t.status = 'batal_pelanggan';
    t.dikemaskini = Date.now();
    await simpanT(t);
    kemaskiniMesej(t);
    hantar(t.driver, `🚫 <b>${t.kod}</b> dibatalkan oleh pelanggan (${esc(t.nama)}).\nSlot ${M.paparTarikh(t.tarikh)} ${M.paparMasa(t.masa)} kini kosong semula.`);
    res.json({ ok: true, ...ringkasAwam(t) });
  });

  app.use(r);
  mulaBot(app);
  muat().catch(() => {});
  setInterval(tugasBerkala, 60e3);
}

module.exports = { pasang };
