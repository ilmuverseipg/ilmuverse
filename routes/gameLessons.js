const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { uploadXlsx } = require('../middleware/upload');
const GameLessonSet = require('../models/GameLessonSet');

// API untuk ciri "Game Arab" - kandungan pelajaran (topik + perkataan)
// boleh diedit di /game-arab-admin.html, disimpan dalam MongoDB yang sama
// dengan Sistem Ganjaran BM (koleksi berasingan: gamelessonsets).

// Bungkus multer (uploadXlsx) supaya ralat fileFilter/had saiz (cth: fail
// bukan .xlsx, fail terlalu besar) pulangkan JSON 400 yang kemas - bukan
// crash 500 mentah (multer panggil next(err) terus ke Express sebaliknya).
function handleXlsxUpload(req, res, next) {
  uploadXlsx.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Gagal muat naik fail.' });
    next();
  });
}

// GET /api/game-lessons - senarai ringkas semua set pelajaran (skrin pilih misi)
router.get('/', async (req, res) => {
  try {
    const lessons = await GameLessonSet.find({}, 'name description words tembakQuestions').sort({ createdAt: 1 });
    const summary = lessons.map((l) => ({
      _id: l._id,
      name: l.name,
      description: l.description,
      wordCount: l.words.length,
      tembakQuestionCount: l.tembakQuestions.length,
    }));
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Gagal ambil senarai pelajaran.', detail: err.message });
  }
});

// GET /api/game-lessons/:id - satu set pelajaran penuh (termasuk semua perkataan)
router.get('/:id', async (req, res) => {
  try {
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'ID tidak sah.', detail: err.message });
  }
});

// POST /api/game-lessons - cipta set pelajaran baharu
router.post('/', async (req, res) => {
  try {
    const { name, description, words } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nama set pelajaran diperlukan.' });
    const lesson = await GameLessonSet.create({ name: name.trim(), description: description || '', words: words || [] });
    res.status(201).json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal cipta set pelajaran.', detail: err.message });
  }
});

// PUT /api/game-lessons/:id - kemaskini nama/penerangan set pelajaran
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description;
    const lesson = await GameLessonSet.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal kemaskini set pelajaran.', detail: err.message });
  }
});

// DELETE /api/game-lessons/:id - padam keseluruhan set pelajaran
router.delete('/:id', async (req, res) => {
  try {
    const lesson = await GameLessonSet.findByIdAndDelete(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Gagal padam set pelajaran.', detail: err.message });
  }
});

// POST /api/game-lessons/:id/words - tambah satu perkataan baharu dalam set
router.post('/:id/words', async (req, res) => {
  try {
    const { melayu, arab, icon } = req.body;
    if (!melayu || !arab) return res.status(400).json({ error: 'Perkataan Melayu dan Arab diperlukan.' });
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    lesson.words.push({ melayu: melayu.trim(), arab: arab.trim(), icon: (icon || '📦').trim() });
    await lesson.save();
    res.status(201).json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal tambah perkataan.', detail: err.message });
  }
});

// PUT /api/game-lessons/:id/words/reorder - susun semula URUTAN perkataan
// (ciri seret & lepas / drag di Panel Guru). Body: { order: [wordId, ...] } -
// mesti ada SEMUA id perkataan sedia ada dalam topik ini (tiada tambah/buang
// di sini, cuma tukar urutan). Didaftarkan SEBELUM laluan ':wordId' di bawah
// supaya "reorder" tidak tersilap dipadan sebagai satu ID perkataan.
router.put('/:id/words/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || !order.length) return res.status(400).json({ error: 'Senarai urutan diperlukan.' });
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    const byId = new Map(lesson.words.map((w) => [String(w._id), w]));
    if (order.length !== byId.size || order.some((wid) => !byId.has(String(wid)))) {
      return res.status(400).json({ error: 'Senarai urutan tidak sepadan dengan perkataan sedia ada.' });
    }
    lesson.words = order.map((wid) => byId.get(String(wid)));
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal susun semula perkataan.', detail: err.message });
  }
});

// PUT /api/game-lessons/:id/words/:wordId - edit satu perkataan
router.put('/:id/words/:wordId', async (req, res) => {
  try {
    const { melayu, arab, icon } = req.body;
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    const word = lesson.words.id(req.params.wordId);
    if (!word) return res.status(404).json({ error: 'Perkataan tidak dijumpai.' });
    if (melayu !== undefined) word.melayu = melayu.trim();
    if (arab !== undefined) word.arab = arab.trim();
    if (icon !== undefined) word.icon = icon.trim();
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal kemaskini perkataan.', detail: err.message });
  }
});

// DELETE /api/game-lessons/:id/words/:wordId - padam satu perkataan
router.delete('/:id/words/:wordId', async (req, res) => {
  try {
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    lesson.words.id(req.params.wordId).deleteOne();
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal padam perkataan.', detail: err.message });
  }
});

// POST /api/game-lessons/:id/words/import-xlsx - import pukal (bulk) drpd
// fail Excel (.xlsx) templat "templat-perkataan.xlsx" (lajur: Perkataan,
// Maksud, Ikon). Lebih laju drpd taip satu-satu bila soalan/perkataan
// banyak. Baris 1 dianggap header & dilangkau; baris kosong dilangkau.
router.post('/:id/words/import-xlsx', handleXlsxUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Sila pilih fail Excel (.xlsx).' });
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });

    let rows;
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Fail Excel tidak sah/rosak. Sila guna templat yang disediakan.' });
    }

    let added = 0, skipped = 0;
    rows.slice(1).forEach((row) => { // baris 1 = header, dilangkau
      const melayu = String(row[0] || '').trim();
      const arab = String(row[1] || '').trim();
      const icon = String(row[2] || '').trim() || '📦';
      if (!melayu || !arab) { skipped++; return; }
      lesson.words.push({ melayu, arab, icon });
      added++;
    });

    if (added === 0) {
      return res.status(400).json({ error: 'Tiada baris sah dijumpai. Pastikan lajur Perkataan & Maksud diisi (ikut templat).' });
    }
    await lesson.save();
    res.status(201).json({ added, skipped, lesson });
  } catch (err) {
    res.status(400).json({ error: 'Gagal import fail Excel.', detail: err.message });
  }
});

// ------------------------------------------------------------------
// SOALAN TEMBAK (Mod Tembak A/B/C) - tempat edit BERASINGAN drpd "words".
// Setiap soalan ada 3 pilihan (options[0..2] = label A/B/C ikut turutan)
// dengan tepat SATU ditanda correct:true.
// ------------------------------------------------------------------

function validateOptions(options) {
  if (!Array.isArray(options) || options.length !== 3) return 'Perlukan tepat 3 pilihan (A/B/C).';
  if (options.some((o) => !o || !String(o.text || '').trim())) return 'Semua 3 pilihan mesti diisi.';
  if (options.filter((o) => o.correct).length !== 1) return 'Tandakan SATU sahaja pilihan yang betul.';
  return null;
}

// POST /api/game-lessons/:id/tembak-questions - tambah satu Soalan Tembak
router.post('/:id/tembak-questions', async (req, res) => {
  try {
    const { soalan, options } = req.body;
    if (!soalan || !soalan.trim()) return res.status(400).json({ error: 'Soalan diperlukan.' });
    const optErr = validateOptions(options);
    if (optErr) return res.status(400).json({ error: optErr });
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    lesson.tembakQuestions.push({
      soalan: soalan.trim(),
      options: options.map((o) => ({ text: o.text.trim(), correct: !!o.correct })),
    });
    await lesson.save();
    res.status(201).json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal tambah Soalan Tembak.', detail: err.message });
  }
});

// PUT /api/game-lessons/:id/tembak-questions/reorder - susun semula URUTAN
// Soalan Tembak (ciri seret & lepas / drag di Panel Guru). Body:
// { order: [qId, ...] } - mesti ada SEMUA id soalan sedia ada dalam topik
// ini. Didaftarkan SEBELUM laluan ':qId' di bawah atas sebab yang sama
// seperti reorder perkataan di atas.
router.put('/:id/tembak-questions/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || !order.length) return res.status(400).json({ error: 'Senarai urutan diperlukan.' });
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    const byId = new Map(lesson.tembakQuestions.map((q) => [String(q._id), q]));
    if (order.length !== byId.size || order.some((qid) => !byId.has(String(qid)))) {
      return res.status(400).json({ error: 'Senarai urutan tidak sepadan dengan soalan sedia ada.' });
    }
    lesson.tembakQuestions = order.map((qid) => byId.get(String(qid)));
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal susun semula Soalan Tembak.', detail: err.message });
  }
});

// PUT /api/game-lessons/:id/tembak-questions/:qId - edit satu Soalan Tembak
router.put('/:id/tembak-questions/:qId', async (req, res) => {
  try {
    const { soalan, options } = req.body;
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    const q = lesson.tembakQuestions.id(req.params.qId);
    if (!q) return res.status(404).json({ error: 'Soalan Tembak tidak dijumpai.' });
    if (options !== undefined) {
      const optErr = validateOptions(options);
      if (optErr) return res.status(400).json({ error: optErr });
      q.options = options.map((o) => ({ text: o.text.trim(), correct: !!o.correct }));
    }
    if (soalan !== undefined) {
      if (!soalan.trim()) return res.status(400).json({ error: 'Soalan diperlukan.' });
      q.soalan = soalan.trim();
    }
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal kemaskini Soalan Tembak.', detail: err.message });
  }
});

// DELETE /api/game-lessons/:id/tembak-questions/:qId - padam satu Soalan Tembak
router.delete('/:id/tembak-questions/:qId', async (req, res) => {
  try {
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });
    lesson.tembakQuestions.id(req.params.qId).deleteOne();
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: 'Gagal padam Soalan Tembak.', detail: err.message });
  }
});

// POST /api/game-lessons/:id/tembak-questions/import-xlsx - import pukal drpd
// fail Excel (.xlsx) templat "templat-soalan-tembak.xlsx" (lajur: Soalan,
// Pilihan A, Pilihan B, Pilihan C, Jawapan Betul (A/B/C)). Baris 1 = header,
// dilangkau. Baris yang tak lengkap/jawapan tak sah dilangkau & disenaraikan
// dalam ralat supaya guru tahu baris mana perlu dibetulkan.
router.post('/:id/tembak-questions/import-xlsx', handleXlsxUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Sila pilih fail Excel (.xlsx).' });
    const lesson = await GameLessonSet.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Set pelajaran tidak dijumpai.' });

    let rows;
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Fail Excel tidak sah/rosak. Sila guna templat yang disediakan.' });
    }

    const letters = ['A', 'B', 'C'];
    let added = 0;
    const rowErrors = [];

    rows.slice(1).forEach((row, idx) => {
      const excelRowNum = idx + 2; // +2 sebab baris 1 = header (1-based utk guru)
      const soalan = String(row[0] || '').trim();
      const optTexts = [String(row[1] || '').trim(), String(row[2] || '').trim(), String(row[3] || '').trim()];
      const jawapan = String(row[4] || '').trim().toUpperCase();

      if (!soalan && optTexts.every((t) => !t) && !jawapan) return; // baris kosong - senyap langkau

      if (!soalan) { rowErrors.push(`Baris ${excelRowNum}: Soalan kosong.`); return; }
      if (optTexts.some((t) => !t)) { rowErrors.push(`Baris ${excelRowNum}: Pilihan A/B/C mesti diisi semua.`); return; }
      if (!letters.includes(jawapan)) { rowErrors.push(`Baris ${excelRowNum}: Jawapan Betul mesti A, B atau C (dapat "${row[4] || ''}").`); return; }

      const options = letters.map((letter, i) => ({ text: optTexts[i], correct: letter === jawapan }));
      const optErr = validateOptions(options);
      if (optErr) { rowErrors.push(`Baris ${excelRowNum}: ${optErr}`); return; }

      lesson.tembakQuestions.push({ soalan, options });
      added++;
    });

    if (added === 0) {
      return res.status(400).json({ error: 'Tiada baris sah dijumpai.', rowErrors });
    }
    await lesson.save();
    res.status(201).json({ added, rowErrors, lesson });
  } catch (err) {
    res.status(400).json({ error: 'Gagal import fail Excel.', detail: err.message });
  }
});

module.exports = router;
