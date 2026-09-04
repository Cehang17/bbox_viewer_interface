/**
 * BBoxOverlayManager - Handles rendering, interactive selection, resizing handles,
 * and mouse-draw creation matching SignForDeaf PDF editor.
 */

class BBoxOverlayManager {
  constructor() {
    this.bboxesByPage = new Map(); // pageNum -> Array<BBoxItem>
    this.activeBBoxId = null;
    this.onBBoxSelectCallback = null;
    this.onBBoxChangeCallback = null;
    this.onNewBBoxDrawnCallback = null;
    
    // Visibility & Mode State
    this.showAllSentences = true; // true = "All Sentence", false = "Just Selected"
    this.drawMode = false;        // true = "Draw Mode On", false = "Draw Mode Off"
    
    // Page Viewport Cache for active pages
    this.pageRenderCache = new Map(); // pageNum -> { pageWrapper, pageWidth, pageHeight, origSize }

    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandleType = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.elementStartBounds = { left: 0, top: 0, width: 0, height: 0 };
    this.currentDragItem = null;
    this.currentDragPageNum = null;

    this._setupGlobalMouseEvents();
  }

  setData(bboxes) {
    this.bboxesByPage.clear();
    bboxes.forEach((item, idx) => {
      const pageNum = parseInt(item.page, 10) || 1;
      if (!this.bboxesByPage.has(pageNum)) {
        this.bboxesByPage.set(pageNum, []);
      }
      this.bboxesByPage.get(pageNum).push(item);
    });
  }

  getAllItems() {
    const all = [];
    for (const items of this.bboxesByPage.values()) {
      all.push(...items);
    }
    return all;
  }

  onSelect(callback) {
    this.onBBoxSelectCallback = callback;
  }

  onChange(callback) {
    this.onBBoxChangeCallback = callback;
  }

  onNewDrawn(callback) {
    this.onNewBBoxDrawnCallback = callback;
  }

  setDrawMode(enabled) {
    this.drawMode = enabled;
    document.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
      wrapper.classList.toggle('draw-mode', enabled);
    });
  }

  setShowAllSentences(showAll) {
    this.showAllSentences = showAll;
    this.updateVisibility();
  }

  updateVisibility() {
    document.querySelectorAll('.bbox-rect').forEach(el => {
      const isThisActive = el.dataset.id === String(this.activeBBoxId);
      if (this.showAllSentences) {
        el.style.display = 'block';
      } else {
        el.style.display = isThisActive ? 'block' : 'none';
      }
    });
  }

  /**
   * Render overlay bounding boxes on a specific page
   */
  renderPageOverlay(pageWrapper, pageNum, pageWidth, pageHeight, pdfPageOriginalSize) {
    this.pageRenderCache.set(pageNum, { pageWrapper, pageWidth, pageHeight, pdfPageOriginalSize });

    pageWrapper.querySelectorAll('.bbox-overlay-layer').forEach(el => el.remove());

    const overlayLayer = document.createElement('div');
    overlayLayer.className = 'bbox-overlay-layer';
    pageWrapper.appendChild(overlayLayer);

    // Setup interactive drawing listener on wrapper
    this._attachDrawListeners(pageWrapper, pageNum);

    const items = this.bboxesByPage.get(pageNum) || [];
    if (items.length === 0) return;

    // Detect max extents across items on this page
    let maxPageX = 0;
    let maxPageY = 0;
    items.forEach(it => {
      const [x0, y0, x1, y1] = it.rawCoords || [0, 0, 0, 0];
      if (x1 > maxPageX) maxPageX = x1;
      if (y1 > maxPageY) maxPageY = y1;
    });

    const origW = (pdfPageOriginalSize && pdfPageOriginalSize.width) || 595.28;
    const origH = (pdfPageOriginalSize && pdfPageOriginalSize.height) || 841.89;

    let refW = origW;
    let refH = origH;

    if (maxPageX > origW * 1.25 || maxPageY > origH * 1.25) {
      const aspect = origW / origH;
      const dpi150W = origW * (150 / 72); // ~1240
      const dpi200W = origW * (200 / 72); // ~1654
      const dpi300W = origW * (300 / 72); // ~2480

      if (maxPageX <= dpi200W * 1.02 && maxPageX > dpi150W * 0.95) {
        refW = dpi200W;
        refH = origH * (200 / 72);
      } else if (maxPageX <= dpi150W * 1.02 && maxPageX > origW * 1.25) {
        refW = dpi150W;
        refH = origH * (150 / 72);
      } else if (maxPageX > dpi200W && maxPageX <= dpi300W * 1.05) {
        refW = dpi300W;
        refH = origH * (300 / 72);
      } else {
        refW = Math.max(maxPageX * 1.06, maxPageY * aspect);
        refH = refW / aspect;
      }
    }

    const scaleX = pageWidth / refW;
    const scaleY = pageHeight / refH;

    this.pageRenderCache.set(pageNum, { pageWrapper, pageWidth, pageHeight, pdfPageOriginalSize, refW, refH, scaleX, scaleY });

    items.forEach(item => {
      const boxElem = document.createElement('div');
      const isActive = String(this.activeBBoxId) === String(item.id);
      boxElem.className = `bbox-rect ${isActive ? 'active' : ''}`;
      boxElem.dataset.id = item.id;
      const sentenceIdVal = item.sentence_id !== undefined ? item.sentence_id : (item.id_display !== undefined ? item.id_display : item.index);
      boxElem.dataset.sentenceId = String(sentenceIdVal);

      // Visibility filter
      if (!this.showAllSentences && !isActive) {
        boxElem.style.display = 'none';
      }

      const [x0, y0, x1, y1] = item.rawCoords || [0, 0, 0, 0];
      const yOrigin = item.yOrigin || 'top';
      let left = 0, top = 0, width = 0, height = 0;

      if (item.coordType === 'norm_0_1') {
        left = x0 * pageWidth;
        width = (x1 - x0) * pageWidth;
        top = yOrigin === 'bottom' ? (1.0 - y1) * pageHeight : y0 * pageHeight;
        height = (y1 - y0) * pageHeight;
      } else if (item.coordType === 'norm_0_1000') {
        left = (x0 / 1000) * pageWidth;
        width = ((x1 - x0) / 1000) * pageWidth;
        top = yOrigin === 'bottom' ? (1.0 - (y1 / 1000)) * pageHeight : (y0 / 1000) * pageHeight;
        height = ((y1 - y0) / 1000) * pageHeight;
      } else if (item.coordType === 'pdf_points' || (refW <= origW * 1.25 && (x1 <= origW * 1.25 && y1 <= origH * 1.25))) {
        // Direct PDF points (72 DPI standard)
        const pdfScaleX = pageWidth / origW;
        const pdfScaleY = pageHeight / origH;
        left = x0 * pdfScaleX;
        width = (x1 - x0) * pdfScaleX;
        top = yOrigin === 'bottom' ? (origH - y1) * pdfScaleY : y0 * pdfScaleY;
        height = (y1 - y0) * pdfScaleY;
      } else {
        // High DPI (e.g. 200/300 DPI image pixels from Surya OCR / DocLayout-YOLO)
        left = x0 * scaleX;
        width = (x1 - x0) * scaleX;
        top = yOrigin === 'bottom' ? (refH - y1) * scaleY : y0 * scaleY;
        height = (y1 - y0) * scaleY;
      }

      width = Math.max(width, 8);
      height = Math.max(height, 8);

      boxElem.style.left = `${Math.round(left)}px`;
      boxElem.style.top = `${Math.round(top)}px`;
      boxElem.style.width = `${Math.round(width)}px`;
      boxElem.style.height = `${Math.round(height)}px`;

      // Red ID badge at the top-right / right side
      const badge = document.createElement('span');
      badge.className = 'bbox-tag-badge';
      // Use custom sentence id or display id
      badge.textContent = item.id_display !== undefined ? item.id_display : (item.sentence_id !== undefined ? item.sentence_id : item.index);
      boxElem.appendChild(badge);

      // 8 Resize Handles (nw, n, ne, e, se, s, sw, w)
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `bbox-handle ${dir}`;
        handle.dataset.dir = dir;
        boxElem.appendChild(handle);
      });

      // Box click & drag listeners
      boxElem.addEventListener('mousedown', (e) => {
        if (this.drawMode) return;
        e.stopPropagation();

        if (e.target.classList.contains('bbox-handle')) {
          // Resize start
          this.isResizing = true;
          this.resizeHandleType = e.target.dataset.dir;
          this.currentDragItem = item;
          this.currentDragPageNum = pageNum;
          this.dragStartPos = { x: e.clientX, y: e.clientY };
          this.elementStartBounds = {
            left: parseFloat(boxElem.style.left),
            top: parseFloat(boxElem.style.top),
            width: parseFloat(boxElem.style.width),
            height: parseFloat(boxElem.style.height)
          };
        } else {
          // Move / select start
          this.selectBBox(item.id, true);
          this.isDragging = true;
          this.currentDragItem = item;
          this.currentDragPageNum = pageNum;
          this.dragStartPos = { x: e.clientX, y: e.clientY };
          this.elementStartBounds = {
            left: parseFloat(boxElem.style.left),
            top: parseFloat(boxElem.style.top),
            width: parseFloat(boxElem.style.width),
            height: parseFloat(boxElem.style.height)
          };
        }
      });

      overlayLayer.appendChild(boxElem);
    });
  }

  /**
   * Set active bounding box and sync
   */
  selectBBox(bboxId, triggerCallback = false) {
    this.activeBBoxId = bboxId;

    let foundItem = null;
    for (const items of this.bboxesByPage.values()) {
      const match = items.find(it => String(it.id) === String(bboxId));
      if (match) {
        foundItem = match;
        break;
      }
    }

    const sId = foundItem ? String(foundItem.sentence_id !== undefined ? foundItem.sentence_id : foundItem.id_display) : null;

    document.querySelectorAll('.bbox-rect').forEach(el => {
      const isExactMatch = el.dataset.id === String(bboxId);
      const isSentenceMatch = sId !== null && el.dataset.sentenceId === sId;

      el.classList.toggle('active', isExactMatch);
      el.classList.toggle('same-sentence', isSentenceMatch && !isExactMatch);

      if (!this.showAllSentences) {
        el.style.display = (isExactMatch || isSentenceMatch) ? 'block' : 'none';
      }
    });

    if (foundItem && triggerCallback && this.onBBoxSelectCallback) {
      this.onBBoxSelectCallback(foundItem);
    }

    return foundItem;
  }

  /**
   * Remove a bbox and shift/decrement all subsequent IDs
   */
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
      // Re-index all remaining items across pages sequentially
      this.reindexAllItems();

      // Re-render all active cached pages so all red badges update immediately
      for (const [pNum, cache] of this.pageRenderCache.entries()) {
        if (cache && cache.pageWrapper) {
          this.renderPageOverlay(cache.pageWrapper, pNum, cache.pageWidth, cache.pageHeight, cache.pdfPageOriginalSize);
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Re-assign sequential sentence IDs to all items across all pages without resetting per page
   */
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

  /**
   * Re-render all cached pages in the DOM
   */
  reRenderAllPages() {
    for (const [pNum, cache] of this.pageRenderCache.entries()) {
      if (cache && cache.pageWrapper) {
        this.renderPageOverlay(cache.pageWrapper, pNum, cache.pageWidth, cache.pageHeight, cache.pdfPageOriginalSize);
      }
    }
  }

  /**
   * Move / Insert BBox at target ID and shift all subsequent items up by 1
   * (e.g. if moved to 116, it takes ID 116, and existing 116 becomes 117, 117 becomes 118, etc.)
   */
  reorderBBoxId(bboxId, targetIdStr) {
    const targetId = parseInt(targetIdStr, 10);
    if (isNaN(targetId)) return false;

    const allItems = this.getAllItems();
    const currentItem = allItems.find(it => String(it.id) === String(bboxId));
    if (!currentItem) return false;

    const currentSentenceId = (currentItem.sentence_id !== undefined && currentItem.sentence_id !== null)
      ? currentItem.sentence_id
      : currentItem.id_display;

    // Identify all sibling lines belonging to this sentence on this page
    const movingItems = allItems.filter(it => {
      if (it.page !== currentItem.page) return false;
      const sId = (it.sentence_id !== undefined && it.sentence_id !== null) ? it.sentence_id : it.id_display;
      return String(it.id) === String(bboxId) || (sId !== undefined && sId === currentSentenceId);
    });

    if (movingItems.length === 0) return false;

    // Remove moving items from their current page list
    const sourcePageItems = this.bboxesByPage.get(currentItem.page) || [];
    movingItems.forEach(mIt => {
      const idx = sourcePageItems.findIndex(it => String(it.id) === String(mIt.id));
      if (idx !== -1) sourcePageItems.splice(idx, 1);
    });

    // Find the target location based on targetId (sentence ID / id_display)
    const remainingItems = this.getAllItems();
    
    // Find all items belonging to the target sentence ID
    const targetSiblings = remainingItems.filter(it => it.id_display === targetId || it.sentence_id === targetId);

    if (targetSiblings.length > 0) {
      const targetItem = targetSiblings[0];
      const targetPageNum = targetItem.page;
      const targetPageItems = this.bboxesByPage.get(targetPageNum) || [];

      // Update page property of moving items if page changed
      movingItems.forEach(mIt => mIt.page = targetPageNum);

      const isMovingForward = (currentSentenceId !== undefined && currentSentenceId < targetId);

      if (isMovingForward) {
        // When moving forward: insert right AFTER the last sibling line of target sentence
        const lastTargetSibling = targetSiblings[targetSiblings.length - 1];
        const lastIdx = targetPageItems.findIndex(it => String(it.id) === String(lastTargetSibling.id));
        const insertPos = (lastIdx !== -1) ? lastIdx + 1 : targetPageItems.length;
        targetPageItems.splice(insertPos, 0, ...movingItems);
      } else {
        // When moving backward: insert right BEFORE the first sibling line of target sentence
        const firstTargetSibling = targetSiblings[0];
        const firstIdx = targetPageItems.findIndex(it => String(it.id) === String(firstTargetSibling.id));
        const insertPos = (firstIdx !== -1) ? firstIdx : 0;
        targetPageItems.splice(insertPos, 0, ...movingItems);
      }
    } else {
      // Target ID does not currently exist: find closest position or boundary
      const pageNumbers = Array.from(this.bboxesByPage.keys()).sort((a, b) => Number(a) - Number(b));
      if (pageNumbers.length === 0) {
        pageNumbers.push(1);
        this.bboxesByPage.set(1, []);
      }

      if (targetId <= 0) {
        // Insert at the very start of page 1
        const firstPage = pageNumbers[0];
        const firstPageItems = this.bboxesByPage.get(firstPage) || [];
        movingItems.forEach(mIt => mIt.page = firstPage);
        firstPageItems.unshift(...movingItems);
      } else {
        // Find closest preceding item with id_display < targetId
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
          // Insert at the very end of the last page
          const lastPage = pageNumbers[pageNumbers.length - 1];
          const lastPageItems = this.bboxesByPage.get(lastPage) || [];
          movingItems.forEach(mIt => mIt.page = lastPage);
          lastPageItems.push(...movingItems);
        }
      }
    }

    // Re-index all items consecutively across pages
    this.reindexAllItems();
    this.reRenderAllPages();
    return true;
  }

  /**
   * Merge selected BBox into an existing sentence (Add Existed Sentence mode)
   */
  mergeToExistingSentence(bboxId, targetIdStr) {
    const targetId = parseInt(targetIdStr, 10);
    if (isNaN(targetId)) return false;

    const allItems = this.getAllItems();
    const currentItem = allItems.find(it => String(it.id) === String(bboxId));
    if (!currentItem) return false;

    const targetItem = allItems.find(it => (it.id_display === targetId || it.sentence_id === targetId) && String(it.id) !== String(bboxId));
    if (!targetItem) return false;

    // Both currentItem and targetItem belong to the same sentence now:
    const targetSentenceId = (targetItem.sentence_id !== undefined && targetItem.sentence_id !== null)
      ? targetItem.sentence_id
      : targetItem.id_display;

    currentItem.sentence_id = targetSentenceId;
    currentItem.id_display = targetItem.id_display;

    // Merge fullSentenceText
    const targetFullText = targetItem.fullSentenceText || targetItem.text || '';
    const currentText = currentItem.text || '';
    let joinedText = targetFullText;
    if (currentText && !targetFullText.includes(currentText)) {
      joinedText = `${targetFullText} ${currentText}`.trim();
    }
    targetItem.fullSentenceText = joinedText;
    currentItem.fullSentenceText = joinedText;

    // Place currentItem adjacent to targetItem on that page
    const sourcePageItems = this.bboxesByPage.get(currentItem.page) || [];
    const currIdx = sourcePageItems.findIndex(it => String(it.id) === String(bboxId));
    if (currIdx !== -1) sourcePageItems.splice(currIdx, 1);

    currentItem.page = targetItem.page;
    const targetPageItems = this.bboxesByPage.get(targetItem.page) || [];
    const tIdx = targetPageItems.findIndex(it => String(it.id) === String(targetItem.id));
    const insertPos = (tIdx !== -1) ? tIdx + 1 : targetPageItems.length;
    targetPageItems.splice(insertPos, 0, currentItem);

    this.reindexAllItems();
    this.reRenderAllPages();
    return targetItem;
  }

  /**
   * Update text on current item
   */
  updateActiveItemData(newId, newText) {
    if (!this.activeBBoxId) return;

    for (const [pageNum, items] of this.bboxesByPage.entries()) {
      const match = items.find(it => String(it.id) === String(this.activeBBoxId));
      if (match) {
        if (newText !== undefined) {
          match.text = newText;
          match.fullSentenceText = newText;
          const sId = match.sentence_id !== undefined ? match.sentence_id : match.id_display;
          items.forEach(it => {
            const itSId = it.sentence_id !== undefined ? it.sentence_id : it.id_display;
            if (itSId === sId) {
              it.fullSentenceText = newText;
            }
          });
        }
        break;
      }
    }
  }

  /**
   * Interactive Drawing Mode setup
   */
  _attachDrawListeners(pageWrapper, pageNum) {
    let isDrawing = false;
    let drawStartX = 0;
    let drawStartY = 0;
    let previewBox = null;

    pageWrapper.addEventListener('mousedown', (e) => {
      if (!this.drawMode) return;
      if (e.target.closest('.bbox-rect')) return;

      isDrawing = true;
      const rect = pageWrapper.getBoundingClientRect();
      drawStartX = e.clientX - rect.left;
      drawStartY = e.clientY - rect.top;

      previewBox = document.createElement('div');
      previewBox.className = 'draw-preview-box';
      previewBox.style.left = `${drawStartX}px`;
      previewBox.style.top = `${drawStartY}px`;
      previewBox.style.width = '0px';
      previewBox.style.height = '0px';
      pageWrapper.appendChild(previewBox);

      const onMouseMove = (moveEvent) => {
        if (!isDrawing || !previewBox) return;
        const curX = moveEvent.clientX - rect.left;
        const curY = moveEvent.clientY - rect.top;

        const left = Math.min(drawStartX, curX);
        const top = Math.min(drawStartY, curY);
        const width = Math.abs(curX - drawStartX);
        const height = Math.abs(curY - drawStartY);

        previewBox.style.left = `${left}px`;
        previewBox.style.top = `${top}px`;
        previewBox.style.width = `${width}px`;
        previewBox.style.height = `${height}px`;
      };

      const onMouseUp = (upEvent) => {
        if (!isDrawing) return;
        isDrawing = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (previewBox) {
          const width = parseFloat(previewBox.style.width);
          const height = parseFloat(previewBox.style.height);
          const left = parseFloat(previewBox.style.left);
          const top = parseFloat(previewBox.style.top);
          previewBox.remove();

          // If box has meaningful size (> 10px)
          if (width > 10 && height > 10) {
            this._createNewBoxFromDrawnPixels(pageNum, left, top, width, height);
          }
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  _createNewBoxFromDrawnPixels(pageNum, left, top, width, height) {
    const cache = this.pageRenderCache.get(pageNum);
    if (!cache) return;

    const allItems = this.getAllItems();
    const newIdx = allItems.length + 1;
    const newId = `bbox-custom-${Date.now()}`;

    // Normalize coordinates back to reference space
    const origW = (cache.pdfPageOriginalSize && cache.pdfPageOriginalSize.width) || 595.28;
    const origH = (cache.pdfPageOriginalSize && cache.pdfPageOriginalSize.height) || 841.89;
    const dpi200W = origW * (200 / 72); // 1654
    const dpi200H = origH * (200 / 72); // 2338

    const scaleX = dpi200W / cache.pageWidth;
    const scaleY = dpi200H / cache.pageHeight;

    const x0 = Math.round(left * scaleX);
    const y0 = Math.round(top * scaleY);
    const x1 = Math.round((left + width) * scaleX);
    const y1 = Math.round((top + height) * scaleY);

    const newItem = {
      id: newId,
      index: newIdx,
      id_display: allItems.length,
      page: pageNum,
      text: "Yeni Cümle / Paragraf",
      rawCoords: [x0, y0, x1, y1],
      coordType: 'image_pixels',
      yOrigin: 'top',
      confidence: 1.0,
      category: 'plain text'
    };

    if (!this.bboxesByPage.has(pageNum)) {
      this.bboxesByPage.set(pageNum, []);
    }
    this.bboxesByPage.get(pageNum).push(newItem);

    // Re-render page
    this.renderPageOverlay(cache.pageWrapper, pageNum, cache.pageWidth, cache.pageHeight, cache.pdfPageOriginalSize);
    this.selectBBox(newId, true);

    if (this.onNewBBoxDrawnCallback) {
      this.onNewBBoxDrawnCallback(newItem);
    }
  }

  /**
   * Handle dragging and resizing of existing bounding boxes
   */
  _setupGlobalMouseEvents() {
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging && !this.isResizing) return;
      if (!this.currentDragItem || !this.currentDragPageNum) return;

      const cache = this.pageRenderCache.get(this.currentDragPageNum);
      if (!cache) return;

      const boxElem = document.querySelector(`.bbox-rect[data-id="${this.currentDragItem.id}"]`);
      if (!boxElem) return;

      const dx = e.clientX - this.dragStartPos.x;
      const dy = e.clientY - this.dragStartPos.y;

      if (this.isDragging) {
        const newLeft = Math.max(0, Math.min(cache.pageWidth - this.elementStartBounds.width, this.elementStartBounds.left + dx));
        const newTop = Math.max(0, Math.min(cache.pageHeight - this.elementStartBounds.height, this.elementStartBounds.top + dy));
        boxElem.style.left = `${Math.round(newLeft)}px`;
        boxElem.style.top = `${Math.round(newTop)}px`;
      } else if (this.isResizing) {
        let { left, top, width, height } = this.elementStartBounds;
        const dir = this.resizeHandleType;

        if (dir.includes('e')) width = Math.max(10, width + dx);
        if (dir.includes('s')) height = Math.max(10, height + dy);
        if (dir.includes('w')) {
          const possibleW = width - dx;
          if (possibleW > 10) {
            left = left + dx;
            width = possibleW;
          }
        }
        if (dir.includes('n')) {
          const possibleH = height - dy;
          if (possibleH > 10) {
            top = top + dy;
            height = possibleH;
          }
        }

        boxElem.style.left = `${Math.round(left)}px`;
        boxElem.style.top = `${Math.round(top)}px`;
        boxElem.style.width = `${Math.round(width)}px`;
        boxElem.style.height = `${Math.round(height)}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging || this.isResizing) {
        if (this.currentDragItem && this.currentDragPageNum) {
          const cache = this.pageRenderCache.get(this.currentDragPageNum);
          const boxElem = document.querySelector(`.bbox-rect[data-id="${this.currentDragItem.id}"]`);
          if (cache && boxElem) {
            const currentLeft = parseFloat(boxElem.style.left);
            const currentTop = parseFloat(boxElem.style.top);
            const currentWidth = parseFloat(boxElem.style.width);
            const currentHeight = parseFloat(boxElem.style.height);

            this._updateItemCoordsFromElement(this.currentDragItem, currentLeft, currentTop, currentWidth, currentHeight, cache);
          }
        }
        this.isDragging = false;
        this.isResizing = false;
        this.currentDragItem = null;
        this.currentDragPageNum = null;
      }
    });
  }

  _updateItemCoordsFromElement(item, left, top, width, height, cache) {
    const { pageWidth, pageHeight, scaleX, scaleY, refH } = cache;
    const yOrigin = item.yOrigin || 'top';

    if (item.coordType === 'norm_0_1') {
      const x0 = left / pageWidth;
      const x1 = (left + width) / pageWidth;
      let y0, y1;
      if (yOrigin === 'bottom') {
        y1 = 1.0 - (top / pageHeight);
        y0 = 1.0 - ((top + height) / pageHeight);
      } else {
        y0 = top / pageHeight;
        y1 = (top + height) / pageHeight;
      }
      item.rawCoords = [x0, y0, x1, y1];
    } else if (item.coordType === 'norm_0_1000') {
      const x0 = (left / pageWidth) * 1000;
      const x1 = ((left + width) / pageWidth) * 1000;
      let y0, y1;
      if (yOrigin === 'bottom') {
        y1 = (1.0 - (top / pageHeight)) * 1000;
        y0 = (1.0 - ((top + height) / pageHeight)) * 1000;
      } else {
        y0 = (top / pageHeight) * 1000;
        y1 = ((top + height) / pageHeight) * 1000;
      }
      item.rawCoords = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
    } else {
      const sX = scaleX || (pageWidth / 595.28);
      const sY = scaleY || (pageHeight / 841.89);
      const rH = refH || 841.89;

      const x0 = left / sX;
      const x1 = (left + width) / sX;
      let y0, y1;
      if (yOrigin === 'bottom') {
        y1 = rH - (top / sY);
        y0 = rH - ((top + height) / sY);
      } else {
        y0 = top / sY;
        y1 = (top + height) / sY;
      }
      item.rawCoords = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
    }

    if (this.onBBoxChangeCallback) {
      this.onBBoxChangeCallback(item);
    }
  }
}

window.BBoxOverlayManager = BBoxOverlayManager;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BBoxOverlayManager;
}
