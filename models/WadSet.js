const mongoose = require('mongoose');

// ============================================================
// WAD KECEMASAN (Mod 10) - soalan Suntikan Kata Majmuk
// ------------------------------------------------------------
// SATU dokumen sahaja (kunci: 'utama'): semua kumpulan dapat soalan sama.
// Setiap soalan: maksud + perkataan 1 + perkataan 2 = kata majmuk (+ emoji).
// ============================================================
const SoalanSchema = new mongoose.Schema(
  {
    maksud: { type: String, default: '', trim: true, maxlength: 140 },
    k1: { type: String, default: '', trim: true, maxlength: 40 },
    k2: { type: String, default: '', trim: true, maxlength: 40 },
    km: { type: String, default: '', trim: true, maxlength: 80 },
    e1: { type: String, default: '', trim: true, maxlength: 16 },
    e2: { type: String, default: '', trim: true, maxlength: 16 },
    ek: { type: String, default: '', trim: true, maxlength: 16 },
  },
  { _id: false }
);

const WadSetSchema = new mongoose.Schema(
  {
    kunci: { type: String, default: 'utama', unique: true },
    kumpulan: { type: [String], default: [] }, // nama 6 kumpulan
    soalan: { type: [SoalanSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = { WadSet: mongoose.model('WadSet', WadSetSchema) };
