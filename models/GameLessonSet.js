const mongoose = require('mongoose');

// Model untuk ciri "Game Arab" (Cyber Sky Arabic - permainan pengesanan
// tangan untuk kosa kata Bahasa Arab). Diasingkan namanya (GameLessonSet)
// daripada model sedia ada (Class, Student, Group, dll) supaya tidak
// bercampur dengan data Sistem Ganjaran BM, walaupun guna MongoDB yang sama.

// Satu perkataan dalam senarai kosa kata - digunakan oleh Mod Padan & Mod
// Isyarat Jari (pasangan/padanan automatik dijana oleh permainan sendiri).
const GameWordSchema = new mongoose.Schema(
  {
    melayu: { type: String, required: true, trim: true }, // cth: "Penyapu"
    arab: { type: String, required: true, trim: true }, // cth: "مِكْنَسَة"
    icon: { type: String, default: '📦', trim: true }, // emoji/ikon ringkas untuk drone
  },
  { _id: true, timestamps: false }
);

// Satu pilihan jawapan (A/B/C) bagi satu Soalan Tembak
const TembakOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

// Satu Soalan Tembak (Mod Tembak A/B/C) - guru taip sendiri soalan & 3
// pilihan jawapan (tandakan yang mana betul). Berasingan drpd "words" sebab
// mod ini perlukan kawalan penuh guru ke atas kandungan setiap pilihan,
// bukan dijana rawak drpd senarai perkataan.
const TembakQuestionSchema = new mongoose.Schema(
  {
    soalan: { type: String, required: true, trim: true }, // cth: "Apakah maksud 'قِطَّة'?"
    options: {
      type: [TembakOptionSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 3 && v.filter((o) => o.correct).length === 1,
        message: 'Soalan Tembak perlukan tepat 3 pilihan (A/B/C) dengan SATU sahaja ditanda betul.',
      },
    },
  },
  { _id: true, timestamps: false }
);

// Satu set/topik pelajaran (cth: "Alatan Bilik Darjah", "Haiwan", "Warna")
const GameLessonSetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    // Tiada had bilangan soalan/perkataan - guru boleh tambah seberapa banyak
    // yang diperlukan untuk satu topik/aktiviti.
    // "words" - dipakai oleh Mod Padan & Mod Isyarat Jari sahaja.
    words: {
      type: [GameWordSchema],
      default: [],
    },
    // "tembakQuestions" - dipakai oleh Mod Tembak (A/B/C) sahaja, tempat
    // edit BERASINGAN drpd "words" di Panel Guru.
    tembakQuestions: {
      type: [TembakQuestionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GameLessonSet', GameLessonSetSchema);
