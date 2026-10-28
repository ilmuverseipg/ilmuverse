// ============================================================
// STORAN - peratus penggunaan untuk cip kecil di bar atas guru.html
// ------------------------------------------------------------
// GET /api/storan  (perlu log masuk)
//   mongo  : (dataSize + indexSize) pangkalan data / kuota Atlas
//            (lalai 512 MB = had percuma M0; tukar dgn env MONGO_KUOTA_MB)
//   render : RAM proses Node (RSS) / had RAM instance Render
//            (lalai 512 MB = pelan Free; tukar dgn env RENDER_RAM_MB)
//   amaran : senarai amaran (>= 85% hampir penuh, >= 95% penuh)
// Nota: Render tidak beri cakera kekal pada pelan Free, jadi yang diukur
// ialah RAM. Keputusan Mongo di-cache 60 saat supaya ringan.
//
// Route lain boleh guna bacaStoran() / ramPenuh() / mongoPenuh() untuk
// menolak muat naik bila storan atau RAM pelayan penuh (HTTP 507).
// ============================================================
const mongoose = require('mongoose');
const { isAuthed } = require('../middleware/siteAuth');

const MB = 1024 * 1024;
const KUOTA_MONGO = (parseFloat(process.env.MONGO_KUOTA_MB) || 512) * MB;
const RAM_RENDER = (parseFloat(process.env.RENDER_RAM_MB) || 512) * MB;
const HAMPIR = 85, PENUH = 95;
let cache = { t: 0, mongo: null };

async function kemasMongo(paksa) {
  const now = Date.now();
  if (!paksa && now - cache.t < 60 * 1000) return cache.mongo;
  cache.t = now;
  try {
    if (mongoose.connection.readyState === 1) {
      const s = await mongoose.connection.db.stats();
      const guna = (s.dataSize || 0) + (s.indexSize || 0);
      cache.mongo = { guna, kuota: KUOTA_MONGO, peratus: Math.min(100, (guna / KUOTA_MONGO) * 100) };
    } else cache.mongo = null;
  } catch (e) { cache.mongo = null; }
  return cache.mongo;
}
const ram = () => { const rss = process.memoryUsage().rss; return { guna: rss, kuota: RAM_RENDER, peratus: Math.min(100, (rss / RAM_RENDER) * 100), diRender: !!process.env.RENDER }; };

async function bacaStoran() {
  const mongo = await kemasMongo(), render = ram(), amaran = [];
  if (mongo && mongo.peratus >= PENUH) amaran.push({ tahap: 'penuh', jenis: 'mongo', mesej: `Storan MongoDB PENUH (${Math.round(mongo.peratus)}%). Padam gambar 800×800 yang tidak digunakan di Mod 08 sebelum muat naik lagi.` });
  else if (mongo && mongo.peratus >= HAMPIR) amaran.push({ tahap: 'hampir', jenis: 'mongo', mesej: `Storan MongoDB hampir penuh (${Math.round(mongo.peratus)}%). Kurangkan muat naik gambar baharu.` });
  if (render.peratus >= PENUH) amaran.push({ tahap: 'penuh', jenis: 'render', mesej: `RAM pelayan Render PENUH (${Math.round(render.peratus)}%). Tutup skrin Kapsul/Sijil yang tidak digunakan atau tunggu sebentar.` });
  else if (render.peratus >= HAMPIR) amaran.push({ tahap: 'hampir', jenis: 'render', mesej: `RAM pelayan Render hampir penuh (${Math.round(render.peratus)}%). Gambar kamera mungkin gagal dihantar.` });
  return { mongo, render, amaran };
}
const ramPenuh = () => ram().peratus >= PENUH;
const mongoPenuh = async () => { const m = await kemasMongo(); return !!(m && m.peratus >= PENUH); };

function pasang(app) {
  app.get('/api/storan', async (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...(await bacaStoran()) });
  });
}

module.exports = pasang;
module.exports.bacaStoran = bacaStoran;
module.exports.ramPenuh = ramPenuh;
module.exports.mongoPenuh = mongoPenuh;
