const mongoose = require('mongoose');

// Model untuk ciri "Kotak Kuiz Magik" (ESP32, butang A/B, LED hijau/merah).
// Guru tetapkan bilangan soalan (1-5) dan jawapan betul (A/B) di
// /kuiz-esp32.html. ESP32 ambil konfigurasi ini SEKALI sahaja semasa mod
// setup (perlu internet), simpan dalam memori flash sendiri, kemudian boleh
// digunakan tanpa internet.
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
    // Kod peranti: rahsia kecil yang sama dalam kod ESP32 dan di laman web.
    kod: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[A-Za-z0-9_-]{4,32}$/, 'Kod peranti mesti 4-32 aksara: huruf, nombor, _ atau -.'],
    },
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
