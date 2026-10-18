/* ====================================================================
 * BOBO KIT - kod bersama untuk permainan ejaan Bobo (Ilmuverse GameBox)
 *   - public/bancuh-ejaan.html   (Bancuh Ejaan Bobo Mixue)
 *   - public/misi-penghantaran.html (Misi Penghantaran Ejaan Bobo Mixue)
 * Kandungan: bunyi & lagu (Web Audio), lukisan Bobo (watak asli Ilmuverse),
 * pengesanan tangan (MediaPipe, genggam/buka, sehingga 2 tangan),
 * senarai perkataan + templat Excel, logo kedai (dimuat naik guru), zarah.
 * ==================================================================== */
(function () {
  'use strict';
  const K = {};

  // ------------------------------------------------------------------
  // UTILITI
  // ------------------------------------------------------------------
  K.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.F = (px, w = 700) => `${w} ${Math.max(1, px)}px Fredoka, sans-serif`;
  K.ease = {
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  };
  K.rr = (ctx, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  K.fitFont = (ctx, text, maxW, px, w = 700) => { while (px > 8) { ctx.font = K.F(px, w); if (ctx.measureText(text).width <= maxW) break; px -= 1; } return px; };
  K.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  K.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  K.lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  K.lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  K.loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => rej(new Error('Gagal muat ' + src)); document.head.appendChild(s); });

  // ------------------------------------------------------------------
  // BUNYI & LAGU
  // ------------------------------------------------------------------
  let AC = null; K.sound = true; K.musicOn = true;
  K.ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
  function osc(f, d, type, v, f2, delay) {
    const a = K.ac(); if (!a) return; const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.05);
  }
  const tone = (f, d, type = 'sine', v = 0.15, f2 = null, delay = 0) => { if (K.sound) osc(f, d, type, v, f2, delay); };
  function noise(d, v, delay = 0, hp = 800, lp = 0) {
    if (!K.sound) return; const a = K.ac(); if (!a) return; const t = a.currentTime + delay, len = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(); f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp; s.buffer = buf; g.gain.value = v; s.connect(f).connect(g).connect(a.destination); s.start(t);
  }
  K.tone = tone; K.noise = noise;
  K.SFX = {
    click() { tone(660, 0.06, 'triangle', 0.1); },
    pick() { tone(520, 0.08, 'triangle', 0.15, 880); },
    drop() { tone(380, 0.1, 'sine', 0.12, 220); },
    snap() { tone(880, 0.07, 'square', 0.08); tone(1320, 0.12, 'triangle', 0.12, null, 0.05); },
    pop() { tone(300, 0.08, 'sine', 0.18, 900); },
    wrong() { tone(330, 0.16, 'square', 0.09, 300); tone(247, 0.3, 'square', 0.09, 210, 0.14); },
    boing() { tone(160, 0.35, 'sine', 0.18, 480); },
    fill() { for (let i = 0; i < 6; i++) tone(300 + i * 60, 0.09, 'sine', 0.07, 340 + i * 60, i * 0.08); noise(0.5, 0.05, 0, 0, 900); },
    seal() { noise(0.12, 0.35, 0, 0, 500); tone(90, 0.18, 'square', 0.18, 50); tone(1200, 0.1, 'triangle', 0.08, null, 0.15); },
    whoosh() { noise(0.35, 0.12, 0, 600); },
    star() { tone(1568, 0.12, 'triangle', 0.1); tone(2093, 0.2, 'triangle', 0.1, null, 0.08); },
    coin() { tone(988, 0.07, 'square', 0.08); tone(1319, 0.18, 'square', 0.08, null, 0.07); },
    collect() { [660, 880, 1100].forEach((f, i) => tone(f, 0.08, 'triangle', 0.12, null, i * 0.05)); },
    crash() { noise(0.45, 0.4, 0, 0, 800); tone(120, 0.4, 'sawtooth', 0.12, 50); },
    horn() { tone(392, 0.18, 'square', 0.08); tone(494, 0.25, 'square', 0.08, null, 0.2); },
    tick(hi) { tone(hi ? 1200 : 900, 0.06, 'square', hi ? 0.09 : 0.06); },
    go() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.08, null, i * 0.07)); },
    correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, null, i * 0.07)); },
    level() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.08, null, i * 0.09)); },
    win() { [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, null, i * 0.13)); setTimeout(() => noise(0.7, 0.08, 0, 3000), 900); },
    lose() { [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.28, 'sawtooth', 0.1, i === 3 ? 180 : null, i * 0.3)); },
    blip() { tone(420 + Math.random() * 260, 0.045, 'square', 0.035); },
  };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const M = { timer: null, next: 0, step: 0, bpm: 132, mel: [], bass: [] };
  let hat = null;
  function mNote(f, t, d, type, v) { const a = AC, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.03); }
  function mHat(t) { const a = AC; if (!hat) { const len = Math.floor(a.sampleRate * 0.05); hat = a.createBuffer(1, len, a.sampleRate); const c = hat.getChannelData(0); for (let i = 0; i < len; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / len); } const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000; g.gain.value = 0.022; s.buffer = hat; s.connect(f).connect(g).connect(a.destination); s.start(t); }
  function mTick() {
    const a = AC; if (!a) return; const e = 60 / M.bpm / 2;
    while (M.next < a.currentTime + 0.2) {
      const i = M.step, t = M.next, m = M.mel[i];
      if (m != null) { mNote(mtof(m), t, e * (M.mel[(i + 1) % M.mel.length] == null ? 1.7 : 0.8), 'square', 0.03); mNote(mtof(m + 12), t, e * 0.45, 'triangle', 0.01); }
      const k = i % 8, root = M.bass[Math.floor(i / 8) % M.bass.length];
      if (k % 2 === 0) mNote(mtof(k % 4 ? root + 7 : root), t, e * 1.5, 'triangle', 0.07);
      if (k === 0 || k === 4) mNote(105, t, 0.1, 'sine', 0.09);
      if (k % 2) mHat(t);
      M.next += e; M.step = (i + 1) % M.mel.length;
    }
  }
  let bgmBound = false;
  function bgmHook() {
    const bg = window.BoboBGM; if (!bg) return null;
    if (!bgmBound) { bgmBound = true; bg.onChange((b) => { if (!b.want || !K.musicOn) return; if (b.ready) { clearInterval(M.timer); M.timer = null; b.play(); } else if (!M.timer) K.music.start(); }); }
    return bg;
  }
  K.music = {
    start(mel, bass, bpm) {
      if (mel) { M.mel = mel; M.bass = bass; } if (bpm) M.bpm = bpm; if (!K.musicOn) return;
      // lagu muat naik guru (bobo-bgm.js) diutamakan; muzik sintesis jadi sandaran
      const bg = bgmHook(); if (bg) { bg.want = true; if (bg.ready) { clearInterval(M.timer); M.timer = null; bg.play(); return; } }
      if (M.timer || !M.mel.length) return; const a = K.ac(); if (!a) return; M.next = a.currentTime + 0.1; M.step = 0; M.timer = setInterval(mTick, 50);
    },
    stop() { clearInterval(M.timer); M.timer = null; const bg = bgmHook(); if (bg) bg.stop(); },
    bpm(b) { M.bpm = b; },
    playing: () => !!M.timer,
  };

  // ------------------------------------------------------------------
  // LUKISAN BOBO (beruang kutub - watak asli Ilmuverse)
  // o: {x,y,R,t,mood:'happy'|'ok'|'sad'|'yuck'|'joy'|'dead'|'wow', mouth, wave, tilt, blink, lookX, lookY, apron}
  // ------------------------------------------------------------------
  K.drawBobo = function (ctx, o) {
    const R = o.R, md = o.mood || 'happy', t = o.t || 0, dead = md === 'dead';
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.tilt || 0);
    const br = Math.sin(t * 2.4) * 0.025; ctx.scale(1 + br, 1 - br);
    const fur = (r) => { const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1); g.addColorStop(0, dead ? '#e4e8ec' : '#ffffff'); g.addColorStop(0.7, dead ? '#c9d0d7' : '#f1f6fb'); g.addColorStop(1, dead ? '#9eabb8' : '#cfdeea'); return g; };
    // badan + apron
    ctx.save(); ctx.translate(0, R * 1.05);
    ctx.fillStyle = fur(R); ctx.beginPath(); ctx.ellipse(0, 0, R * 0.92, R * 0.68, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e3242b'; ctx.beginPath(); ctx.moveTo(-R * 0.52, -R * 0.42); ctx.quadraticCurveTo(0, -R * 0.55, R * 0.52, -R * 0.42); ctx.lineTo(R * 0.62, R * 0.45); ctx.quadraticCurveTo(0, R * 0.72, -R * 0.62, R * 0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = K.F(R * 0.19); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.apron || 'BOBO', 0, -R * 0.1);
    [-1, 1].forEach((s) => {
      ctx.save(); ctx.translate(s * R * 0.82, -R * 0.2);
      let a = s * (0.5 + Math.sin(t * 2) * 0.08);
      if (o.wave && s === 1) a = -2.5 + Math.sin(t * 10) * 0.35;
      if (md === 'joy') a = s * (2.5 + Math.sin(t * 10 + s) * 0.35) * -1;
      ctx.rotate(a); ctx.fillStyle = fur(R * 0.4); ctx.beginPath(); ctx.ellipse(0, R * 0.18, R * 0.2, R * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    [-1, 1].forEach((s) => { ctx.fillStyle = fur(R * 0.4); ctx.beginPath(); ctx.ellipse(s * R * 0.48, R * 0.6, R * 0.27, R * 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f7b9c4'; ctx.beginPath(); ctx.ellipse(s * R * 0.48, R * 0.62, R * 0.12, R * 0.08, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    K.drawBoboHead(ctx, o, fur);
    ctx.restore();
  };
  K.drawBoboHead = function (ctx, o, fur) {
    const R = o.R, md = o.mood || 'happy', t = o.t || 0, dead = md === 'dead';
    fur = fur || ((r) => { const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1); g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#f1f6fb'); g.addColorStop(1, '#cfdeea'); return g; });
    [-1, 1].forEach((s) => { ctx.fillStyle = fur(R * 0.4); ctx.beginPath(); ctx.arc(s * R * 0.68, -R * 0.7, R * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f7b9c4'; ctx.beginPath(); ctx.arc(s * R * 0.68, -R * 0.68, R * 0.16, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = fur(R); ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(0, -R * 0.86); ctx.fillStyle = '#e3242b'; K.rr(ctx, -R * 0.42, -R * 0.2, R * 0.84, R * 0.26, R * 0.08); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-R * 0.42, -R * 0.02, R * 0.84, R * 0.06); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, R * 0.3, R * 0.5, R * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(160,180,200,.5)'; ctx.lineWidth = Math.max(1, R * 0.02); ctx.stroke();
    if (md === 'happy' || md === 'joy' || md === 'wow') { ctx.fillStyle = 'rgba(255,120,150,.45)'; [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * R * 0.58, R * 0.2, R * 0.16, R * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }); }
    ctx.lineCap = 'round'; ctx.strokeStyle = ctx.fillStyle = '#2a1516'; ctx.lineWidth = R * 0.07;
    const ey = -R * 0.18, ex = R * 0.36;
    if (dead) { [-1, 1].forEach((s) => { const q = R * 0.13; ctx.beginPath(); ctx.moveTo(s * ex - q, ey - q); ctx.lineTo(s * ex + q, ey + q); ctx.moveTo(s * ex + q, ey - q); ctx.lineTo(s * ex - q, ey + q); ctx.stroke(); }); }
    else if (md === 'yuck') { [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * ex - s * R * 0.12, ey - R * 0.1); ctx.lineTo(s * ex + s * R * 0.06, ey); ctx.lineTo(s * ex - s * R * 0.12, ey + R * 0.1); ctx.stroke(); }); }
    else if (md === 'happy' || md === 'joy') { [-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(s * ex, ey + R * 0.05, R * 0.13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }); }
    else if (o.blink) { [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * ex - R * 0.1, ey); ctx.lineTo(s * ex + R * 0.1, ey); ctx.stroke(); }); }
    else {
      const lx = (o.lookX || 0) * R * 0.05, ly = (o.lookY || 0) * R * 0.04, big = md === 'wow' ? 1.25 : 1;
      [-1, 1].forEach((s) => { ctx.fillStyle = '#2a1516'; ctx.beginPath(); ctx.ellipse(s * ex + lx, ey + ly, R * 0.11 * big, R * 0.13 * big, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * ex + lx + R * 0.04, ey + ly - R * 0.05, R * 0.04 * big, 0, Math.PI * 2); ctx.fill(); });
      if (md === 'sad') { ctx.strokeStyle = '#2a1516'; ctx.lineWidth = R * 0.05; [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * (ex + R * 0.16), ey - R * 0.17); ctx.lineTo(s * (ex - R * 0.08), ey - R * 0.27); ctx.stroke(); }); }
    }
    ctx.fillStyle = '#2a1516'; ctx.beginPath(); ctx.ellipse(0, R * 0.14, R * 0.12, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-R * 0.03, R * 0.11, R * 0.04, R * 0.02, 0, 0, Math.PI * 2); ctx.fill();
    const mo = K.clamp(o.mouth || 0, 0, 1); ctx.fillStyle = '#7a1d2a'; ctx.strokeStyle = '#2a1516'; ctx.lineWidth = R * 0.04;
    if (dead) { ctx.beginPath(); ctx.moveTo(-R * 0.18, R * 0.4); ctx.quadraticCurveTo(0, R * 0.32, R * 0.18, R * 0.4); ctx.stroke(); }
    else if (md === 'yuck') { ctx.beginPath(); ctx.moveTo(-R * 0.2, R * 0.42); for (let i = 1; i <= 4; i++) ctx.lineTo(-R * 0.2 + i * R * 0.1, R * 0.42 + (i % 2 ? -1 : 1) * R * 0.04); ctx.stroke(); }
    else if (mo > 0.2 || md === 'joy' || md === 'wow') {
      const m2 = Math.max(mo, md === 'joy' ? 0.7 : md === 'wow' ? 0.5 : 0);
      ctx.beginPath(); ctx.ellipse(0, R * 0.36 + m2 * R * 0.06, R * (0.16 + m2 * 0.18), R * (0.06 + m2 * 0.22), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.ellipse(0, R * 0.42 + m2 * R * 0.14, R * 0.12 * m2 + R * 0.03, R * 0.06 * m2 + R * 0.02, 0, 0, Math.PI * 2); ctx.fill();
    } else if (md === 'sad') { ctx.beginPath(); ctx.arc(0, R * 0.48, R * 0.13, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(0, R * 0.22); ctx.lineTo(0, R * 0.32); ctx.stroke(); ctx.beginPath(); ctx.arc(-R * 0.1, R * 0.32, R * 0.1, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(R * 0.1, R * 0.32, R * 0.1, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
    if (md === 'sad') { const k = (t * 0.8) % 1; ctx.fillStyle = 'rgba(90,184,255,.85)'; ctx.beginPath(); ctx.ellipse(R * 0.82, -R * 0.4 + k * R * 0.6, R * 0.07, R * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
  };

  // ------------------------------------------------------------------
  // LOGO KEDAI (dimuat naik guru, disimpan dalam pelayar - kunci sama dgn Kaunter Lapar)
  // ------------------------------------------------------------------
  K.logo = null;
  K.loadLogo = (cb) => { const d = K.lsGet('kl_logo_v1', null); if (!d) { K.logo = null; cb && cb(); return; } const im = new Image(); im.onload = () => { K.logo = im; cb && cb(); }; im.onerror = () => { K.logo = null; cb && cb(); }; im.src = d; };
  K.uploadLogo = (file, cb) => {
    const img = new Image(); img.onload = () => {
      const sc = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); let d = c.toDataURL('image/png');
      if (!K.lsSet('kl_logo_v1', d)) { d = c.toDataURL('image/jpeg', 0.85); K.lsSet('kl_logo_v1', d); }
      URL.revokeObjectURL(img.src); K.loadLogo(cb);
    }; img.src = URL.createObjectURL(file);
  };
  K.clearLogo = (cb) => { K.lsSet('kl_logo_v1', null); K.logo = null; cb && cb(); };
  // lukis logo (atau lencana asal) dalam kotak w x h berpusat di (x,y)
  K.drawLogo = (ctx, x, y, w, h) => {
    if (K.logo) { const r = Math.min(w / K.logo.width, h / K.logo.height); ctx.drawImage(K.logo, x - K.logo.width * r / 2, y - K.logo.height * r / 2, K.logo.width * r, K.logo.height * r); return; }
    const s = Math.min(w, h); ctx.save(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e3242b'; ctx.lineWidth = s * 0.05; ctx.stroke();
    ctx.fillStyle = '#e3242b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = K.F(s * 0.22); ctx.fillText('BOBO', x, y + s * 0.02); ctx.restore();
  };

  // ------------------------------------------------------------------
  // PERKATAAN (ejaan salah -> ejaan betul) + TEMPLAT
  // ------------------------------------------------------------------
  K.DEFAULT_WORDS = [
    { set: 1, betul: 'bekas', salah: 'beksa', gambar: '🥡' }, { set: 1, betul: 'gula', salah: 'gual', gambar: '🧂' }, { set: 1, betul: 'cawan', salah: 'cawna', gambar: '🥤' }, { set: 1, betul: 'sudu', salah: 'sduu', gambar: '🥄' },
    { set: 2, betul: 'susu', salah: 'ssuu', gambar: '🥛' }, { set: 2, betul: 'kopi', salah: 'kpoi', gambar: '☕' }, { set: 2, betul: 'ais', salah: 'asi', gambar: '🧊' }, { set: 2, betul: 'madu', salah: 'mdau', gambar: '🍯' },
    { set: 3, betul: 'limau', salah: 'liamu', gambar: '🍋' }, { set: 3, betul: 'mangga', salah: 'mnagga', gambar: '🥭' }, { set: 3, betul: 'oren', salah: 'orne', gambar: '🍊' }, { set: 3, betul: 'kelapa', salah: 'kelpaa', gambar: '🥥' },
    { set: 4, betul: 'coklat', salah: 'cokalt', gambar: '🍫' }, { set: 4, betul: 'kon', salah: 'kno', gambar: '🍦' }, { set: 4, betul: 'kacang', salah: 'kcaang', gambar: '🥜' }, { set: 4, betul: 'pisang', salah: 'pisnag', gambar: '🍌' },
    { set: 5, betul: 'roti', salah: 'rtoi', gambar: '🍞' }, { set: 5, betul: 'kek', salah: 'kke', gambar: '🍰' }, { set: 5, betul: 'biskut', salah: 'bisukt', gambar: '🍪' }, { set: 5, betul: 'dulang', salah: 'dualng', gambar: '🍽️' },
    { set: 6, betul: 'beg', salah: 'bge', gambar: '👜' }, { set: 6, betul: 'plastik', salah: 'plasitk', gambar: '🛍️' }, { set: 6, betul: 'tisu', salah: 'tsiu', gambar: '🧻' }, { set: 6, betul: 'wang', salah: 'wnag', gambar: '💵' },
  ];
  const LS_WORDS = 'bobo_ejaan_words_v1';
  K.loadWords = () => { const c = K.lsGet(LS_WORDS, null); return Array.isArray(c) && c.length ? { words: c, custom: true } : { words: K.DEFAULT_WORDS, custom: false }; };
  K.clearWords = () => K.lsSet(LS_WORDS, null);
  K.sets = (words) => [...new Set(words.map((w) => w.set).filter((s) => s))].sort((a, b) => a - b);
  // pilih perkataan: set tertentu (semua dalam set) atau rawak n perkataan, disusun ikut panjang
  K.pickWords = (words, setKey, n) => {
    let list = setKey && setKey !== 'rawak' ? words.filter((w) => String(w.set) === String(setKey)) : K.shuffle(words).slice(0, n);
    if (!list.length) list = K.shuffle(words).slice(0, n);
    return list.slice().sort((a, b) => a.betul.length - b.betul.length);
  };
  K.parseWordRows = (rows) => {
    const errs = [], words = []; if (!rows.length) return { words, errs: ['Fail kosong.'] };
    const hd = rows[0].map((h) => String(h).toLowerCase().trim()), find = (fn) => hd.findIndex(fn);
    const iS = find((h) => h.startsWith('set')), iB = find((h) => h.includes('betul') || h.startsWith('perkataan')), iX = find((h) => h.includes('salah')), iG = find((h) => h.startsWith('gambar'));
    if (iB < 0) return { words, errs: ['Lajur "Perkataan Betul" tidak dijumpai pada baris pertama.'] };
    rows.slice(1).forEach((r, k) => {
      const betul = String(r[iB] ?? '').trim().toLowerCase(); if (!betul) return;
      if (!/^[a-z-]{2,10}$/.test(betul)) { errs.push(`Baris ${k + 2}: "${betul}" mesti 2 hingga 10 huruf (a-z) tanpa ruang.`); return; }
      let salah = iX >= 0 ? String(r[iX] ?? '').trim().toLowerCase() : '';
      if (!salah || salah === betul) salah = K.scramble(betul);
      words.push({ set: iS >= 0 ? parseInt(r[iS], 10) || 0 : 0, betul, salah, gambar: iG >= 0 ? String(r[iG] ?? '').trim() : '' });
    });
    if (!words.length && !errs.length) errs.push('Tiada perkataan dijumpai.');
    return { words, errs };
  };
  K.scramble = (w) => { if (w.length < 3) return w.split('').reverse().join(''); for (let n = 0; n < 20; n++) { const i = 1 + Math.floor(Math.random() * (w.length - 2)); const s = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); if (s !== w) return s; } return w; };
  K.ensureXLSX = async () => { if (!window.XLSX) await K.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); return window.XLSX; };
  K.importWords = async (file) => {
    const X = await K.ensureXLSX(), wb = X.read(await file.arrayBuffer(), { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
    const res = K.parseWordRows(X.utils.sheet_to_json(ws, { header: 1, defval: '' }));
    if (res.words.length) K.lsSet(LS_WORDS, res.words);
    return res;
  };
  K.downloadTemplate = async () => {
    try { const r = await fetch('/templates/templat-ejaan-bobo.xlsx', { method: 'HEAD' }); if (r.ok) { const a = document.createElement('a'); a.href = '/templates/templat-ejaan-bobo.xlsx'; a.download = 'templat-ejaan-bobo.xlsx'; a.click(); return true; } } catch (e) {}
    const X = await K.ensureXLSX(); const ws = X.utils.aoa_to_sheet([['Set', 'Perkataan Betul', 'Ejaan Salah', 'Gambar (emoji, pilihan)'], ...K.DEFAULT_WORDS.map((w) => [w.set, w.betul, w.salah, w.gambar])]);
    ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 22 }]; const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Perkataan'); X.writeFile(wb, 'templat-ejaan-bobo.xlsx'); return true;
  };

  // ------------------------------------------------------------------
  // TANGAN (MediaPipe Hands): kedudukan tapak tangan + bukaan (genggam/buka)
  // ------------------------------------------------------------------
  K.hands = { ready: false, list: [], video: null };
  K.startHands = async function (video, maxHands, getSize) {
    if (K.hands.ready) return true;
    try {
      if (!window.Hands) await K.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js');
      if (!window.Camera) await K.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
      const hm = new window.Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
      hm.setOptions({ maxNumHands: maxHands || 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      hm.onResults((r) => {
        const { W, H } = getSize(), vw = video.videoWidth || 640, vh = video.videoHeight || 480, sc = Math.max(W / vw, H / vh), sw = W / sc, sh = H / sc, sx = (vw - sw) / 2, sy = (vh - sh) / 2;
        const now = performance.now();
        K.hands.list = (r.multiHandLandmarks || []).map((lm) => {
          const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
          const open = [[8, 5], [12, 9], [16, 13], [20, 17]].reduce((s, [tp, mc]) => s + d(tp, 0) / (d(mc, 0) || 1e-3), 0) / 4;
          const ids = [0, 5, 9, 13, 17], cx = ids.reduce((s, i) => s + lm[i].x, 0) / 5, cy = ids.reduce((s, i) => s + lm[i].y, 0) / 5;
          return { x: W - ((cx * vw - sx) / sw) * W, y: ((cy * vh - sy) / sh) * H, open, t: now };
        });
      });
      const cam = new window.Camera(video, { onFrame: async () => { await hm.send({ image: video }); }, width: 640, height: 480 });
      await cam.start(); K.hands.ready = true; K.hands.video = video; return true;
    } catch (e) { console.warn(e); return false; }
  };
  // Keadaan kursor seorang pemain (tangan atau tetikus). Genggam: histeresis + pelicinan + tempoh hilang.
  K.makeCursor = () => ({ x: -999, y: -999, tx: -999, ty: -999, down: false, lastDown: false, active: false, grip: 0, openS: null, openFrames: 0, seen: 0, pointerId: null });
  K.GRIP = { close: 1.42, open: 1.65, frames: 3, lostMs: 750 };
  K.feedHand = (c, h) => {
    c.tx = h.x; c.ty = h.y; c.active = true; c.seen = h.t;
    c.openS = c.openS == null ? h.open : c.openS * 0.55 + h.open * 0.45;
    c.grip = K.clamp((1.75 - c.openS) / 0.4, 0, 1);
    if (!c.down) { if (c.openS < K.GRIP.close) { c.down = true; c.openFrames = 0; } }
    else if (c.openS > K.GRIP.open) { if (++c.openFrames >= K.GRIP.frames) c.down = false; } else c.openFrames = 0;
  };
  K.updateCursor = (c, dt, hand) => {
    if (hand && c.active && performance.now() - c.seen > (c.down ? K.GRIP.lostMs : 300)) { c.active = false; c.down = false; c.openS = null; }
    const k = hand ? Math.min(1, dt * 16) : 1; if (c.x < -900) { c.x = c.tx; c.y = c.ty; } c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k;
    const pressed = c.down && c.active; c.justDown = pressed && !c.lastDown; c.justUp = !pressed && c.lastDown; c.pressed = pressed; c.lastDown = pressed;
  };
  K.drawHandCursor = (ctx, c, u, color) => {
    if (!c.active) return; const R = 44 * u, col = color || '#e3242b';
    ctx.save();
    // jejak gerakan
    c.trail = c.trail || []; c.trail.push({ x: c.x, y: c.y }); if (c.trail.length > 8) c.trail.shift();
    c.trail.forEach((p, i) => { ctx.globalAlpha = (i / c.trail.length) * 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.45 * (i / c.trail.length), 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fillStyle = c.down ? 'rgba(255,200,61,.42)' : 'rgba(255,255,255,.28)'; ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8 * u;
    ctx.lineWidth = 4 * u; ctx.strokeStyle = '#2a1516'; ctx.stroke();
    ctx.lineWidth = 8 * u; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, R + 7 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (c.down ? 1 : Math.max(0.08, c.grip))); ctx.stroke();
    ctx.font = `${40 * u}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0; ctx.globalAlpha = 0.7; ctx.fillText(c.down ? '✊' : '✋', c.x, c.y + 2 * u); ctx.restore();
  };
  K.drawCamPreview = (ctx, W, H, u, ok) => {
    const v = K.hands.video; if (!K.hands.ready || !v || !v.videoWidth) return;
    const pw = 160 * u, ph = pw * v.videoHeight / v.videoWidth, px = W - pw - 14 * u, py = H - ph - 14 * u;
    ctx.save(); K.rr(ctx, px, py, pw, ph, 12 * u); ctx.clip(); ctx.translate(px + pw, py); ctx.scale(-1, 1); ctx.globalAlpha = 0.85; ctx.drawImage(v, 0, 0, pw, ph); ctx.restore();
    ctx.save(); K.rr(ctx, px, py, pw, ph, 12 * u); ctx.lineWidth = 4 * u; ctx.strokeStyle = ok ? '#22b573' : '#fff'; ctx.stroke(); ctx.restore();
  };

  // ------------------------------------------------------------------
  // ZARAH (konfeti, percikan, teks terapung)
  // ------------------------------------------------------------------
  K.Particles = function () {
    const P = [], T = [];
    this.burst = (x, y, n, colors, sp = 1, shape) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (120 + Math.random() * 380) * sp; P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150 * sp, g: 700 * sp, life: 1, dec: 0.8 + Math.random() * 0.6, s: (6 + Math.random() * 9) * sp, c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 9, shape: shape || (i % 4 === 0 ? 'star' : 'circle') }); } };
    this.confetti = (W, n, sp = 1) => { const cols = ['#e3242b', '#ffc83d', '#3ccf91', '#5ab8ff', '#ff7ab6', '#fff']; for (let i = 0; i < n; i++) P.push({ x: Math.random() * W, y: -20 - Math.random() * 400 * sp, vx: (Math.random() - 0.5) * 120 * sp, vy: (80 + Math.random() * 160) * sp, g: 50 * sp, life: 1, dec: 0.2, s: (8 + Math.random() * 8) * sp, c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, shape: 'rect' }); };
    this.text = (x, y, txt, color, size) => T.push({ x, y, txt, color, size, t: 0 });
    this.update = (dt, H) => {
      for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= p.dec * dt; if (p.life <= 0 || p.y > H + 50) P.splice(i, 1); }
      for (let i = T.length - 1; i >= 0; i--) { T[i].t += dt; if (T[i].t > 1.3) T.splice(i, 1); }
    };
    this.draw = (ctx) => {
      P.forEach((p) => { ctx.save(); ctx.globalAlpha = K.clamp(p.life, 0, 1); ctx.fillStyle = p.c; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.shape === 'rect') ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        else if (p.shape === 'star') { ctx.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? p.s * 0.45 : p.s; ctx.lineTo(Math.cos(k * Math.PI / 5) * r, Math.sin(k * Math.PI / 5) * r); } ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); });
      T.forEach((f) => { const e = K.ease.outCubic(K.clamp(f.t / 1.3, 0, 1)); ctx.save(); ctx.globalAlpha = 1 - e * e; ctx.font = K.F(f.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = f.size * 0.22; ctx.strokeStyle = '#fff'; ctx.strokeText(f.txt, f.x, f.y - e * 60); ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y - e * 60); ctx.restore(); });
    };
    this.count = () => P.length;
  };

  // teks besar dengan garis luar (tajuk, "BETUL!", "KURANG TEPAT!")
  K.bigText = (ctx, txt, x, y, px, fill, stroke, sw) => { ctx.save(); ctx.font = K.F(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = sw || px * 0.18; ctx.strokeStyle = stroke || '#fff'; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y); ctx.restore(); };

  window.BoboKit = K;
})();
