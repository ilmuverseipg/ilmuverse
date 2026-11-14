// Semua pengiraan masa ikut waktu Malaysia (UTC+8) walaupun server di luar negara.
const OFFSET = 8 * 60 * 60 * 1000;

const HARI = ['ahad', 'isnin', 'selasa', 'rabu', 'khamis', 'jumaat', 'sabtu'];
const HARI_PAPAR = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

const ymd = (d) => d.toISOString().slice(0, 10);
const hariIni = () => ymd(new Date(Date.now() + OFFSET));
const keEpoch = (tarikh, masa) => Date.parse(`${tarikh}T${masa}:00+08:00`);
const indeksHari = (tarikh) => new Date(tarikh + 'T00:00:00Z').getUTCDay();
const namaHari = (tarikh) => HARI[indeksHari(tarikh)];

function tambahHari(tarikh, n) {
  const d = new Date(tarikh + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

function paparTarikh(tarikh) {
  const d = new Date(tarikh + 'T00:00:00Z');
  return `${HARI_PAPAR[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const keMinit = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const dariMinit = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function paparMasa(hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

const sahTarikh = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const sahMasa = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

module.exports = {
  HARI, HARI_PAPAR, hariIni, keEpoch, namaHari, indeksHari, tambahHari,
  paparTarikh, paparMasa, keMinit, dariMinit, sahTarikh, sahMasa,
};
