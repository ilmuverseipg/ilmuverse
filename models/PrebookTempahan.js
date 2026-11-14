const mongoose = require('mongoose');

// [TEMPAHAN DRIVER] Satu dokumen = satu tempahan pelanggan.
// Koleksi berasingan ('prebooktempahans') - tidak sentuh model/koleksi lain.
const PrebookTempahanSchema = new mongoose.Schema(
  {
    kod: { type: String, required: true, unique: true },
    driver: { type: String, enum: ['perempuan', 'lelaki'], required: true, index: true },
    status: { type: String, default: 'menunggu' },
    nama: String,
    telefon: String,
    tarikh: { type: String, index: true }, // YYYY-MM-DD (waktu Malaysia)
    masa: String, // HH:MM
    penumpang: Number,
    ambil: String,
    destinasi: String,
    jenis: String,
    masaBalik: String,
    catatan: String,
    dibuat: Number,
    dikemaskini: Number,
    ingatan: { type: Boolean, default: false },
    tgMsgId: Number,
  },
  { versionKey: false }
);

module.exports = mongoose.model('PrebookTempahan', PrebookTempahanSchema);
