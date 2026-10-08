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
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ingat peranti selama 30 hari

// Token = HMAC(kata laluan) - berubah sendiri bila kata laluan ditukar,
// jadi semua peranti lama perlu log masuk semula.
const TOKEN = crypto.createHmac('sha256', SECRET).update(PASSWORD).digest('hex');

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
function isAuthed(req) { return safeEqual(readCookie(req, COOKIE), TOKEN); }

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
    res.cookie(COOKIE, TOKEN, { httpOnly: true, sameSite: 'lax', secure, maxAge: MAX_AGE_MS, path: '/' });
    res.json({ ok: true, next: safeNext(req.body && req.body.next) });
  });

  app.get('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.redirect('/login.html');
  });

  app.get(['/login', '/login.html'], (req, res) => {
    if (isAuthed(req)) return res.redirect(safeNext(req.query.next));
    res.sendFile(loginFile);
  });

  // Pintu: halaman HTML & root perlu kebenaran; aset (css/js/model) & API dibiarkan.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    const isPage = p === '/' || p.endsWith('/') || p.toLowerCase().endsWith('.html');
    if (!isPage || isAuthed(req)) return next();
    res.set('Cache-Control', 'no-store');
    res.redirect('/login.html?next=' + encodeURIComponent(req.originalUrl));
  });
}

module.exports = siteAuth;
