// ============================================================
// ILMUVERSE - PINTU KATA LALUAN TAPAK
// ------------------------------------------------------------
// Semua HALAMAN (.html dan '/') perlu kata laluan dahulu.
// Kata laluan disemak di SERVER sahaja - tidak pernah dihantar ke pelayar,
// jadi tidak boleh dilihat melalui "View Source".
//
// Laluan /api/* dan WebSocket TIDAK dikunci supaya ESP32 / pembaca NFC /
// kamera yang sedia ada terus berfungsi seperti biasa.
//
// Tukar kata laluan: set env var SITE_PASSWORD di Render (fallback: 'pokdeng').
// ============================================================
const crypto = require('crypto');
const path = require('path');

const PASSWORD = process.env.SITE_PASSWORD || 'pokdeng';
const SECRET = process.env.SITE_AUTH_SECRET || ('ilmuverse-site::' + PASSWORD);
const COOKIE = 'ilmuverse_akses';
// Kuki SESI sahaja (tiada maxAge) + had 12 jam di server. Tambahan pula,
// SETIAP KALI orang MASUK ke laman (taip alamat, buka link luar, bookmark,
// tab baharu) kata laluan diminta semula walaupun kuki masih sah - lihat
// isFreshEntry(). Kuki cuma membenarkan bertukar halaman DI DALAM laman.
const SESSION_MS = 12 * 60 * 60 * 1000;

// Token = "<masa dikeluarkan>.<HMAC>" - HMAC berubah sendiri bila kata
// laluan ditukar, jadi semua sesi lama terus tidak sah.
function sign(issued) { return crypto.createHmac('sha256', SECRET).update(PASSWORD + ':' + issued).digest('hex'); }
function makeToken() { const t = Date.now().toString(36); return t + '.' + sign(t); }

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function isAuthed(req) {
  const v = readCookie(req, COOKIE), i = v.indexOf('.');
  if (i < 1) return false;
  const t = v.slice(0, i), issued = parseInt(t, 36);
  if (!Number.isFinite(issued) || Date.now() - issued > SESSION_MS || issued > Date.now() + 60000) return false;
  return safeEqual(v.slice(i + 1), sign(t));
}

// Adakah permintaan ini "masuk dari luar" (bukan klik pautan dalam laman)?
// Pelayar moden hantar Sec-Fetch-Site: 'same-origin' bila navigasi datang
// dari halaman Ilmuverse sendiri; 'none' = taip alamat / bookmark / tab baharu;
// 'cross-site' = link dari WhatsApp, Google, dll. Pelayar lama tanpa header
// ini -> semak Referer hos yang sama.
function isFreshEntry(req) {
  const sfs = req.headers['sec-fetch-site'];
  if (sfs) return sfs !== 'same-origin';
  const ref = req.headers.referer || '';
  try { return new URL(ref).host !== req.headers.host; } catch (e) { return true; }
}

// Hanya benarkan redirect ke laluan dalaman (elak open-redirect).
function safeNext(n) {
  return (typeof n === 'string' && /^\/(?!\/)[^\s\\]*$/.test(n) && !n.startsWith('/login')) ? n : '/guru.html';
}

// Percubaan salah dihadkan (per IP) supaya tak boleh diteka secara pukal.
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), a = attempts.get(ip);
  if (!a || now - a.t > 10 * 60 * 1000) return false;
  return a.n >= 10;
}
function noteFail(ip) {
  const now = Date.now(), a = attempts.get(ip);
  if (!a || now - a.t > 10 * 60 * 1000) attempts.set(ip, { n: 1, t: now });
  else a.n++;
}

function siteAuth(app) {
  const loginFile = path.join(__dirname, '../public/login.html');

  app.post('/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (tooMany(ip)) return res.status(429).json({ ok: false, mesej: 'Terlalu banyak cubaan. Cuba lagi selepas 10 minit.' });
    const pw = (req.body && typeof req.body.password === 'string') ? req.body.password : '';
    if (!safeEqual(pw, PASSWORD)) {
      noteFail(ip);
      return res.status(401).json({ ok: false, mesej: 'Kata laluan salah.' });
    }
    attempts.delete(ip);
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(COOKIE, makeToken(), { httpOnly: true, sameSite: 'lax', secure, path: '/' }); // kuki sesi
    res.json({ ok: true, next: safeNext(req.body && req.body.next) });
  });

  app.get('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.redirect('/login.html');
  });

  app.get(['/login', '/login.html'], (req, res) => {
    // Sentiasa papar halaman kata laluan (walaupun sudah log masuk) - setiap kemasukan mesti log masuk.
    res.set('Cache-Control', 'no-store');
    res.sendFile(loginFile);
  });

  // Pintu: halaman HTML & root perlu kebenaran; aset (css/js/model) & API dibiarkan.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    const isPage = p === '/' || p.endsWith('/') || p.toLowerCase().endsWith('.html');
    if (!isPage) return next();
    res.set('Cache-Control', 'no-store'); // jangan simpan halaman dalam cache pelayar
    if (isAuthed(req) && !isFreshEntry(req)) return next();
    res.redirect('/login.html?next=' + encodeURIComponent(req.originalUrl));
  });
}

module.exports = siteAuth;
// Dieksport supaya route API yang perlu dikunci (cth. routes/kuizEsp32.js) boleh semak kuki log masuk.
module.exports.isAuthed = isAuthed;
