// ============================================================
// KAUNTER LAPAR - GEGANTI (RELAY) WEBSOCKET TELEFON <-> SKRIN
// ------------------------------------------------------------
// Skrin laptop (public/kaunter-lapar.html) sambung ke
//   /kaunter?bilik=1234&peranan=paparan
// Telefon guru (public/kaunter-alat.html) sambung ke
//   /kaunter?bilik=1234&peranan=alat
// Telefon hantar {jenis:'arahan'} -> diteruskan ke skrin dalam bilik sama.
// Skrin hantar {jenis:'keadaan'} -> disimpan & diteruskan ke semua telefon.
// Tiada data disimpan dalam MongoDB; bilik hilang bila semua putus.
// ============================================================
const WebSocket = require('ws');

const bilik = new Map(); // kod -> { paparan:Set, alat:Set, keadaan:Object|null }
const ARAHAN = new Set(['mula', 'kumpulan', 'jeda', 'menu']);

function dapatBilik(kod) {
  let b = bilik.get(kod);
  if (!b) { b = { paparan: new Set(), alat: new Set(), keadaan: null }; bilik.set(kod, b); }
  return b;
}
function hantar(set, obj) {
  const m = JSON.stringify(obj);
  set.forEach((w) => { if (w.readyState === WebSocket.OPEN) { try { w.send(m); } catch (e) {} } });
}
function kemasBilangan(b) {
  hantar(b.paparan, { jenis: 'bilangan', alat: b.alat.size });
  hantar(b.alat, { jenis: 'bilangan', paparan: b.paparan.size });
}

function sambung(ws, url) {
  const q = new URL(url, 'http://x').searchParams;
  const kod = String(q.get('bilik') || '').replace(/\D/g, '').slice(0, 6);
  const peranan = q.get('peranan') === 'alat' ? 'alat' : 'paparan';
  if (kod.length < 4) { try { ws.close(4000, 'kod bilik tidak sah'); } catch (e) {} return; }
  ws._kaunter = { kod, peranan };
  const b = dapatBilik(kod);
  b[peranan].add(ws);
  if (peranan === 'alat' && b.keadaan) ws.send(JSON.stringify({ jenis: 'keadaan', data: b.keadaan }));
  kemasBilangan(b);
}

function mesej(ws, data) {
  const k = ws._kaunter; if (!k || !data) return;
  const b = dapatBilik(k.kod);
  if (k.peranan === 'paparan' && data.jenis === 'keadaan' && data.data && JSON.stringify(data.data).length < 6000) {
    b.keadaan = data.data;
    hantar(b.alat, { jenis: 'keadaan', data: b.keadaan });
  } else if (k.peranan === 'alat' && data.jenis === 'arahan' && ARAHAN.has(data.a)) {
    const i = Math.max(0, Math.min(5, parseInt(data.i, 10) || 0));
    const masa = Math.max(0, Math.min(600, parseInt(data.masa, 10) || 0));
    hantar(b.paparan, { jenis: 'arahan', a: data.a, i, masa });
  }
}

function putus(ws) {
  const k = ws._kaunter; if (!k) return;
  const b = bilik.get(k.kod); if (!b) return;
  b[k.peranan].delete(ws);
  kemasBilangan(b);
  if (!b.paparan.size && !b.alat.size) bilik.delete(k.kod);
}

module.exports = { sambung, mesej, putus };
