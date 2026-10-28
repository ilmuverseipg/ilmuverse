/* ==================================================================
   KM-AMARAN - amaran storan / pelayan penuh (MongoDB & RAM Render)
   Semak /api/storan semasa dibuka dan setiap 3 minit. Jika >= 85%
   (hampir penuh) atau >= 95% (penuh), papar jalur amaran di atas skrin.
   Guru boleh tutup jalur (✕); ia muncul semula jika tahap bertambah.
   ================================================================== */
(() => {
  'use strict';
  const tutup = new Set();
  let el = null;
  function jalur() {
    if (el) return el;
    el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99999;max-width:min(760px,94vw);display:none;gap:10px;align-items:flex-start;padding:12px 14px 12px 16px;border-radius:14px;font:600 15px/1.4 Fredoka,system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.25);';
    document.body.appendChild(el);
    return el;
  }
  function papar(amaran) {
    const e = jalur(), baru = amaran.filter((a) => !tutup.has(a.jenis + a.tahap));
    if (!baru.length) { e.style.display = 'none'; return; }
    const penuh = baru.some((a) => a.tahap === 'penuh');
    e.style.background = penuh ? '#c8283a' : '#f59e0b'; e.style.color = penuh ? '#fff' : '#1f2937';
    e.innerHTML = '<span style="font-size:20px;line-height:1">' + (penuh ? '⛔' : '⚠️') + '</span><div style="flex:1">' +
      baru.map((a) => a.mesej.replace(/[<>&]/g, '')).join('<br>') + '</div><button type="button" title="Tutup" style="border:0;background:rgba(0,0,0,.15);color:inherit;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer">✕</button>';
    e.style.display = 'flex';
    e.querySelector('button').onclick = () => { baru.forEach((a) => tutup.add(a.jenis + a.tahap)); e.style.display = 'none'; };
  }
  async function semak() {
    try { const r = await fetch('/api/storan', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); papar(j.amaran || []); } catch (e) {}
  }
  const mula = () => { semak(); setInterval(semak, 3 * 60 * 1000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mula); else mula();
  window.KMAmaran = { semak };
})();
