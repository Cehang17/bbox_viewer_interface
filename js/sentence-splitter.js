/**
 * SentenceSplitter - JavaScript implementation of NLP sentence splitting & BBox calculation
 * ported directly from new_sentence_splitter.py.
 *
 * Rules:
 *  - ABBREVIATIONS: vb, vs, örn, sn, bkz, vd, dr, av, Cad, Sk, A.Ş, T.C, No, Min., Maks., USD, Mah, T.A.O, T
 *  - SENTENCE_ENDINGS: . ! ? ؟
 *  - ITEM_MARKERS: a), b), c)
 *  - Non-ending rules:
 *      1. Ends with ".)"
 *      2. Preceded by digit (e.g. "15.", "5.")
 *      3. Period not followed by space (e.g. web URLs, abbreviations)
 *      4. Abbreviations (case-insensitive)
 *      5. Ends with comma "," (joined with next)
 *      6. Bullet markers (•, -, ▪, ·, ●, *, ◦, >>)
 *      7. Early comma/semicolon on short line (< 90% ref width)
 *      8. Header matching ("Madde 16:", etc.)
 *      9. Proportional character-based bounding box calculation per line
 *     10. Table handling: Table cells are handled at cell-level.
 *         Each table cell is treated as an independent sentence and gets its own distinct BBox.
 */

class SentenceSplitter {
  static ABBREVIATIONS = new Set([
    "vb", "vs", "örn", "sn", "bkz", "vd", "dr", "av", "cad", "sk", 
    "a.ş", "t.c", "no", "min.", "maks.", "usd", "mah", "t.a.o", "t",
    "vb.", "vs.", "örn.", "sn.", "bkz.", "vd.", "dr.", "av.", "cad.", "sk.",
    "a.ş.", "t.c.", "no.", "mah."
  ]);

  static SENTENCE_ENDINGS = new Set([".", "!", "?", "؟"]);

  static BULLET_CHARS = ["•", "-", "▪", "·", "●", "*", "◦", ">>"];

  static ITEM_MARKERS_REGEX = /(?:(?<=^)|(?<=[\s(]))[a-z]\)(?=\s|$)/gi;

  /**
   * Check if the last word in the sentence is a known abbreviation
   */
  static isAbbreviation(sentence) {
    if (!sentence) return false;
    const words = sentence.trim().split(/\s+/);
    if (!words || words.length === 0) return false;

    const lastWord = words[words.length - 1];
    const lastWordClean = lastWord.toLowerCase().replace(/^[(\["'“‘]+|[)\]"'”’.,:;]+$/g, '');
    const lastWordWithDot = lastWord.toLowerCase().replace(/^[(\["'“‘]+|[)\]"'”’,:;]+$/g, '');

    if (this.ABBREVIATIONS.has(lastWordClean) || this.ABBREVIATIONS.has(lastWordWithDot)) return true;

    for (const abbr of this.ABBREVIATIONS) {
      const cleanAbbr = abbr.toLowerCase().replace(/\.+$/, '');
      if (lastWordClean === cleanAbbr || lastWordClean.startsWith(cleanAbbr)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Postprocess sentences: join sentences ending with a comma ','
   */
  static postprocessSentences(sentences) {
    const processed = [];
    let temp = "";
    for (const sentence of sentences) {
      const s = (sentence || "").trim();
      if (!s) continue;
      if (s.endsWith(',')) {
        temp += (temp ? " " : "") + s;
      } else {
        const full = (temp ? temp + " " + s : s).trim();
        if (full) processed.push(full);
        temp = "";
      }
    }
    if (temp.trim()) {
      processed.push(temp.trim());
    }
    return processed;
  }

  /**
   * Split a paragraph of text into NLP-governed sentences
   * @param {string} paragraphText
   * @param {string} [pdfLang="tr"]
   * @returns {Array<{text: string, start: number, end: number}>}
   */
  static splitParagraphIntoSentences(paragraphText, pdfLang = "tr") {
    if (!paragraphText || typeof paragraphText !== 'string') return [];

    let cleanedText = paragraphText.trim()
      .replace(/\r?\n/g, " ")
      .replace(/\t/g, " ")
      .replace(/،/g, ",");

    // Replace item markers (a), b), etc.) with '.'
    cleanedText = cleanedText.replace(this.ITEM_MARKERS_REGEX, '.');

    // Tokenize into candidate sentences based on punctuation and space
    const rawSegments = this._tokenizeRawSegments(cleanedText);

    // If single segment is > 2000 chars and lacks punctuation, split by comma
    let candidates = rawSegments;
    if (candidates.length === 1 && candidates[0].length > 2000 && !/[.!؟]/.test(candidates[0])) {
      candidates = candidates[0].split(',').map(s => s.trim()).filter(Boolean);
      candidates = this.postprocessSentences(candidates);
    }

    const correctedSentences = [];
    let tempSentence = "";
    let searchIdx = 0;
    let prevSentenceEnd = null;

    for (let i = 0; i < candidates.length; i++) {
      const sentence = candidates[i].trim();
      if (!sentence) continue;

      let indexInText = cleanedText.indexOf(sentence, searchIdx);
      if (indexInText === -1) {
        indexInText = cleanedText.indexOf(sentence);
      }
      if (indexInText !== -1) {
        searchIdx = indexInText + sentence.length;
      }

      let joinStr = " ";
      if (prevSentenceEnd !== null && indexInText !== -1 && indexInText >= prevSentenceEnd) {
        joinStr = cleanedText.substring(prevSentenceEnd, indexInText) || " ";
      }

      let isEnd = this.SENTENCE_ENDINGS.has(sentence[sentence.length - 1]);

      // Kural 1: Ends with ".)" -> NOT sentence end
      if (sentence.length >= 2 && sentence.endsWith(".)")) {
        isEnd = false;
      }

      // Kural 2: Preceded by digit (e.g. "15.", "1.") -> NOT sentence end
      if (sentence.length >= 2 && this.SENTENCE_ENDINGS.has(sentence[sentence.length - 1])) {
        const charBefore = sentence[sentence.length - 2];
        if (/\d/.test(charBefore)) {
          isEnd = false;
        }
      }

      // Kural 3: Period not followed by space in original text -> NOT sentence end (e.g. vakifbank.com.tr)
      if (sentence.endsWith('.')) {
        if (indexInText !== -1 && indexInText + sentence.length < cleanedText.length) {
          const nextChar = cleanedText[indexInText + sentence.length];
          if (nextChar !== " " && nextChar !== "\n" && nextChar !== "\t") {
            isEnd = false;
          }
        }
      }

      // Kural 4: Abbreviation check
      const isAbbr = this.isAbbreviation(sentence);
      const isSentenceEnd = isEnd && !isAbbr;

      if (i < candidates.length - 1) {
        if (isSentenceEnd) {
          const finished = tempSentence ? (tempSentence + joinStr + sentence) : sentence;
          correctedSentences.push(finished.trim());
          tempSentence = "";
        } else {
          tempSentence = tempSentence ? (tempSentence + joinStr + sentence) : sentence;
        }
      } else {
        // Last segment
        const finished = tempSentence ? (tempSentence + joinStr + sentence) : sentence;
        correctedSentences.push(finished.trim());
      }

      prevSentenceEnd = (indexInText !== -1) ? (indexInText + sentence.length) : null;
    }

    const sentences = [];
    let startIdx = 0;
    for (const sentenceText of correctedSentences) {
      if (!sentenceText) continue;
      startIdx = cleanedText.indexOf(sentenceText, startIdx);
      if (startIdx === -1) {
        startIdx = cleanedText.indexOf(sentenceText);
      }
      if (startIdx === -1) continue;
      const endIdx = startIdx + sentenceText.length;
      sentences.push({
        text: sentenceText,
        start: startIdx,
        end: endIdx
      });
      startIdx = endIdx;
    }

    return sentences;
  }

  /**
   * Internal tokenizer to split raw text into segments while tracking punctuation
   */
  static _tokenizeRawSegments(text) {
    const segments = [];
    let current = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      current += char;

      if (this.SENTENCE_ENDINGS.has(char)) {
        const nextChar = (i + 1 < text.length) ? text[i + 1] : "";
        // If next char is space or end of string, finish candidate segment
        if (!nextChar || /\s/.test(nextChar) || nextChar === '"' || nextChar === '”') {
          segments.push(current.trim());
          current = "";
        }
      }
    }

    if (current.trim()) {
      segments.push(current.trim());
    }

    return this.postprocessSentences(segments.filter(Boolean));
  }

  /**
   * Preprocess lines before sentence splitting:
   *  - Early comma rule: line ends with ',' or ';' and width < 90% of ref width -> becomes '.'
   *  - Bullet rule: line not ending with .!? followed by bullet -> becomes '.'
   *  - Header rule: line starting with header & ':' is split
   */
  static preprocessLines(lines, ratioThreshold = 0.9, headersForPage = []) {
    if (!lines || lines.length === 0) return { text: "", processedLines: [] };

    // Reference width: maximum line width
    let refWidth = 1;
    lines.forEach(ln => {
      const rect = this._getRectFromPolygonOrBox(ln.bbox || ln.rawCoords);
      if (rect) {
        const w = rect[2] - rect[0];
        if (w > refWidth) refWidth = w;
      }
    });

    const processed = [];
    const processedLines = [];
    const n = lines.length;

    for (let i = 0; i < n; i++) {
      const ln = lines[i];
      let txt = (ln.text || "").trimEnd();
      let lnBBox = ln.bbox || ln.rawCoords;

      // 0) Header rule: check for "Madde X:" or header match with ':'
      const didSplit = this._matchHeaderAndSplit(txt, headersForPage);
      if (didSplit.split) {
        // If previous line didn't end with punctuation, close it
        if (processed.length > 0) {
          let last = processed[processed.length - 1].trimEnd();
          if (!/[.!?]$/.test(last)) {
            last = last.replace(/[,:;\s]+$/, "") + ".";
            processed[processed.length - 1] = last;
            if (processedLines.length > 0) {
              processedLines[processedLines.length - 1].text = last;
            }
          }
        }

        let leftNorm = didSplit.leftRaw.trim();
        if (/[,;]\s*$/.test(leftNorm)) {
          leftNorm = leftNorm.replace(/[,;]+\s*$/, ":");
        }
        if (!/[:：]\s*$/.test(leftNorm)) {
          leftNorm += ":";
        }
        leftNorm += "."; // Period for NLP splitting

        processed.push(leftNorm);

        // Split bbox horizontally based on colon position
        const splitRatio = Math.max(0.1, Math.min(0.9, (didSplit.sepIdx + 1) / Math.max(txt.length, 1)));
        const rect = this._getRectFromPolygonOrBox(lnBBox);
        if (rect) {
          const [xMin, yMin, xMax, yMax] = rect;
          const splitX = xMin + (xMax - xMin) * splitRatio;
          const leftBox = [xMin, yMin, splitX, yMax];
          const rightBox = [splitX, yMin, xMax, yMax];
          processedLines.push({ text: leftNorm, bbox: leftBox });
          lnBBox = rightBox;
        } else {
          processedLines.push({ text: leftNorm, bbox: lnBBox });
        }

        txt = didSplit.rightRaw;
      }

      // 1) Early comma / semicolon rule
      if (/[,;]$/.test(txt) && lnBBox) {
        const rect = this._getRectFromPolygonOrBox(lnBBox);
        if (rect) {
          const lineWidth = rect[2] - rect[0];
          const upperRatio = (txt.match(/[A-ZÇĞİÖŞÜ]/g) || []).length / Math.max(txt.length, 1);
          const adjustedWidth = lineWidth * (1 + upperRatio * 0.2);

          if (adjustedWidth / refWidth < ratioThreshold) {
            txt = txt.slice(0, -1) + '.';
          }
        }
      }

      // 2) Bullet rule
      if (i < n - 1) {
        const nextTxt = (lines[i + 1].text || "").trimStart();
        const nextStartsWithBullet = this.BULLET_CHARS.some(b => nextTxt.startsWith(b));
        if (!/[.!?]$/.test(txt) && nextStartsWithBullet) {
          txt += '.';
        }
      }

      processed.push(txt);
      processedLines.push({ text: txt, bbox: lnBBox });
    }

    return {
      text: processed.join(' '),
      processedLines: processedLines
    };
  }

  /**
   * Helper to check header matching and colon split
   */
  static _matchHeaderAndSplit(lineText, headersForPage = []) {
    if (!lineText) return { split: false };

    const colonIdx = lineText.indexOf(':');
    const fullwidthColonIdx = lineText.indexOf('：');
    let sepIdx = -1;
    if (colonIdx !== -1 && fullwidthColonIdx !== -1) {
      sepIdx = Math.min(colonIdx, fullwidthColonIdx);
    } else {
      sepIdx = Math.max(colonIdx, fullwidthColonIdx);
    }

    if (sepIdx === -1) return { split: false };

    const leftRaw = lineText.substring(0, sepIdx + 1).trim();
    const rightRaw = lineText.substring(sepIdx + 1).trim();
    if (!leftRaw) return { split: false };

    const isHeaderPattern = /^(?:Madde\s*\d+|Bölüm\s*\d+|\d+\.\s*[A-ZÇĞİÖŞÜ]+|[A-ZÇĞİÖŞÜ\s]{3,})/i.test(leftRaw);
    const isExplicitHeader = headersForPage.some(h => leftRaw.toLowerCase().includes((h.text || '').toLowerCase().trim()));

    if (isHeaderPattern || isExplicitHeader) {
      return {
        split: true,
        sepIdx: sepIdx,
        leftRaw: leftRaw,
        rightRaw: rightRaw
      };
    }

    return { split: false };
  }

  /**
   * Preprocess lines before sentence splitting:
   *  - Early comma rule: line ends with ',' or ';' and width < 90% of ref width -> becomes '.'
   *  - Bullet rule: line not ending with .!? followed by bullet -> becomes '.'
   *  - Header rule: line starting with header & ':' is split
   *  - Standalone Header: line ending with ':' (e.g. 'TAHSİLAT ŞEKLİ:') becomes its own sentence
   */
  static preprocessLines(lines, ratioThreshold = 0.9, headersForPage = []) {
    if (!lines || lines.length === 0) return { text: "", processedLines: [] };

    // Reference width: maximum line width
    let refWidth = 1;
    lines.forEach(ln => {
      const rect = this._getRectFromPolygonOrBox(ln.bbox || ln.rawCoords);
      if (rect) {
        const w = rect[2] - rect[0];
        if (w > refWidth) refWidth = w;
      }
    });

    const processed = [];
    const processedLines = [];
    const n = lines.length;

    for (let i = 0; i < n; i++) {
      const ln = lines[i];
      let txt = (ln.text || "").trimEnd();
      let lnBBox = ln.bbox || ln.rawCoords;

      // 0) Header rule: check for "Madde X:" or header match with ':'
      const didSplit = this._matchHeaderAndSplit(txt, headersForPage);
      if (didSplit.split) {
        // If previous line didn't end with punctuation, close it
        if (processed.length > 0) {
          let last = processed[processed.length - 1].trimEnd();
          if (!/[.!?:]$/.test(last)) {
            last = last.replace(/[,;]+\s*$/, "") + ".";
            processed[processed.length - 1] = last;
            if (processedLines.length > 0) {
              processedLines[processedLines.length - 1].text = last;
            }
          }
        }

        let leftNorm = didSplit.leftRaw.trim();
        if (/[,;]\s*$/.test(leftNorm)) {
          leftNorm = leftNorm.replace(/[,;]+\s*$/, ":");
        }
        if (!/[:：]\s*$/.test(leftNorm)) {
          leftNorm += ":";
        }

        // If line is ONLY the header (e.g. 'TAHSİLAT ŞEKLİ:'), rightRaw is empty
        if (!didSplit.rightRaw) {
          const headerSentenceText = leftNorm + "."; // Period for NLP splitting
          processed.push(headerSentenceText);
          processedLines.push({ text: headerSentenceText, bbox: lnBBox });
          continue;
        }

        const leftSentenceText = leftNorm + ".";
        processed.push(leftSentenceText);

        // Split bbox horizontally based on colon position
        const splitRatio = Math.max(0.1, Math.min(0.9, (didSplit.sepIdx + 1) / Math.max(txt.length, 1)));
        const rect = this._getRectFromPolygonOrBox(lnBBox);
        if (rect) {
          const [xMin, yMin, xMax, yMax] = rect;
          const splitX = xMin + (xMax - xMin) * splitRatio;
          const leftBox = [xMin, yMin, splitX, yMax];
          const rightBox = [splitX, yMin, xMax, yMax];
          processedLines.push({ text: leftSentenceText, bbox: leftBox });
          lnBBox = rightBox;
        } else {
          processedLines.push({ text: leftSentenceText, bbox: lnBBox });
        }

        txt = didSplit.rightRaw;
      } else if (/[:：]$/.test(txt)) {
        // Line ends with colon: standalone section title / header
        if (processed.length > 0) {
          let last = processed[processed.length - 1].trimEnd();
          if (!/[.!?:]$/.test(last)) {
            last = last.replace(/[,;]+\s*$/, "") + ".";
            processed[processed.length - 1] = last;
            if (processedLines.length > 0) {
              processedLines[processedLines.length - 1].text = last;
            }
          }
        }
        const headerSentenceText = txt + ".";
        processed.push(headerSentenceText);
        processedLines.push({ text: headerSentenceText, bbox: lnBBox });
        continue;
      }

      // 1) Early comma / semicolon rule
      if (/[,;]$/.test(txt) && lnBBox) {
        const rect = this._getRectFromPolygonOrBox(lnBBox);
        if (rect) {
          const lineWidth = rect[2] - rect[0];
          const upperRatio = (txt.match(/[A-ZÇĞİÖŞÜ]/g) || []).length / Math.max(txt.length, 1);
          const adjustedWidth = lineWidth * (1 + upperRatio * 0.2);

          if (adjustedWidth / refWidth < ratioThreshold) {
            txt = txt.slice(0, -1) + '.';
          }
        }
      }

      // 2) Bullet rule
      if (i < n - 1) {
        const nextTxt = (lines[i + 1].text || "").trimStart();
        const nextStartsWithBullet = this.BULLET_CHARS.some(b => nextTxt.startsWith(b));
        if (!/[.!?]$/.test(txt) && nextStartsWithBullet) {
          txt += '.';
        }
      }

      processed.push(txt);
      processedLines.push({ text: txt, bbox: lnBBox });
    }

    return {
      text: processed.join(' '),
      processedLines: processedLines
    };
  }

  /**
   * Map sentences to lines based on character offset overlap
   */
  static mapSentencesToLines(sentences, lineIndices) {
    for (const sentence of sentences) {
      const sentenceLines = [];
      for (const line of lineIndices) {
        if (line.end > sentence.start && line.start < sentence.end) {
          const overlapStart = Math.max(sentence.start, line.start) - line.start;
          const overlapEnd = Math.min(sentence.end, line.end) - line.start;
          sentenceLines.push({
            line: line,
            overlap_start: overlapStart,
            overlap_end: overlapEnd
          });
        }
      }
      sentence.lines = sentenceLines;
    }
    return sentences;
  }

  /**
   * Calculate precise bounding boxes for a sentence based on line character ratios
   * Exactly ports calculate_sentence_bboxes from new_sentence_splitter.py
   */
  static calculateSentenceBBoxes(sentence, pdfLang = "tr") {
    const bboxList = [];
    const bboxTexts = [];
    let currentLineBBoxes = [];

    const lines = sentence.lines || [];

    for (const item of lines) {
      const line = item.line;
      const overlapStart = item.overlap_start;
      const overlapEnd = item.overlap_end;
      const lineText = line.text || "";
      const strippedLineText = lineText.trim().replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
      const lineLength = strippedLineText.length;

      if (lineLength === 0) continue;

      let x1Ratio = overlapStart / lineLength;
      let x2Ratio = overlapEnd / lineLength;

      const rect = this._getRectFromPolygonOrBox(line.bbox || line.rawCoords);
      if (!rect) continue;

      const [xMin, yMin, xMax, yMax] = rect;

      // Full line shortcut: if entire line belongs to sentence, use full width
      if (overlapStart <= 0 && overlapEnd >= lineLength) {
        x1Ratio = 0.0;
        x2Ratio = 1.0;
      }

      let x1, x2;
      if (pdfLang === "ar") {
        x1 = xMin + (1.0 - x2Ratio) * (xMax - xMin);
        x2 = xMin + (1.0 - x1Ratio) * (xMax - xMin);
      } else {
        x1 = xMin + x1Ratio * (xMax - xMin);
        x2 = xMin + x2Ratio * (xMax - xMin);
      }

      const y1 = yMin;
      const y2 = yMax;

      let isNewLine = false;
      if (currentLineBBoxes.length > 0) {
        const prev = currentLineBBoxes[currentLineBBoxes.length - 1];
        const prevYMin = prev[1], prevYMax = prev[3];
        const currYMin = y1, currYMax = y2;
        const overlap = Math.max(0.0, Math.min(prevYMax, currYMax) - Math.max(prevYMin, currYMin));
        const denom = Math.max(prevYMax - prevYMin, currYMax - currYMin, 1e-6);
        const overlapRatio = overlap / denom;

        if (overlapRatio < 0.4) {
          isNewLine = true;
        } else {
          const lineHeight = Math.max(prevYMax - prevYMin, currYMax - currYMin, 1e-6);
          const horizontalGap = x1 - prev[2];
          if (horizontalGap > Math.max(40.0, lineHeight * 3)) {
            isNewLine = true;
          }
        }
      }

      if (isNewLine) {
        if (currentLineBBoxes.length > 0) {
          const mergedBBox = [
            Math.min(...currentLineBBoxes.map(b => b[0])),
            Math.min(...currentLineBBoxes.map(b => b[1])),
            Math.max(...currentLineBBoxes.map(b => b[2])),
            Math.max(...currentLineBBoxes.map(b => b[3]))
          ];
          bboxList.push(mergedBBox);
          const mergedText = bboxTexts.slice(-currentLineBBoxes.length).join(" ");
          bboxTexts.splice(-currentLineBBoxes.length, currentLineBBoxes.length, mergedText);
        }
        currentLineBBoxes = [];
      }

      currentLineBBoxes.push([x1, y1, x2, y2]);

      const startChar = Math.max(0, Math.floor(overlapStart));
      const endChar = Math.min(strippedLineText.length, Math.ceil(overlapEnd));
      const bText = strippedLineText.substring(startChar, endChar).trim();
      bboxTexts.push(bText);
    }

    if (currentLineBBoxes.length > 0) {
      const mergedBBox = [
        Math.min(...currentLineBBoxes.map(b => b[0])),
        Math.min(...currentLineBBoxes.map(b => b[1])),
        Math.max(...currentLineBBoxes.map(b => b[2])),
        Math.max(...currentLineBBoxes.map(b => b[3]))
      ];
      bboxList.push(mergedBBox);
      const mergedText = bboxTexts.slice(-currentLineBBoxes.length).join(" ");
      bboxTexts.splice(-currentLineBBoxes.length, currentLineBBoxes.length, mergedText);
    }

    // General same-line merge
    if (bboxList.length > 0 && bboxTexts.length > 0) {
      const mergedBBoxes = [];
      const mergedTexts = [];
      const yTolerancePx = 2;
      const maxGapPx = 18;

      for (let k = 0; k < bboxList.length; k++) {
        const bb = bboxList[k];
        const tx = bboxTexts[k] || "";
        if (mergedBBoxes.length > 0) {
          const prev = mergedBBoxes[mergedBBoxes.length - 1];
          const sameLine = Math.abs(bb[1] - prev[1]) <= yTolerancePx && Math.abs(bb[3] - prev[3]) <= yTolerancePx;
          const smallGap = (bb[0] - prev[2]) <= maxGapPx;
          if (sameLine && smallGap) {
            mergedBBoxes[mergedBBoxes.length - 1] = [
              Math.min(prev[0], bb[0]),
              Math.min(prev[1], bb[1]),
              Math.max(prev[2], bb[2]),
              Math.max(prev[3], bb[3])
            ];
            mergedTexts[mergedTexts.length - 1] = (mergedTexts[mergedTexts.length - 1] + " " + tx.trim()).trim();
            continue;
          }
        }
        mergedBBoxes.push(bb);
        mergedTexts.push(tx);
      }
      sentence.bboxes = mergedBBoxes;
      sentence.bbox_texts = mergedTexts;
    } else {
      sentence.bboxes = bboxList;
      sentence.bbox_texts = bboxTexts;
    }

    return sentence.bboxes;
  }

  /**
   * Clean sentences:
   *  - Strip bullet markers (•, -, ▪, ·, ●, *, ◦, >>) and adjust first bbox width proportionally
   *  - Clean artificial trailing periods added to colon headers (e.g. 'TAHSİLAT ŞEKLİ:.' -> 'TAHSİLAT ŞEKLİ:')
   *  - Remove sentences that have no letters and no numbers
   */
  static cleanSentences(sentences) {
    const cleaned = [];

    for (const s of sentences) {
      let text = (s.text || "").trim();
      const originalText = text;

      for (const pattern of this.BULLET_CHARS) {
        if (text.startsWith(pattern)) {
          const patternLength = pattern.length;
          text = text.substring(patternLength).trim();

          if (s.bboxes && s.bboxes.length > 0) {
            const firstBBox = s.bboxes[0];
            const bboxWidth = firstBBox[2] - firstBBox[0];
            const patternRatio = patternLength / Math.max(originalText.length, 1);
            const patternBBoxWidth = bboxWidth * patternRatio;

            if (patternBBoxWidth < bboxWidth * 0.5) {
              firstBBox[0] += patternBBoxWidth;
            } else {
              s.bboxes.shift();
              if (s.bbox_texts && s.bbox_texts.length > 0) {
                s.bbox_texts.shift();
              }
            }
          }
        }
      }

      // Revert artificial header dot if ended in ':.'
      if (/[:：]\.$/.test(text)) {
        text = text.replace(/\.$/, '');
      }
      if (s.bbox_texts && Array.isArray(s.bbox_texts)) {
        s.bbox_texts = s.bbox_texts.map(t => typeof t === 'string' ? t.replace(/[:：]\.$/, ':') : t);
      }

      // Keep sentence if it has letters or is digit+dot
      const hasAlpha = /[a-zA-ZçÇğĞıİöÖşŞüÜ]/.test(text);
      const isDigitPattern = /^\d+(?:\.\d+)*\.?$/.test(text.replace(/\s+/g, ''));
      if (hasAlpha || isDigitPattern) {
        s.text = text;
        cleaned.push(s);
      }
    }

    return cleaned;
  }

  /**
   * Fix tiny leading bounding boxes by merging into previous sentence
   */
  static fixTinyLeadingBBoxes(sentences, gapThr = 2, charWidthFactor = 4) {
    for (let i = 1; i < sentences.length; i++) {
      const curr = sentences[i];
      const prev = sentences[i - 1];
      const currB = curr.bboxes || [];
      const prevB = prev.bboxes || [];
      if (currB.length === 0 || prevB.length === 0) continue;

      const first = currB[0];
      const lastp = prevB[prevB.length - 1];

      // Adjacent?
      if (!(Math.abs(first[0] - lastp[2]) < gapThr || first[0] === lastp[2])) continue;
      // Same line?
      if (Math.abs(first[1] - lastp[1]) > gapThr || Math.abs(first[3] - lastp[3]) > gapThr) continue;

      const fragW = first[2] - first[0];
      if (fragW > 15 * charWidthFactor) continue;

      // Union
      lastp[0] = Math.min(lastp[0], first[0]);
      lastp[1] = Math.min(lastp[1], first[1]);
      lastp[2] = Math.max(lastp[2], first[2]);
      lastp[3] = Math.max(lastp[3], first[3]);

      currB.shift();
      if (curr.bbox_texts && curr.bbox_texts.length > 0) {
        const t = curr.bbox_texts.shift();
        if (prev.bbox_texts && prev.bbox_texts.length > 0) {
          prev.bbox_texts[prev.bbox_texts.length - 1] += " " + t;
        }
      }
    }
  }

  /**
   * TABLE HANDLING:
   * Each cell is taken directly as an individual sentence with its own distinct bounding box.
   */
  static extractTableCells(tableData) {
    if (!tableData) return [];
    const cellItems = [];

    const cells = tableData.cells || tableData.table_cells || tableData.cell_bboxes || [];
    if (Array.isArray(cells) && cells.length > 0) {
      cells.forEach((cell, idx) => {
        const text = (cell.text || cell.ocr_text || cell.content || `Hücre #${idx + 1}`).trim();
        const box = cell.bbox || cell.rawCoords || cell.polygon || cell.ocr_polygon || cell.coordinates || cell.box;
        const rect = this._getRectFromPolygonOrBox(box);
        if (rect) {
          cellItems.push({
            text: text,
            rawCoords: rect,
            category: 'Table Cell',
            isTableCell: true,
            row: cell.row_index !== undefined ? cell.row_index : (cell.row || 0),
            col: cell.col_index !== undefined ? cell.col_index : (cell.col || 0),
            rowspan: cell.rowspan || cell.row_span || 1,
            colspan: cell.colspan || cell.col_span || 1
          });
        }
      });
      return cellItems;
    }

    const rows = tableData.rows || tableData.table_rows || [];
    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((row, rIdx) => {
        const rowCells = row.cells || row;
        if (Array.isArray(rowCells)) {
          rowCells.forEach((cell, cIdx) => {
            const text = (typeof cell === 'string' ? cell : (cell.text || cell.content || `Hücre R${rIdx+1}C${cIdx+1}`)).trim();
            const box = cell.bbox || cell.polygon || cell.ocr_polygon;
            const rect = this._getRectFromPolygonOrBox(box);
            if (rect) {
              cellItems.push({
                text: text,
                rawCoords: rect,
                category: 'Table Cell',
                isTableCell: true,
                row: rIdx,
                col: cIdx
              });
            }
          });
        }
      });
      return cellItems;
    }

    return cellItems;
  }

  /**
   * Helper to normalize layout categories
   */
  static normalizeCategory(cat) {
    if (!cat || typeof cat !== 'string') return 'Plain Text';
    const c = cat.trim().toLowerCase().replace(/[_-]/g, ' ');
    if (c.includes('abandon') || c.includes('figure') || c.includes('watermark') || c.includes('background') || c.includes('footer')) {
      return 'Abandon';
    }
    if (c.includes('table')) {
      return 'Table';
    }
    if (c.includes('title') || c.includes('section header') || c.includes('heading') || c.includes('header') || c.includes('caption')) {
      return 'Title';
    }
    return 'Plain Text';
  }

  /**
   * Processes all raw line / layout items on a page into true NLP-segmented sentences
   * with strict layout-aware boundary rules:
   *  - 'abandon': discarded.
   *  - 'title': independent sentence BBox; never merged with preceding or succeeding plain text.
   *  - 'table': handled cell-by-cell; never merged with text or titles.
   *  - 'plain text': consecutive plain text items within the same layout block/column are merged first,
   *                  then split according to Turkish/Arabic/English NLP sentence rules.
   *
   * @param {Array} rawItems - Array of line bounding box items on this page
   * @param {number} pageNum - Page number
   * @param {number} startSentenceNumber - Initial sentence number counter
   * @returns {{ items: Array, nextSentenceNumber: number }}
   */
  static processPageLinesIntoSentences(rawItems, pageNum = 1, startSentenceNumber = 1) {
    if (!rawItems || rawItems.length === 0) return { items: [], nextSentenceNumber: startSentenceNumber };

    // Step 1: Normalize items (including abandon)
    const normalizedItems = [];
    rawItems.forEach(it => {
      const rawCat = it.category || it.type || it.label || it.layout_label || '';
      const cat = this.normalizeCategory(rawCat);

      if (cat === 'Abandon') {
        const rect = this._getRectFromPolygonOrBox(it.rawCoords || it.bbox || it.polygon);
        if (rect) {
          normalizedItems.push({
            text: (it.text || 'Abandon').trim(),
            bbox: rect,
            rawCoords: rect,
            category: 'Abandon',
            origItem: it
          });
        }
        return;
      }

      // If Table element
      if (cat === 'Table' || it.isTableCell || it.cells || it.table_cells) {
        const cells = this.extractTableCells(it);
        if (cells.length > 0) {
          cells.forEach(c => {
            normalizedItems.push({
              text: c.text,
              bbox: c.rawCoords,
              rawCoords: c.rawCoords,
              category: 'Table Cell',
              isTableCell: true,
              origItem: it
            });
          });
        } else {
          const rect = this._getRectFromPolygonOrBox(it.rawCoords || it.bbox || it.polygon);
          if (rect) {
            normalizedItems.push({
              text: (it.text || 'Tablo').trim(),
              bbox: rect,
              rawCoords: rect,
              category: 'Table Cell',
              isTableCell: true,
              origItem: it
            });
          }
        }
        return;
      }

      const rect = this._getRectFromPolygonOrBox(it.rawCoords || it.bbox || it.polygon);
      const text = (it.text || '').trim();
      if (!rect || text.length === 0) return;

      normalizedItems.push({
        text: text,
        bbox: rect,
        rawCoords: rect,
        category: cat, // 'Title' or 'Plain Text'
        origItem: it
      });
    });

    if (normalizedItems.length === 0) {
      return { items: [], nextSentenceNumber: startSentenceNumber };
    }

    // Step 2: Sort items in document reading order (top-to-bottom, column-aware)
    normalizedItems.sort((a, b) => {
      const [ax0, ay0, ax1, ay1] = a.bbox;
      const [bx0, by0, bx1, by1] = b.bbox;
      const aMidY = (ay0 + ay1) / 2;
      const bMidY = (by0 + by1) / 2;
      const lineH = Math.max(ay1 - ay0, by1 - by0, 10);
      if (Math.abs(aMidY - bMidY) > lineH * 0.75) {
        return aMidY - bMidY;
      }
      return ax0 - bx0;
    });

    let currentSentenceNum = startSentenceNumber;
    const finalSentenceBBoxes = [];

    // Step 3: Layout analysis & block clustering
    // Consecutive 'Plain Text' items in the same column are merged together into a continuous block.
    // 'Title', 'Table Cell', and 'Abandon' are independent boundaries that trigger immediate flush.
    let currentTextBlock = [];

    const flushTextBlock = () => {
      if (currentTextBlock.length === 0) return;

      const block = currentTextBlock;
      currentTextBlock = [];

      const { text: preprocessedText, processedLines } = this.preprocessLines(block, 0.9, []);
      if (!preprocessedText.trim()) return;

      const sentences = this.splitParagraphIntoSentences(preprocessedText);
      if (!sentences || sentences.length === 0) return;

      const lineIndices = [];
      let searchIdx = 0;
      for (const pl of processedLines) {
        const lt = (pl.text || '').trim();
        if (!lt) continue;
        let idx = preprocessedText.indexOf(lt, searchIdx);
        if (idx === -1) idx = preprocessedText.indexOf(lt);
        if (idx === -1) continue;
        const end = idx + lt.length;
        lineIndices.push({ text: lt, start: idx, end: end, bbox: pl.bbox });
        searchIdx = end;
      }

      this.mapSentencesToLines(sentences, lineIndices);

      for (const s of sentences) {
        this.calculateSentenceBBoxes(s);
      }

      this.fixTinyLeadingBBoxes(sentences);
      const cleanedSentences = this.cleanSentences(sentences);

      for (const s of cleanedSentences) {
        const sNum = currentSentenceNum++;
        const sText = s.text.trim();
        const sBBoxes = s.bboxes || [];
        const sTexts = s.bbox_texts || [];

        if (sBBoxes.length === 0) {
          const minX = Math.min(...block.map(l => l.bbox[0]));
          const minY = Math.min(...block.map(l => l.bbox[1]));
          const maxX = Math.max(...block.map(l => l.bbox[2]));
          const maxY = Math.max(...block.map(l => l.bbox[3]));
          finalSentenceBBoxes.push({
            id: `bbox-p${pageNum}-s${sNum}`,
            page: pageNum,
            sentence_id: sNum,
            id_display: sNum,
            sentence_number: sNum,
            fullSentenceText: sText,
            text: sText,
            rawCoords: [minX, minY, maxX, maxY],
            coordType: 'abs_points',
            category: 'Plain Text',
            confidence: 0.98
          });
        } else {
          sBBoxes.forEach((bb, bIdx) => {
            const lineBoxText = (sTexts[bIdx] || sText).trim();
            finalSentenceBBoxes.push({
              id: `bbox-p${pageNum}-s${sNum}-b${bIdx + 1}`,
              page: pageNum,
              sentence_id: sNum,
              id_display: sNum,
              sentence_number: sNum,
              fullSentenceText: sText,
              text: lineBoxText,
              rawCoords: [Math.round(bb[0] * 10) / 10, Math.round(bb[1] * 10) / 10, Math.round(bb[2] * 10) / 10, Math.round(bb[3] * 10) / 10],
              coordType: 'abs_points',
              category: 'Plain Text',
              confidence: 0.98
            });
          });
        }
      }
    };

    let currentTableBlock = [];

    const flushTableBlock = () => {
      if (currentTableBlock.length === 0) return;
      const tBlock = currentTableBlock;
      currentTableBlock = [];

      const Classifier = (typeof TableClassifier !== 'undefined')
        ? TableClassifier
        : (typeof require !== 'undefined' ? (() => { try { return require('./table-classifier.js'); } catch(e) { return null; } })() : null);

      if (Classifier && typeof Classifier.processTable === 'function') {
        const { items: tableItems, nextSentenceNumber } = Classifier.processTable({ cells: tBlock }, pageNum, currentSentenceNum);
        if (tableItems && tableItems.length > 0) {
          currentSentenceNum = nextSentenceNumber;
          tableItems.forEach(it => {
            finalSentenceBBoxes.push(it);
          });
          return;
        }
      }

      tBlock.forEach(item => {
        const sNum = currentSentenceNum++;
        finalSentenceBBoxes.push({
          id: `bbox-p${pageNum}-t${sNum}`,
          page: pageNum,
          sentence_id: sNum,
          id_display: sNum,
          sentence_number: sNum,
          fullSentenceText: item.text,
          text: item.text,
          rawCoords: item.rawCoords,
          coordType: 'abs_points',
          category: 'Table Cell',
          confidence: 0.99
        });
      });
    };

    for (let i = 0; i < normalizedItems.length; i++) {
      const item = normalizedItems[i];

      // A. Table Cell: gather into table block for structural classification & accessible reading order
      if (item.category === 'Table Cell') {
        flushTextBlock();
        currentTableBlock.push(item);
        continue;
      }

      // If non-table cell arrives, flush any ongoing table block
      flushTableBlock();

      // B. Title: always separate (never merged with plain text before or after)
      if (item.category === 'Title') {
        flushTextBlock();
        const sNum = currentSentenceNum++;
        finalSentenceBBoxes.push({
          id: `bbox-p${pageNum}-title-${sNum}`,
          page: pageNum,
          sentence_id: sNum,
          id_display: sNum,
          sentence_number: sNum,
          fullSentenceText: item.text,
          text: item.text,
          rawCoords: item.rawCoords,
          coordType: 'abs_points',
          category: 'Title',
          confidence: 0.99
        });
        continue;
      }

      // C. Abandon: always separate (never merged with plain text before or after)
      if (item.category === 'Abandon') {
        flushTextBlock();
        const sNum = currentSentenceNum++;
        finalSentenceBBoxes.push({
          id: `bbox-p${pageNum}-abandon-${sNum}`,
          page: pageNum,
          sentence_id: sNum,
          id_display: sNum,
          sentence_number: sNum,
          fullSentenceText: item.text,
          text: item.text,
          rawCoords: item.rawCoords,
          coordType: 'abs_points',
          category: 'Abandon',
          confidence: 0.95
        });
        continue;
      }

      // D. Plain Text: consecutive plain text items are merged together
      if (currentTextBlock.length === 0) {
        currentTextBlock.push(item);
      } else {
        const prevLine = currentTextBlock[currentTextBlock.length - 1];
        const [px0, py0, px1, py1] = prevLine.bbox;
        const [lx0, ly0, lx1, ly1] = item.bbox;
        const prevH = Math.max(py1 - py0, 10);
        const currText = item.text.trim();

        const isHeaderLike = /^(?:Madde\s*\d+|Bölüm\s*\d+|\d+\.\s*[A-ZÇĞİÖŞÜ]+)/i.test(currText) ||
                             /^[A-ZÇĞİÖŞÜ0-9\s:/-]{4,}:$/.test(currText) ||
                             (/^([A-ZÇĞİÖŞÜ\s]{4,})$/.test(currText) && currText.length < 50);
        const isColShift = Math.abs(lx0 - px0) > 150 && Math.abs(ly0 - py0) < prevH * 2;

        if (isHeaderLike || isColShift) {
          flushTextBlock();
          currentTextBlock = [item];
        } else {
          // Merge consecutive plain text!
          currentTextBlock.push(item);
        }
      }
    }

    flushTextBlock();
    flushTableBlock();

    return {
      items: finalSentenceBBoxes,
      nextSentenceNumber: currentSentenceNum
    };
  }

  /**
   * Segment all items across an entire document with global sequential sentence IDs.
   * If items are lines, segments them into multi-line sentence bounding boxes.
   */
  static segmentAllParagraphs(items) {
    if (!items || items.length === 0) return [];

    // Group items by page
    const itemsByPage = new Map();
    items.forEach(it => {
      const p = parseInt(it.page || 1, 10);
      if (!itemsByPage.has(p)) itemsByPage.set(p, []);
      itemsByPage.get(p).push(it);
    });

    const allSegmented = [];
    let currentSentenceNum = 1;

    // Numerical page ordering (Page 1 -> Page 2 -> Page 3 ...)
    const sortedPages = Array.from(itemsByPage.keys()).sort((a, b) => Number(a) - Number(b));
    for (const pageNum of sortedPages) {
      const pageItems = itemsByPage.get(pageNum);
      const res = this.processPageLinesIntoSentences(pageItems, pageNum, currentSentenceNum);
      allSegmented.push(...res.items);
      currentSentenceNum = res.nextSentenceNumber;
    }

    return allSegmented;
  }

  /**
   * Helper to extract [x1, y1, x2, y2] from polygon or box array
   */
  static _getRectFromPolygonOrBox(polyOrBox) {
    if (!polyOrBox) return null;
    if (Array.isArray(polyOrBox)) {
      // If 4-point polygon [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
      if (polyOrBox.length >= 3 && Array.isArray(polyOrBox[0])) {
        const xs = polyOrBox.map(pt => Number(pt[0]) || 0);
        const ys = polyOrBox.map(pt => Number(pt[1]) || 0);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      }
      // If [x1, y1, x2, y2]
      if (polyOrBox.length === 4 && typeof polyOrBox[0] === 'number') {
        const [a, b, c, d] = polyOrBox.map(Number);
        return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
      }
    }
    // If object { xmin, ymin, xmax, ymax }
    if (typeof polyOrBox === 'object') {
      const x0 = Number(polyOrBox.xmin ?? polyOrBox.x0 ?? polyOrBox.left ?? 0);
      const y0 = Number(polyOrBox.ymin ?? polyOrBox.y0 ?? polyOrBox.top ?? 0);
      const x1 = Number(polyOrBox.xmax ?? polyOrBox.x1 ?? (x0 + (polyOrBox.width ?? 0)));
      const y1 = Number(polyOrBox.ymax ?? polyOrBox.y1 ?? (y0 + (polyOrBox.height ?? 0)));
      return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    }
    return null;
  }
}

// Exports
if (typeof window !== 'undefined') {
  window.SentenceSplitter = SentenceSplitter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SentenceSplitter;
}

