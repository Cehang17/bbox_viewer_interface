/**
 * TableClassifier - Advanced Table Detection, Structural Classification & Accessible Reading Order Engine
 *
 * Implements the 6 Structural Table Categories & Reading Order Pipeline:
 *  1. A_MATRIX: Matrix Data Grid (Row Header + Col Header + Value association)
 *  2. B_KEY_VALUE: Key-Value Form (2-column Label: Value pairs)
 *  3. C_PARALLEL_TEXT: False Table / Parallel Column Paragraphs (Vertical column-by-column flow)
 *  4. D_MERGED_CELLS: Hierarchical Colspan/Rowspan Merged Tables
 *  5. E_FORMULA: Mathematical Formulas & Calculation Tables
 *  6. F_HYBRID_NOTE: Data Table with Bottom Explanation/Footnote Blocks
 */

class TableClassifier {
  static TYPES = {
    A_MATRIX: 'A_MATRIX',
    B_KEY_VALUE: 'B_KEY_VALUE',
    C_PARALLEL_TEXT: 'C_PARALLEL_TEXT',
    D_MERGED_CELLS: 'D_MERGED_CELLS',
    E_FORMULA: 'E_FORMULA',
    F_HYBRID_NOTE: 'F_HYBRID_NOTE'
  };

  /**
   * Main entry point to process, classify, and generate accessible reading-ordered BBoxes for any table.
   * @param {Object} tableData - Raw table object or container with cells/words/bbox
   * @param {number} pageNum - Page number
   * @param {number} startSentenceNumber - Starting sentence number counter
   * @returns {{ items: Array, tableType: string, nextSentenceNumber: number }}
   */
  static processTable(tableData, pageNum = 1, startSentenceNumber = 1) {
    if (!tableData) return { items: [], tableType: this.TYPES.A_MATRIX, nextSentenceNumber: startSentenceNumber };

    // Step 1: Extract or construct individual cell objects
    const rawCells = this._extractCellsFromTable(tableData);
    if (rawCells.length === 0) return { items: [], tableType: this.TYPES.A_MATRIX, nextSentenceNumber: startSentenceNumber };

    // Step 2: Grid and coordinate reconstruction
    const tableBox = this._getRect(tableData.bbox || tableData.coords || tableData.box) || this._calculateBounds(rawCells);
    const grid = this.recalculateGridFromBBoxes(rawCells, tableBox);

    // Step 3: Calculate structural metrics
    const metrics = this.calculateTableMetrics(grid, rawCells, tableBox);

    // Step 4: Classify table type (6 categories)
    const tableType = this.classifyTable(grid, rawCells, metrics);

    // Step 5: Structure headers, multi-line mergers, and footer notes
    const structuredData = this.structureTableHeadersAndNotes(grid, rawCells, tableType, tableBox);

    // Step 6: Generate accessible reading-ordered BBox items
    const { items, nextSentenceNumber } = this.generateAccessibleTableReadingOrder(structuredData, tableType, pageNum, startSentenceNumber);

    return {
      items,
      tableType,
      nextSentenceNumber
    };
  }

  /**
   * Extract or assemble raw cells from tableData
   */
  static _extractCellsFromTable(tableData) {
    let cells = [];

    const rawList = tableData.cells || tableData.table_cells || tableData.cell_bboxes || [];
    if (Array.isArray(rawList) && rawList.length > 0) {
      cells = rawList.map((c, idx) => {
        const rect = this._getRect(c.bbox || c.rawCoords || c.abs_coords || c.cell_coords || c.polygon || c.coords || c.box);
        const text = (c.text || c.content || c.ocr_text || `Hücre #${idx + 1}`).trim();
        return {
          text,
          rawCoords: rect || [0, 0, 0, 0],
          row: c.row_index ?? c.row ?? 0,
          col: c.col_index ?? c.col ?? 0,
          rowspan: c.row_span ?? c.rowspan ?? 1,
          colspan: c.col_span ?? c.colspan ?? 1,
          confidence: c.confidence ?? 0.98,
          words: c.words || []
        };
      }).filter(c => c.rawCoords && (c.rawCoords[2] > c.rawCoords[0]));
    }

    if (cells.length === 0) {
      const Splitter = (typeof SentenceSplitter !== 'undefined')
        ? SentenceSplitter
        : (typeof require !== 'undefined' ? (() => { try { return require('./sentence-splitter.js'); } catch(e) { return null; } })() : null);

      if (Splitter && typeof Splitter.extractTableCells === 'function') {
        cells = Splitter.extractTableCells(tableData);
      }
    }

    // Fallback: If tableData has words but no explicit cell boundaries, cluster words into cells
    if (cells.length === 0 && Array.isArray(tableData.words) && tableData.words.length > 0) {
      cells = this._clusterWordsIntoCells(tableData.words);
    }

    return cells;
  }

  /**
   * Cluster unstructured OCR words inside a table into grid cells
   */
  static _clusterWordsIntoCells(words) {
    if (!words || words.length === 0) return [];
    const validWords = words.filter(w => {
      const b = w.bbox || w.coords;
      return Array.isArray(b) && b.length >= 4;
    });
    if (validWords.length === 0) return [];

    // Find horizontal column clusters
    const xCenters = validWords.map(w => ((w.bbox[0] + w.bbox[2]) / 2)).sort((a, b) => a - b);
    const colSplits = [];
    for (let i = 0; i < xCenters.length - 1; i++) {
      const gap = xCenters[i + 1] - xCenters[i];
      if (gap > 40) {
        colSplits.push((xCenters[i] + xCenters[i + 1]) / 2);
      }
    }

    // Group words into columns
    const colWords = Array.from({ length: colSplits.length + 1 }, () => []);
    validWords.forEach(w => {
      const cx = (w.bbox[0] + w.bbox[2]) / 2;
      let cIdx = 0;
      while (cIdx < colSplits.length && cx >= colSplits[cIdx]) cIdx++;
      colWords[cIdx].push(w);
    });

    const cells = [];
    colWords.forEach((cWList, cIdx) => {
      if (cWList.length === 0) return;
      cWList.sort((a, b) => a.bbox[1] - b.bbox[1]);

      // Group words into lines/cells by vertical proximity
      let curCell = null;
      cWList.forEach(w => {
        const [wx0, wy0, wx1, wy1] = w.bbox;
        const wcy = (wy0 + wy1) / 2;
        if (!curCell || (wy0 - curCell.y1 > 12)) {
          if (curCell) cells.push(curCell);
          curCell = {
            col: cIdx,
            row: cells.length,
            x0: wx0, y0: wy0, x1: wx1, y1: wy1,
            words: [w],
            text: w.word || w.text || ''
          };
        } else {
          curCell.words.push(w);
          curCell.x0 = Math.min(curCell.x0, wx0);
          curCell.y0 = Math.min(curCell.y0, wy0);
          curCell.x1 = Math.max(curCell.x1, wx1);
          curCell.y1 = Math.max(curCell.y1, wy1);
          curCell.text += ' ' + (w.word || w.text || '');
        }
      });
      if (curCell) cells.push(curCell);
    });

    return cells.map((c, idx) => ({
      text: c.text.trim(),
      rawCoords: [c.x0, c.y0, c.x1, c.y1],
      row: c.row,
      col: c.col,
      rowspan: 1,
      colspan: 1,
      confidence: 0.95
    }));
  }

  /**
   * Recalculate grid, row, and column boundaries from cell BBoxes with X/Y clustering
   */
  static recalculateGridFromBBoxes(cells, tableBox) {
    if (!cells || cells.length === 0) return { rows: [], cols: [], cells: [] };

    // 1. Cluster X boundaries (Δx <= 15px)
    const xPoints = [];
    cells.forEach(c => {
      const [x0, , x1] = c.rawCoords;
      xPoints.push(x0, x1);
    });
    xPoints.sort((a, b) => a - b);

    const xClusters = [];
    xPoints.forEach(x => {
      const match = xClusters.find(cl => Math.abs(cl.center - x) <= 15);
      if (match) {
        match.points.push(x);
        match.center = match.points.reduce((a, b) => a + b, 0) / match.points.length;
      } else {
        xClusters.push({ center: x, points: [x] });
      }
    });
    xClusters.sort((a, b) => a.center - b.center);

    // Form column intervals (width >= 10px)
    const colIntervals = [];
    for (let i = 0; i < xClusters.length - 1; i++) {
      const left = xClusters[i].center;
      const right = xClusters[i + 1].center;
      if (right - left >= 10) {
        colIntervals.push({ col_idx: colIntervals.length, x0: left, x1: right });
      }
    }

    // 2. Cluster Y boundaries (Δy <= 8px)
    const yPoints = [];
    cells.forEach(c => {
      const [, y0, , y1] = c.rawCoords;
      yPoints.push(y0, y1);
    });
    yPoints.sort((a, b) => a - b);

    const yClusters = [];
    yPoints.forEach(y => {
      const match = yClusters.find(cl => Math.abs(cl.center - y) <= 8);
      if (match) {
        match.points.push(y);
        match.center = match.points.reduce((a, b) => a + b, 0) / match.points.length;
      } else {
        yClusters.push({ center: y, points: [y] });
      }
    });
    yClusters.sort((a, b) => a.center - b.center);

    // Form row intervals (height >= 6px)
    const rowIntervals = [];
    for (let i = 0; i < yClusters.length - 1; i++) {
      const top = yClusters[i].center;
      const bottom = yClusters[i + 1].center;
      if (bottom - top >= 6) {
        rowIntervals.push({ row_idx: rowIntervals.length, y0: top, y1: bottom });
      }
    }

    // 3. Map cells to rows & cols based on IoU overlap (IoU >= 0.25)
    const structuredCells = cells.map((c, idx) => {
      const [cx0, cy0, cx1, cy1] = c.rawCoords;
      const matchedCols = [];
      colIntervals.forEach(col => {
        const overlapX = Math.max(0, Math.min(cx1, col.x1) - Math.max(cx0, col.x0));
        const colW = col.x1 - col.x0;
        if (overlapX / Math.min(cx1 - cx0, colW) > 0.35) {
          matchedCols.push(col.col_idx);
        }
      });

      const matchedRows = [];
      rowIntervals.forEach(row => {
        const overlapY = Math.max(0, Math.min(cy1, row.y1) - Math.max(cy0, row.y0));
        const rowH = row.y1 - row.y0;
        if (overlapY / Math.min(cy1 - cy0, rowH) > 0.35) {
          matchedRows.push(row.row_idx);
        }
      });

      const startCol = matchedCols.length > 0 ? Math.min(...matchedCols) : (c.col || 0);
      const endCol = matchedCols.length > 0 ? Math.max(...matchedCols) : startCol;
      const startRow = matchedRows.length > 0 ? Math.min(...matchedRows) : (c.row || 0);
      const endRow = matchedRows.length > 0 ? Math.max(...matchedRows) : startRow;

      return {
        ...c,
        id: c.id || `cell-${idx + 1}`,
        row: startRow,
        col: startCol,
        rowspan: Math.max(1, endRow - startRow + 1),
        colspan: Math.max(1, endCol - startCol + 1)
      };
    });

    return {
      rows: rowIntervals,
      cols: colIntervals,
      cells: structuredCells
    };
  }

  /**
   * Calculate structural decision metrics for the table
   */
  static calculateTableMetrics(grid, cells, tableBox) {
    const totalCells = cells.length;
    if (totalCells === 0) return {};

    let totalChars = 0;
    let numericChars = 0;
    let formulaChars = 0;
    let longCellCount = 0;
    let mergedCellCount = 0;

    const formulaOperators = new Set(['=', '*', '+', '%', '÷', '/', '₺', '$', '€', '#']);

    cells.forEach(c => {
      const txt = (c.text || '').trim();
      const len = txt.length;
      totalChars += len;

      if (len > 30) longCellCount++;
      if (c.rowspan > 1 || c.colspan > 1) mergedCellCount++;

      for (let i = 0; i < len; i++) {
        const ch = txt[i];
        if (/\d/.test(ch)) numericChars++;
        if (formulaOperators.has(ch)) {
          formulaChars++;
          numericChars++;
        }
      }
    });

    const uniqueCols = new Set(cells.map(c => c.col)).size;
    const uniqueRows = new Set(cells.map(c => c.row)).size;

    // Check 2-column key-value ratio
    let isTwoColKeyValue = false;
    if (uniqueCols === 2) {
      const col0Cells = cells.filter(c => c.col === 0);
      const col1Cells = cells.filter(c => c.col === 1);
      const avgLen0 = col0Cells.reduce((sum, c) => sum + (c.text || '').length, 0) / Math.max(col0Cells.length, 1);
      const avgLen1 = col1Cells.reduce((sum, c) => sum + (c.text || '').length, 0) / Math.max(col1Cells.length, 1);
      if (avgLen0 > 0 && avgLen0 <= avgLen1 * 0.75 && avgLen0 < 45) {
        isTwoColKeyValue = true;
      }
    }

    // Check footnote / note rows at the bottom
    const maxRow = Math.max(...cells.map(c => c.row), 0);
    const bottomCells = cells.filter(c => c.row === maxRow);
    const hasBottomNote = bottomCells.some(c => {
      const t = (c.text || '').toLowerCase();
      const isWide = (c.rawCoords[2] - c.rawCoords[0]) > (tableBox ? (tableBox[2] - tableBox[0]) * 0.7 : 250);
      return (t.includes('not:') || t.includes('dipnot') || t.includes('açıklama') || t.includes('sebep')) || (isWide && t.length > 40);
    });

    return {
      numeric_ratio: totalChars > 0 ? numericChars / totalChars : 0,
      formula_density: totalChars > 0 ? formulaChars / totalChars : 0,
      long_cell_ratio: totalCells > 0 ? longCellCount / totalCells : 0,
      merged_cell_ratio: totalCells > 0 ? mergedCellCount / totalCells : 0,
      n_cols: Math.max(uniqueCols, grid.cols.length, 1),
      n_rows: Math.max(uniqueRows, grid.rows.length, 1),
      is_two_col_key_value: isTwoColKeyValue,
      has_bottom_note: hasBottomNote
    };
  }

  /**
   * Classify table into one of 6 types based on decision tree rules
   */
  static classifyTable(grid, cells, metrics) {
    // 1. C_PARALLEL_TEXT (False Table / Parallel Column Paragraph Flow):
    // If single column or cells mostly contain continuous long sentences
    if (metrics.n_cols <= 1 && metrics.long_cell_ratio >= 0.60) {
      return this.TYPES.C_PARALLEL_TEXT;
    }
    if (metrics.long_cell_ratio >= 0.75 && metrics.numeric_ratio < 0.15) {
      return this.TYPES.C_PARALLEL_TEXT;
    }

    // 2. E_FORMULA (Calculation / Formula Table):
    const hasEquations = cells.some(c => (c.text || '').includes('=')) && (metrics.formula_density >= 0.03 || metrics.numeric_ratio >= 0.25);
    if (hasEquations || metrics.formula_density >= 0.05 || (metrics.formula_density >= 0.03 && metrics.numeric_ratio >= 0.35)) {
      return this.TYPES.E_FORMULA;
    }

    // 3. B_KEY_VALUE (Form / Key-Value Pair Table):
    if (metrics.is_two_col_key_value && metrics.n_cols === 2) {
      return this.TYPES.B_KEY_VALUE;
    }

    // 4. D_MERGED_CELLS (Hierarchical / Colspan & Rowspan Merged Table):
    if (metrics.merged_cell_ratio >= 0.15) {
      return this.TYPES.D_MERGED_CELLS;
    }

    // 5. F_HYBRID_NOTE (Hybrid Table with Bottom Footnote / Explanation Block):
    if (metrics.has_bottom_note && metrics.n_rows >= 2) {
      return this.TYPES.F_HYBRID_NOTE;
    }

    // 6. A_MATRIX (Standard Matrix Data Table - Default):
    return this.TYPES.A_MATRIX;
  }

  /**
   * Structure headers, multi-line title mergers, and footer notes
   */
  static structureTableHeadersAndNotes(grid, cells, tableType, tableBox) {
    // Sort cells row by row, then col by col
    const sortedCells = [...cells].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    // Detect first data row (first row with numbers, currency, or mathematical symbols)
    let firstDataRow = 1;
    for (let r = 0; r < 5; r++) {
      const rowCells = sortedCells.filter(c => c.row === r);
      const hasNumeric = rowCells.some(c => /\d|[₺$€%]/.test(c.text || ''));
      if (hasNumeric && r > 0) {
        firstDataRow = r;
        break;
      }
    }

    // Column Headers Map: col_idx -> Header Text
    const colHeaders = new Map();
    for (let cIdx = 0; cIdx < grid.cols.length + 10; cIdx++) {
      const headerCells = sortedCells.filter(c => c.col === cIdx && c.row < firstDataRow);
      if (headerCells.length > 0) {
        const mergedHeaderText = headerCells.map(c => c.text).join(' ').trim();
        colHeaders.set(cIdx, mergedHeaderText);
      }
    }

    // Row Headers Map: row_idx -> Row Header Text (Col 0 cell for that row)
    const rowHeaders = new Map();
    sortedCells.filter(c => c.col === 0 && c.row >= firstDataRow).forEach(c => {
      rowHeaders.set(c.row, (c.text || '').trim());
    });

    return {
      cells: sortedCells,
      colHeaders,
      rowHeaders,
      firstDataRow,
      tableBox
    };
  }

  /**
   * Generate accessible reading-ordered BBox items with type-specific semantic fullSentenceText
   */
  static generateAccessibleTableReadingOrder(structuredData, tableType, pageNum = 1, startSentenceNumber = 1) {
    const { cells, colHeaders, rowHeaders, firstDataRow } = structuredData;
    const items = [];
    let currentSentenceNum = startSentenceNumber;

    // Strategy 1: C_PARALLEL_TEXT (Read column by column, top to bottom, as flowing paragraphs)
    if (tableType === this.TYPES.C_PARALLEL_TEXT) {
      const Splitter = (typeof SentenceSplitter !== 'undefined')
        ? SentenceSplitter
        : (typeof require !== 'undefined' ? (() => { try { return require('./sentence-splitter.js'); } catch(e) { return null; } })() : null);
      // Group cells by column
      const colsMap = new Map();
      cells.forEach(c => {
        if (!colsMap.has(c.col)) colsMap.set(c.col, []);
        colsMap.get(c.col).push(c);
      });

      const sortedCols = Array.from(colsMap.keys()).sort((a, b) => a - b);
      for (const colIdx of sortedCols) {
        const colCells = colsMap.get(colIdx).sort((a, b) => a.row - b.row);
        const colLines = colCells.map(c => ({ text: c.text, rawCoords: c.rawCoords, bbox: c.rawCoords }));

        if (Splitter && typeof Splitter.preprocessLines === 'function') {
          const { text: fullColText, processedLines } = Splitter.preprocessLines(colLines, 0.9, []);
          const sentences = Splitter.splitParagraphIntoSentences(fullColText);
          const lineIndices = [];
          let sIdx = 0;
          processedLines.forEach(pl => {
            let s = fullColText.indexOf(pl.text, sIdx);
            if (s === -1) s = fullColText.indexOf(pl.text);
            if (s === -1) s = 0;
            const e = s + pl.text.length;
            sIdx = e;
            lineIndices.push({ text: pl.text, start: s, end: e, bbox: pl.bbox });
          });

          Splitter.mapSentencesToLines(sentences, lineIndices);
          for (const s of sentences) {
            Splitter.calculateSentenceBBoxes(s);
          }
          const cleaned = Splitter.cleanSentences(sentences);

          for (const s of cleaned) {
            const sId = currentSentenceNum++;
            const sText = s.text.trim();
            const sBBoxes = s.bboxes || [];
            const sTexts = s.bbox_texts || [];

            if (sBBoxes.length === 0) {
              const firstC = colCells[0];
              items.push({
                id: `bbox-p${pageNum}-para-${sId}`,
                page: pageNum,
                sentence_id: sId,
                id_display: sId,
                text: sText,
                fullSentenceText: sText,
                rawCoords: firstC.rawCoords,
                coordType: 'abs_points',
                category: 'Plain Text',
                confidence: 0.98,
                table_type: tableType
              });
            } else {
              sBBoxes.forEach((bb, bi) => {
                items.push({
                  id: `bbox-p${pageNum}-para-${sId}-l${bi + 1}`,
                  page: pageNum,
                  sentence_id: sId,
                  id_display: sId,
                  text: (sTexts[bi] || sText).trim(),
                  fullSentenceText: sText,
                  rawCoords: [Math.round(bb[0]), Math.round(bb[1]), Math.round(bb[2]), Math.round(bb[3])],
                  coordType: 'abs_points',
                  category: 'Plain Text',
                  confidence: 0.98,
                  table_type: tableType
                });
              });
            }
          }
        } else {
          colCells.forEach(c => {
            const sId = currentSentenceNum++;
            items.push({
              id: `bbox-p${pageNum}-tcell-${sId}`,
              page: pageNum,
              sentence_id: sId,
              id_display: sId,
              text: c.text,
              fullSentenceText: c.text,
              rawCoords: c.rawCoords,
              coordType: 'abs_points',
              category: 'Table Cell',
              confidence: c.confidence || 0.98,
              table_type: tableType
            });
          });
        }
      }
      return { items, nextSentenceNumber: currentSentenceNum };
    }

    // Strategy 2: B_KEY_VALUE (Form / Key-Value Pair Table)
    if (tableType === this.TYPES.B_KEY_VALUE) {
      const rowsMap = new Map();
      cells.forEach(c => {
        if (!rowsMap.has(c.row)) rowsMap.set(c.row, []);
        rowsMap.get(c.row).push(c);
      });

      const sortedRows = Array.from(rowsMap.keys()).sort((a, b) => a - b);
      for (const rowIdx of sortedRows) {
        const rowCells = rowsMap.get(rowIdx).sort((a, b) => a.col - b.col);
        const keyCell = rowCells.find(c => c.col === 0);
        const valCell = rowCells.find(c => c.col === 1);

        const keyText = (keyCell ? keyCell.text : '').trim();
        const valText = (valCell ? valCell.text : '').trim();
        const fullPairText = `${keyText}: ${valText}`.trim();

        rowCells.forEach(c => {
          const sId = currentSentenceNum++;
          items.push({
            id: `bbox-p${pageNum}-kv-${sId}`,
            page: pageNum,
            sentence_id: sId,
            id_display: sId,
            text: c.text,
            fullSentenceText: fullPairText || c.text,
            rawCoords: c.rawCoords,
            coordType: 'abs_points',
            category: 'Table Cell',
            confidence: c.confidence || 0.99,
            table_type: tableType,
            row: c.row,
            col: c.col
          });
        });
      }
      return { items, nextSentenceNumber: currentSentenceNum };
    }

    // Strategy 3: A_MATRIX, D_MERGED_CELLS, E_FORMULA, F_HYBRID_NOTE (Standard & Extended Matrix Grid)
    for (const c of cells) {
      const sId = currentSentenceNum++;
      const cellText = (c.text || '').trim();
      let accessibleText = cellText;

      const colHeader = colHeaders.get(c.col) || '';
      const rowHeader = (c.col > 0) ? (rowHeaders.get(c.row) || '') : '';

      if (tableType === this.TYPES.A_MATRIX) {
        if (c.row >= firstDataRow && c.col > 0 && (rowHeader || colHeader)) {
          accessibleText = `[${rowHeader || 'Veri'}] - [${colHeader || 'Sütun'}]: ${cellText}`;
        }
      } else if (tableType === this.TYPES.D_MERGED_CELLS) {
        if (colHeader && c.row >= firstDataRow) {
          accessibleText = `[${colHeader}] altındaki ${cellText}`;
        }
      } else if (tableType === this.TYPES.E_FORMULA) {
        accessibleText = cellText
          .replace(/=/g, ' eşittir ')
          .replace(/\*/g, ' çarpı ')
          .replace(/\+/g, ' artı ')
          .replace(/%/g, ' yüzde ')
          .replace(/÷|\//g, ' bölü ')
          .trim();
      } else if (tableType === this.TYPES.F_HYBRID_NOTE) {
        const isNote = (c.text || '').toLowerCase().includes('not:') || (c.text || '').toLowerCase().includes('dipnot') || (c.colspan > 2);
        if (isNote) {
          accessibleText = `Tablo Notu: ${cellText}`;
        } else if (c.row >= firstDataRow && c.col > 0 && (rowHeader || colHeader)) {
          accessibleText = `[${rowHeader}] - [${colHeader}]: ${cellText}`;
        }
      }

      items.push({
        id: `bbox-p${pageNum}-grid-${sId}`,
        page: pageNum,
        sentence_id: sId,
        id_display: sId,
        text: cellText,
        fullSentenceText: accessibleText || cellText,
        rawCoords: c.rawCoords,
        coordType: 'abs_points',
        category: 'Table Cell',
        confidence: c.confidence || 0.99,
        table_type: tableType,
        row: c.row,
        col: c.col,
        rowspan: c.rowspan,
        colspan: c.colspan
      });
    }

    return { items, nextSentenceNumber: currentSentenceNum };
  }

  static _getRect(polyOrBox) {
    if (!polyOrBox) return null;
    if (Array.isArray(polyOrBox)) {
      if (polyOrBox.length >= 3 && Array.isArray(polyOrBox[0])) {
        const xs = polyOrBox.map(pt => Number(pt[0]) || 0);
        const ys = polyOrBox.map(pt => Number(pt[1]) || 0);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      }
      if (polyOrBox.length === 4 && typeof polyOrBox[0] === 'number') {
        const [a, b, c, d] = polyOrBox.map(Number);
        return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
      }
    }
    if (typeof polyOrBox === 'object') {
      const x0 = Number(polyOrBox.xmin ?? polyOrBox.x0 ?? polyOrBox.left ?? 0);
      const y0 = Number(polyOrBox.ymin ?? polyOrBox.y0 ?? polyOrBox.top ?? 0);
      const x1 = Number(polyOrBox.xmax ?? polyOrBox.x1 ?? (x0 + (polyOrBox.width ?? 0)));
      const y1 = Number(polyOrBox.ymax ?? polyOrBox.y1 ?? (y0 + (polyOrBox.height ?? 0)));
      return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    }
    return null;
  }

  static _calculateBounds(cells) {
    if (!cells || cells.length === 0) return [0, 0, 0, 0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cells.forEach(c => {
      const [x0, y0, x1, y1] = c.rawCoords || [0, 0, 0, 0];
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x1 > maxX) maxX = x1;
      if (y1 > maxY) maxY = y1;
    });
    return [minX, minY, maxX, maxY];
  }
}

// Exports
if (typeof window !== 'undefined') {
  window.TableClassifier = TableClassifier;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TableClassifier;
}
