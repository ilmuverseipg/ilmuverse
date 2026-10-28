// ============================================================
// Gambar asal kata majmuk (public/img/km/<slug>.jpg|png|webp)
// Dikongsi oleh Kapsul (Mod 08) dan Sijil Kelahiran (Mod 09).
// slug: "kerusi roda" -> "kerusi-roda". Tiada fail -> '' (guna emoji).
// ============================================================
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../public/img/km');
let peta = new Map();
function imbas() {
  const m = new Map();
  try {
    for (const f of fs.readdirSync(DIR)) {
      const x = f.match(/^([a-z0-9-]+)\.(jpg|jpeg|png|webp)$/i); if (!x) continue;
      const st = fs.statSync(path.join(DIR, f));
      m.set(x[1].toLowerCase(), `/img/km/${f}?v=${Math.floor(st.mtimeMs / 1000) % 1e8}`);
    }
  } catch (e) {}
  peta = m;
}
imbas();
setInterval(imbas, 5 * 60 * 1000).unref();
const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
const urlGambar = (kata) => peta.get(slug(kata)) || '';
module.exports = { urlGambar, slug, imbas };
