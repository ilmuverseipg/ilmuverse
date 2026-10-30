// ============================================================
// KM-TAJUK: skrin tajuk besar 2 saat setiap kali sistem Kata Majmuk dibuka
// (zoom masuk -> tahan -> zoom keluar ke dalam sistem).
//   Auto:  <script src="/km-tajuk.js" data-ik="💊" data-jen="SISTEM SEMAKAN"
//            data-nama="Semak Pantas Kapsul" data-lbl="LANGKAH 1" data-w="#e8434f"></script>
//          (tidak dipapar dalam mod embed - Klinik TV papar tajuknya sendiri)
//   Manual: KMTajuk.tunjuk({ ik, jen, nama, lbl, w }, selesai)
// ============================================================
(function () {
  const TEMPOH = 2000;
  let gaya = false, el = null, t = [];
  function pasangGaya() {
    if (gaya) return; gaya = true;
    const s = document.createElement('style');
    s.textContent = `
#kmTajuk { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; overflow: hidden; color: #fff; text-align: center;
  background: radial-gradient(circle at 50% 45%, var(--kmt, #0d9488) 0%, #04121c 74%); font-family: 'Inter', system-ui, sans-serif; }
#kmTajuk.keluar { animation: kmtLatar .45s ease-in forwards; }
#kmTajuk .kmt-isi { animation: kmtMasuk .55s cubic-bezier(.15,1.25,.35,1) both; }
#kmTajuk.keluar .kmt-isi { animation: kmtKeluar .45s cubic-bezier(.6,0,.9,.4) forwards; }
#kmTajuk .kmt-cin { position: absolute; inset: -20%; background: repeating-conic-gradient(from 0deg, rgba(255,255,255,.07) 0 6deg, transparent 6deg 18deg); animation: kmtPusing 6s linear infinite; }
#kmTajuk .kmt-ik { font-size: 15vh; line-height: 1; filter: drop-shadow(0 1.5vh 3vh rgba(0,0,0,.45)); animation: kmtLompat .5s .5s ease-in-out infinite alternate; }
#kmTajuk .kmt-jen { margin-top: 2.2vh; font-weight: 800; font-size: 3.1vh; letter-spacing: .9vh; color: #ffd23f; }
#kmTajuk .kmt-nm { font-family: 'Baloo 2', 'Inter', system-ui, sans-serif; font-weight: 800; font-size: 11vh; line-height: 1.05; margin: .5vh 3vw 0; text-shadow: 0 1vh 3vh rgba(0,0,0,.45); }
#kmTajuk .kmt-lb { display: inline-block; margin-top: 2vh; padding: .8vh 2vw; border-radius: 99px; background: rgba(255,255,255,.16); border: .25vh solid rgba(255,255,255,.4); font-weight: 800; font-size: 2.4vh; letter-spacing: .3vh; }
#kmTajuk .kmt-bar { position: relative; width: min(520px, 46vw); height: .9vh; margin: 3.6vh auto 0; border-radius: 99px; background: rgba(255,255,255,.18); overflow: hidden; }
#kmTajuk .kmt-bar i { position: absolute; inset: 0; background: #ffd23f; transform-origin: left; animation: kmtBar ${TEMPOH - 450}ms linear both; }
@keyframes kmtMasuk { from { transform: scale(.25); opacity: 0; filter: blur(10px); } to { transform: none; opacity: 1; filter: none; } }
@keyframes kmtKeluar { to { transform: scale(3.2); opacity: 0; filter: blur(8px); } }
@keyframes kmtLatar { to { opacity: 0; } }
@keyframes kmtPusing { to { transform: rotate(360deg); } }
@keyframes kmtLompat { from { transform: translateY(0) rotate(-5deg) scale(1); } to { transform: translateY(-1.6vh) rotate(5deg) scale(1.06); } }
@keyframes kmtBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { #kmTajuk *, #kmTajuk { animation-duration: .01s !important; } }`;
    document.head.appendChild(s);
  }
  function bunyi() {
    try {
      const KS = window.KMSuara, a = KS && KS.audio && KS.audio();
      if (!a || a.state !== 'running') return;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(), s = a.currentTime + i * .08;
        o.type = 'triangle'; o.frequency.setValueAtTime(f, s);
        g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.11, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .32);
        o.connect(g).connect(KS.keluaran ? KS.keluaran() : a.destination); o.start(s); o.stop(s + .36);
      });
    } catch (e) {}
  }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function tutup() { t.forEach(clearTimeout); t = []; if (el) { el.remove(); el = null; } }
  function tunjuk(L, selesai) {
    pasangGaya(); tutup();
    if (!L) return;
    el = document.createElement('div'); el.id = 'kmTajuk';
    el.style.setProperty('--kmt', L.w || '#0d9488');
    el.innerHTML = `<div class="kmt-cin"></div><div class="kmt-isi"><div class="kmt-ik">${esc(L.ik)}</div>${L.jen ? `<div class="kmt-jen">${esc(L.jen)}</div>` : ''}<div class="kmt-nm">${esc(L.nama)}</div>${L.lbl ? `<div class="kmt-lb">${esc(L.lbl)}</div>` : ''}<div class="kmt-bar"><i></i></div></div>`;
    el.addEventListener('click', () => { tutup(); selesai && selesai(); }); // klik untuk langkau
    document.body.appendChild(el); bunyi();
    t.push(setTimeout(() => el && el.classList.add('keluar'), TEMPOH - 450));
    t.push(setTimeout(() => { tutup(); selesai && selesai(); }, TEMPOH));
  }
  window.KMTajuk = { tunjuk, tutup, TEMPOH };
  // auto (halaman sistem dibuka terus, bukan dalam Klinik TV)
  const sk = document.currentScript;
  if (sk && sk.dataset.nama && !/[?&]embed=1/.test(location.search)) {
    const L = { ik: sk.dataset.ik, jen: sk.dataset.jen, nama: sk.dataset.nama, lbl: sk.dataset.lbl, w: sk.dataset.w };
    const mula = () => tunjuk(L);
    if (document.body) mula(); else document.addEventListener('DOMContentLoaded', mula);
  }
})();
