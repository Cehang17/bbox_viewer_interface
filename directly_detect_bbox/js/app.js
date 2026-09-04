import { parseBboxJson, serializeBboxes } from './bbox-parser.js';
import { PdfViewer } from './pdf-viewer.js';
import { OverlayEditor } from './overlay.js';
import { SAMPLE_BBOX_DATA, SAMPLE_LAYOUT_DATA, SAMPLE_PDF_BASE64 } from '../sample_data/sample-data.js';

const state = {
  boxes: [],
  selectedId: null,
  visibility: 'all',
  drawMode: false,
};

const el = {
  pdfInput: document.getElementById('pdfInput'),
  jsonInput: document.getElementById('jsonInput'),
  pdfViewer: document.getElementById('pdfViewer'),
  overlayRoot: document.getElementById('overlayRoot'),
  drawModeBtn: document.getElementById('drawModeBtn'),
  exportBtn: document.getElementById('exportBtn'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  fitWidthBtn: document.getElementById('fitWidthBtn'),
  fitPageBtn: document.getElementById('fitPageBtn'),
  visibilityFilter: document.getElementById('visibilityFilter'),
  themeBtn: document.getElementById('themeBtn'),
  bboxIdInput: document.getElementById('bboxIdInput'),
  bboxTextInput: document.getElementById('bboxTextInput'),
  saveIdBtn: document.getElementById('saveIdBtn'),
  saveTextBtn: document.getElementById('saveTextBtn'),
  loadSampleBtn: document.getElementById('loadSampleBtn'),
  status: document.getElementById('status'),
};

const viewer = new PdfViewer(el.pdfViewer);
const overlay = new OverlayEditor(
  el.overlayRoot,
  (box) => {
    state.selectedId = box.id;
    syncInspector();
    render();
  },
  (id, draft) => {
    state.boxes = state.boxes.map((box) => (box.id === id ? { ...box, ...draft } : box));
    render();
  },
  (draft) => {
    const maxSentence = state.boxes.reduce((max, x) => Math.max(max, Number(x.sentence_id) || 0), 0);
    const id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `bbox-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    state.boxes.push({
      id,
      sentence_id: maxSentence + 1,
      text: 'Yeni kutu',
      category: 'Plain Text',
      ...draft,
    });
    state.selectedId = id;
    syncInspector();
    render();
  }
);

function setStatus(msg) {
  el.status.textContent = msg;
}

async function loadPdfFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await viewer.load(bytes);
  overlay.syncPages(viewer.pages);
  render();
}

async function loadSample() {
  const bytes = Uint8Array.from(atob(SAMPLE_PDF_BASE64), (ch) => ch.charCodeAt(0));
  await viewer.load(bytes);
  overlay.syncPages(viewer.pages);
  state.boxes = parseBboxJson(SAMPLE_BBOX_DATA.length ? SAMPLE_BBOX_DATA : SAMPLE_LAYOUT_DATA);
  state.selectedId = state.boxes[0]?.id || null;
  syncInspector();
  render();
  setStatus('Sample data loaded.');
}

function syncInspector() {
  const selected = state.boxes.find((box) => box.id === state.selectedId);
  el.bboxIdInput.value = selected?.id || '';
  el.bboxTextInput.value = selected?.text || '';
}

function render() {
  const selected = state.boxes.find((box) => box.id === state.selectedId);
  const selectedSentenceId = selected?.sentence_id;
  overlay.render(state.boxes, selectedSentenceId, state.visibility);
}

el.pdfInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await loadPdfFile(file);
  setStatus('PDF yüklendi.');
});

el.jsonInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const json = await file.text();
  state.boxes = parseBboxJson(json);
  state.selectedId = state.boxes[0]?.id || null;
  syncInspector();
  render();
  setStatus('JSON yüklendi.');
});

el.drawModeBtn.addEventListener('click', () => {
  state.drawMode = !state.drawMode;
  overlay.setDrawMode(state.drawMode);
  el.drawModeBtn.textContent = state.drawMode ? 'Draw Mode: On' : 'Draw Mode';
});

el.visibilityFilter.addEventListener('change', () => {
  state.visibility = el.visibilityFilter.value;
  render();
});

el.saveIdBtn.addEventListener('click', () => {
  if (!state.selectedId) return;
  const nextId = el.bboxIdInput.value.trim();
  if (!nextId) return;
  state.boxes = state.boxes.map((box) => (box.id === state.selectedId ? { ...box, id: nextId } : box));
  state.selectedId = nextId;
  render();
  setStatus('ID güncellendi.');
});

el.saveTextBtn.addEventListener('click', () => {
  if (!state.selectedId) return;
  const nextText = el.bboxTextInput.value;
  state.boxes = state.boxes.map((box) => (box.id === state.selectedId ? { ...box, text: nextText } : box));
  render();
  setStatus('Metin güncellendi.');
});

el.exportBtn.addEventListener('click', () => {
  const payload = serializeBboxes(state.boxes);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'updated-bboxes.json';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('JSON dışa aktarıldı.');
});

el.zoomInBtn.addEventListener('click', async () => {
  await viewer.zoomIn();
  overlay.syncPages(viewer.pages);
  render();
});

el.zoomOutBtn.addEventListener('click', async () => {
  await viewer.zoomOut();
  overlay.syncPages(viewer.pages);
  render();
});

el.fitWidthBtn.addEventListener('click', async () => {
  await viewer.fitWidth();
  overlay.syncPages(viewer.pages);
  render();
});

el.fitPageBtn.addEventListener('click', async () => {
  await viewer.fitPage();
  overlay.syncPages(viewer.pages);
  render();
});

el.themeBtn.addEventListener('click', () => {
  document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
});

el.loadSampleBtn.addEventListener('click', loadSample);

window.addEventListener('resize', () => {
  overlay.syncPages(viewer.pages);
  render();
});
