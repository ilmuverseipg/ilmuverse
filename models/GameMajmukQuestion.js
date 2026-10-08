const mongoose = require('mongoose');

// Mod Kata Majmuk (Ilmuverse GameBox) - soalan BERGAMBAR: "Gambar 1 + Gambar 2
// = ?" dan murid cubit & seret SATU daripada 3 pilihan jawapan ke kotak.
// Soalan tetap "Apakah Kata Majmuk Ini?" (tidak disimpan - dipaparkan oleh
// permainan sendiri).
//
// Disimpan dalam KOLEKSI BERASINGAN (bukan dibenam dalam GameLessonSet) sebab
// setiap soalan bawa 2 gambar 800x800 (base64) - kalau dibenam, satu topik
// dengan banyak soalan boleh melepasi had 16MB satu dokumen MongoDB, dan
// senarai topik (skrin pilih misi) akan jadi berat untuk dimuatkan.
const MajmukOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true }, // cth: "buku teks"
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const GameMajmukQuestionSchema = new mongoose.Schema(
  {
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameLessonSet', required: true, index: true },
    order: { type: Number, default: 0 },
    // data URI JPEG 800x800 (diubah saiz di Panel Guru sebelum dimuat naik)
    gambar1: { type: String, required: true },
    gambar2: { type: String, required: true },
    options: {
      type: [MajmukOptionSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 3 && v.filter((o) => o.correct).length === 1,
        message: 'Soalan Kata Majmuk perlukan tepat 3 pilihan dengan SATU sahaja ditanda betul.',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GameMajmukQuestion', GameMajmukQuestionSchema);
