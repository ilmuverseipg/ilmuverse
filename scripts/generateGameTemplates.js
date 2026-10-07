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

console.log('Templat dijana:');
console.log(' -', path.join(outDir, 'templat-perkataan.xlsx'));
console.log(' -', path.join(outDir, 'templat-soalan-tembak.xlsx'));
console.log(' -', path.join(outDir, 'templat-imbuhan-apitan.xlsx'));
