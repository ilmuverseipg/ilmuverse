// ============================================================
// Gambar asal kata majmuk (public/img/km/<slug>.jpg|png|webp)
// Dikongsi oleh Kapsul (Mod 08) dan Sijil Kelahiran (Mod 09).
// slug: "kerusi roda" -> "kerusi-roda". Tiada fail -> '' (guna emoji).
// ============================================================
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../public/img/km');
const DIR_GALERI = path.join(__dirname, '../public/img/galeri'); // gambar khas Galeri Bukti (diutamakan)
let peta = new Map(), petaGaleri = new Map();
function imbasDir(dir, web) {
  const m = new Map();
  try {
    for (const f of fs.readdirSync(dir)) {
      const x = f.match(/^([a-z0-9-]+)\.(jpg|jpeg|png|webp)$/i); if (!x) continue;
      const st = fs.statSync(path.join(dir, f));
      m.set(x[1].toLowerCase(), `${web}/${f}?v=${Math.floor(st.mtimeMs / 1000) % 1e8}`);
    }
  } catch (e) {}
  return m;
}
function imbas() { peta = imbasDir(DIR, '/img/km'); petaGaleri = imbasDir(DIR_GALERI, '/img/galeri'); }
imbas();
setInterval(imbas, 5 * 60 * 1000).unref();
const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
const urlGambar = (kata) => peta.get(slug(kata)) || '';
const urlGaleri = (kata) => petaGaleri.get(slug(kata)) || urlGambar(kata);
module.exports = { urlGambar, urlGaleri, slug, imbas };
