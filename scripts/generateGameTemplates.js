// Skrip untuk jana fail TEMPLAT Excel (.xlsx) yang boleh dimuat turun terus
// di Panel Guru Ilmuverse Gamebox - supaya guru boleh isi ramai
// perkataan/soalan sekali gus (Excel) drpd taip satu-satu dalam borang.
// Fail yang dijana disimpan dalam public/templates/ (disajikan statik oleh
// Express) dan DIKOMIT terus ke repo - tak perlu jana semula setiap kali
// server start. Jalankan semula hanya jika format templat berubah:
//   node scripts/generateGameTemplates.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const outDir = path.join(__dirname, '..', 'public', 'templates');
fs.mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------
// Templat 1: Perkataan (Mod Padan & Mod Isyarat Jari)
// ------------------------------------------------------------------
const perkataanRows = [
  ['Perkataan/Istilah', 'Maksud/Jawapan', 'Ikon (pilihan)'],
  ['Kucing', 'قِطَّة', '🐱'],
  ['Anjing', 'كَلْب', '🐶'],
  ['Burung', 'طَائِر', '🐦'],
];
const wbWords = XLSX.utils.book_new();
const wsWords = XLSX.utils.aoa_to_sheet(perkataanRows);
wsWords['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wbWords, wsWords, 'Perkataan');
XLSX.writeFile(wbWords, path.join(outDir, 'templat-perkataan.xlsx'));

// ------------------------------------------------------------------
// Templat 2: Soalan Tembak (Mod Tembak A/B/C)
// ------------------------------------------------------------------
const tembakRows = [
  ['Soalan', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Jawapan Betul (A/B/C)'],
  ["Apakah maksud 'قِطَّة'?", 'Kucing', 'Anjing', 'Burung', 'A'],
  ['Berapakah 2 + 2?', '3', '4', '5', 'B'],
];
const wbTembak = XLSX.utils.book_new();
const wsTembak = XLSX.utils.aoa_to_sheet(tembakRows);
wsTembak['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }];
XLSX.utils.book_append_sheet(wbTembak, wsTembak, 'Soalan Tembak');
XLSX.writeFile(wbTembak, path.join(outDir, 'templat-soalan-tembak.xlsx'));

// ------------------------------------------------------------------
// Templat 3: Soalan Imbuhan Apitan (Mod Imbuhan Apitan - Jawi)
// NOTA: baris contoh di bawah SEKADAR ILUSTRASI format lajur - sila SEMAK
// & GANTIKAN ejaan Jawi dgn ejaan yang disahkan sendiri oleh guru sebelum
// guna sebenar dgn murid (ejaan Jawi kata terbitan tak selalu ikut bunyi
// terus, jadi sistem ni sengaja TIDAK auto-tukar Rumi->Jawi).
// ------------------------------------------------------------------
const apitanRows = [
  [
    'Soalan (Rumi)', 'Kata Dasar (Rumi)', 'Kata Dasar (Jawi)',
    'Awalan A (Rumi)', 'Awalan A (Jawi)', 'Awalan B (Rumi)', 'Awalan B (Jawi)', 'Awalan C (Rumi)', 'Awalan C (Jawi)', 'Awalan Betul (A/B/C)',
    'Akhiran A (Rumi)', 'Akhiran A (Jawi)', 'Akhiran B (Rumi)', 'Akhiran B (Jawi)', 'Akhiran C (Rumi)', 'Akhiran C (Jawi)', 'Akhiran Betul (A/B/C)',
    'Jawapan Jawi Lengkap',
  ],
  [
    'Kehidupan', 'hidup', 'هيدوڤ',
    'Ke-', 'ک', 'Ber-', 'بر', 'Pe-', 'ڤ', 'A',
    '-an', 'ن', '-kan', 'كن', '-i', 'ي', 'A',
    'كهيدوڤن',
  ],
];
const wbApitan = XLSX.utils.book_new();
const wsApitan = XLSX.utils.aoa_to_sheet(apitanRows);
wsApitan['!cols'] = [
  { wch: 20 }, { wch: 16 }, { wch: 16 },
  { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
  { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
  { wch: 22 },
];
XLSX.utils.book_append_sheet(wbApitan, wsApitan, 'Imbuhan Apitan');
XLSX.writeFile(wbApitan, path.join(outDir, 'templat-imbuhan-apitan.xlsx'));


// ------------------------------------------------------------------
// Templat: MIX-KATA (Suap Bobo) - public/game-mixkata.html
// Level 1 = 2 pilihan (1 betul), Level 2 = 3 pilihan (1 betul),
// Level 3 = 4 pilihan (2 betul, tulis cth "A,C"). Kosongkan pilihan tak guna.
// Petikan (pilihan): bila diisi, petikan dipaparkan besar & murid cari perkataan
// SALAH EJAAN; 'Ejaan Betul' dipaparkan hijau dalam petikan bila dijawab.
// ------------------------------------------------------------------
const mixkataRows = [
  ['Level', 'Soalan', 'Petikan (pilihan)', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Jawapan Betul (cth: A atau A,C)', 'Ejaan Betul (pilihan)'],
  [1, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Bobo pergi ke kedai. Dia mahu membeli aiskrem.', 'aiskrem', 'kedai', '', '', 'A', 'aiskrim'],
  [1, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Bobo beratur dengan sabar di kaunter. Dia tidak memotong barisn.', 'kaunter', 'barisn', '', '', 'B', 'barisan'],
  [2, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Bobo membeli segelas air teh. Harganya lima ringit. Dia membayar dengan duit kertas.', 'segelas', 'ringit', 'kertas', '', 'B', 'ringgit'],
  [2, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Penjual memberikan baki kepada Bobo. Bobo mengucapkan terima kaseh.', 'baki', 'penjual', 'kaseh', '', 'C', 'kasih'],
  [3, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Penjual tersalah memberi baki. Bobo memulangkan duit itu kerana dia jujor. Penjual itu sangat gembera.', 'jujor', 'penjual', 'gembera', 'baki', 'A,C', 'jujur, gembira'],
  [3, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Bobo minum air teh yang sejok. Dia membuang cawan ke dalam tong sampa. Bobo budak yang bersih.', 'cawan', 'sejok', 'bersih', 'sampa', 'B,D', 'sejuk, sampah'],
  [3, 'Cari perkataan yang SALAH EJAAN dalam petikan!', 'Bobo membeli dua biji rotti dan sebotol air. Dia membawa beg plastik. Bobo berjalan pulang ke rumh.', 'rotti', 'plastik', 'berjalan', 'rumh', 'A,D', 'roti, rumah'],
  [1, 'Contoh TANPA petikan (kata ganda): Air manakah KATA GANDA?', '', 'kedai', 'kawan-kawan', '', '', 'B', ''],
];
const wbMix = XLSX.utils.book_new();
const wsMix = XLSX.utils.aoa_to_sheet(mixkataRows);
wsMix['!cols'] = [{ wch: 8 }, { wch: 42 }, { wch: 70 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 22 }];
XLSX.utils.book_append_sheet(wbMix, wsMix, 'Soalan MIX-KATA');
XLSX.writeFile(wbMix, path.join(outDir, 'templat-mixkata.xlsx'));


// ------------------------------------------------------------------
// Templat: KAUNTER LAPAR 3D (pemasa 6 kumpulan) - public/kaunter-lapar.html
// Satu soalan = satu pusingan. Masa kosong = ikut tetapan (lalai 30 saat).
// ------------------------------------------------------------------
const kaunterRows = [
  ['Soalan', 'Jawapan', 'Masa (saat)'],
  ['Senaraikan TIGA kata ganda penuh tentang benda di kedai.', 'Contoh: cawan-cawan, roti-roti, kuih-kuih', ''],
  ["Bina SATU ayat menggunakan kata ganda 'kawan-kawan'.", 'Contoh: Kawan-kawan saya beratur di kaunter.', 60],
  ["Betulkan ejaan ini: 'pembeli pembeli'", 'pembeli-pembeli', ''],
  ['Masukkan 4 kad aiskrim KATA GANDA ke dalam Cawan Kata Ganda.', 'Semak dengan senarai jawapan set', 90],
];
const wbK = XLSX.utils.book_new();
const wsK = XLSX.utils.aoa_to_sheet(kaunterRows);
wsK['!cols'] = [{ wch: 60 }, { wch: 46 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wbK, wsK, 'Soalan');
XLSX.writeFile(wbK, path.join(outDir, 'templat-kaunter-lapar.xlsx'));


// ------------------------------------------------------------------
// Templat: EJAAN BOBO - public/bancuh-ejaan.html & public/misi-penghantaran.html
// Set (pilihan) | Perkataan Betul | Ejaan Salah (kosong = dijana) | Gambar (emoji, pilihan)
// ------------------------------------------------------------------
const ejaanRows = [
  ['Set', 'Perkataan Betul', 'Ejaan Salah', 'Gambar (emoji, pilihan)'],
  [1, 'bekas', 'beksa', '🥡'], [1, 'gula', 'gual', '🧂'], [1, 'cawan', 'cawna', '🥤'], [1, 'sudu', 'sduu', '🥄'],
  [2, 'susu', 'ssuu', '🥛'], [2, 'kopi', 'kpoi', '☕'], [2, 'ais', 'asi', '🧊'], [2, 'madu', 'mdau', '🍯'],
  [3, 'limau', 'liamu', '🍋'], [3, 'mangga', 'mnagga', '🥭'], [3, 'oren', 'orne', '🍊'], [3, 'kelapa', 'kelpaa', '🥥'],
  [4, 'coklat', 'cokalt', '🍫'], [4, 'kon', 'kno', '🍦'], [4, 'kacang', 'kcaang', '🥜'], [4, 'pisang', 'pisnag', '🍌'],
  [5, 'roti', 'rtoi', '🍞'], [5, 'kek', 'kke', '🍰'], [5, 'biskut', 'bisukt', '🍪'], [5, 'dulang', 'dualng', '🍽️'],
  [6, 'beg', 'bge', '👜'], [6, 'plastik', 'plasitk', '🛍️'], [6, 'tisu', 'tsiu', '🧻'], [6, 'wang', 'wnag', '💵'],
];
const wbE = XLSX.utils.book_new();
const wsE = XLSX.utils.aoa_to_sheet(ejaanRows);
wsE['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 22 }];
XLSX.utils.book_append_sheet(wbE, wsE, 'Perkataan');
XLSX.writeFile(wbE, path.join(outDir, 'templat-ejaan-bobo.xlsx'));

// ------------------------------------------------------------------
// Templat: PENJODOH BILANGAN - public/penjodoh-bilangan.html
// Ayat (___ = tempat kosong) | Jawapan | Pilihan Salah 1-3 | Gambar (emoji)
// ------------------------------------------------------------------
const pjbRows = [
  ['Ayat (guna ___ untuk tempat kosong)', 'Jawapan', 'Pilihan Salah 1', 'Pilihan Salah 2', 'Pilihan Salah 3', 'Gambar (emoji, pilihan)'],
  ['Atuk membela tiga ___ ayam.', 'ekor', 'biji', 'buah', '', '🐔'],
  ['Ibu membeli sepuluh ___ telur.', 'biji', 'helai', 'orang', '', '🥚'],
  ['Ada dua ___ kereta di halaman rumah.', 'buah', 'ekor', 'batang', '', '🚗'],
  ['Adik memegang ___ pensel.', 'sebatang', 'seekor', 'sebiji', '', '✏️'],
  ['Kakak melipat dua ___ baju.', 'helai', 'buah', 'biji', '', '👕'],
  ['Tiga ___ murid sedang membaca.', 'orang', 'ekor', 'helai', '', '🧒'],
  ['Ayah membeli ___ tembikai.', 'sebiji', 'sehelai', 'seorang', '', '🍉'],
  ['Ada ___ rumah kayu di tepi sawah.', 'sebuah', 'seekor', 'sebatang', '', '🏠'],
  ['Dua ___ kucing tidur di atas tikar.', 'ekor', 'orang', 'buah', '', '🐱'],
  ['Atuk membersihkan ___ meriam buluh.', 'selaras', 'sehelai', 'sebiji', '', '🎋'],
];
const wbP = XLSX.utils.book_new();
const wsP = XLSX.utils.aoa_to_sheet(pjbRows);
wsP['!cols'] = [{ wch: 44 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wbP, wsP, 'Soalan');
XLSX.writeFile(wbP, path.join(outDir, 'templat-penjodoh-bilangan.xlsx'));

console.log('Templat dijana:');
console.log(' -', path.join(outDir, 'templat-perkataan.xlsx'));
console.log(' -', path.join(outDir, 'templat-soalan-tembak.xlsx'));
console.log(' -', path.join(outDir, 'templat-imbuhan-apitan.xlsx'));
console.log(' -', path.join(outDir, 'templat-mixkata.xlsx'));
console.log(' -', path.join(outDir, 'templat-kaunter-lapar.xlsx'));
console.log(' -', path.join(outDir, 'templat-ejaan-bobo.xlsx'));
console.log(' -', path.join(outDir, 'templat-penjodoh-bilangan.xlsx'));
