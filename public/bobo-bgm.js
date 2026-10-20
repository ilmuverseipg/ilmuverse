/* ==================================================================
   BOBO BGM - lagu latar pilihan guru untuk kuiz Bobo (MIX-KATA, Bancuh Ejaan,
   Misi Penghantaran, Akuarium Ejaan). Guru muat naik fail audio (mp3/m4a/wav)
   SEKALI; fail disimpan dalam IndexedDB pelayar ini sahaja (tidak dihantar ke
   pelayan) dan dikongsi oleh semua kuiz. Lagu dimainkan berulang (loop).
   Tanpa fail, permainan guna muzik sintesis asal.
   ================================================================== */
(() => {
  'use strict';
  const DB = 'bobo_media_v1', ST = 'files', KEY = window.BOBO_BGM_KEY || 'bgm';
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const get = async () => {
    try { const db = await open(); return await new Promise((res) => { const q = db.transaction(ST).objectStore(ST).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
    catch (e) { return null; }
  };
  const put = async (v) => {
    const db = await open();
    await new Promise((res, rej) => { const tx = db.transaction(ST, 'readwrite'); const s = tx.objectStore(ST); if (v == null) s.delete(KEY); else s.put(v, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  };

  const B = { ready: false, name: '', el: null, want: false, volume: 0.45, _ls: [] };
  const emit = () => B._ls.forEach((f) => { try { f(B); } catch (e) {} });
  function setRec(rec) {
    if (B.el) { B.el.pause(); try { URL.revokeObjectURL(B.el.src); } catch (e) {} B.el = null; }
    B.ready = !!(rec && rec.blob); B.name = B.ready ? rec.name || 'lagu' : '';
    if (B.ready) { const a = new Audio(URL.createObjectURL(rec.blob)); a.loop = true; a.volume = B.volume; a.preload = 'auto'; B.el = a; if (B.want) a.play().catch(() => {}); }
    emit();
  }
  B.load = async () => setRec(await get());
  B.upload = async (file) => {
    if (!file) return;
    if (!/^audio\//.test(file.type || '') && !/\.(mp3|m4a|aac|wav|ogg|oga|webm)$/i.test(file.name || '')) throw new Error('Bukan fail audio (guna mp3, m4a atau wav).');
    if (file.size > 40 * 1024 * 1024) throw new Error('Fail terlalu besar (maksimum 40 MB).');
    const rec = { name: file.name, blob: file }; await put(rec); setRec(rec);
  };
  B.clear = async () => { try { await put(null); } catch (e) {} setRec(null); };
  B.play = () => { B.want = true; if (B.el) { B.el.play().catch(() => {}); return true; } return false; };
  B.stop = () => { B.want = false; if (B.el) B.el.pause(); };
  B.onChange = (f) => { B._ls.push(f); };

  // Butang "🎵 Lagu" untuk menu permainan: klik = pilih fail; ✖ = buang.
  B.mount = (container, btnClass) => {
    if (!container) return;
    const wrap = document.createElement('span'); wrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = btnClass || '';
    const x = document.createElement('button'); x.type = 'button'; x.className = btnClass || ''; x.textContent = '✖'; x.title = 'Buang lagu (guna muzik asal)';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.m4a,.wav'; inp.style.display = 'none';
    const sync = () => { btn.textContent = B.ready ? '🎵 Lagu: ✔' : '🎵 Lagu'; btn.title = B.ready ? 'Lagu latar: ' + B.name + ' (klik untuk tukar)' : 'Muat naik lagu latar (berulang) untuk semua kuiz Bobo'; x.style.display = B.ready ? '' : 'none'; };
    btn.onclick = () => inp.click();
    inp.onchange = async () => { const f = inp.files[0]; inp.value = ''; if (!f) return; btn.textContent = '⏳ Menyimpan…'; try { await B.upload(f); } catch (e) { alert(e.message || 'Lagu tidak dapat disimpan.'); } sync(); };
    x.onclick = async () => { if (confirm('Buang lagu latar "' + B.name + '"?')) { await B.clear(); sync(); } };
    wrap.append(btn, x, inp); container.appendChild(wrap); B.onChange(sync); sync();
  };

  window.BoboBGM = B;
  B.load();
})();
