const multer = require('multer');

// Guna memory storage - fail disimpan sementara dalam RAM (buffer),
// kemudian ditukar terus ke base64 dan disimpan DALAM MongoDB.
// Ini memastikan gambar KEKAL walaupun server Render restart/redeploy,
// sebab gambar bukan lagi disimpan atas cakera server (yang bersifat sementara).
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(file.originalname.toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error('Hanya fail imej dibenarkan (jpg, png, gif, webp)'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 4 * 1024 * 1024 } // 4MB (selamat untuk simpan dalam MongoDB)
});

// Tukar fail (buffer) yang diupload kepada base64 data URI untuk disimpan dalam DB
function toDataUri(file) {
  if (!file) return '';
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

// Muat naik templat Excel (.xlsx) - guna utk ciri "Import Excel" Ilmuverse
// Gamebox (Panel Guru), supaya guru boleh tambah banyak perkataan/soalan
// sekali gus drpd taip satu-satu. Disemak ikut sambungan fail (bukan
// mime-type sahaja, sebab sesetengah browser hantar mime generik utk xlsx).
const xlsxFileFilter = (req, file, cb) => {
  const extOk = /\.xlsx$/i.test(file.originalname || '');
  if (extOk) return cb(null, true);
  cb(new Error('Hanya fail Excel (.xlsx) dibenarkan'));
};

const uploadXlsx = multer({
  storage,
  fileFilter: xlsxFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB - cukup besar utk ratusan baris
});

module.exports = upload;
module.exports.toDataUri = toDataUri;
module.exports.uploadXlsx = uploadXlsx;
