const mongoose = require('mongoose');

// ============================================================
// KAPSUL KATA MAJMUK (Mod 08) - skema jawapan setiap kumpulan
// ------------------------------------------------------------
// Satu dokumen = satu kumpulan (1-6), setiap kumpulan ada 4 kapsul.
// Setiap kapsul: perkataan 1 + perkataan 2 = kata majmuk, dengan emoji
// sandaran. Gambar 800x800 (pilihan) disimpan dalam koleksi berasingan
// (KapsulGambar) supaya senarai set kekal ringan.
// Gambar KAMERA murid TIDAK disimpan di sini - hanya dalam memori server
// semasa aktiviti (lihat routes/kapsulKataMajmuk.js).
// ============================================================
const JawapanSchema = new mongoose.Schema(
  {
    k1: { type: String, default: '', trim: true, maxlength: 40 },
    k2: { type: String, default: '', trim: true, maxlength: 40 },
    km: { type: String, default: '', trim: true, maxlength: 80 },
    e1: { type: String, default: '', trim: true, maxlength: 16 },
    e2: { type: String, default: '', trim: true, maxlength: 16 },
    ek: { type: String, default: '', trim: true, maxlength: 16 },
    // versi gambar (0 = tiada) untuk setiap slot - dinaikkan bila guru muat naik
    g1: { type: Number, default: 0 },
    g2: { type: Number, default: 0 },
    gk: { type: Number, default: 0 },
  },
  { _id: false }
);

const KapsulSetSchema = new mongoose.Schema(
  {
    kumpulan: { type: Number, required: true, min: 1, max: 6, unique: true },
    nama: { type: String, default: '', trim: true, maxlength: 40 },
    jawapan: { type: [JawapanSchema], default: [] },
  },
  { timestamps: true }
);

const KapsulGambarSchema = new mongoose.Schema(
  {
    kunci: { type: String, required: true, unique: true }, // "<kumpulan>-<idx>-<slot>" cth "3-0-k"
    jenis: { type: String, default: 'image/jpeg' },
    data: { type: Buffer, required: true },
    v: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = {
  KapsulSet: mongoose.model('KapsulSet', KapsulSetSchema),
  KapsulGambar: mongoose.model('KapsulGambar', KapsulGambarSchema),
};
