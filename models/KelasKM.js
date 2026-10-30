const mongoose = require('mongoose');

// ============================================================
// KELAS KATA MAJMUK - 6 kumpulan (nama, gambar) + rekod mata aktiviti
// ------------------------------------------------------------
// SATU dokumen (kunci: 'utama'). Mata dikira daripada senarai rekod:
// setiap aktiviti menulis satu rekod (id unik) yang boleh diganti jika
// guru menyemak semula, jadi mata tidak berganda.
// Gambar kumpulan disimpan berasingan (KelasGambar) supaya dokumen ringan.
// ============================================================
const RekodSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: '' },
    mata: { type: [Number], default: [0, 0, 0, 0, 0, 0] },
    t: { type: Number, default: 0 },
  },
  { _id: false }
);
const KelasKMSchema = new mongoose.Schema(
  {
    kunci: { type: String, default: 'utama', unique: true },
    nama: { type: [String], default: [] },
    gv: { type: [Number], default: [0, 0, 0, 0, 0, 0] }, // versi gambar (0 = tiada)
    rekod: { type: [RekodSchema], default: [] },
  },
  { timestamps: true }
);
const KelasGambarSchema = new mongoose.Schema(
  {
    g: { type: Number, required: true, unique: true },
    data: Buffer,
    type: { type: String, default: 'image/jpeg' },
    v: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = {
  KelasKM: mongoose.model('KelasKM', KelasKMSchema),
  KelasGambar: mongoose.model('KelasGambar', KelasGambarSchema),
};
