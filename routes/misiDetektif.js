// ============================================================
// MISI DETEKTIF INTEGRITI - PAUTAN PERIBADI (TANPA KATA LALUAN)
// ------------------------------------------------------------
// Halaman pemilihan kad situasi untuk kegunaan kawan guru sahaja.
// Dibuka melalui pautan rahsia:  /detektif/<token>
//
// - Fail HTML disimpan dlm private/ (BUKAN public/), jadi TIDAK boleh
//   dibuka melalui /misi-detektif.html atau mana-mana laluan lain.
// - Didaftarkan SEBELUM pintu kata laluan (middleware/siteAuth.js), jadi
//   pautan ini terus dibuka tanpa log masuk. Halaman lain Ilmuverse
//   masih dikunci seperti biasa - pemegang pautan ini tak boleh masuk.
// - Token salah -> 404 (tidak dedahkan apa-apa).
//
// Tukar pautan (cth. jika pautan tersebar): set env var
// MISI_DETEKTIF_TOKEN di Render. Pautan lama terus tidak berfungsi.
// ============================================================
const crypto = require('crypto');
const path = require('path');

const TOKEN = process.env.MISI_DETEKTIF_TOKEN || '7e1axbpdhg';
const FILE = path.join(__dirname, '../private/misi-detektif.html');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = function misiDetektif(app) {
  app.get('/detektif/:token', (req, res) => {
    if (!safeEqual(req.params.token, TOKEN)) return res.status(404).send('Halaman tidak dijumpai.');
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',   // jangan disenaraikan oleh Google
      'Referrer-Policy': 'no-referrer'       // pautan rahsia tidak bocor ke laman lain
    });
    res.sendFile(FILE);
  });
};
