// ============================================================
// KM-NAMA: edit nama 6 kumpulan dari mana-mana sistem Kata Majmuk.
// Nama dikongsi oleh semua sistem (KMKumpulan / /api/kelas). Susunan
// Kumpulan 1..6 = Set 1..6 (Kapsul, Sijil, Pemasa, Galeri, Papan Mata).
//   <script src="/km-nama.js" data-auto="header"></script>
//     -> butang "✏️ Kumpulan" dimasukkan ke dalam <header> (tidak dalam mod embed)
//   KMNama.buka()  -> buka tetingkap edit
// ============================================================
(function () {
  const sk = document.currentScript;
  let gaya = false;
  function pasangGaya() {
    if (gaya) return; gaya = true;
    const s = document.createElement('style');
    s.textContent = `
.kmnBtn { margin-left: auto; flex: none; border: 0; border-radius: 999px; background: #ffd23f; color: #102030; font: inherit; font-weight: 800; font-size: 13px; padding: 7px 12px; cursor: pointer; white-space: nowrap; }
.kmnBtn + .btnTamatT { margin-left: 6px !important; }
#kmnLapis { position: fixed; inset: 0; z-index: 9998; background: rgba(4,14,24,.72); display: flex; align-items: flex-end; justify-content: center; font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; }
#kmnLapis .kmnKad { width: min(520px, 100%); max-height: 92vh; overflow: auto; background: #fff; color: #13334c; border-radius: 22px 22px 0 0; padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -10px 40px rgba(0,0,0,.35); animation: kmnNaik .3s ease both; }
@media (min-width: 700px) { #kmnLapis { align-items: center; } #kmnLapis .kmnKad { border-radius: 22px; } }
@keyframes kmnNaik { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
#kmnLapis h3 { margin: 0 0 2px; font-size: 22px; font-weight: 800; }
#kmnLapis p { margin: 0 0 12px; color: #5b7184; font-size: 13.5px; line-height: 1.4; }
#kmnLapis .kmnBaris { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
#kmnLapis .kmnNo { flex: none; width: 66px; white-space: nowrap; border-radius: 12px; color: #fff; font-weight: 800; font-size: 13px; text-align: center; padding: 6px 4px; line-height: 1.1; }
#kmnLapis .kmnNo small { display: block; font-weight: 600; font-size: 11px; opacity: .92; }
#kmnLapis input { flex: 1; min-width: 0; font: inherit; font-size: 18px; font-weight: 700; padding: 10px 12px; border: 2px solid #cfe1ea; border-radius: 12px; color: #13334c; }
#kmnLapis input:focus { outline: none; border-color: #14a394; }
#kmnLapis .kmnTindak { display: grid; grid-template-columns: 1fr 1.6fr; gap: 10px; margin-top: 14px; }
#kmnLapis .kmnTindak button { border: 0; border-radius: 999px; padding: 14px; font: inherit; font-weight: 800; font-size: 16px; cursor: pointer; }
#kmnLapis .kmnBatal { background: #e8f1f5; color: #13334c; }
#kmnLapis .kmnSimpan { background: #14a394; color: #fff; box-shadow: 0 5px 0 #0b6b61; }
#kmnLapis .kmnRalat { color: #dc2626; font-weight: 700; font-size: 13px; min-height: 18px; margin-top: 8px; }`;
    document.head.appendChild(s);
  }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WARNA = () => (window.KMKumpulan && window.KMKumpulan.WARNA) || ['#ff5a6a', '#48a8ff', '#3ddc84', '#ffd23f', '#b38cff', '#ff9a3d'];
  async function namaKini() {
    try { const r = await fetch('/api/kelas', { cache: 'no-store' }); const j = await r.json(); if (j && Array.isArray(j.kumpulan)) return j.kumpulan.map((k) => k.nama); } catch (e) {}
    return [0, 1, 2, 3, 4, 5].map((g) => (window.KMKumpulan ? window.KMKumpulan.nama(g) : ['HELANG', 'MERAK', 'NURI', 'GARUDA', 'GAGAK', 'ENGGANG'][g]));
  }
  async function buka() {
    pasangGaya();
    if (document.getElementById('kmnLapis')) return;
    const nama = await namaKini(), W = WARNA();
    const d = document.createElement('div'); d.id = 'kmnLapis';
    d.innerHTML = `<div class="kmnKad" role="dialog" aria-label="Nama kumpulan"><h3>✏️ Nama kumpulan</h3>
      <p>Susunan ikut set: nama pertama = Set 1, nama kedua = Set 2 dan seterusnya. Nama ini digunakan oleh <b>semua sistem</b>.</p>
      ${[0, 1, 2, 3, 4, 5].map((g) => `<div class="kmnBaris"><span class="kmnNo" style="background:${W[g]}">Set ${g + 1}</span><input data-g="${g}" maxlength="30" value="${esc(nama[g] || '')}" placeholder="Nama kumpulan"></div>`).join('')}
      <div class="kmnRalat" id="kmnRalat"></div>
      <div class="kmnTindak"><button class="kmnBatal" id="kmnBatal">Batal</button><button class="kmnSimpan" id="kmnSimpan">💾 Simpan nama</button></div></div>`;
    document.body.appendChild(d);
    const tutup = () => d.remove();
    d.addEventListener('click', (e) => { if (e.target === d) tutup(); });
    d.querySelector('#kmnBatal').onclick = tutup;
    d.querySelector('#kmnSimpan').onclick = async () => {
      const b = d.querySelector('#kmnSimpan'); b.disabled = true; b.textContent = 'Menyimpan…';
      const n = [...d.querySelectorAll('input')].map((i) => i.value.trim());
      try {
        const r = await fetch('/api/kelas/nama', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama: n }) });
        if (r.status === 401) throw new Error('Sesi tamat. Log masuk semula.');
        if (!r.ok) throw new Error('Gagal menyimpan (' + r.status + ')');
        if (window.KMKumpulan && window.KMKumpulan.muat) await window.KMKumpulan.muat();
        // muat semula nama dalam sistem yang dibuka di dalam bingkai (Klinik)
        document.querySelectorAll('iframe').forEach((f) => { try { const w = f.contentWindow; w && w.KMKumpulan && w.KMKumpulan.muat(); } catch (e) {} });
        tutup();
      } catch (e) { d.querySelector('#kmnRalat').textContent = e.message || 'Gagal menyimpan'; b.disabled = false; b.textContent = '💾 Simpan nama'; }
    };
  }
  window.KMNama = { buka };
  // butang automatik dalam <header>
  if (sk && sk.dataset.auto && !/[?&]embed=1/.test(location.search)) {
    const pasang = () => {
      pasangGaya();
      const h = document.querySelector(sk.dataset.auto); if (!h || h.querySelector('.kmnBtn')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kmnBtn'; b.textContent = '✏️ Kumpulan'; b.title = 'Edit nama kumpulan';
      b.onclick = buka;
      const tamat = h.querySelector('.btnTamatT'); if (tamat) h.insertBefore(b, tamat); else h.appendChild(b);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang); else pasang();
  }
})();
