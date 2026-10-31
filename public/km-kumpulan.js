/* ==================================================================
   KM-KUMPULAN - nama & gambar 6 kumpulan (dikongsi semua sistem kata majmuk)
   KMKumpulan.nama(g)    -> nama kumpulan g (0..5) untuk paparan & SUARA
   KMKumpulan.gambar(g)  -> URL gambar kumpulan, atau '' jika tiada
   KMKumpulan.jumlah     -> mata terkini [6]
   KMKumpulan.onChange(fn) -> dipanggil bila nama / gambar / mata berubah
   Data dari /api/kelas, dimuat semula setiap 12 saat (dan serta-merta bila
   skrin Klinik memberitahu ada perubahan).
   ================================================================== */
(() => {
  'use strict';
  if (window.KMKumpulan) return;
  const ASAL = (g) => ['HELANG', 'MERAK', 'NURI', 'GARUDA', 'GAGAK', 'ENGGANG'][g] || 'Kumpulan ' + (g + 1);
  const K = { data: null, versi: 0, jumlah: [0, 0, 0, 0, 0, 0], WARNA: ['#ff5a6a', '#48a8ff', '#3ddc84', '#ffd23f', '#b38cff', '#ff9a3d'] };
  const pendengar = [];
  K.nama = (g) => (K.data && K.data.kumpulan && K.data.kumpulan[g] && K.data.kumpulan[g].nama) || ASAL(g);
  K.gambar = (g) => { const k = K.data && K.data.kumpulan && K.data.kumpulan[g]; return k && k.gv ? `/api/kelas/gambar/${g}?v=${k.gv}` : ''; };
  K.onChange = (fn) => { pendengar.push(fn); if (K.data) { try { fn(K); } catch (e) {} } };
  let sedang = null;
  K.muat = () => {
    if (sedang) return sedang;
    sedang = fetch('/api/kelas', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.ok) return;
        const berubah = !K.data || j.versi !== K.versi || JSON.stringify(j.kumpulan) !== JSON.stringify(K.data.kumpulan);
        K.data = j; K.versi = j.versi; K.jumlah = j.jumlah || K.jumlah;
        if (berubah) pendengar.forEach((fn) => { try { fn(K); } catch (e) {} });
      })
      .catch(() => {})
      .finally(() => { sedang = null; });
    return sedang;
  };
  K.muat();
  setInterval(K.muat, 12000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') K.muat(); });
  window.KMKumpulan = K;
})();
