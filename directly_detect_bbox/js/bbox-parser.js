import { sentenceBoxesFromLayouts } from './sentence-splitter.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `bbox-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function normalizeBox(box, page = 1) {
  const x = toNumber(box.x ?? box.left ?? box.bbox?.[0]);
  const y = toNumber(box.y ?? box.top ?? box.bbox?.[1]);
  const width = toNumber(box.width ?? (box.bbox ? box.bbox[2] - box.bbox[0] : 0));
  const height = toNumber(box.height ?? (box.bbox ? box.bbox[3] - box.bbox[1] : 0));
  return {
    id: String(box.id ?? box.sentence_id ?? createId()),
    sentence_id: Number(box.sentence_id ?? box.id ?? 0),
    page: Number(box.page ?? page),
    text: String(box.text ?? ''),
    category: box.category ?? 'Plain Text',
    x,
    y,
    width,
    height
  };
}

export function parseBboxJson(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (Array.isArray(data?.sentences)) {
    return data.sentences.map((item) => normalizeBox(item));
  }

  if (Array.isArray(data?.boxes)) {
    return data.boxes.map((item) => normalizeBox(item));
  }

  if (Array.isArray(data?.layouts)) {
    const generated = sentenceBoxesFromLayouts(data.layouts);
    return generated.map((item) => normalizeBox(item, item.page));
  }

  if (Array.isArray(data)) {
    return data.map((item) => normalizeBox(item));
  }

  return [];
}

export function serializeBboxes(items) {
  return JSON.stringify({ sentences: items }, null, 2);
}
