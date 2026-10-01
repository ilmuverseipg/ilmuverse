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

console.log('Templat dijana:');
console.log(' -', path.join(outDir, 'templat-perkataan.xlsx'));
console.log(' -', path.join(outDir, 'templat-soalan-tembak.xlsx'));
