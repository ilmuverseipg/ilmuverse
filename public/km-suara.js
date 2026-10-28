/* ==================================================================
   KM-SUARA - suara Bahasa Melayu MALAYSIA + muzik latar lembut
   Dikongsi oleh Kapsul Kata Majmuk (Mod 08) & Sijil Kelahiran (Mod 09).

   SUARA: hanya guna suara ms-MY (contoh Microsoft "Yasmin"/"Osman" dalam
   Edge, atau suara Google Melayu pada Android). Suara Bahasa Indonesia
   (id-ID) TIDAK digunakan langsung. Jika tiada suara Melayu Malaysia,
   suara dimatikan dan guru diberi amaran (cadang guna Microsoft Edge).

   MUZIK: muzik sintesis lembut (marimba + pad) yang diperlahankan secara
   automatik (ducking) setiap kali suara bercakap, supaya suara jelas.
   Guru boleh muat naik lagu sendiri (disimpan dalam pelayar ini sahaja).
   ================================================================== */
(() => {
  'use strict';
  const K = { suara: null, adaSuara: false, muzikHidup: false, vol: 0.075, _amaran: false };
  let ac = null, master = null, muzikGain = null, jadualT = null, bcakap = 0, laguEl = null;

  // ---------------- AUDIO ----------------
  K.audio = () => {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 1; master.connect(ac.destination);
        muzikGain = ac.createGain(); muzikGain.gain.value = 0; muzikGain.connect(master);
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  };
  K.keluaran = () => (K.audio(), master);

  // ---------------- SUARA MELAYU MALAYSIA ----------------
  function markah(v) {
    const l = String(v.lang || '').replace('_', '-').toLowerCase(), n = String(v.name || '').toLowerCase();
    if (l.startsWith('id') || /indones/.test(n)) return -1;               // tolak Bahasa Indonesia
    let s = -1;
    if (l === 'ms-my') s = 50; else if (l.startsWith('ms')) s = 40; else if (/malay|melayu/.test(n)) s = 30;
    if (s < 0) return -1;
    if (/yasmin|osman/.test(n)) s += 20;                                   // suara Microsoft Malaysia
    if (/natural|online|neural/.test(n)) s += 10;
    if (/google/.test(n)) s += 5;
    return s;
  }
  function pilihSuara() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    let best = null, bs = -1;
    vs.forEach((v) => { const m = markah(v); if (m > bs) { bs = m; best = v; } });
    K.suara = bs >= 0 ? best : null; K.adaSuara = !!K.suara;
    K._cb && K._cb(K);
  }
  if ('speechSynthesis' in window) { pilihSuara(); speechSynthesis.onvoiceschanged = pilihSuara; setTimeout(pilihSuara, 1500); }
  K.onSuara = (f) => { K._cb = f; f(K); };

  // Pembetulan sebutan kecil supaya bunyi Melayu Malaysia (Johor-Riau)
  const SEBUT = [[/\bKM\b/g, 'kata majmuk']];
  function sebutan(t) { let x = String(t || ''); SEBUT.forEach(([a, b]) => { x = x.replace(a, b); }); return x; }

  let barisan = Promise.resolve(), tokenCakap = 0;
  K.diam = () => { tokenCakap++; try { speechSynthesis.cancel(); } catch (e) {} bcakap = 0; duck(); barisan = Promise.resolve(); };
  // cakap(teks) -> Promise (selesai bila habis bercakap). Diatur dalam barisan.
  K.cakap = (teks, opt = {}) => {
    if (!('speechSynthesis' in window) || !teks) return Promise.resolve();
    if (!K.adaSuara) {
      if (!K._amaran && K.amaran) { K._amaran = true; K.amaran('Suara Bahasa Melayu Malaysia tiada pada pelayar ini. Buka skrin TV dengan Microsoft Edge untuk suara Melayu Malaysia.'); }
      return Promise.resolve();
    }
    const tok = tokenCakap;
    barisan = barisan.then(() => new Promise((ok) => {
      if (tok !== tokenCakap) return ok();
      try {
        const u = new SpeechSynthesisUtterance(sebutan(teks));
        u.voice = K.suara; u.lang = K.suara.lang; u.rate = opt.rate || 0.92; u.pitch = opt.pitch || 1.05; u.volume = 1;
        let siap = false; const tamat = () => { if (siap) return; siap = true; bcakap = Math.max(0, bcakap - 1); duck(); ok(); };
        u.onstart = () => { bcakap++; duck(); };
        u.onend = tamat; u.onerror = tamat;
        setTimeout(tamat, 2500 + teks.length * 140); // jaring keselamatan
        speechSynthesis.speak(u);
      } catch (e) { ok(); }
    }));
    return barisan;
  };

  // ---------------- MUZIK LATAR ----------------
  function duck() {
    const sasaran = !K.muzikHidup ? 0 : bcakap > 0 ? K.vol * 0.28 : K.vol;
    if (muzikGain && ac) { const t = ac.currentTime; muzikGain.gain.cancelScheduledValues(t); muzikGain.gain.setTargetAtTime(sasaran, t, bcakap > 0 ? 0.08 : 0.5); }
    if (laguEl) laguEl.volume = Math.min(1, (bcakap > 0 ? 0.28 : 1) * (K.muzikHidup ? 0.35 : 0));
  }
  K.duck = duck;
  // progresi lembut C - Am - F - G (marimba arpeggio + pad)
  const KORD = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
  const CORAK = [0, 1, 2, 3, 2, 1, 2, 3];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const TEMPO = 84, LANGKAH = 60 / TEMPO / 2;
  let langkahSeterusnya = 0, kiraan = 0;
  function not(f, t, d, jenis, v) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = jenis; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(muzikGain); o.start(t); o.stop(t + d + 0.05);
  }
  function pad(fs, t, d) {
    fs.forEach((f) => { const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = f / 2; fl.type = 'lowpass'; fl.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(fl).connect(g).connect(muzikGain); o.start(t); o.stop(t + d + 0.1); });
  }
  function jadual() {
    if (!ac) return;
    while (langkahSeterusnya < ac.currentTime + 0.35) {
      const bar = Math.floor(kiraan / 8) % 4, k = KORD[bar], l = kiraan % 8, t = langkahSeterusnya;
      if (l === 0) { pad(k.slice(0, 3).map(hz), t, LANGKAH * 8); not(hz(k[0] - 12), t, 1.2, 'sine', 0.22); }
      const m = k[CORAK[l]] + 12, f = hz(m);
      not(f, t, 0.45, 'sine', l % 2 ? 0.07 : 0.11); not(f * 4, t, 0.08, 'sine', 0.012); // marimba: asas + kilau
      langkahSeterusnya += LANGKAH; kiraan++;
    }
  }
  K.muzik = (hidup) => {
    K.muzikHidup = !!hidup;
    if (window.BoboBGM && window.BoboBGM.ready && window.BoboBGM.el) {
      laguEl = window.BoboBGM.el; if (hidup) window.BoboBGM.play(); else window.BoboBGM.stop();
      clearInterval(jadualT); jadualT = null; duck(); return;
    }
    laguEl = null;
    if (hidup) { if (!K.audio()) return; if (!jadualT) { langkahSeterusnya = ac.currentTime + 0.1; jadualT = setInterval(jadual, 100); } }
    else { clearInterval(jadualT); jadualT = null; }
    duck();
  };
  window.KMSuara = K;
})();
