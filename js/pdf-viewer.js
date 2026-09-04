/**
 * PDFViewer - PDF rendering and viewport management using PDF.js
 */

// Configure PDF.js worker safely
if (typeof window !== 'undefined' && window.pdfjsLib) {
  try {
    if (window.location && window.location.protocol === 'file:') {
      // In file:// context, let pdfjs use inline fake worker to prevent browser file:// worker security restrictions
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    } else {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';
    }
  } catch (e) {
    console.warn('PDF.js worker setup warning:', e);
  }
}

class PDFViewer {
  constructor(containerElement, overlayManager) {
    this.container = containerElement; // #pdf-scroll-view
    this.overlayManager = overlayManager;
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.25; // default 125%
    this.pageRenderTasks = new Map();
    this.pageOriginalSizes = new Map();
    this.onPageChangeCallback = null;
    this.onScaleChangeCallback = null;
    this.intersectionObserver = null;

    this._setupIntersectionObserver();
  }

  _setupIntersectionObserver() {
    if (typeof window === 'undefined' || !window.IntersectionObserver || !this.container) return;
    try {
      this.intersectionObserver = new window.IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.dataset.pageNumber, 10);
            if (!isNaN(pageNum) && pageNum !== this.currentPage) {
              this.currentPage = pageNum;
              if (this.onPageChangeCallback) {
                this.onPageChangeCallback(this.currentPage, this.totalPages);
              }
            }
          }
        });
      }, {
        root: this.container,
        threshold: 0.4
      });
    } catch (e) {
      console.warn('IntersectionObserver setup failed:', e);
    }
  }

  /**
   * Load PDF from an ArrayBuffer, Uint8Array or URL
   */
  async loadDocument(data) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js kütüphanesi yüklenemedi. Lütfen sayfayı yenileyin.');
    }

    // Cancel any ongoing rendering
    this.pageRenderTasks.forEach(task => task.cancel && task.cancel());
    this.pageRenderTasks.clear();
    this.pageOriginalSizes.clear();
    this.container.innerHTML = '';

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: data });
      this.pdfDoc = await loadingTask.promise;
    } catch (workerErr) {
      console.warn('Primary PDF load failed, attempting with main-thread worker...', workerErr);
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        const fallbackTask = window.pdfjsLib.getDocument({ data: data });
        this.pdfDoc = await fallbackTask.promise;
      } catch (fallbackErr) {
        throw new Error('PDF belgesi okunamadı: ' + (fallbackErr.message || fallbackErr));
      }
    }

    this.totalPages = this.pdfDoc.numPages;
    this.currentPage = 1;

    // Cache original dimensions of each page
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const page = await this.pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      this.pageOriginalSizes.set(pageNum, {
        width: unscaledViewport.width,
        height: unscaledViewport.height
      });
    }

    // Render all pages
    await this.renderAllPages();

    if (this.onPageChangeCallback) {
      this.onPageChangeCallback(this.currentPage, this.totalPages);
    }

    if (this.onScaleChangeCallback) {
      this.onScaleChangeCallback(this.scale);
    }

    return this.totalPages;
  }

  /**
   * Render all pages sequentially into the container
   */
  async renderAllPages() {
    if (!this.pdfDoc) return;

    this.container.innerHTML = '';

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = `pdf-page-${pageNum}`;
      pageWrapper.dataset.pageNumber = pageNum;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      pageWrapper.appendChild(canvas);

      this.container.appendChild(pageWrapper);

      // Render single page
      await this._renderSinglePage(pageNum, pageWrapper, canvas);
    }
  }

  /**
   * Render individual page canvas and trigger overlay
   */
  async _renderSinglePage(pageNum, pageWrapper, canvas) {
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });

    // Handle high DPI displays for crystal-clear text
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);

    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    pageWrapper.style.width = `${Math.floor(viewport.width)}px`;
    pageWrapper.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    const renderTask = page.render(renderContext);
    this.pageRenderTasks.set(pageNum, renderTask);

    try {
      await renderTask.promise;
      // After canvas is rendered, draw the bounding boxes
      const origSize = this.pageOriginalSizes.get(pageNum);
      this.overlayManager.renderPageOverlay(
        pageWrapper,
        pageNum,
        viewport.width,
        viewport.height,
        origSize
      );
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error(`Page ${pageNum} render error:`, err);
      }
    }
  }

  /**
   * Re-render existing pages (e.g. after zoom)
   */
  async reRenderOverlays() {
    if (!this.pdfDoc) return;
    await this.renderAllPages();
  }

  /**
   * Zoom controls
   */
  async setZoom(newScale) {
    newScale = Math.min(Math.max(newScale, 0.3), 4.0);
    this.scale = Math.round(newScale * 100) / 100;
    await this.renderAllPages();

    if (this.onScaleChangeCallback) {
      this.onScaleChangeCallback(this.scale);
    }
  }

  zoomIn() {
    this.setZoom(this.scale + 0.15);
  }

  zoomOut() {
    this.setZoom(this.scale - 0.15);
  }

  async fitToWidth() {
    if (!this.pdfDoc || this.pageOriginalSizes.size === 0) return;
    const firstPage = this.pageOriginalSizes.get(1);
    const containerWidth = this.container.clientWidth - 80; // account for padding
    if (firstPage && containerWidth > 0) {
      const targetScale = containerWidth / firstPage.width;
      await this.setZoom(targetScale);
    }
  }

  async fitToPage() {
    if (!this.pdfDoc || this.pageOriginalSizes.size === 0) return;
    const firstPage = this.pageOriginalSizes.get(1);
    const containerHeight = this.container.clientHeight - 80;
    if (firstPage && containerHeight > 0) {
      const targetScale = containerHeight / firstPage.height;
      await this.setZoom(targetScale);
    }
  }

  /**
   * Scroll to a specific page
   */
  scrollToPage(pageNum) {
    const pageEl = document.getElementById(`pdf-page-${pageNum}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Scroll smoothly and center on a specific BBox
   */
  scrollToBBox(bboxItem) {
    const pageNum = bboxItem.page || 1;
    const pageEl = document.getElementById(`pdf-page-${pageNum}`);
    if (!pageEl) return;

    const boxEl = pageEl.querySelector(`.bbox-rect[data-id="${bboxItem.id}"]`);
    if (boxEl) {
      boxEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } else {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Extract all text lines with exact bounding coordinates for a given page
   * @param {number} pageNum
   * @returns {Promise<Array<{text: string, rawCoords: number[], pdfX0: number, pdfY0: number, pdfX1: number, pdfY1: number, h: number}>>}
   */
  async getPageTextLines(pageNum) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) return [];
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const origH = unscaledViewport.height;

      const rawItems = textContent.items.filter(it => it.str && it.str.trim());
      if (rawItems.length === 0) return [];

      // Sort items by reading order: top-to-bottom, then left-to-right
      rawItems.sort((a, b) => {
        const ya = origH - a.transform[5];
        const yb = origH - b.transform[5];
        if (Math.abs(ya - yb) > 4) return ya - yb;
        return a.transform[4] - b.transform[4];
      });

      const lines = [];

      rawItems.forEach(it => {
        const fontSize = Math.hypot(it.transform[0], it.transform[1]) || 10;
        const tx = it.transform[4];
        const ty = it.transform[5];
        const w = it.width;
        // Text ascent and descent for tight, accurate bounding box
        const ascent = fontSize * 0.85;
        const descent = fontSize * 0.20;

        const pdfX0 = Math.round(tx * 10) / 10;
        const pdfY0 = Math.round(Math.max(0, origH - (ty + ascent)) * 10) / 10;
        const pdfX1 = Math.round((tx + w) * 10) / 10;
        const pdfY1 = Math.round(Math.min(origH, origH - (ty - descent)) * 10) / 10;

        // Find existing adjacent line segment on the SAME vertical baseline
        // Gap threshold: do not merge across columns or table cells (max fontSize * 2.2)
        const maxGap = Math.max(fontSize * 2.2, 14);
        const match = lines.find(seg => {
          const sameY = Math.abs(seg.pdfY0 - pdfY0) < fontSize * 0.45 && Math.abs(seg.pdfY1 - pdfY1) < fontSize * 0.45;
          if (!sameY) return false;
          const isAdjacent = (pdfX0 >= seg.pdfX1 - 3 && pdfX0 <= seg.pdfX1 + maxGap) ||
                             (seg.pdfX0 >= pdfX1 - 3 && seg.pdfX0 <= pdfX1 + maxGap);
          return isAdjacent;
        });

        if (match) {
          if (pdfX0 > match.pdfX0) {
            match.text += ' ' + it.str.trim();
          } else {
            match.text = it.str.trim() + ' ' + match.text;
          }
          match.pdfX0 = Math.min(match.pdfX0, pdfX0);
          match.pdfY0 = Math.min(match.pdfY0, pdfY0);
          match.pdfX1 = Math.max(match.pdfX1, pdfX1);
          match.pdfY1 = Math.max(match.pdfY1, pdfY1);
          match.rawCoords = [match.pdfX0, match.pdfY0, match.pdfX1, match.pdfY1];
          match.bbox = [match.pdfX0, match.pdfY0, match.pdfX1, match.pdfY1];
        } else {
          lines.push({
            text: it.str.trim(),
            pdfX0, pdfY0, pdfX1, pdfY1,
            rawCoords: [pdfX0, pdfY0, pdfX1, pdfY1],
            bbox: [pdfX0, pdfY0, pdfX1, pdfY1],
            fontSize,
            h: Math.max(pdfY1 - pdfY0, fontSize)
          });
        }
      });

      // Sort lines by column / reading order
      lines.sort((a, b) => {
        if (Math.abs(a.pdfY0 - b.pdfY0) > a.h * 0.8) {
          return a.pdfY0 - b.pdfY0;
        }
        return a.pdfX0 - b.pdfX0;
      });

      return lines;
    } catch (e) {
      console.warn('Could not extract page text lines:', e);
      return [];
    }
  }

  /**
   * Automatically detect all text paragraphs from the PDF document that are NOT
   * covered by any existing bounding box, and create bounding boxes for them
   * using strict Turkish NLP sentence splitting and multi-line boundary rules.
   */
  async detectMissingBBoxesFromPDF(existingBBoxes = []) {
    if (!this.pdfDoc) return [];

    const newDetectedItems = [];
    const Splitter = (typeof SentenceSplitter !== 'undefined')
      ? SentenceSplitter
      : (typeof require !== 'undefined' ? (() => { try { return require('./sentence-splitter.js'); } catch(e) { return null; } })() : null);

    let maxSentenceNum = 0;
    existingBBoxes.forEach(b => {
      const sId = parseInt(b.sentence_id !== undefined ? b.sentence_id : (b.id_display !== undefined ? b.id_display : b.index), 10);
      if (!isNaN(sId) && sId > maxSentenceNum) maxSentenceNum = sId;
    });
    let nextSentenceNum = maxSentenceNum + 1;

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const lines = await this.getPageTextLines(pageNum);
      if (lines.length === 0) continue;

      const pageExisting = existingBBoxes.filter(b => (b.page || 1) === pageNum);

      // Filter lines not covered by existing boxes
      const uncoveredLines = lines.filter(line => {
        const [lx0, ly0, lx1, ly1] = line.rawCoords || [0, 0, 0, 0];
        const midX = (lx0 + lx1) / 2;
        const midY = (ly0 + ly1) / 2;

        const isCovered = pageExisting.some(ex => {
          const [exX0, exY0, exX1, exY1] = ex.rawCoords || [0, 0, 0, 0];
          return midX >= exX0 - 10 && midX <= exX1 + 10 && midY >= exY0 - 8 && midY <= exY1 + 8;
        });

        return !isCovered;
      });

      if (uncoveredLines.length === 0) continue;

      if (Splitter && typeof Splitter.processPageLinesIntoSentences === 'function') {
        const res = Splitter.processPageLinesIntoSentences(uncoveredLines, pageNum, nextSentenceNum);
        newDetectedItems.push(...res.items);
        nextSentenceNum = res.nextSentenceNumber;
      } else {
        uncoveredLines.forEach((ln, idx) => {
          newDetectedItems.push({
            id: `auto-bbox-p${pageNum}-${nextSentenceNum}`,
            page: pageNum,
            sentence_id: nextSentenceNum,
            id_display: nextSentenceNum,
            sentence_number: nextSentenceNum++,
            text: ln.text,
            fullSentenceText: ln.text,
            rawCoords: ln.rawCoords,
            coordType: 'abs_points',
            category: 'Sentence',
            confidence: 0.99
          });
        });
      }
    }

    return newDetectedItems;
  }
}

// Attach to window
window.PDFViewer = PDFViewer;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFViewer;
}

