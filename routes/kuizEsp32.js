const express = require('express');
const router = express.Router();
const KuizEsp32Config = require('../models/KuizEsp32Config');
const { isAuthed } = require('../middleware/siteAuth');

// API untuk "Kotak Kuiz Magik" (ESP32). Dipasang di /api/kuiz-esp32.
// Sistem tetap: satu konfigurasi, mengandungi 3 set soalan.
//
//  GET /peranti   AWAM, teks biasa, untuk ESP32 (firmware v11 ke atas):
//                   KUIZ2 <versi> <n1> <jaw1> <n2> <jaw2> <n3> <jaw3>
//                 cth: "KUIZ2 14 5 ABABA 3 BBA 0 -"
//                 (n = bilangan soalan set itu, jaw = jawapan betul, '-' jika kosong)
//  GET /config    Perlu log masuk tapak. Konfigurasi penuh untuk laman guru.
//  PUT /config    Perlu log masuk tapak. Simpan 3 set (versi naik 1).
//
// Laluan /api/* tidak dikunci oleh siteAuth, jadi GET/PUT config disemak di sini
// guna kuki log masuk yang sama dengan halaman .html.

const KUNCI = 'utama';
const BIL_SET = 3;
const MAKS_SOALAN = 5;

function perluLogin(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Perlu log masuk tapak dahulu.' });
}

function setKosong() {
  return { tajuk: '', soalan: [] };
}

// Pulangkan 3 set daripada dokumen. Dokumen lama (sebelum 3 set) dipindah:
// soalan lama jadi Set 1, Set 2 dan 3 kosong.
function ambilSets(doc) {
  if (Array.isArray(doc.sets) && doc.sets.length === BIL_SET) {
    return doc.sets.map((s) => ({ tajuk: s.tajuk || '', soalan: s.soalan || [] }));
  }
  const sets = [setKosong(), setKosong(), setKosong()];
  if (Array.isArray(doc.soalan) && doc.soalan.length) {
    sets[0] = { tajuk: doc.tajuk || '', soalan: doc.soalan };
  }
  return sets;
}

function bersih(s) {
  return {
    teks: (s && s.teks) || '',
    pilihanA: (s && s.pilihanA) || '',
    pilihanB: (s && s.pilihanB) || '',
    betul: s.betul,
  };
}

router.get('/peranti', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain');
  try {
    const doc = await KuizEsp32Config.findOne({ kunci: KUNCI }).lean();
    if (!doc) return res.status(404).send('TIADA');
    const bahagian = ambilSets(doc).map((s) => {
      const n = s.soalan.length;
      return `${n} ${n ? s.soalan.map((q) => q.betul).join('') : '-'}`;
    });
    res.send(`KUIZ2 ${doc.versi} ${bahagian.join(' ')}`);
  } catch (err) {
    res.status(500).send('RALAT_PELAYAN');
  }
});

router.get('/config', perluLogin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const doc = await KuizEsp32Config.findOne({ kunci: KUNCI }).lean();
    if (!doc) return res.status(404).json({ error: 'Belum ada konfigurasi.' });
    res.json({ sets: ambilSets(doc), versi: doc.versi, updatedAt: doc.updatedAt });
  } catch (err) {
    res.status(500).json({ error: 'Gagal baca konfigurasi.', detail: err.message });
  }
});

router.put('/config', perluLogin, async (req, res) => {
  const { sets } = req.body || {};
  if (!Array.isArray(sets) || sets.length !== BIL_SET) {
    return res.status(400).json({ error: 'Mesti hantar tepat 3 set.' });
  }
  let jumlah = 0;
  for (let i = 0; i < BIL_SET; i++) {
    const s = sets[i];
    if (!s || !Array.isArray(s.soalan) || s.soalan.length > MAKS_SOALAN) {
      return res.status(400).json({ error: `Set ${i + 1}: bilangan soalan mesti 0 hingga 5.` });
    }
    for (const q of s.soalan) {
      if (!q || (q.betul !== 'A' && q.betul !== 'B')) {
        return res.status(400).json({ error: `Set ${i + 1}: setiap soalan mesti ada jawapan betul A atau B.` });
      }
    }
    jumlah += s.soalan.length;
  }
  if (jumlah === 0) {
    return res.status(400).json({ error: 'Sekurang-kurangnya satu set mesti ada soalan.' });
  }
  try {
    let doc = await KuizEsp32Config.findOne({ kunci: KUNCI });
    if (!doc) doc = new KuizEsp32Config({ kunci: KUNCI, versi: 0 });
    doc.sets = sets.map((s) => ({
      tajuk: typeof s.tajuk === 'string' ? s.tajuk : '',
      soalan: s.soalan.map(bersih),
    }));
    // Buang medan lama supaya tiada dua sumber data.
    doc.soalan = undefined;
    doc.tajuk = '';
    doc.versi = (doc.versi || 0) + 1;
    await doc.save();
    res.json({ sets: ambilSets(doc.toObject()), versi: doc.versi, updatedAt: doc.updatedAt });
  } catch (err) {
    res.status(400).json({ error: 'Gagal simpan konfigurasi.', detail: err.message });
  }
});

module.exports = router;
