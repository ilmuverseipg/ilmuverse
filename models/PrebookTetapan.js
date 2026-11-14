const mongoose = require('mongoose');

// [TEMPAHAN DRIVER] Tetapan setiap driver: jadual mingguan, tarikh ditutup
// dan chat ID Telegram (didaftarkan bila driver tekan /start pada bot).
const PrebookTetapanSchema = new mongoose.Schema(
  {
    driver: { type: String, required: true, unique: true },
    jadual: { type: mongoose.Schema.Types.Mixed, default: {} },
    tutup: { type: [String], default: [] },
    chatId: { type: String, default: '' },
  },
  { versionKey: false, minimize: false }
);

module.exports = mongoose.model('PrebookTetapan', PrebookTetapanSchema);
