const mongoose = require('mongoose');

// ============================================================
// SIJIL KELAHIRAN KATA MAJMUK (Mod 09) - jawapan setiap set
// ------------------------------------------------------------
// Satu dokumen = satu set/kumpulan (1-6). Setiap set ada 4 bahagian:
// perkataan 1 + perkataan 2 = kata majmuk (emoji), kad perkataan yang
// dicetak bercampur pada sijil (dipisah dengan "/") dan ayat yang betul.
// Gambar KAMERA sijil murid TIDAK disimpan di sini - memori sahaja.
// ============================================================
const BahagianSchema = new mongoose.Schema(
  {
    k1: { type: String, default: '', trim: true, maxlength: 40 },
    k2: { type: String, default: '', trim: true, maxlength: 40 },
    km: { type: String, default: '', trim: true, maxlength: 80 },
    e1: { type: String, default: '', trim: true, maxlength: 16 },
    e2: { type: String, default: '', trim: true, maxlength: 16 },
    ek: { type: String, default: '', trim: true, maxlength: 16 },
    kad: { type: String, default: '', trim: true, maxlength: 200 },  // susunan bercampur pada sijil, cth "memakai / sarung tangan. / Doktor"
    ayat: { type: String, default: '', trim: true, maxlength: 200 }, // ayat betul
  },
  { _id: false }
);

const SijilSetSchema = new mongoose.Schema(
  {
    kumpulan: { type: Number, required: true, min: 1, max: 6, unique: true },
    nama: { type: String, default: '', trim: true, maxlength: 40 },
    bahagian: { type: [BahagianSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = { SijilSet: mongoose.model('SijilSet', SijilSetSchema) };
