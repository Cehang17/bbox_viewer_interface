const ABBREVIATIONS = new Set([
  'vb.', 'vs.', 'örn.', 'sn.', 'bkz.', 'vd.', 'dr.', 'av.', 'cad.', 'sk.', 'a.ş.', 't.c.', 'no.', 'mah.'
]);

const BULLET_RE = /^(?:[•▪\-]|[a-zçğıöşü]\)|\d+[\).])\s+/i;

function normalizeToken(token) {
  return token.trim().toLocaleLowerCase('tr-TR');
}

function isProtectedEnding(text, index) {
  const slice = text.slice(Math.max(0, index - 12), index + 1);
  const wordMatch = slice.match(/([A-Za-zÇĞİÖŞÜçğıöşü\.]+)$/);
  if (!wordMatch) return false;
  const token = normalizeToken(wordMatch[1]);
  if (ABBREVIATIONS.has(token)) return true;
  if (/^(madde\s+\d+\.)$/i.test(token)) return true;
  if (/^\d+\.$/.test(token)) return true;
  if (/^[A-ZÇĞİÖŞÜ](?:\.[A-ZÇĞİÖŞÜ])+\.$/.test(wordMatch[1])) return true;
  return false;
}

export function splitSentences(text) {
  if (!text?.trim()) return [];
  const out = [];
  let start = 0;
  const src = text.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!'.!?:'.includes(ch)) continue;
    if (isProtectedEnding(src, i)) continue;
    const next = src[i + 1];
    if (next && !/\s/.test(next)) continue;
    const sentence = src.slice(start, i + 1).trim();
    if (sentence) out.push(sentence);
    start = i + 1;
  }
  const tail = src.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function splitLineByRatio(line, sentencePieces) {
  const chars = sentencePieces.reduce((sum, s) => sum + s.length, 0) || 1;
  let used = 0;
  return sentencePieces.map((piece, idx) => {
    const portion = idx === sentencePieces.length - 1 ? (line.width - used) : Math.max(1, Math.round(line.width * (piece.length / chars)));
    const part = {
      x: line.x + used,
      y: line.y,
      width: portion,
      height: line.height,
      text: piece
    };
    used += portion;
    return part;
  });
}

function splitAcrossLines(block, sentenceText) {
  const lines = Array.isArray(block.lines) && block.lines.length
    ? block.lines
    : [{ x: block.x, y: block.y, width: block.width, height: block.height, text: block.text || sentenceText }];
  const capacities = lines.map((line) => Math.max(1, (line.text || '').trim().length || Math.round(line.width)));
  let remaining = sentenceText.length;
  let remainingChars = sentenceText;
  const segments = [];

  for (let i = 0; i < lines.length && remaining > 0; i++) {
    const line = lines[i];
    const cap = capacities[i];
    const quota = i === lines.length - 1
      ? remaining
      : Math.max(1, Math.min(remaining, Math.round((cap / capacities.reduce((a, b) => a + b, 0)) * sentenceText.length)));
    const taken = Math.min(remaining, quota);
    const textChunk = remainingChars.slice(0, taken).trim() || remainingChars.slice(0, taken);
    remainingChars = remainingChars.slice(taken);
    remaining -= taken;
    const widthRatio = taken / cap;
    const width = i === lines.length - 1 || remaining === 0
      ? line.width
      : Math.max(1, Math.min(line.width, line.width * widthRatio));
    segments.push({
      x: line.x,
      y: line.y,
      width,
      height: line.height,
      text: textChunk
    });
  }

  if (!segments.length) {
    segments.push({ x: block.x, y: block.y, width: block.width, height: block.height, text: sentenceText });
  }
  return segments;
}

function bucketByColumn(items) {
  const columns = [[], []];
  const xs = items.map((x) => x.x).sort((a, b) => a - b);
  const pivot = xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  for (const item of items) {
    if (item.x + item.width / 2 <= pivot) columns[0].push(item);
    else columns[1].push(item);
  }
  return columns.filter((c) => c.length);
}

function mergePlainTexts(sorted) {
  const merged = [];
  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.layout_type === 'plain text' && block.layout_type === 'plain text') {
      last.text = `${last.text} ${block.text}`.trim();
      last.width = Math.max(last.width, block.x + block.width - last.x);
      last.height = block.y + block.height - last.y;
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

function sanitizeBullets(text) {
  return text.replace(BULLET_RE, '').trim();
}

export function sentenceBoxesFromLayouts(layouts = []) {
  const filtered = layouts
    .filter((l) => l && l.width > 2 && l.height > 2)
    .filter((l) => l.layout_type !== 'macro container')
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  const results = [];
  let sentenceId = 1;

  const byPage = filtered.reduce((acc, block) => {
    (acc[block.page] ||= []).push(block);
    return acc;
  }, {});

  for (const pageItems of Object.values(byPage)) {
    const deduped = pageItems.filter((item, idx, arr) => {
      return !arr.some((other, j) => {
        if (j === idx || other.page !== item.page) return false;
        const interW = Math.max(0, Math.min(item.x + item.width, other.x + other.width) - Math.max(item.x, other.x));
        const interH = Math.max(0, Math.min(item.y + item.height, other.y + other.height) - Math.max(item.y, other.y));
        const interArea = interW * interH;
        const minArea = Math.min(item.width * item.height, other.width * other.height);
        return interArea / (minArea || 1) > 0.9 && j < idx;
      });
    });

    const columns = bucketByColumn(deduped);

    for (const columnBlocks of columns) {
      const sorted = mergePlainTexts(columnBlocks.sort((a, b) => a.y - b.y || a.x - b.x));
      for (const block of sorted) {
        const category = (block.layout_type || 'plain text').toLowerCase();
        if (category === 'table') {
          for (const cell of block.cells || [{ text: block.text, x: block.x, y: block.y, width: block.width, height: block.height }]) {
            results.push({
              sentence_id: sentenceId,
              page: block.page,
              category: 'Table',
              text: (cell.text || '').trim(),
              x: cell.x,
              y: cell.y,
              width: cell.width,
              height: cell.height
            });
            sentenceId += 1;
          }
          continue;
        }

        if (category === 'abandon' || category === 'title') {
          results.push({
            sentence_id: sentenceId,
            page: block.page,
            category: category === 'title' ? 'Title' : 'Abandon',
            text: sanitizeBullets(block.text || ''),
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height
          });
          sentenceId += 1;
          continue;
        }

        const cleaned = sanitizeBullets(block.text || '');
        const parts = splitSentences(cleaned);
        if (!parts.length) continue;
        if (Array.isArray(block.lines) && block.lines.length && parts.length === 1) {
          parts.forEach((sentence) => {
            const segments = splitAcrossLines(block, sentence);
            segments.forEach((piece) => {
              results.push({
                sentence_id: sentenceId,
                page: block.page,
                category: 'Plain Text',
                text: piece.text,
                x: piece.x,
                y: piece.y,
                width: piece.width,
                height: piece.height
              });
            });
            sentenceId += 1;
          });
        } else {
          const linePieces = splitLineByRatio(block, parts);
          linePieces.forEach((piece) => {
            results.push({
              sentence_id: sentenceId,
              page: block.page,
              category: 'Plain Text',
              text: piece.text,
              x: piece.x,
              y: piece.y,
              width: piece.width,
              height: piece.height
            });
            sentenceId += 1;
          });
        }
      }
    }
  }

  return results;
}
