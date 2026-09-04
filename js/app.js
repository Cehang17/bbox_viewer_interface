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
   * Refine paragraph bboxes into sentence-level line bboxes using SentenceSplitter NLP segmentation.
   */
  async function refineBBoxesWithPDFLines(bboxes) {
    if (!bboxes || bboxes.length === 0) return [];
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
