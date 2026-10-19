// ============================================================
// MAHKAMAH MASA - TIMER DETEKTIF (PAUTAN PERIBADI, TANPA KATA LALUAN)
// ------------------------------------------------------------
// Pemasa bertema misteri: hakim bayangan hitam, detik jam, ketukan
// tukul 20 saat terakhir & muzik suspens. Dibuka melalui pautan rahsia:
//     /hakim/<token>
//
// - Fail HTML disimpan dlm private/ (BUKAN public/), jadi TIDAK boleh
//   dibuka melalui mana-mana laluan lain.
// - Didaftarkan SEBELUM pintu kata laluan (middleware/siteAuth.js), jadi
//   pautan ini terus dibuka tanpa log masuk. Halaman lain Ilmuverse
//   masih dikunci seperti biasa - pemegang pautan ini tak boleh masuk.
// - Token salah -> 404 (tidak dedahkan apa-apa).
//
// Tukar pautan (cth. jika pautan tersebar): set env var
// MAHKAMAH_MASA_TOKEN di Render. Pautan lama terus tidak berfungsi.
// ============================================================
const crypto = require('crypto');
const path = require('path');

const TOKEN = process.env.MAHKAMAH_MASA_TOKEN || 'h59qtjsggh';
const FILE = path.join(__dirname, '../private/mahkamah-masa.html');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = function mahkamahMasa(app) {
  app.get('/hakim/:token', (req, res) => {
    if (!safeEqual(req.params.token, TOKEN)) return res.status(404).send('Halaman tidak dijumpai.');
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer'
    });
    res.sendFile(FILE);
  });
};
