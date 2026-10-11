const mongoose = require('mongoose');

// Model untuk ciri "Kotak Kuiz Magik" (ESP32, butang A/B, LED hijau/merah).
// Guru tetapkan bilangan soalan (1-5) dan jawapan betul (A/B) di
// /kuiz-esp32.html. ESP32 ambil konfigurasi ini SEKALI sahaja semasa mod
// setup (perlu internet), simpan dalam memori flash sendiri, kemudian boleh
// digunakan tanpa internet. Tiada kod peranti: satu konfigurasi tetap.
//
// Koleksi berasingan ('kuizesp32configs') - tidak sentuh model/koleksi lain.

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

const KuizEsp32ConfigSchema = new mongoose.Schema(
  {
    // Sistem tetap: hanya SATU konfigurasi untuk satu kotak. Medan ini sentiasa
    // 'utama' dan unik, supaya tidak boleh wujud dua dokumen.
    kunci: { type: String, default: 'utama', unique: true, immutable: true },
    tajuk: { type: String, default: '', trim: true, maxlength: 100 },
    soalan: {
      type: [KuizSoalanSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 5,
        message: 'Bilangan soalan mesti antara 1 hingga 5.',
      },
    },
    // Naik 1 setiap kali guru simpan. ESP32 simpan nombor ini supaya guru
    // boleh tahu peranti sudah ambil versi terkini.
    versi: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('KuizEsp32Config', KuizEsp32ConfigSchema);
