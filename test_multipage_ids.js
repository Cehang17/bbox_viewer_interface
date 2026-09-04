const assert = require('assert');
const BBoxParser = require('./js/bbox-parser.js');
const SentenceSplitter = require('./js/sentence-splitter.js');

console.log('--- TESTING MULTI-PAGE SEQUENTIAL ID CONTINUITY ---');

// Simulated Multi-page document
const multiPageDoc = [
  // Page 1
  {
    page: 1,
    category: 'Title',
    rawCoords: [50, 50, 400, 80],
    text: 'SÖZLEŞME BAŞLIĞI'
  },
  {
    page: 1,
    category: 'Plain Text',
    rawCoords: [50, 100, 400, 150],
    text: 'Bu birinci sayfanın ilk cümlesidir.'
  },
  {
    page: 1,
    category: 'Plain Text',
    rawCoords: [50, 160, 400, 210],
    text: 'Bu birinci sayfanın ikinci cümlesidir.'
  },
  // Page 2
  {
    page: 2,
    category: 'Title',
    rawCoords: [50, 50, 400, 80],
    text: 'MADDE 2: ÖDEME ŞARTLARI'
  },
  {
    page: 2,
    category: 'Plain Text',
    rawCoords: [50, 100, 400, 150],
    text: 'Bu ikinci sayfanın birinci cümlesidir.'
  },
  {
    page: 2,
    category: 'Plain Text',
    rawCoords: [50, 160, 400, 210],
    text: 'Bu ikinci sayfanın ikinci cümlesidir.'
  },
  // Page 3
  {
    page: 3,
    category: 'Plain Text',
    rawCoords: [50, 100, 400, 150],
    text: 'Bu üçüncü sayfanın birinci ve son cümlesidir.'
  }
];

const parsed = BBoxParser.parse(multiPageDoc);

console.log(`Total parsed items across all pages: ${parsed.length}`);
parsed.forEach(it => {
  console.log(`Page: ${it.page} | ID: ${it.id_display} (sentence_id: ${it.sentence_id}) | Cat: ${it.category} | Text: ${it.text}`);
});

// Check that IDs are strictly increasing
const page1Ids = parsed.filter(it => it.page === 1).map(it => it.id_display);
const page2Ids = parsed.filter(it => it.page === 2).map(it => it.id_display);
const page3Ids = parsed.filter(it => it.page === 3).map(it => it.id_display);

console.log('Page 1 IDs:', page1Ids);
console.log('Page 2 IDs:', page2Ids);
console.log('Page 3 IDs:', page3Ids);

// Page 2 IDs must all be strictly greater than max of Page 1 IDs
const maxP1 = Math.max(...page1Ids);
const minP2 = Math.min(...page2Ids);
assert.ok(minP2 > maxP1, `Page 2 IDs (${minP2}) must continue after Page 1 (${maxP1})`);

const maxP2 = Math.max(...page2Ids);
const minP3 = Math.min(...page3Ids);
assert.ok(minP3 > maxP2, `Page 3 IDs (${minP3}) must continue after Page 2 (${maxP2})`);

console.log('\n--- MULTI-PAGE SEQUENTIAL ID TEST PASSED PERFECTLY! ---');
