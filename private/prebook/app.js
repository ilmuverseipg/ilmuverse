const DRIVER = location.pathname.split('/').filter(Boolean).pop();
const $ = (id) => document.getElementById(id);
const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

let info = null;
let pilihan = { tarikh: null, masa: null, paparTarikh: '', paparMasa: '' };

async function api(url, opt) {
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.ralat || 'Ralat sambungan. Cuba lagi.');
  return j;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Mula ----------
async function mula() {
  document.body.dataset.tema = DRIVER;
  try {
    info = await api(`/api/prebook/driver/${DRIVER}`);
  } catch {
    document.querySelector('main').innerHTML = '<div class="kad">Halaman tidak dijumpai. <a href="/tempah">Kembali</a></div>';
    return;
  }
  document.title = `Tempah ${info.nama}`;
  $('namaDriver').textContent = info.nama;
  $('lencana').textContent = (DRIVER === 'perempuan' ? '👩 ' : '👨 ') + info.label;
  $('awalJam').textContent = info.tempahAwalJam;
  $('akuanJantina').textContent = info.penumpang;
  muatTarikh();

  const kod = new URLSearchParams(location.search).get('kod');
  if (kod) { tukarTab('semak'); semak(kod); }
}

// ---------- Langkah 1: tarikh ----------
async function muatTarikh() {
  const senarai = await api(`/api/prebook/tarikh/${DRIVER}`);
  const bekas = $('senaraiTarikh');
  bekas.innerHTML = '';
  senarai.forEach((d, i) => {
    const t = new Date(d.tarikh + 'T00:00:00');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tarikh';
    b.disabled = d.bilAda === 0;
    const label = i === 0 ? 'Hari ini' : i === 1 ? 'Esok' : d.hari.slice(0, 3);
    const status = d.tutup ? 'Cuti' : d.bilAda === 0 ? 'Penuh' : `${d.bilAda} slot`;
    b.innerHTML = `<div class="h">${label}</div><div class="t">${t.getDate()}</div><div class="b">${BULAN[t.getMonth()]}</div><div class="s">${status}</div>`;
    b.onclick = () => pilihTarikh(d.tarikh, b);
    if (pilihan.tarikh === d.tarikh && !b.disabled) b.classList.add('dipilih');
    bekas.appendChild(b);
  });
}

async function pilihTarikh(tarikh, el) {
  document.querySelectorAll('.tarikh').forEach((x) => x.classList.remove('dipilih'));
  el.classList.add('dipilih');
  pilihan = { tarikh, masa: null };
  $('langkah3').classList.add('tersembunyi');
  await muatSlot();
  $('langkah2').classList.remove('tersembunyi');
  $('langkah2').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Langkah 2: masa ----------
async function muatSlot() {
  const d = await api(`/api/prebook/slot/${DRIVER}?tarikh=${pilihan.tarikh}`);
  pilihan.paparTarikh = d.papar;
  $('tarikhDipilih').textContent = d.papar;
  const bekas = $('senaraiSlot');
  bekas.innerHTML = '';
  if (!d.slot.some((s) => s.ada)) {
    bekas.innerHTML = '<p class="kecil">Tiada slot kosong pada tarikh ini.</p>';
    return;
  }
  d.slot.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    b.textContent = s.papar;
    b.disabled = !s.ada;
    b.onclick = () => pilihMasa(s, b);
    bekas.appendChild(b);
  });
}

function pilihMasa(s, el) {
  document.querySelectorAll('.slot').forEach((x) => x.classList.remove('dipilih'));
  el.classList.add('dipilih');
  pilihan.masa = s.masa;
  pilihan.paparMasa = s.papar;
  $('ringkasPilihan').textContent = `📅 ${pilihan.paparTarikh} • 🕐 ${s.papar}`;
  $('langkah3').classList.remove('tersembunyi');
  $('langkah3').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Langkah 3: borang ----------
$('jenis').onchange = (e) => $('kotakBalik').classList.toggle('tersembunyi', e.target.value !== 'pergi-balik');

// Ingat nama & telefon untuk tempahan seterusnya
try {
  const simpan = JSON.parse(localStorage.getItem('pelanggan') || '{}');
  if (simpan.nama) $('langkah3').nama.value = simpan.nama;
  if (simpan.telefon) $('langkah3').telefon.value = simpan.telefon;
} catch {}

$('langkah3').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  $('ralatBorang').textContent = '';
  if (!pilihan.masa) return ($('ralatBorang').textContent = 'Sila pilih masa dahulu.');
  if (!f.akuan.checked) return ($('ralatBorang').textContent = `Sila tandakan pengesahan penumpang ${info.penumpang}.`);

  const data = Object.fromEntries(new FormData(f));
  data.akuan = f.akuan.checked;
  data.tarikh = pilihan.tarikh;
  data.masa = pilihan.masa;

  const btn = $('btnHantar');
  btn.disabled = true;
  btn.textContent = 'Menghantar…';
  try {
    const r = await api(`/api/prebook/tempah/${DRIVER}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    try { localStorage.setItem('pelanggan', JSON.stringify({ nama: data.nama, telefon: data.telefon })); } catch {}
    tunjukBerjaya(r, data);
  } catch (err) {
    $('ralatBorang').textContent = err.message;
    muatTarikh();
    muatSlot();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Hantar Tempahan';
  }
};

function tunjukBerjaya(r, data) {
  ['langkah1', 'langkah2', 'langkah3'].forEach((id) => $(id).classList.add('tersembunyi'));
  $('berjaya').classList.remove('tersembunyi');
  $('kodBerjaya').textContent = r.kod;
  $('infoBerjaya').innerHTML = `📅 ${esc(r.tarikh)}<br>🕐 ${esc(r.masa)}<br>📍 ${esc(data.ambil)} → ${esc(data.destinasi)}`;
  if (info.wa) {
    const mesej = `Assalamualaikum ${info.nama}, saya ${data.nama}. Saya baru buat tempahan kod ${r.kod} pada ${r.tarikh}, ${r.masa} dari ${data.ambil} ke ${data.destinasi}.`;
    $('btnWA').href = `https://wa.me/${info.wa}?text=${encodeURIComponent(mesej)}`;
    $('btnWA').classList.remove('tersembunyi');
  }
  $('btnSemakKod').onclick = () => { tukarTab('semak'); semak(r.kod); };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('btnBaru').onclick = () => {
  $('berjaya').classList.add('tersembunyi');
  $('langkah1').classList.remove('tersembunyi');
  $('langkah2').classList.add('tersembunyi');
  $('langkah3').reset();
  try {
    const s = JSON.parse(localStorage.getItem('pelanggan') || '{}');
    $('langkah3').nama.value = s.nama || '';
    $('langkah3').telefon.value = s.telefon || '';
  } catch {}
  pilihan = { tarikh: null, masa: null };
  muatTarikh();
};

// ---------- Tab ----------
function tukarTab(nama) {
  document.querySelectorAll('.tab button').forEach((b) => b.classList.toggle('aktif', b.dataset.tab === nama));
  $('tab-tempah').classList.toggle('tersembunyi', nama !== 'tempah');
  $('tab-semak').classList.toggle('tersembunyi', nama !== 'semak');
}
document.querySelectorAll('.tab button').forEach((b) => (b.onclick = () => tukarTab(b.dataset.tab)));

// ---------- Semak & batal ----------
$('borangSemak').onsubmit = (e) => {
  e.preventDefault();
  semak(e.target.kod.value);
};

async function semak(kod) {
  kod = String(kod).trim().toUpperCase();
  $('borangSemak').kod.value = kod;
  $('ralatSemak').textContent = '';
  const hasil = $('hasilSemak');
  hasil.classList.add('tersembunyi');
  try {
    const t = await api(`/api/prebook/status/${encodeURIComponent(kod)}`);
    hasil.innerHTML = `
      <div class="status-besar">${esc(t.statusPapar)}</div>
      <div class="baris"><span>Kod</span><span>${esc(t.kod)}</span></div>
      <div class="baris"><span>Tarikh</span><span>${esc(t.tarikh)}</span></div>
      <div class="baris"><span>Masa</span><span>${esc(t.masa)}</span></div>
      <div class="baris"><span>Ambil</span><span>${esc(t.ambil)}</span></div>
      <div class="baris"><span>Destinasi</span><span>${esc(t.destinasi)}</span></div>
      ${t.bolehBatal ? `
        <label style="margin-top:14px">Masukkan no. telefon untuk batal
          <input id="telBatal" inputmode="tel" placeholder="0123456789" />
        </label>
        <button class="kedua bahaya" id="btnBatal">🚫 Batal tempahan</button>
        <p class="ralat" id="ralatBatal"></p>` : ''}`;
    hasil.classList.remove('tersembunyi');
    if (t.bolehBatal) {
      $('btnBatal').onclick = async () => {
        if (!confirm('Batalkan tempahan ini?')) return;
        try {
          await api(`/api/prebook/batal/${t.kod}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefon: $('telBatal').value }),
          });
          semak(t.kod);
          muatTarikh();
        } catch (err) {
          $('ralatBatal').textContent = err.message;
        }
      };
    }
  } catch (err) {
    $('ralatSemak').textContent = err.message;
  }
}

mula();
