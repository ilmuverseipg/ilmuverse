const mongoose = require('mongoose');

// [TEMPAHAN DRIVER] Tetapan setiap driver: jadual mingguan, tarikh ditutup,
// chat ID Telegram, kunci Panel Driver, profil (nama/telefon/kereta) dan
// gambar kereta (base64, dimampatkan di telefon sebelum dimuat naik).
const PrebookTetapanSchema = new mongoose.Schema(
  {
    driver: { type: String, required: true, unique: true },
    jadual: { type: mongoose.Schema.Types.Mixed, default: {} },
    tutup: { type: [String], default: [] },
    chatId: { type: String, default: '' },
    aktif: { type: Boolean, default: true },
    panelKey: { type: String, default: '' },
    profil: {
      nama: { type: String, default: '' },
      telefon: { type: String, default: '' },
      kereta: { type: String, default: '' },
      warna: { type: String, default: '' },
      plat: { type: String, default: '' },
    },
    gambar: {
      data: { type: String, default: '' }, // base64 tanpa awalan data:
      jenis: { type: String, default: '' }, // image/jpeg | image/png | image/webp
      versi: { type: Number, default: 0 },
    },
  },
  { versionKey: false, minimize: false }
);

module.exports = mongoose.model('PrebookTetapan', PrebookTetapanSchema);
