// ============================================================
// KAPSUL KATA MAJMUK (Mod 08) - PAUTAN DEMO PERIBADI (TANPA KATA LALUAN)
// ------------------------------------------------------------
// Untuk kawan guru cuba Mod 08 tanpa kata laluan Ilmuverse:
//     /kapsul-demo/<token>            -> skrin TV / PC
//     /kapsul-demo/<token>/telefon    -> telefon (dibuka melalui QR di TV)
//
// - Guna fail SAMA dengan Mod 08 sebenar (public/kapsul-skrin.html &
//   kapsul-telefon.html), cuma beberapa pautan ditukar semasa dihantar.
// - Pemegang pautan dapat kuki "demo" yang HANYA membenarkan aliran
//   imbasan Mod 08 (lihat jawapan, ambil gambar, semak di TV). Mereka
//   TIDAK boleh ubah jawapan / gambar 800x800 guru, dan TIDAK boleh buka
//   halaman lain Ilmuverse.
// - Bilik TV demo ditanda "demo". Telefon demo hanya boleh sambung ke
//   bilik demo, jadi tak boleh kawal skrin TV kelas sebenar.
// - Token salah -> 404.
//
// Tukar pautan (cth. jika tersebar): set env var KAPSUL_DEMO_TOKEN di
// Render. Pautan & kuki lama terus tidak berfungsi.
// ============================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.KAPSUL_DEMO_TOKEN || '6bagykhatn';
const COOKIE = 'ilmuverse_kapsul_demo';
const SESSION_MS = 12 * 60 * 60 * 1000;
const KEY = 'ilmuverse-kapsul-demo::' + TOKEN;
const DIR = path.join(__dirname, '../public');
const BASE = '/kapsul-demo/' + TOKEN;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const sign = (t) => crypto.createHmac('sha256', KEY).update(t).digest('hex');
function makeToken() { const t = Date.now().toString(36); return t + '.' + sign(t); }
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
// Kuki demo sah? (dipakai oleh routes/kapsulKataMajmuk.js)
function isDemo(req) {
  const v = readCookie(req, COOKIE), i = v.indexOf('.');
  if (i < 1) return false;
  const t = v.slice(0, i), issued = parseInt(t, 36);
  if (!Number.isFinite(issued) || Date.now() - issued > SESSION_MS || issued > Date.now() + 60000) return false;
  return safeEqual(v.slice(i + 1), sign(t));
}

// Tukar pautan dalam HTML asal supaya kekal dalam laluan demo.
function ganti(html, pasangan, fail) {
  for (const [a, b] of pasangan) {
    if (!html.includes(a)) console.warn(`[KAPSUL DEMO] ${fail}: teks tidak dijumpai -> ${a.slice(0, 60)}`);
    html = html.split(a).join(b);
  }
  return html;
}
const LABEL = '<div style="position:fixed;left:10px;bottom:10px;z-index:9999;background:#ffcf4a;color:#3b2a00;font:700 13px Fredoka,sans-serif;padding:5px 12px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none">MOD DEMO</div>';
const keLogMasukDemo = "function keLogMasuk() { toast('Sesi demo tamat. Memuat semula…', 3000); setTimeout(() => location.reload(), 1400); }";

function bina(fail) {
  let html = fs.readFileSync(path.join(DIR, fail), 'utf8');
  if (fail === 'kapsul-skrin.html') {
    html = ganti(html, [
      ["const LS = 'ilmuverseKapsulSkrin.v1';", "const LS = 'ilmuverseKapsulSkrin.demo.v1';"],
      ['`${location.origin}/kapsul-telefon.html?bilik=${sesi.kod}`', '`${location.origin}' + BASE + '/telefon?bilik=${sesi.kod}`'],
      ['&peranan=paparan&kunci=${sesi.kunci}`', '&peranan=paparan&kunci=${sesi.kunci}&demo=1`'],
      ['<a class="btn" href="/kapsul-kata-majmuk.html" title="Kembali">✕</a>', ''],
      ["toast('Sila log masuk semula di PC ini', 5000)", "toast('Sesi demo tamat. Muat semula halaman ini.', 5000)"],
    ], fail);
  } else {
    html = ganti(html, [
      ['<a class="ikonBtn" href="/kapsul-kata-majmuk.html" title="Urus jawapan">⚙️</a>', ''],
      ["function keLogMasuk() { toast('Sesi tamat. Sila log masuk semula.', 4000); setTimeout(() => location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search), 1400); }", keLogMasukDemo],
    ], fail);
  }
  return html.replace('</body>', LABEL + '\n</body>');
}

function pasang(app) {
  const hantar = (fail) => (req, res) => {
    if (!safeEqual(req.params.token, TOKEN)) return res.status(404).send('Halaman tidak dijumpai.');
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(COOKIE, makeToken(), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_MS });
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    });
    try { res.send(bina(fail)); } catch (e) { console.error('[KAPSUL DEMO]', e); res.status(500).send('Ralat memuatkan demo.'); }
  };
  app.get('/kapsul-demo/:token', hantar('kapsul-skrin.html'));
  app.get('/kapsul-demo/:token/telefon', hantar('kapsul-telefon.html'));
}

module.exports = { pasang, isDemo };
