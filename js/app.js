/**
 * App Controller - SignForDeaf PDF Reader & JSON Sentence Editor
 */

function initApp() {
  // Application State
  const state = {
    pdfLoaded: false,
    jsonLoaded: false,
    rawJsonData: null,
    parsedBBoxes: [],
    selectedBBox: null,
    selectedIndex: 0,
    activePage: 1,
    totalPages: 0,
    zoomScale: 1.5, // 150% as seen in screenshot
    drawMode: false,
    showAllSentences: true,
    sentenceMode: 'create', // 'create' or 'add_existed'
    pdfFileName: '',
    jsonFileName: ''
  };

  // DOM Elements
  const elements = {
    // Drop Zone & Viewport
    dropZone: document.getElementById('drop-zone'),
    pdfScrollView: document.getElementById('pdf-scroll-view'),
    viewportBanner: document.getElementById('viewport-banner'),
    bannerCloseBtn: document.getElementById('banner-close-btn'),

    // Dedicated Button Triggers
    topPdfBtn: document.getElementById('top-pdf-btn'),
    dropPdfBtn: document.getElementById('drop-pdf-btn'),
    topJsonBtn: document.getElementById('top-json-btn'),
    dropJsonBtn: document.getElementById('drop-json-btn'),
    bannerJsonBtn: document.getElementById('banner-json-btn'),

    // Hidden Native Inputs
    topPdfInput: document.getElementById('top-pdf-input'),
    dropPdfInput: document.getElementById('drop-pdf-input'),
    topJsonInput: document.getElementById('top-json-input'),
    dropJsonInput: document.getElementById('drop-json-input'),
    bannerJsonInput: document.getElementById('banner-json-input'),

    // Live Status Chips & Hint
    cardStatusPdf: document.getElementById('card-status-pdf'),
    cardPdfDesc: document.getElementById('card-pdf-desc'),
    cardStatusJson: document.getElementById('card-status-json'),
    cardJsonDesc: document.getElementById('card-json-desc'),
    dropHintMsg: document.getElementById('drop-hint-msg'),
    dropPdfBtnText: document.getElementById('drop-pdf-btn-text'),
    dropJsonBtnText: document.getElementById('drop-json-btn-text'),
    topbarStatusTag: document.getElementById('topbar-status-tag'),

    dropDemoBtn: document.getElementById('drop-demo-btn'),

    // Topbar Zoom & Page Controls
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomValue: document.getElementById('zoom-value'),
    pageNumberInput: document.getElementById('page-number-input'),
    pageTotalLabel: document.getElementById('page-total-label'),
    exportJsonBtn: document.getElementById('export-json-btn'),

    // Sidebar Action Buttons
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    removeBtn: document.getElementById('remove-btn'),

    // Sidebar Mode Toggles
    drawModeOffBtn: document.getElementById('draw-mode-off-btn'),
    drawModeOnBtn: document.getElementById('draw-mode-on-btn'),
    createSentenceBtn: document.getElementById('create-sentence-btn'),
    addExistedSentenceBtn: document.getElementById('add-existed-sentence-btn'),
    justSelectedBtn: document.getElementById('just-selected-btn'),
    allSentenceBtn: document.getElementById('all-sentence-btn'),

    // Form Inputs
    bboxIdInput: document.getElementById('bbox-id-input'),
    saveIdBtn: document.getElementById('save-id-btn'),
    bboxTextInput: document.getElementById('bbox-text-input'),
    saveTextBtn: document.getElementById('save-text-btn'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };

  // Helper file readers (safe cross-browser)
  function readFileAsArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
      reader.readAsText(file, 'utf-8');
    });
  }

  // Initialize Overlay & PDF Viewer
  const overlayManager = new BBoxOverlayManager();
  const pdfViewer = new PDFViewer(elements.pdfScrollView, overlayManager);
  pdfViewer.scale = state.zoomScale;

  // Sync Overlay Callbacks
  overlayManager.onSelect((bboxItem) => {
    selectSentence(bboxItem, false);
  });

  overlayManager.onNewDrawn((newItem) => {
    state.parsedBBoxes = overlayManager.getAllItems();
    selectSentence(newItem, false);
    showToast('Yeni BBox oluşturuldu.', 'success');
  });

  pdfViewer.onPageChangeCallback = (curr, total) => {
    state.activePage = curr;
    state.totalPages = total;
    elements.pageNumberInput.value = curr;
    elements.pageTotalLabel.textContent = `/ ${total}`;
  };

  pdfViewer.onScaleChangeCallback = (scale) => {
    state.zoomScale = scale;
    elements.zoomValue.textContent = `%${Math.round(scale * 100)}`;
  };

  function updateTopbarStatus() {
    if (!elements.topbarStatusTag) return;
    const parts = [];
    if (state.pdfFileName) {
      parts.push(`<span class="file-pill"><i class="fa-solid fa-file-pdf"></i> ${state.pdfFileName}</span>`);
    }
    if (state.jsonFileName) {
      parts.push(`<span class="file-pill"><i class="fa-solid fa-file-code"></i> ${state.jsonFileName} (${state.parsedBBoxes.length} BBox)</span>`);
    }
    if (parts.length > 0) {
      elements.topbarStatusTag.innerHTML = parts.join('<span style="color:rgba(255,255,255,0.2)">|</span>');
      elements.topbarStatusTag.classList.remove('hidden');
    }
  }

  // =========================================================================
  // File Loading Logic
  // =========================================================================

  async function loadPDFFile(file) {
    if (!file) return;
    try {
      showToast(`PDF yükleniyor: ${file.name}`, 'info');
      state.pdfFileName = file.name;
      const arrayBuffer = await readFileAsArrayBuffer(file);
      const uint8 = new Uint8Array(arrayBuffer);

      await pdfViewer.loadDocument(uint8);
      
      state.pdfLoaded = true;
      elements.pageNumberInput.disabled = false;

      // Update card status
      if (elements.cardStatusPdf) {
        elements.cardStatusPdf.className = 'status-chip loaded';
      }
      if (elements.cardPdfDesc) {
        elements.cardPdfDesc.textContent = `${file.name} (${state.totalPages} sayfa)`;
      }
      if (elements.dropPdfBtnText) {
        elements.dropPdfBtnText.textContent = 'PDF Değiştir';
      }

      // Switch to scroll view
      elements.dropZone.style.display = 'none';
      elements.dropZone.classList.add('hidden');
      elements.pdfScrollView.style.display = 'flex';
      elements.pdfScrollView.classList.remove('hidden');

      updateTopbarStatus();

      if (state.parsedBBoxes.length > 0) {
        overlayManager.setData(state.parsedBBoxes);
        await pdfViewer.reRenderOverlays();
        if (elements.viewportBanner) elements.viewportBanner.classList.add('hidden');
        showToast(`PDF & JSON hazır (${state.parsedBBoxes.length} BBox)`, 'success');
      } else {
        if (elements.viewportBanner) {
          elements.viewportBanner.classList.remove('hidden');
          const bText = document.getElementById('banner-text');
          if (bText) bText.textContent = `"${file.name}" yüklendi. Cümle kutularını görmek için JSON dosyanızı seçin:`;
        }
        showToast(`PDF yüklendi (${state.totalPages} sayfa). Şimdi JSON dosyasını seçebilirsiniz.`, 'info');
      }
    } catch (err) {
      console.error('PDF Load Error:', err);
      showToast(`PDF yükleme hatası: ${err.message || err}`, 'error');
      if (elements.dropHintMsg) {
        elements.dropHintMsg.className = 'drop-hint-msg error';
        elements.dropHintMsg.textContent = `PDF okunamadı: ${err.message || err}`;
        elements.dropHintMsg.classList.remove('hidden');
      }
    }
  }

  /**
   * Snaps bounding boxes directly to the nearest PDF text line strictly inside each DocLayout-YOLO layout boundary.
   * Processes Left Column completely first, then Right Column, splitting sentences per layout with zero overflow.
   */
  async function alignAllBBoxesToPDFText(notify = true) {
    if (!state.pdfLoaded || !pdfViewer || !pdfViewer.pdfDoc) {
      if (notify) showToast('Lütfen önce bir PDF dosyası yükleyin.', 'info');
      return;
    }
    if (notify) showToast('BBox\'lar katman katman PDF üzerindeki metinlere hizalanıyor...', 'info');

    try {
      // 1. Check if rawJsonData has DocLayout-YOLO elements/layouts:
      let rawPages = [];
      if (Array.isArray(state.rawJsonData)) {
        rawPages = state.rawJsonData;
      } else if (state.rawJsonData && typeof state.rawJsonData === 'object') {
        if (Array.isArray(state.rawJsonData.pages)) rawPages = state.rawJsonData.pages;
        else rawPages = [state.rawJsonData];
      }

      const hasDocLayoutElements = rawPages.some(p => Array.isArray(p.elements) || Array.isArray(p.blocks));

      if (hasDocLayoutElements) {
        const alignedAll = [];
        let globalSentenceCounter = 1;

        for (let pageNum = 1; pageNum <= pdfViewer.totalPages; pageNum++) {
          const pageObj = rawPages.find(p => (p.page || p.page_number || 1) === pageNum) || rawPages[pageNum - 1];
          if (!pageObj) continue;

          const rawElements = pageObj.elements || pageObj.blocks || [];
          const pageLines = await pdfViewer.getPageTextLines(pageNum);
          if (pageLines.length === 0) continue;

          // Parse and sort layouts in natural 2-column reading order:
          // Top headers -> Left column (top to bottom) -> Right column (top to bottom) -> Footers
          const validRaw = rawElements.filter(el => {
            const b = el.coords || el.bbox;
            const t = (el.type || '').toLowerCase();
            return Array.isArray(b) && b.length >= 4 && t !== 'abandon' && !t.includes('abandon');
          });

          const layouts = validRaw.map((el, elIdx) => {
            const b = el.coords || el.bbox;
            const toPDF = (Math.max(b[2], b[3]) > 700) ? (72 / 200) : 1.0;
            return {
              id: el.id || `layout-p${pageNum}-${elIdx + 1}`,
              type: (el.type || el.category || 'plain text').toLowerCase(),
              x0: Math.min(b[0], b[2]) * toPDF,
              y0: Math.min(b[1], b[3]) * toPDF,
              x1: Math.max(b[0], b[2]) * toPDF,
              y1: Math.max(b[1], b[3]) * toPDF,
              confidence: el.confidence || 0.95,
              text: el.text || '',
              cells: el.cells || el.table_cells || null,
              words: el.words || null,
              rawElement: el
            };
          });

          // Sort layouts using 2-column reading order
          const sortedLayouts = (typeof BBoxParser !== 'undefined' && typeof BBoxParser._sortLayoutsReadingOrder === 'function')
            ? BBoxParser._sortLayoutsReadingOrder(layouts)
            : layouts;

          for (const layout of sortedLayouts) {
            // A. Table layout:
            if (layout.type === 'table' || (layout.cells && layout.cells.length > 0)) {
              const cells = layout.cells || [];
              cells.forEach((c, cIdx) => {
                const cBox = c.abs_coords || c.cell_coords || c.bbox || [layout.x0, layout.y0, layout.x1, layout.y1];
                const toPDF = (Math.max(cBox[2], cBox[3]) > 700) ? (72 / 200) : 1.0;
                const cText = (c.text || '').trim() || (c.words ? c.words.map(w => w.word).join(' ') : `Hücre #${cIdx + 1}`);
                const sId = globalSentenceCounter++;
                alignedAll.push({
                  id: `${layout.id}-c${cIdx + 1}`,
                  id_display: sId,
                  sentence_id: sId,
                  page: pageNum,
                  text: cText,
                  fullSentenceText: cText,
                  rawCoords: [Math.round(cBox[0] * toPDF * 10) / 10, Math.round(cBox[1] * toPDF * 10) / 10, Math.round(cBox[2] * toPDF * 10) / 10, Math.round(cBox[3] * toPDF * 10) / 10],
                  coordType: 'abs_points',
                  category: 'Table Cell',
                  confidence: c.confidence || layout.confidence || 0.98,
                  layoutProcessed: true
                });
              });
              continue;
            }

            // B. Text / Paragraph / Title layout:
            // Find all PDF lines falling strictly inside this layout box
            const matchedLines = pageLines.filter(pl => {
              const cx = (pl.pdfX0 + pl.pdfX1) / 2;
              const cy = (pl.pdfY0 + pl.pdfY1) / 2;
              return cx >= layout.x0 - 5 && cx <= layout.x1 + 5 && cy >= layout.y0 - 5 && cy <= layout.y1 + 5;
            });

            const Splitter = (typeof SentenceSplitter !== 'undefined') ? SentenceSplitter : null;

            if (matchedLines.length === 0) {
              const lText = (layout.text || '').trim();
              if (!lText) continue;
              const sentences = (Splitter && typeof Splitter.splitParagraphIntoSentences === 'function')
                ? Splitter.splitParagraphIntoSentences(lText)
                : [{ text: lText, start: 0, end: lText.length }];
              sentences.forEach(s => {
                const sId = globalSentenceCounter++;
                alignedAll.push({
                  id: `${layout.id}-s${sId}`,
                  id_display: sId,
                  sentence_id: sId,
                  page: pageNum,
                  text: s.text,
                  fullSentenceText: s.text,
                  rawCoords: [layout.x0, layout.y0, layout.x1, layout.y1],
                  coordType: 'abs_points',
                  category: layout.type.includes('title') ? 'title' : 'Sentence',
                  confidence: layout.confidence,
                  layoutProcessed: true
                });
              });
              continue;
            }

            matchedLines.sort((a, b) => a.pdfY0 - b.pdfY0);

            const layoutFullText = matchedLines.map(ln => ln.text).join(' ').trim();
            if (!layoutFullText) continue;

            const sentences = (Splitter && typeof Splitter.splitParagraphIntoSentences === 'function')
              ? Splitter.splitParagraphIntoSentences(layoutFullText)
              : [{ text: layoutFullText, start: 0, end: layoutFullText.length }];

            const lineIndices = [];
            let sIdx = 0;
            matchedLines.forEach(ln => {
              let s = layoutFullText.indexOf(ln.text, sIdx);
              if (s === -1) s = layoutFullText.indexOf(ln.text);
              if (s === -1) s = 0;
              const e = s + ln.text.length;
              sIdx = e;
              lineIndices.push({ text: ln.text, start: s, end: e, bbox: [ln.pdfX0, ln.pdfY0, ln.pdfX1, ln.pdfY1] });
            });

            if (Splitter && typeof Splitter.mapSentencesToLines === 'function') {
              Splitter.mapSentencesToLines(sentences, lineIndices);
            }

            sentences.forEach(s => {
              const sId = globalSentenceCounter++;
              const bboxes = (Splitter && typeof Splitter.calculateSentenceBBoxes === 'function')
                ? Splitter.calculateSentenceBBoxes(s)
                : [[matchedLines[0].pdfX0, matchedLines[0].pdfY0, matchedLines[0].pdfX1, matchedLines[0].pdfY1]];

              bboxes.forEach((b, bi) => {
                const bx0 = Math.max(layout.x0, Math.min(b[0], layout.x1));
                const by0 = Math.max(layout.y0, Math.min(b[1], layout.y1));
                const bx1 = Math.max(layout.x0, Math.min(b[2], layout.x1));
                const by1 = Math.max(layout.y0, Math.min(b[3], layout.y1));
                alignedAll.push({
                  id: `${layout.id}-s${sId}-l${bi + 1}`,
                  id_display: sId,
                  sentence_id: sId,
                  page: pageNum,
                  text: (s.bbox_texts && s.bbox_texts[bi]) ? s.bbox_texts[bi] : s.text,
                  fullSentenceText: s.text,
                  rawCoords: [Math.round(bx0 * 10) / 10, Math.round(by0 * 10) / 10, Math.round(bx1 * 10) / 10, Math.round(by1 * 10) / 10],
                  coordType: 'abs_points',
                  category: layout.type.includes('title') ? 'title' : 'Sentence',
                  confidence: layout.confidence,
                  layoutProcessed: true
                });
              });
            });
          }
        }

        if (alignedAll.length > 0) {
          state.parsedBBoxes = alignedAll;
          overlayManager.setData(state.parsedBBoxes);
          await pdfViewer.reRenderOverlays();
          if (notify) showToast(`${alignedAll.length} adet BBox katmanlara göre başarıyla oturtuldu!`, 'success');
          return;
        }
      }

      // Fallback if no layout elements: tighten existing bboxes
      if (state.parsedBBoxes && state.parsedBBoxes.length > 0) {
        const byPage = new Map();
        state.parsedBBoxes.forEach(b => {
          const p = b.page || 1;
          if (!byPage.has(p)) byPage.set(p, []);
          byPage.get(p).push(b);
        });

        for (const [pageNum, items] of byPage.entries()) {
          const pageLines = await pdfViewer.getPageTextLines(pageNum);
          if (!pageLines || pageLines.length === 0) continue;

          items.forEach(it => {
            const [x0, y0, x1, y1] = it.rawCoords || [0, 0, 0, 0];
            const toPDF = (x1 > 700 || y1 > 900) ? (72 / 200) : 1.0;
            const px0 = x0 * toPDF, py0 = y0 * toPDF, px1 = x1 * toPDF, py1 = y1 * toPDF;
            const itText = (it.text || '').trim();

            let bestLine = null;
            let maxScore = -1;

            pageLines.forEach(pl => {
              const plText = (pl.text || '').trim();
              const yOverlap = Math.max(0, Math.min(py1, pl.pdfY1) - Math.max(py0, pl.pdfY0));
              const xOverlap = Math.max(0, Math.min(px1, pl.pdfX1) - Math.max(px0, pl.pdfX0));
              if (yOverlap > 2 && xOverlap > 5) {
                let score = yOverlap + xOverlap;
                if (itText && plText && (itText.includes(plText) || plText.includes(itText))) {
                  score += 100;
                }
                if (score > maxScore) {
                  maxScore = score;
                  bestLine = pl;
                }
              }
            });

            if (bestLine) {
              it.rawCoords = [bestLine.pdfX0, bestLine.pdfY0, bestLine.pdfX1, bestLine.pdfY1];
              it.coordType = 'abs_points';
            }
          });
        }

        overlayManager.setData(state.parsedBBoxes);
        await pdfViewer.reRenderOverlays();
        if (notify) showToast('BBox\'lar PDF üzerindeki yerlerine başarıyla oturtuldu!', 'success');
      }
    } catch (err) {
      console.error(err);
      if (notify) showToast('Hizalama hatası: ' + err.message, 'error');
    }
  }

  /**
   * Refine paragraph bboxes into sentence-level line bboxes using PDF text lines
   * and SentenceSplitter NLP segmentation.
   */
  async function refineBBoxesWithPDFLines(bboxes) {
    if (!bboxes || bboxes.length === 0) return [];
    if (state.pdfLoaded) {
      await alignAllBBoxesToPDFText(false);
      return state.parsedBBoxes;
    }
    if (typeof SentenceSplitter !== 'undefined' && typeof SentenceSplitter.segmentAllParagraphs === 'function') {
      return SentenceSplitter.segmentAllParagraphs(bboxes);
    }
    return bboxes;
  }
  window.refineBBoxesWithPDFLines = refineBBoxesWithPDFLines;

  async function loadJSONFile(file) {
    if (!file) return;
    try {
      showToast('JSON okunuyor...', 'info');
      state.jsonFileName = file.name;
      let text = await readFileAsText(file);
      text = text.trim();
      let jsonData = null;

      try {
        jsonData = JSON.parse(text);
      } catch {
        try {
          jsonData = JSON.parse(`[${text.replace(/^,/, '').replace(/,$/, '').trim()}]`);
        } catch {
          const matches = text.match(/\{[\s\S]*?\}(?=\s*(?:,|\n|\]|\}|$))/g);
          if (matches) {
            jsonData = matches.map(m => JSON.parse(m));
          } else {
            throw new Error('Geçerli bir JSON verisi bulunamadı.');
          }
        }
      }

      state.rawJsonData = jsonData;
      state.parsedBBoxes = BBoxParser.parse(jsonData, 'auto', 'top');

      overlayManager.setData(state.parsedBBoxes);

      // Populate right sidebar with the first sentence immediately!
      if (state.parsedBBoxes.length > 0) {
        selectSentence(state.parsedBBoxes[0], false);
      }

      // Update card status
      if (elements.cardStatusJson) {
        elements.cardStatusJson.className = 'status-chip loaded';
      }
      if (elements.cardJsonDesc) {
        elements.cardJsonDesc.textContent = `${file.name} (${state.parsedBBoxes.length} BBox)`;
      }
      if (elements.dropJsonBtnText) {
        elements.dropJsonBtnText.textContent = 'JSON Değiştir';
      }

      updateTopbarStatus();

      if (state.pdfLoaded) {
        elements.dropZone.style.display = 'none';
        elements.dropZone.classList.add('hidden');
        elements.pdfScrollView.style.display = 'flex';
        elements.pdfScrollView.classList.remove('hidden');
        if (elements.viewportBanner) elements.viewportBanner.classList.add('hidden');
        await pdfViewer.reRenderOverlays();
        showToast(`JSON yüklendi (${state.parsedBBoxes.length} BBox)`, 'success');
      } else {
        if (elements.dropHintMsg) {
          elements.dropHintMsg.className = 'drop-hint-msg success';
          elements.dropHintMsg.textContent = `✓ "${file.name}" yüklendi (${state.parsedBBoxes.length} cümle). Kutuları görmek için lütfen PDF dosyasını seçin.`;
          elements.dropHintMsg.classList.remove('hidden');
        }
        showToast(`JSON yüklendi (${state.parsedBBoxes.length} BBox). Lütfen şimdi PDF dosyasını seçin.`, 'success');
      }
    } catch (err) {
      console.error('JSON Load Error:', err);
      showToast(`JSON hatası: ${err.message || err}`, 'error');
      if (elements.dropHintMsg) {
        elements.dropHintMsg.className = 'drop-hint-msg error';
        elements.dropHintMsg.textContent = `JSON okunamadı: ${err.message || err}`;
        elements.dropHintMsg.classList.remove('hidden');
      }
    }
  }

  function processJSONData(jsonData) {
    state.rawJsonData = jsonData;
    state.parsedBBoxes = BBoxParser.parse(jsonData, 'auto', 'top');

    overlayManager.setData(state.parsedBBoxes);

    if (state.parsedBBoxes.length > 0) {
      selectSentence(state.parsedBBoxes[0], true);
    }

    if (state.pdfLoaded) {
      pdfViewer.reRenderOverlays();
    }
  }

  /**
   * Load Bank Contract Demo (Kazandıran Çeyrek Hesap Sözleşmesi)
   */
  async function loadDemoData() {
    try {
      showToast('Örnek banka sözleşmesi hazırlanıyor...', 'info');
      const pdfBuffer = SampleDataset.generateSamplePDFArrayBuffer();
      await pdfViewer.loadDocument(pdfBuffer);
      state.pdfLoaded = true;

      elements.dropZone.classList.add('hidden');
      elements.pdfScrollView.classList.remove('hidden');
      elements.pageNumberInput.disabled = false;

      // Realistic dataset matching the exact screenshot structure
      const sampleJSON = [
        {
          "page": 1,
          "elements": [
            {
              "type": "title",
              "coords": [200, 94, 1473, 175],
              "confidence": 0.99,
              "text": "TÜRKİYE VAKIFLAR BANKASI T.A.O. SABİT FAİZLİ ESNEK VE ALTERNATİF ÖDEME SEÇENEKLİ\nKONUT FINANSMANI SÖZLEŞMESİ"
            },
            {
              "type": "plain text",
              "coords": [76, 204, 820, 742],
              "confidence": 0.97,
              "text": "Madde 1- TARAFLAR ve SÖZLEŞMENİN AMACI\nİşbu Sözleşme, bir taraftan TÜRKİYE VAKIFLAR BANKASI T.A.O. (Bundan sonra “Banka” olarak adlandırılacaktır) ile diğer taraftan son sayfada isim ve imzaları bulunan Müşteri ve Kefil/Kefiller arasında, Müşteri’nin satın alacağı konutun finansmanında kullanılmak üzere düzenlenmiştir."
            },
            {
              "type": "plain text",
              "coords": [854, 209, 1597, 321],
              "confidence": 0.95,
              "text": "fazla Müşteri tarafından borçlu sıfatıyla imzalanması halinde Kredi Banka tarafından Müşterilerden herhangi birinin hesabına yatırılabilecektir."
            },
            {
              "type": "plain text",
              "coords": [853, 324, 1597, 474],
              "confidence": 0.94,
              "text": "2.5. Müşteri, Krediyi Tüketicinin Korunması Hakkında Kanun ve işbu Sözleşmede belirtilen amaçlara uygun olarak kullanacağını kabul, beyan ve taahhüt eder."
            },
            {
              "type": "plain text",
              "coords": [853, 477, 1598, 703],
              "confidence": 0.96,
              "text": "2.6. Müşteri ve Kefil/Kefiller, Kredi konusu konut ile ilgili olarak müşteri ile satıcı/yüklenici arasında çıkabilecek uyuşmazlıkların Kredinin geri ödenmesine engel olmayacağını kabul eder."
            },
            {
              "type": "plain text",
              "coords": [76, 780, 820, 1161],
              "confidence": 0.98,
              "text": "Madde 2- KREDİ KULLANDIRIM KOŞULLARI ve ŞEKLİ\n2.1. Banka Krediyi, Kredi konusu konuta ilişkin ekspertiz raporu, Müşteri ve/veya Kefil/Kefillerin ödeme gücü göz önüne alınarak tahsis etmektedir."
            },
            {
              "type": "title",
              "coords": [854, 1162, 1596, 1276],
              "confidence": 0.92,
              "text": "Madde 3- “AFET RİSKİ ALTINDAKİ ALANLARIN DÖNÜŞTÜRÜLMESİ HAKKINDA KANUN” KAPSAMINDA KULLANDIRILAN KONUT KREDİLERİ"
            },
            {
              "type": "plain text",
              "coords": [74, 1164, 820, 1545],
              "confidence": 0.96,
              "text": "2.2. Müşteri ve/veya Kefil/Kefillerin Bankaya vermiş oldukları bilgi ve belgelerin doğru olmadığının öğrenilmesi halinde Banka Krediyi kullandırmaktan vazgeçebilir."
            },
            {
              "type": "plain text",
              "coords": [853, 1281, 1597, 1582],
              "confidence": 0.95,
              "text": "3.1. Kredinin ilgili kanun kapsamında kullandırılması halinde faiz desteği Bakanlık tarafından karşılanacaktır."
            },
            {
              "type": "plain text",
              "coords": [75, 1548, 820, 1774],
              "confidence": 0.97,
              "text": "2.3. Müşteri, kredi açılmasının uygun görülmemesi halinde masrafları ödemeyi taahhüt eder."
            },
            {
              "type": "plain text",
              "coords": [854, 1584, 1598, 1930],
              "confidence": 0.94,
              "text": "3.2. Söz konusu faiz desteği ilgili bildirim üzerine hesaba aktarılacaktır."
            },
            {
              "type": "plain text",
              "coords": [75, 1777, 819, 1930],
              "confidence": 0.95,
              "text": "2.4. Banka Krediyi nakden veya virman yapmak suretiyle ödeyebilir."
            }
          ]
        }
      ];

      state.pdfFileName = "Vakifbank_Sozlesme.pdf";
      state.jsonFileName = "Sozlesme_BBox.json";
      updateTopbarStatus();
      if (elements.viewportBanner) elements.viewportBanner.classList.add('hidden');
      if (elements.cardStatusPdf) {
        elements.cardStatusPdf.className = 'status-chip loaded';
        elements.cardPdfDesc.textContent = "Demo Banka Sözleşmesi";
      }
      if (elements.cardStatusJson) {
        elements.cardStatusJson.className = 'status-chip loaded';
        elements.cardJsonDesc.textContent = "10 Cümle / BBox";
      }

      processJSONData(sampleJSON);
      showToast('Örnek demo verisi başarıyla yüklendi!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Demo yüklenirken hata: ' + err.message, 'error');
    }
  }

  // =========================================================================
  // Drag & Drop & Button File Selectors
  // =========================================================================

  // Explicit Button Click Triggers
  if (elements.topPdfBtn && elements.topPdfInput) {
    elements.topPdfBtn.addEventListener('click', () => elements.topPdfInput.click());
  }
  if (elements.dropPdfBtn && elements.dropPdfInput) {
    elements.dropPdfBtn.addEventListener('click', () => elements.dropPdfInput.click());
  }
  if (elements.topJsonBtn && elements.topJsonInput) {
    elements.topJsonBtn.addEventListener('click', () => elements.topJsonInput.click());
  }
  if (elements.dropJsonBtn && elements.dropJsonInput) {
    elements.dropJsonBtn.addEventListener('click', () => elements.dropJsonInput.click());
  }
  if (elements.bannerJsonBtn && elements.bannerJsonInput) {
    elements.bannerJsonBtn.addEventListener('click', () => elements.bannerJsonInput.click());
  }

  // Safe Native File Input Change Listeners
  const pdfInputList = [elements.topPdfInput, elements.dropPdfInput].filter(Boolean);
  pdfInputList.forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        await loadPDFFile(file);
      }
      inp.value = '';
    });
  });

  const jsonInputList = [elements.topJsonInput, elements.dropJsonInput, elements.bannerJsonInput].filter(Boolean);
  jsonInputList.forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        await loadJSONFile(file);
      }
      inp.value = '';
    });
  });

  // Safe Drag & Drop on window (single global handler to prevent duplicate race conditions)
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    let pdfFile = null;
    let jsonFile = null;

    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.pdf')) pdfFile = f;
      else if (lower.endsWith('.json') || lower.endsWith('.txt')) jsonFile = f;
    }

    if (jsonFile) await loadJSONFile(jsonFile);
    if (pdfFile) await loadPDFFile(pdfFile);
  });

  if (elements.bannerCloseBtn && elements.viewportBanner) {
    elements.bannerCloseBtn.addEventListener('click', () => {
      elements.viewportBanner.classList.add('hidden');
    });
  }

  elements.demoBtn.addEventListener('click', loadDemoData);
  elements.dropDemoBtn.addEventListener('click', loadDemoData);

  // Auto-Detect Missing Text on PDF
  async function runAutoDetectMissing() {
    if (!state.pdfLoaded) {
      showToast('Lütfen önce bir PDF dosyası yükleyin.', 'info');
      return;
    }
    showToast('PDF taranıyor ve eksik cümleler aranıyor...', 'info');
    try {
      const missingBoxes = await pdfViewer.detectMissingBBoxesFromPDF(state.parsedBBoxes);
      if (!missingBoxes || missingBoxes.length === 0) {
        showToast('Eksik cümle bulunamadı, tüm metinler kutu içinde.', 'success');
        return;
      }

      const combined = [...state.parsedBBoxes, ...missingBoxes];
      const sorted = BBoxParser.sortReadingOrder(combined);
      state.parsedBBoxes = sorted;
      overlayManager.setData(state.parsedBBoxes);
      await pdfViewer.reRenderOverlays();

      showToast(`${missingBoxes.length} adet eksik cümle otomatik tespit edildi ve eklendi!`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Otomatik algılama hatası: ' + err.message, 'error');
    }
  }

  if (elements.autoDetectBtn) {
    elements.autoDetectBtn.addEventListener('click', runAutoDetectMissing);
  }

  if (elements.snapPdfBtn) {
    elements.snapPdfBtn.addEventListener('click', () => alignAllBBoxesToPDFText(true));
  }

  // =========================================================================
  // Selection & Right Sidebar Sync
  // =========================================================================

  function selectSentence(bboxItem, scrollPdf = true) {
    if (!bboxItem) return;
    state.selectedBBox = bboxItem;
    state.selectedIndex = state.parsedBBoxes.findIndex(b => String(b.id) === String(bboxItem.id));

    // Update overlay active state
    overlayManager.selectBBox(bboxItem.id, false);

    // Update sidebar inputs
    elements.bboxIdInput.value = bboxItem.id_display !== undefined ? bboxItem.id_display : bboxItem.index;

    // Retrieve the full sentence text for this entire sentence (not just the clicked line segment)
    let fullText = bboxItem.fullSentenceText || '';
    if (!fullText) {
      const targetSentenceId = bboxItem.sentence_id !== undefined ? bboxItem.sentence_id : bboxItem.id_display;
      const siblingLines = state.parsedBBoxes.filter(it => {
        const sId = it.sentence_id !== undefined ? it.sentence_id : it.id_display;
        return it.page === bboxItem.page && sId === targetSentenceId;
      });
      if (siblingLines.length > 0) {
        fullText = siblingLines.map(l => l.text).join(' ').trim();
      } else {
        fullText = bboxItem.text || '';
      }
    }
    elements.bboxTextInput.value = fullText;

    // Center PDF view onto box
    if (scrollPdf && state.pdfLoaded) {
      pdfViewer.scrollToBBox(bboxItem);
    }
  }

  // Prev Button
  elements.prevBtn.addEventListener('click', () => {
    if (state.parsedBBoxes.length === 0) return;
    let idx = state.selectedIndex - 1;
    if (idx < 0) idx = state.parsedBBoxes.length - 1;
    selectSentence(state.parsedBBoxes[idx], true);
  });

  // Next Button
  elements.nextBtn.addEventListener('click', () => {
    if (state.parsedBBoxes.length === 0) return;
    let idx = state.selectedIndex + 1;
    if (idx >= state.parsedBBoxes.length) idx = 0;
    selectSentence(state.parsedBBoxes[idx], true);
  });

  // Remove Button
  elements.removeBtn.addEventListener('click', () => {
    if (!state.selectedBBox) {
      showToast('Silinecek BBox seçilmedi.', 'info');
      return;
    }
    const remId = state.selectedBBox.id;
    overlayManager.removeItem(remId);
    state.parsedBBoxes = overlayManager.getAllItems();

    if (state.parsedBBoxes.length > 0) {
      const nextIdx = Math.min(state.selectedIndex, state.parsedBBoxes.length - 1);
      selectSentence(state.parsedBBoxes[nextIdx], true);
    } else {
      state.selectedBBox = null;
      elements.bboxIdInput.value = '';
      elements.bboxTextInput.value = '';
    }
    showToast('BBox silindi.', 'success');
  });

  // =========================================================================
  // Mode Toggles (Draw Mode, Sentence Mode, Visibility)
  // =========================================================================

  // Draw Mode Off / On
  elements.drawModeOffBtn.addEventListener('click', () => {
    state.drawMode = false;
    overlayManager.setDrawMode(false);
    elements.drawModeOffBtn.className = 'sidebar-toggle-btn active-blue';
    elements.drawModeOnBtn.className = 'sidebar-toggle-btn inactive-white';
    showToast('Çizim Modu Kapatıldı.', 'info');
  });

  elements.drawModeOnBtn.addEventListener('click', () => {
    state.drawMode = true;
    overlayManager.setDrawMode(true);
    elements.drawModeOnBtn.className = 'sidebar-toggle-btn active-blue';
    elements.drawModeOffBtn.className = 'sidebar-toggle-btn inactive-white';
    showToast('Çizim Modu Açık: PDF üzerine sürükleyerek yeni BBox çizebilirsiniz.', 'info');
  });

  // Create / Add Existed Sentence
  elements.createSentenceBtn.addEventListener('click', () => {
    state.sentenceMode = 'create';
    elements.createSentenceBtn.className = 'sidebar-toggle-btn active-blue';
    elements.addExistedSentenceBtn.className = 'sidebar-toggle-btn inactive-white';
  });

  elements.addExistedSentenceBtn.addEventListener('click', () => {
    state.sentenceMode = 'add_existed';
    elements.addExistedSentenceBtn.className = 'sidebar-toggle-btn active-blue';
    elements.createSentenceBtn.className = 'sidebar-toggle-btn inactive-white';
  });

  // Just Selected / All Sentence
  elements.justSelectedBtn.addEventListener('click', () => {
    state.showAllSentences = false;
    overlayManager.setShowAllSentences(false);
    elements.justSelectedBtn.className = 'sidebar-toggle-btn active-blue';
    elements.allSentenceBtn.className = 'sidebar-toggle-btn inactive-white';
  });

  elements.allSentenceBtn.addEventListener('click', () => {
    state.showAllSentences = true;
    overlayManager.setShowAllSentences(true);
    elements.allSentenceBtn.className = 'sidebar-toggle-btn active-blue';
    elements.justSelectedBtn.className = 'sidebar-toggle-btn inactive-white';
  });

  // =========================================================================
  // Save Id & Save Text Handlers
  // =========================================================================

  elements.saveIdBtn.addEventListener('click', () => {
    if (!state.selectedBBox) {
      showToast('Lütfen önce bir BBox seçin.', 'info');
      return;
    }
    const targetIdStr = elements.bboxIdInput.value.trim();
    if (!targetIdStr) return;

    if (state.sentenceMode === 'add_existed') {
      // Add Existed Sentence Mode: Merge text and join existing sentence ID
      const mergedTarget = overlayManager.mergeToExistingSentence(state.selectedBBox.id, targetIdStr);
      if (mergedTarget) {
        state.parsedBBoxes = overlayManager.getAllItems();
        elements.bboxTextInput.value = mergedTarget.text;
        showToast(`BBox, #${targetIdStr} numaralı cümleyle birleştirildi.`, 'success');
      } else {
        showToast(`ID #${targetIdStr} bulunamadı.`, 'error');
      }
    } else {
      // Create New Sentence Mode: Reorder ID and shift all subsequent items up by 1
      const success = overlayManager.reorderBBoxId(state.selectedBBox.id, targetIdStr);
      if (success) {
        state.parsedBBoxes = overlayManager.getAllItems();
        const currentItem = state.parsedBBoxes.find(it => String(it.id) === String(state.selectedBBox.id));
        if (currentItem) {
          selectSentence(currentItem, false);
        }
        showToast(`ID #${targetIdStr} konumuna yerleştirildi, sonrakiler (+1) kaydırıldı.`, 'success');
      } else {
        showToast('Geçersiz ID numarası.', 'error');
      }
    }
  });

  elements.saveTextBtn.addEventListener('click', () => {
    if (!state.selectedBBox) {
      showToast('Lütfen önce bir BBox seçin.', 'info');
      return;
    }
    const newText = elements.bboxTextInput.value;
    overlayManager.updateActiveItemData(undefined, newText);
    showToast('Paragraf metni kaydedildi.', 'success');
  });

  // =========================================================================
  // Topbar Controls (Zoom, Page, Export)
  // =========================================================================

  elements.zoomInBtn.addEventListener('click', () => pdfViewer.zoomIn());
  elements.zoomOutBtn.addEventListener('click', () => pdfViewer.zoomOut());

  elements.pageNumberInput.addEventListener('change', (e) => {
    let p = parseInt(e.target.value, 10);
    if (isNaN(p)) p = 1;
    p = Math.max(1, Math.min(p, state.totalPages));
    pdfViewer.scrollToPage(p);
  });

  elements.exportJsonBtn.addEventListener('click', () => {
    const all = overlayManager.getAllItems();
    if (all.length === 0) {
      showToast('Dışa aktarılacak veri bulunamadı.', 'info');
      return;
    }

    // Group items by page matching standard document json schema
    const pagesMap = new Map();
    all.forEach(it => {
      const pageNum = it.page || 1;
      if (!pagesMap.has(pageNum)) pagesMap.set(pageNum, []);
      pagesMap.get(pageNum).push({
        type: it.category || 'plain text',
        coords: it.rawCoords || [0, 0, 0, 0],
        confidence: it.confidence || 1.0,
        text: it.text || ''
      });
    });

    const exportData = [];
    for (const [pageNum, elementsList] of pagesMap.entries()) {
      exportData.push({
        page: pageNum,
        elements: elementsList
      });
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "edited_pdf_sentences.json");
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    showToast('Düzenlenmiş JSON indirildi!', 'success');
  });

  // Toast Helper
  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    if (elements.toastContainer) {
      elements.toastContainer.appendChild(t);
    } else {
      document.body.appendChild(t);
    }
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 250);
    }, 2800);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
