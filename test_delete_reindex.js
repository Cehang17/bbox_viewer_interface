const assert = require('assert');

// Mock BBoxOverlayManager to test deletion and reindexing across pages
class MockBBoxOverlayManager {
  constructor() {
    this.bboxesByPage = new Map();
  }

  setData(bboxes) {
    this.bboxesByPage.clear();
    bboxes.forEach(item => {
      const pageNum = parseInt(item.page, 10) || 1;
      if (!this.bboxesByPage.has(pageNum)) {
        this.bboxesByPage.set(pageNum, []);
      }
      this.bboxesByPage.get(pageNum).push(item);
    });
  }

  getAllItems() {
    const all = [];
    const pageNumbers = Array.from(this.bboxesByPage.keys()).sort((a, b) => Number(a) - Number(b));
    for (const pNum of pageNumbers) {
      all.push(...this.bboxesByPage.get(pNum));
    }
    return all;
  }

  removeItem(bboxId) {
    let removed = false;
    for (const [pageNum, items] of this.bboxesByPage.entries()) {
      const idx = items.findIndex(it => String(it.id) === String(bboxId));
      if (idx !== -1) {
        items.splice(idx, 1);
        removed = true;
        break;
      }
    }

    if (removed) {
      this.reindexAllItems();
      return true;
    }
    return false;
  }

  reindexAllItems() {
    let globalIndex = 0;
    let globalSentenceCounter = 0;
    let lastSentenceKey = null;

    const pageNumbers = Array.from(this.bboxesByPage.keys()).sort((a, b) => Number(a) - Number(b));
    for (const pNum of pageNumbers) {
      const items = this.bboxesByPage.get(pNum) || [];
      items.forEach((it, idx) => {
        it.index = globalIndex;
        globalIndex++;

        // Sibling line matching key: belongs to same page and sentence ID or full text
        const sKey = `${pNum}_${(it.sentence_id !== undefined && it.sentence_id !== null) ? it.sentence_id : (it.fullSentenceText || it.text || `item_${idx}`)}`;

        if (lastSentenceKey !== null && sKey !== lastSentenceKey) {
          globalSentenceCounter++;
        }
        lastSentenceKey = sKey;

        it.sentence_id = globalSentenceCounter;
        it.id_display = globalSentenceCounter;
      });
    }
  }
}

console.log('--- TESTING BBOX DELETION & CONTINUOUS MULTI-PAGE REINDEXING ---');

const manager = new MockBBoxOverlayManager();

// Setup 3 pages of data
const initialData = [
  // Page 1
  { id: 'p1_1', page: 1, sentence_id: 0, text: 'P1 Item 1' },
  { id: 'p1_2', page: 1, sentence_id: 1, text: 'P1 Item 2' },
  { id: 'p1_3', page: 1, sentence_id: 2, text: 'P1 Item 3' },
  // Page 2
  { id: 'p2_1', page: 2, sentence_id: 3, text: 'P2 Item 1' },
  { id: 'p2_2', page: 2, sentence_id: 4, text: 'P2 Item 2' },
  { id: 'p2_3', page: 2, sentence_id: 5, text: 'P2 Item 3' },
  // Page 3
  { id: 'p3_1', page: 3, sentence_id: 6, text: 'P3 Item 1' },
  { id: 'p3_2', page: 3, sentence_id: 7, text: 'P3 Item 2' }
];

manager.setData(initialData);

console.log('1. Deleting item "p1_2" (middle item of Page 1)...');
manager.removeItem('p1_2');

const itemsAfterDelete = manager.getAllItems();
console.log('Items after delete:');
itemsAfterDelete.forEach(it => {
  console.log(`Page: ${it.page} | ID: ${it.id} | id_display: ${it.id_display}`);
});

const p1Ids = itemsAfterDelete.filter(it => it.page === 1).map(it => it.id_display);
const p2Ids = itemsAfterDelete.filter(it => it.page === 2).map(it => it.id_display);
const p3Ids = itemsAfterDelete.filter(it => it.page === 3).map(it => it.id_display);

console.log('Page 1 IDs:', p1Ids);
console.log('Page 2 IDs:', p2Ids);
console.log('Page 3 IDs:', p3Ids);

// Assert Page 1 IDs are [0, 1]
assert.deepStrictEqual(p1Ids, [0, 1]);
// Assert Page 2 IDs continue from 2: [2, 3, 4]
assert.deepStrictEqual(p2Ids, [2, 3, 4]);
// Assert Page 3 IDs continue from 5: [5, 6]
assert.deepStrictEqual(p3Ids, [5, 6]);

console.log('\n2. Deleting item "p2_1" (first item of Page 2)...');
manager.removeItem('p2_1');

const itemsAfter2ndDelete = manager.getAllItems();
const p1Ids2 = itemsAfter2ndDelete.filter(it => it.page === 1).map(it => it.id_display);
const p2Ids2 = itemsAfter2ndDelete.filter(it => it.page === 2).map(it => it.id_display);
const p3Ids2 = itemsAfter2ndDelete.filter(it => it.page === 3).map(it => it.id_display);

console.log('Page 1 IDs:', p1Ids2);
console.log('Page 2 IDs:', p2Ids2);
console.log('Page 3 IDs:', p3Ids2);

assert.deepStrictEqual(p1Ids2, [0, 1]);
assert.deepStrictEqual(p2Ids2, [2, 3]);
assert.deepStrictEqual(p3Ids2, [4, 5]);

console.log('\n--- DELETION & REINDEXING TEST PASSED PERFECTLY! ---');
