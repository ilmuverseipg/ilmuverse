// ============================================================
// KLINIK KATA MAJMUK - pautan "kembali" pintar
// ------------------------------------------------------------
// Bila guru masuk melalui /kata-majmuk.html (avatar di halaman log masuk),
// semua pautan kembali bertanda data-km-balik dihalakan ke hub Kata Majmuk,
// bukan ke halaman penuh Ilmuverse. Masuk ke guru.html memadam mod ini.
// ============================================================
(() => {
  const HUB = '/kata-majmuk.html';
  const p = location.pathname;
  let hidup = false;
  try {
    if (p === HUB) sessionStorage.setItem('km_hub', '1');
    else if (p === '/guru.html' || p === '/') sessionStorage.removeItem('km_hub');
    hidup = sessionStorage.getItem('km_hub') === '1';
  } catch (e) { hidup = false; }
  if (!hidup || p === HUB) return;
  const betulkan = () => document.querySelectorAll('a[data-km-balik]').forEach((a) => {
    a.href = HUB;
    a.title = 'Kembali ke Klinik Kata Majmuk';
    if (a.dataset.kmBalik) a.textContent = a.dataset.kmBalik;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', betulkan);
  else betulkan();
})();
