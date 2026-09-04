const assert = require('assert');

// Test the exact BBoxOverlayManager reorderBBoxId and mergeToExistingSentence logic
class TestOverlayManager {
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

  reorderBBoxId(bboxId, targetIdStr) {
    const targetId = parseInt(targetIdStr, 10);
    if (isNaN(targetId)) return false;

    const allItems = this.getAllItems();
    const currentItem = allItems.find(it => String(it.id) === String(bboxId));
    if (!currentItem) return false;

    const currentSentenceId = (currentItem.sentence_id !== undefined && currentItem.sentence_id !== null)
      ? currentItem.sentence_id
      : currentItem.id_display;

    const movingItems = allItems.filter(it => {
      if (it.page !== currentItem.page) return false;
      const sId = (it.sentence_id !== undefined && it.sentence_id !== null) ? it.sentence_id : it.id_display;
      return String(it.id) === String(bboxId) || (sId !== undefined && sId === currentSentenceId);
    });

    if (movingItems.length === 0) return false;

    const sourcePageItems = this.bboxesByPage.get(currentItem.page) || [];
    movingItems.forEach(mIt => {
      const idx = sourcePageItems.findIndex(it => String(it.id) === String(mIt.id));
      if (idx !== -1) sourcePageItems.splice(idx, 1);
    });

    const remainingItems = this.getAllItems();
    const targetSiblings = remainingItems.filter(it => it.id_display === targetId || it.sentence_id === targetId);

    if (targetSiblings.length > 0) {
      const targetItem = targetSiblings[0];
      const targetPageNum = targetItem.page;
      const targetPageItems = this.bboxesByPage.get(targetPageNum) || [];

      movingItems.forEach(mIt => mIt.page = targetPageNum);

      const isMovingForward = (currentSentenceId !== undefined && currentSentenceId < targetId);

      if (isMovingForward) {
        const lastTargetSibling = targetSiblings[targetSiblings.length - 1];
        const lastIdx = targetPageItems.findIndex(it => String(it.id) === String(lastTargetSibling.id));
        const insertPos = (lastIdx !== -1) ? lastIdx + 1 : targetPageItems.length;
        targetPageItems.splice(insertPos, 0, ...movingItems);
      } else {
        const firstTargetSibling = targetSiblings[0];
        const firstIdx = targetPageItems.findIndex(it => String(it.id) === String(firstTargetSibling.id));
        const insertPos = (firstIdx !== -1) ? firstIdx : 0;
        targetPageItems.splice(insertPos, 0, ...movingItems);
      }
    } else {
      const pageNumbers = Array.from(this.bboxesByPage.keys()).sort((a, b) => Number(a) - Number(b));
      if (pageNumbers.length === 0) {
        pageNumbers.push(1);
        this.bboxesByPage.set(1, []);
      }

      if (targetId <= 0) {
        const firstPage = pageNumbers[0];
        const firstPageItems = this.bboxesByPage.get(firstPage) || [];
        movingItems.forEach(mIt => mIt.page = firstPage);
        firstPageItems.unshift(...movingItems);
      } else {
        let bestPrecedingItem = null;
        for (const it of remainingItems) {
          const itId = it.id_display !== undefined ? it.id_display : it.sentence_id;
          if (itId !== undefined && itId < targetId) {
            if (!bestPrecedingItem || itId > (bestPrecedingItem.id_display !== undefined ? bestPrecedingItem.id_display : bestPrecedingItem.sentence_id)) {
              bestPrecedingItem = it;
            }
          }
        }

        if (bestPrecedingItem) {
          const targetPageNum = bestPrecedingItem.page;
          const targetPageItems = this.bboxesByPage.get(targetPageNum) || [];
          movingItems.forEach(mIt => mIt.page = targetPageNum);
          const pIdx = targetPageItems.findIndex(it => String(it.id) === String(bestPrecedingItem.id));
          const insertPos = (pIdx !== -1) ? pIdx + 1 : targetPageItems.length;
          targetPageItems.splice(insertPos, 0, ...movingItems);
        } else {
          const lastPage = pageNumbers[pageNumbers.length - 1];
          const lastPageItems = this.bboxesByPage.get(lastPage) || [];
          movingItems.forEach(mIt => mIt.page = lastPage);
          lastPageItems.push(...movingItems);
        }
      }
    }

    this.reindexAllItems();
    return true;
  }
}

console.log('--- TESTING ACCURATE ID REORDERING & RENAMING ---');

const manager = new TestOverlayManager();

// Setup 150 items across 2 pages
const items = [];
for (let i = 0; i <= 150; i++) {
  const p = i < 100 ? 1 : 2;
  items.push({
    id: `item_${i}`,
    page: p,
    sentence_id: i,
    id_display: i,
    text: `Sentence text ${i}`
  });
}

manager.setData(items);
manager.reindexAllItems();

console.log('1. Moving item "item_150" (current ID 150) to ID 116...');
manager.reorderBBoxId('item_150', '116');

const allAfter1 = manager.getAllItems();
const movedItem1 = allAfter1.find(it => it.id === 'item_150');
console.log(`   item_150 new ID: ${movedItem1.id_display}`);
assert.strictEqual(movedItem1.id_display, 116, 'item_150 must have EXACTLY ID 116!');

const oldItem116 = allAfter1.find(it => it.id === 'item_116');
console.log(`   item_116 shifted to ID: ${oldItem116.id_display}`);
assert.strictEqual(oldItem116.id_display, 117, 'Former item_116 must shift to 117!');

console.log('2. Moving item "item_0" (current ID 0) forward to ID 50...');
manager.reorderBBoxId('item_0', '50');

const allAfter2 = manager.getAllItems();
const movedItem0 = allAfter2.find(it => it.id === 'item_0');
console.log(`   item_0 new ID: ${movedItem0.id_display}`);
assert.strictEqual(movedItem0.id_display, 50, 'item_0 must have EXACTLY ID 50!');

console.log('\n--- ALL ID REORDERING TESTS PASSED PERFECTLY! ---');
