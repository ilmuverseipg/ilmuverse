// Panel Driver - masuk guna pautan rahsia dari bot Telegram (/panel)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HARI = [
  ['isnin', 'Isnin'], ['selasa', 'Selasa'], ['rabu', 'Rabu'], ['khamis', 'Khamis'],
  ['jumaat', 'Jumaat'], ['sabtu', 'Sabtu'], ['ahad', 'Ahad'],
];
const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

// ---------- Kunci akses ----------
let KUNCI = '';
try {
  const dariHash = new URLSearchParams(location.hash.slice(1)).get('k');
  if (dariHash) {
    localStorage.setItem('prebookPanelKey', dariHash);
    history.replaceState(null, '', location.pathname);
  }
  KUNCI = dariHash || localStorage.getItem('prebookPanelKey') || '';
} catch {
  KUNCI = new URLSearchParams(location.hash.slice(1)).get('k') || '';
}

async function api(url, body) {
  const r = await fetch('/api/prebook/panel' + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Panel-Key': KUNCI },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) tiadaAkses(j.ralat);
  if (!r.ok) throw new Error(j.ralat || 'Ralat sambungan. Cuba lagi.');
  return j;
}

let toastMasa;
function toast(teks) {
  $('toast').textContent = teks;
  $('toast').classList.add('papar');
  clearTimeout(toastMasa);
  toastMasa = setTimeout(() => $('toast').classList.remove('papar'), 2500);
}

function tiadaAkses(mesej) {
  $('kandungan').classList.add('tersembunyi');
  $('tabNav').classList.add('tersembunyi');
  $('tiadaAkses').classList.remove('tersembunyi');
  $('namaDriver').textContent = 'Panel Driver';
  if (mesej) $('ralatAkses').textContent = mesej;
}

// ---------- Info & suis ----------
let info = null;
function paparInfo(i) {
  info = i;
  document.body.dataset.tema = i.id;
  document.title = `Panel ${i.nama}`;
  $('namaDriver').textContent = i.nama;
  $('lencana').textContent = `🖥 Panel Driver • ${i.id === 'perempuan' ? '👩' : '👨'} ${i.label}`;
  $('suisAktif').checked = i.aktif;
  $('labelAktif').textContent = i.aktif ? '🟢 Tempahan DIBUKA' : '⛔ Tempahan DITUTUP';
  $('subAktif').textContent = i.aktif ? 'Pelanggan boleh tempah ikut jadual' : 'Pelanggan tidak boleh tempah sekarang';
  $('lihatHalaman').href = i.pautanAwam;
  $('slotMinit').textContent = i.slotMinit;
  $('tarikhTutup').min = i.hariIni;
  paparTutup();
  paparProfil();
  $('infoBot').innerHTML = i.botAktif
    ? i.botDaftar ? '🤖 Bot Telegram: <b>aktif dan berdaftar</b>. Notifikasi tempahan akan dihantar ke Telegram anda.' : '🤖 Bot Telegram aktif tetapi <b>belum didaftarkan</b>. Buka bot dan tekan /start.'
    : '🤖 Bot Telegram <b>belum disambung</b> (token belum diset di Render).';
}

$('suisAktif').onchange = async (e) => {
  try {
    paparInfo(await api('/aktif', { aktif: e.target.checked }));
    toast(e.target.checked ? 'Tempahan dibuka' : 'Tempahan ditutup');
  } catch (err) {
    e.target.checked = !e.target.checked;
    toast(err.message);
  }
};

$('salinPautan').onclick = async () => {
  try {
    await navigator.clipboard.writeText(info.pautanAwam);
    toast('Pautan disalin');
  } catch {
    prompt('Salin pautan ini:', info.pautanAwam);
  }
};

// ---------- Tab ----------
function tukarTab(nama) {
  document.querySelectorAll('#tabNav button').forEach((b) => b.classList.toggle('aktif', b.dataset.tab === nama));
  for (const t of ['tempahan', 'jadual', 'profil']) $('tab-' + t).classList.toggle('tersembunyi', t !== nama);
  if (nama === 'jadual') binaEditorJadual();
}
document.querySelectorAll('#tabNav button').forEach((b) => (b.onclick = () => tukarTab(b.dataset.tab)));

// ---------- Tempahan ----------
let skop = 'akan';
document.querySelectorAll('[data-skop]').forEach((b) => {
  b.onclick = () => {
    skop = b.dataset.skop;
    document.querySelectorAll('[data-skop]').forEach((x) => x.classList.toggle('utama-k', x === b));
    muatTempahan();
  };
});

const formatTel = (t) => (t.length === 11 ? `${t.slice(0, 3)}-${t.slice(3, 7)} ${t.slice(7)}` : `${t.slice(0, 3)}-${t.slice(3, 6)} ${t.slice(6)}`);

async function muatTempahan() {
  const bekas = $('senaraiTempahan');
  let senarai;
  try {
    senarai = await api('/tempahan?skop=' + skop);
  } catch (e) {
    bekas.innerHTML = `<p class="ralat">${esc(e.message)}</p>`;
    return;
  }
  if (!senarai.length) {
    bekas.innerHTML = `<p class="kecil" style="text-align:center;padding:20px 0">${skop === 'akan' ? 'Tiada tempahan akan datang.' : 'Tiada sejarah tempahan.'}</p>`;
    return;
  }
  let html = '';
  let tarikhSemasa = '';
  for (const t of senarai) {
    if (t.tarikh !== tarikhSemasa) {
      tarikhSemasa = t.tarikh;
      const hari = t.tarikh === info.hariIni ? ' (Hari ini)' : '';
      html += `<div class="kumpulan-tarikh">📅 ${esc(t.paparTarikh)}${hari}</div>`;
    }
    const mesejWa = `Assalamualaikum ${t.nama}, saya ${info.nama} (driver). Berkenaan tempahan ${t.kod} pada ${t.paparTarikh}, ${t.paparMasa}.`;
    const butang = [];
    if (t.status === 'menunggu') butang.push(`<button class="b-sah" data-aksi="sah" data-kod="${t.kod}">✅ Sahkan</button>`, `<button class="b-tolak" data-aksi="tolak" data-kod="${t.kod}">❌ Tolak</button>`);
    if (t.status === 'disahkan') butang.push(`<button class="b-sah" data-aksi="siap" data-kod="${t.kod}">🏁 Selesai</button>`, `<button class="b-tolak" data-aksi="batal" data-kod="${t.kod}">🚫 Batal</button>`);
    butang.push(`<a class="b-wa" href="https://wa.me/${t.wa}?text=${encodeURIComponent(mesejWa)}" target="_blank" rel="noopener">💬 WhatsApp</a>`, `<a class="b-tel" href="tel:${t.telefon}">📞 Telefon</a>`);
    html += `
      <div class="tempahan-kad">
        <div class="atas"><span>🕐 ${esc(t.paparMasa)} • ${esc(t.kod)}</span><span class="lencana-status">${esc(t.statusPapar)}</span></div>
        <div style="margin-top:6px">👤 <b>${esc(t.nama)}</b> (${t.penumpang} orang) • ${esc(formatTel(t.telefon))}</div>
        <div>📍 ${esc(t.ambil)} → 🏁 ${esc(t.destinasi)}</div>
        <div class="kecil">🔁 ${t.jenis === 'pergi-balik' ? 'Pergi-balik' + (t.masaBalik ? ` (balik: ${esc(t.masaBalik)})` : '') : 'Sehala'}${t.catatan ? ` • 📝 ${esc(t.catatan)}` : ''}</div>
        <div class="bawah">${butang.join('')}</div>
      </div>`;
  }
  bekas.innerHTML = html;
  bekas.querySelectorAll('[data-aksi]').forEach((b) => {
    b.onclick = async () => {
      const label = { sah: 'Sahkan', tolak: 'Tolak', siap: 'Tandakan selesai', batal: 'Batalkan' }[b.dataset.aksi];
      if ((b.dataset.aksi === 'tolak' || b.dataset.aksi === 'batal') && !confirm(`${label} tempahan ${b.dataset.kod}?`)) return;
      b.disabled = true;
      try {
        const r = await api('/tempahan/' + b.dataset.kod, { aksi: b.dataset.aksi });
        toast(r.mesej);
      } catch (e) {
        toast(e.message);
      }
      muatTempahan();
    };
  });
}

// ---------- Jadual mingguan ----------
let draf = null;
function binaEditorJadual() {
  draf = JSON.parse(JSON.stringify(info.jadual));
  lukisJadual();
}
function lukisJadual() {
  $('editorJadual').innerHTML = HARI.map(([k, nama]) => {
    const sesi = draf[k] || [];
    const kerja = sesi.length > 0;
    return `
      <div class="hari-baris">
        <div class="hari-kepala">
          <span>${nama}</span>
          <label class="suis" style="margin:0;font-weight:400;font-size:.85rem;gap:8px">
            ${kerja ? 'Free' : 'Tutup'}
            <input type="checkbox" data-hari="${k}" ${kerja ? 'checked' : ''} />
            <span class="trek"></span>
          </label>
        </div>
        ${sesi.map((s, i) => `
          <div class="sesi">
            <input type="time" value="${s.mula}" data-hari="${k}" data-i="${i}" data-medan="mula" />
            <span>–</span>
            <input type="time" value="${s.tamat}" data-hari="${k}" data-i="${i}" data-medan="tamat" />
            <button class="btn-kecil bahaya-k" data-buang="${k}" data-i="${i}" title="Buang sesi">✕</button>
          </div>`).join('')}
        ${kerja ? `<button class="btn-kecil" style="margin-top:8px" data-tambah="${k}">＋ Tambah sesi</button>` : ''}
      </div>`;
  }).join('');

  const ed = $('editorJadual');
  ed.querySelectorAll('input[type=checkbox][data-hari]').forEach((c) => {
    c.onchange = () => {
      draf[c.dataset.hari] = c.checked ? [{ mula: '17:00', tamat: '22:00' }] : [];
      lukisJadual();
    };
  });
  ed.querySelectorAll('input[type=time]').forEach((inp) => {
    inp.onchange = () => (draf[inp.dataset.hari][inp.dataset.i][inp.dataset.medan] = inp.value);
  });
  ed.querySelectorAll('[data-buang]').forEach((b) => {
    b.onclick = () => {
      draf[b.dataset.buang].splice(Number(b.dataset.i), 1);
      lukisJadual();
    };
  });
  ed.querySelectorAll('[data-tambah]').forEach((b) => {
    b.onclick = () => {
      const s = draf[b.dataset.tambah];
      const akhir = s.length ? s[s.length - 1].tamat : '08:00';
      const [h, m] = akhir.split(':').map(Number);
      const mula = `${String(Math.min(h + 1, 22)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const tamat = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      s.push({ mula, tamat });
      lukisJadual();
    };
  });
}

$('simpanJadual').onclick = async () => {
  $('ralatJadual').textContent = '';
  try {
    paparInfo(await api('/jadual', { jadual: draf }));
    binaEditorJadual();
    toast('Jadual disimpan ✅');
  } catch (e) {
    $('ralatJadual').textContent = e.message;
  }
};

// ---------- Tarikh ditutup ----------
function paparTarikh(t) {
  const d = new Date(t + 'T00:00:00');
  return `${['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'][d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
}
function paparTutup() {
  const s = info.tutup;
  $('senaraiTutup').innerHTML = s.length
    ? s.map((t) => `<span class="cip">${paparTarikh(t)} <button data-buka="${t}" title="Buka semula">✕</button></span>`).join('')
    : '<span class="kecil">Tiada tarikh ditutup.</span>';
  $('senaraiTutup').querySelectorAll('[data-buka]').forEach((b) => {
    b.onclick = async () => {
      try {
        paparInfo(await api('/tutup', { tarikh: b.dataset.buka, tutup: false }));
        toast('Tarikh dibuka semula');
      } catch (e) {
        toast(e.message);
      }
    };
  });
}
$('btnTutup').onclick = async () => {
  const tarikh = $('tarikhTutup').value;
  if (!tarikh) return toast('Pilih tarikh dahulu');
  try {
    const r = await api('/tutup', { tarikh, tutup: true });
    paparInfo(r);
    $('tarikhTutup').value = '';
    if (r.amaran) alert('⚠️ ' + r.amaran);
    else toast('Tarikh ditutup');
  } catch (e) {
    toast(e.message);
  }
};

// ---------- Profil ----------
function paparProfil() {
  const f = $('borangProfil');
  if (document.activeElement?.form !== f) {
    f.nama.value = info.nama || '';
    f.telefon.value = info.telefon || '';
    f.kereta.value = info.kereta || '';
    f.warna.value = info.warna || '';
    f.plat.value = info.plat || '';
  }
  const ada = !!info.gambar;
  $('pratontonGambar').classList.toggle('tersembunyi', !ada);
  $('tiadaGambar').classList.toggle('tersembunyi', ada);
  if (ada) $('pratontonGambar').src = info.gambar;
  $('btnPadamGambar').classList.toggle('tersembunyi', !ada);
}

$('borangProfil').onsubmit = async (e) => {
  e.preventDefault();
  $('ralatProfil').textContent = '';
  try {
    paparInfo(await api('/profil', Object.fromEntries(new FormData(e.target))));
    toast('Profil disimpan ✅');
  } catch (err) {
    $('ralatProfil').textContent = err.message;
  }
};

// Mampatkan gambar di telefon sebelum muat naik (maks 1280px, JPEG)
function mampat(fail) {
  return new Promise((ok, gagal) => {
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * skala);
      c.height = Math.round(img.height * skala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => gagal(new Error('Fail bukan gambar yang sah'));
    img.src = URL.createObjectURL(fail);
  });
}

$('btnPilihGambar').onclick = () => $('failGambar').click();
$('failGambar').onchange = async (e) => {
  const fail = e.target.files[0];
  e.target.value = '';
  if (!fail) return;
  toast('Memuat naik gambar…');
  try {
    const data = await mampat(fail);
    paparInfo(await api('/gambar', { data }));
    toast('Gambar kereta dikemas kini ✅');
  } catch (err) {
    toast(err.message);
  }
};
$('btnPadamGambar').onclick = async () => {
  if (!confirm('Buang gambar kereta?')) return;
  try {
    paparInfo(await api('/gambar', { padam: true }));
    toast('Gambar dibuang');
  } catch (err) {
    toast(err.message);
  }
};

// ---------- Mula ----------
async function mula() {
  if (!KUNCI) return tiadaAkses();
  try {
    paparInfo(await api('/info'));
  } catch (e) {
    return tiadaAkses(e.message);
  }
  $('kandungan').classList.remove('tersembunyi');
  $('tabNav').classList.remove('tersembunyi');
  muatTempahan();
  // segar semula senarai setiap 30 saat
  setInterval(() => {
    if (!document.hidden && !$('tab-tempahan').classList.contains('tersembunyi')) muatTempahan();
  }, 30000);
}
mula();
