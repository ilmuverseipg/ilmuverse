const express = require('express');
const router = express.Router();
const KuizEsp32Config = require('../models/KuizEsp32Config');
const { isAuthed } = require('../middleware/siteAuth');

// API untuk "Kotak Kuiz Magik" (ESP32). Dipasang di /api/kuiz-esp32.
// Sistem tetap: hanya satu konfigurasi (tiada kod peranti).
//
//  GET /peranti   AWAM, teks biasa, untuk ESP32. Contoh balasan:
//                   KUIZ1 5 ABABA 12
//                 (penanda, bilangan soalan, jawapan betul, versi)
//  GET /config    Perlu log masuk tapak. Konfigurasi penuh untuk laman guru.
//  PUT /config    Perlu log masuk tapak. Simpan konfigurasi (versi naik 1).
//
// Laluan /api/* tidak dikunci oleh siteAuth, jadi GET/PUT config disemak di sini
// guna kuki log masuk yang sama dengan halaman .html.

const KUNCI = 'utama';

function perluLogin(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Perlu log masuk tapak dahulu.' });
}

router.get('/peranti', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain');
  try {
    const doc = await KuizEsp32Config.findOne({ kunci: KUNCI }).lean();
    if (!doc) return res.status(404).send('TIADA');
    const jawapan = doc.soalan.map((s) => s.betul).join('');
    res.send(`KUIZ1 ${doc.soalan.length} ${jawapan} ${doc.versi}`);
  } catch (err) {
    res.status(500).send('RALAT_PELAYAN');
  }
});

router.get('/config', perluLogin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const doc = await KuizEsp32Config.findOne({ kunci: KUNCI }).lean();
    if (!doc) return res.status(404).json({ error: 'Belum ada konfigurasi.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Gagal baca konfigurasi.', detail: err.message });
  }
});

router.put('/config', perluLogin, async (req, res) => {
  const { tajuk, soalan } = req.body || {};
  if (!Array.isArray(soalan) || soalan.length < 1 || soalan.length > 5) {
    return res.status(400).json({ error: 'Bilangan soalan mesti antara 1 hingga 5.' });
  }
  for (const s of soalan) {
    if (!s || (s.betul !== 'A' && s.betul !== 'B')) {
      return res.status(400).json({ error: 'Setiap soalan mesti ada jawapan betul A atau B.' });
    }
  }
  try {
    let doc = await KuizEsp32Config.findOne({ kunci: KUNCI });
    if (!doc) doc = new KuizEsp32Config({ kunci: KUNCI, versi: 0 });
    doc.tajuk = typeof tajuk === 'string' ? tajuk : '';
    doc.soalan = soalan.map((s) => ({
      teks: s.teks || '',
      pilihanA: s.pilihanA || '',
      pilihanB: s.pilihanB || '',
      betul: s.betul,
    }));
    doc.versi += 1;
    await doc.save();
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: 'Gagal simpan konfigurasi.', detail: err.message });
  }
});

module.exports = router;
