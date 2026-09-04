const assert = require('assert');
const TableClassifier = require('./js/table-classifier.js');
const SentenceSplitter = require('./js/sentence-splitter.js');
const BBoxParser = require('./js/bbox-parser.js');

console.log('--- TESTING TABLE CLASSIFIER & READING ORDER SYSTEM ---');

// Test 1: A_MATRIX (Multi-column financial/statistical grid)
const matrixTable = {
  bbox: [50, 50, 450, 200],
  cells: [
    { row: 0, col: 0, rawCoords: [50, 50, 150, 90], text: 'Dönem' },
    { row: 0, col: 1, rawCoords: [150, 50, 300, 90], text: 'Elektrik Gideri' },
    { row: 0, col: 2, rawCoords: [300, 50, 450, 90], text: 'Su Gideri' },
    { row: 1, col: 0, rawCoords: [50, 90, 150, 140], text: 'Ocak Ayı' },
    { row: 1, col: 1, rawCoords: [150, 90, 300, 140], text: '1.250 TL' },
    { row: 1, col: 2, rawCoords: [300, 90, 450, 140], text: '400 TL' },
    { row: 2, col: 0, rawCoords: [50, 140, 150, 190], text: 'Şubat Ayı' },
    { row: 2, col: 1, rawCoords: [150, 140, 300, 190], text: '1.400 TL' },
    { row: 2, col: 2, rawCoords: [300, 140, 450, 190], text: '420 TL' }
  ]
};

const res1 = TableClassifier.processTable(matrixTable, 1, 1);
console.log('1. A_MATRIX Classification:', res1.tableType);
assert.strictEqual(res1.tableType, 'A_MATRIX');
console.log('   Sample reading text:', res1.items[4].fullSentenceText);
assert.ok(res1.items[4].fullSentenceText.includes('Ocak Ayı') && res1.items[4].fullSentenceText.includes('Elektrik Gideri'));

// Test 2: B_KEY_VALUE (2-column form key-value pairs)
const keyValueTable = {
  bbox: [50, 50, 400, 180],
  cells: [
    { row: 0, col: 0, rawCoords: [50, 50, 150, 90], text: 'Müşteri Adı' },
    { row: 0, col: 1, rawCoords: [150, 50, 400, 90], text: 'Hasan Yılmaz' },
    { row: 1, col: 0, rawCoords: [50, 90, 150, 130], text: 'Hesap No' },
    { row: 1, col: 1, rawCoords: [150, 90, 400, 130], text: '123456789' },
    { row: 2, col: 0, rawCoords: [50, 130, 150, 170], text: 'IBAN' },
    { row: 2, col: 1, rawCoords: [150, 130, 400, 170], text: 'TR12 0006 1005 1234 5678 9012 34' }
  ]
};

const res2 = TableClassifier.processTable(keyValueTable, 1, 1);
console.log('2. B_KEY_VALUE Classification:', res2.tableType);
assert.strictEqual(res2.tableType, 'B_KEY_VALUE');
console.log('   Sample reading text:', res2.items[0].fullSentenceText);
assert.ok(res2.items[0].fullSentenceText.includes('Müşteri Adı: Hasan Yılmaz'));

// Test 3: C_PARALLEL_TEXT (False table containing long paragraph sentences)
const parallelTextTable = {
  bbox: [50, 50, 500, 300],
  cells: [
    { row: 0, col: 0, rawCoords: [50, 50, 500, 100], text: 'Bu sözleşme taraflar arasındaki tüm ticari ve hukuki yükümlülükleri eksiksiz olarak düzenlemektedir.' },
    { row: 1, col: 0, rawCoords: [50, 100, 500, 150], text: 'Taraflardan herhangi biri sözleşme şartlarına aykırı davrandığı takdirde tazminat ödemekle mükelleftir.' },
    { row: 2, col: 0, rawCoords: [50, 150, 500, 200], text: 'Uyuşmazlık durumunda İstanbul Mahkemeleri ve İcra Daireleri yetkilidir.' }
  ]
};

const res3 = TableClassifier.processTable(parallelTextTable, 1, 1);
console.log('3. C_PARALLEL_TEXT Classification:', res3.tableType);
assert.strictEqual(res3.tableType, 'C_PARALLEL_TEXT');
console.log('   Decomposed plain text count:', res3.items.length);
assert.ok(res3.items[0].category === 'Plain Text');

// Test 4: D_MERGED_CELLS (Hierarchical headers with rowspan / colspan)
const mergedTable = {
  bbox: [50, 50, 450, 200],
  cells: [
    { row: 0, col: 0, rowspan: 2, colspan: 1, rawCoords: [50, 50, 150, 120], text: 'Bölge' },
    { row: 0, col: 1, rowspan: 1, colspan: 2, rawCoords: [150, 50, 450, 85], text: '2025 Yılı Finansal Göstergeleri' },
    { row: 1, col: 1, rowspan: 1, colspan: 1, rawCoords: [150, 85, 300, 120], text: 'Gelir' },
    { row: 1, col: 2, rowspan: 1, colspan: 1, rawCoords: [300, 85, 450, 120], text: 'Gider' },
    { row: 2, col: 0, rowspan: 1, colspan: 1, rawCoords: [50, 120, 150, 160], text: 'Marmara' },
    { row: 2, col: 1, rowspan: 1, colspan: 1, rawCoords: [150, 120, 300, 160], text: '50.000 TL' },
    { row: 2, col: 2, rowspan: 1, colspan: 1, rawCoords: [300, 120, 450, 160], text: '30.000 TL' }
  ]
};

const res4 = TableClassifier.processTable(mergedTable, 1, 1);
console.log('4. D_MERGED_CELLS Classification:', res4.tableType);
assert.strictEqual(res4.tableType, 'D_MERGED_CELLS');

// Test 5: E_FORMULA (Formula and calculation table)
const formulaTable = {
  bbox: [50, 50, 400, 200],
  cells: [
    { row: 0, col: 0, rawCoords: [50, 50, 200, 80], text: 'KDV Tutarı' },
    { row: 0, col: 1, rawCoords: [200, 50, 400, 80], text: '= Matrah * %20' },
    { row: 1, col: 0, rawCoords: [50, 80, 200, 110], text: 'Ödenecek Tutar' },
    { row: 1, col: 1, rawCoords: [200, 80, 400, 110], text: '= Matrah + KDV Tutarı' },
    { row: 2, col: 0, rawCoords: [50, 110, 200, 140], text: 'Toplam Tutar' },
    { row: 2, col: 1, rawCoords: [200, 110, 400, 140], text: '= 1000 + 200 = 1200 TL' }
  ]
};

const res5 = TableClassifier.processTable(formulaTable, 1, 1);
console.log('5. E_FORMULA Classification:', res5.tableType);
assert.strictEqual(res5.tableType, 'E_FORMULA');
console.log('   Sample formula reading text:', res5.items[1].fullSentenceText);
assert.ok(res5.items[1].fullSentenceText.includes('eşittir') || res5.items[1].fullSentenceText.includes('çarpı') || res5.items[1].fullSentenceText.includes('yüzde'));

// Test 6: F_HYBRID_NOTE (Matrix Table with Note / Footnote at the bottom)
const hybridTable = {
  bbox: [50, 50, 450, 250],
  cells: [
    { row: 0, col: 0, rawCoords: [50, 50, 150, 90], text: 'Kategori' },
    { row: 0, col: 1, rawCoords: [150, 50, 300, 90], text: 'Oran' },
    { row: 0, col: 2, rawCoords: [300, 50, 450, 90], text: 'Tutar' },
    { row: 1, col: 0, rawCoords: [50, 90, 150, 130], text: 'A Grubu' },
    { row: 1, col: 1, rawCoords: [150, 90, 300, 130], text: '%15' },
    { row: 1, col: 2, rawCoords: [300, 90, 450, 130], text: '1.500 TL' },
    { row: 2, col: 0, colspan: 3, rawCoords: [50, 130, 450, 180], text: 'Not: Bu tablodaki veriler 2025 yılı ilk çeyrek TCMB gösterge kurlarına göre derlenmiştir.' }
  ]
};

const res6 = TableClassifier.processTable(hybridTable, 1, 1);
console.log('6. F_HYBRID_NOTE Classification:', res6.tableType);
assert.strictEqual(res6.tableType, 'F_HYBRID_NOTE');
console.log('   Bottom note reading text:', res6.items[6].fullSentenceText);
assert.ok(res6.items[6].fullSentenceText.includes('Tablo Notu'));

// Test 7: Full BBoxParser.parse Integration
console.log('\n7. End-to-End BBoxParser.parse Test with Tables:');
const fullDoc = [
  {
    page: 1,
    category: 'Title',
    rawCoords: [50, 20, 500, 45],
    text: 'BÖLÜM 1: FİNANSAL TABLOLAR VE VERİLER'
  },
  matrixTable,
  {
    page: 1,
    category: 'Plain Text',
    rawCoords: [50, 220, 500, 250],
    text: 'Yukarıdaki tabloda belirtilen tutarlar vadesi geldiğinde banka hesabına aktarılacaktır.'
  }
];

const parsedDoc = BBoxParser.parse(fullDoc);
console.log('   Parsed total items:', parsedDoc.length);
assert.ok(parsedDoc.length >= 10);
console.log('   Title text:', parsedDoc[0].text);
console.log('   First table item text:', parsedDoc[1].text);
console.log('   First table item accessible sentence:', parsedDoc[1].fullSentenceText);

console.log('\n--- ALL 6 TABLE CLASSIFICATION & READING ORDER TESTS PASSED PERFECTLY! ---');
