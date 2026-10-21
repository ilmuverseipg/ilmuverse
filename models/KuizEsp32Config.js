const mongoose = require('mongoose');

// Model untuk ciri "Kotak Kuiz Magik" (ESP32, butang A/B, LED hijau/merah).
// Guru tetapkan sehingga 3 SET soalan di /kuiz-esp32.html. Setiap set ada
// 0-5 soalan (0 = set tidak digunakan) dengan jawapan betul A/B.
// ESP32 ambil semua set SEKALI semasa segerak WiFi, simpan dalam memori flash,
// kemudian boleh digunakan tanpa internet. Di kotak, tahan butang D23 / D25 /
// D26 selama 3 saat untuk masuk (atau reset) Set 1 / Set 2 / Set 3.
//
// Koleksi berasingan ('kuizesp32configs') - tidak sentuh model/koleksi lain.

const BIL_SET = 3;
const MAKS_SOALAN = 5;

const KuizSoalanSchema = new mongoose.Schema(
  {
    // Teks di bawah hanya rujukan guru di laman web (ESP32 tak terima teks).
    teks: { type: String, default: '', trim: true, maxlength: 300 },
    pilihanA: { type: String, default: '', trim: true, maxlength: 150 },
    pilihanB: { type: String, default: '', trim: true, maxlength: 150 },
    // Jawapan betul - satu-satunya data soalan yang dihantar ke ESP32.
    betul: { type: String, enum: ['A', 'B'], required: true },
  },
  { _id: false }
);

const KuizSetSchema = new mongoose.Schema(
  {
    tajuk: { type: String, default: '', trim: true, maxlength: 100 },
    soalan: {
      type: [KuizSoalanSchema],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length <= MAKS_SOALAN,
        message: 'Setiap set maksimum 5 soalan.',
      },
    },
  },
  { _id: false }
);

const KuizEsp32ConfigSchema = new mongoose.Schema(
  {
    // Sistem tetap: hanya SATU konfigurasi untuk satu kotak.
    kunci: { type: String, default: 'utama', unique: true, immutable: true },
    // 3 set soalan (indeks 0 = Set 1 / butang D23, 1 = Set 2 / D25, 2 = Set 3 / D26).
    sets: {
      type: [KuizSetSchema],
      default: undefined,
      validate: {
        validator: (v) => v == null || (Array.isArray(v) && v.length === BIL_SET),
        message: 'Mesti ada tepat 3 set.',
      },
    },
    // Medan lama (sebelum ada 3 set). Hanya dibaca untuk dipindah ke Set 1.
    tajuk: { type: String, default: '', trim: true, maxlength: 100 },
    soalan: { type: [KuizSoalanSchema], default: undefined },
    // Naik 1 setiap kali guru simpan.
    versi: { type: Number, default: 0 },
  },
  { timestamps: true }
);

KuizEsp32ConfigSchema.statics.BIL_SET = BIL_SET;
KuizEsp32ConfigSchema.statics.MAKS_SOALAN = MAKS_SOALAN;

module.exports = mongoose.model('KuizEsp32Config', KuizEsp32ConfigSchema);
