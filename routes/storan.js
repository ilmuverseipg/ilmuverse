// ============================================================
// STORAN - peratus penggunaan untuk cip kecil di bar atas guru.html
// ------------------------------------------------------------
// GET /api/storan  (perlu log masuk)
//   mongo  : (dataSize + indexSize) pangkalan data / kuota Atlas
//            (lalai 512 MB = had percuma M0; tukar dgn env MONGO_KUOTA_MB)
//   render : RAM proses Node (RSS) / had RAM instance Render
//            (lalai 512 MB = pelan Free; tukar dgn env RENDER_RAM_MB)
// Nota: Render tidak beri cakera kekal pada pelan Free, jadi yang diukur
// ialah RAM. Keputusan Mongo di-cache 60 saat supaya ringan.
// ============================================================
const mongoose = require('mongoose');
const { isAuthed } = require('../middleware/siteAuth');

const MB = 1024 * 1024;
const KUOTA_MONGO = (parseFloat(process.env.MONGO_KUOTA_MB) || 512) * MB;
const RAM_RENDER = (parseFloat(process.env.RENDER_RAM_MB) || 512) * MB;
let cache = { t: 0, mongo: null };

module.exports = function storan(app) {
  app.get('/api/storan', async (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false });
    res.set('Cache-Control', 'no-store');
    const now = Date.now();
    if (now - cache.t > 60 * 1000) {
      cache.t = now;
      try {
        if (mongoose.connection.readyState === 1) {
          const s = await mongoose.connection.db.stats();
          const guna = (s.dataSize || 0) + (s.indexSize || 0);
          cache.mongo = { guna, kuota: KUOTA_MONGO, peratus: Math.min(100, (guna / KUOTA_MONGO) * 100) };
        } else cache.mongo = null;
      } catch (e) { cache.mongo = null; }
    }
    const rss = process.memoryUsage().rss;
    res.json({
      ok: true,
      mongo: cache.mongo,
      render: { guna: rss, kuota: RAM_RENDER, peratus: Math.min(100, (rss / RAM_RENDER) * 100), diRender: !!process.env.RENDER },
    });
  });
};
