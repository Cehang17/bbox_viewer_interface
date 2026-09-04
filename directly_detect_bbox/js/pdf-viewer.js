import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs';

export class PdfViewer {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.pdfDoc = null;
    this.scale = 1.2;
    this.pages = [];
  }

  async load(buffer) {
    this.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    this.pages = [];
    this.rootEl.innerHTML = '';

    for (let i = 1; i <= this.pdfDoc.numPages; i++) {
      const page = await this.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: this.scale });
      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.dataset.page = String(i);
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'page-canvas';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      wrapper.appendChild(canvas);
      this.rootEl.appendChild(wrapper);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      this.pages.push({ pageNumber: i, page, wrapper, canvas, viewport });
    }
    return this.pages;
  }

  async rerender(scale) {
    if (!this.pdfDoc) return this.pages;
    this.scale = scale;
    return this.load(await this.pdfDoc.getData());
  }

  async zoomIn() { return this.rerender(Math.min(this.scale + 0.2, 4)); }
  async zoomOut() { return this.rerender(Math.max(this.scale - 0.2, 0.5)); }
  async fitWidth(containerWidth = this.rootEl.clientWidth - 40) {
    if (!this.pdfDoc) return this.pages;
    const first = await this.pdfDoc.getPage(1);
    const base = first.getViewport({ scale: 1 });
    return this.rerender(containerWidth / base.width);
  }
  async fitPage(containerHeight = window.innerHeight - 120) {
    if (!this.pdfDoc) return this.pages;
    const first = await this.pdfDoc.getPage(1);
    const base = first.getViewport({ scale: 1 });
    return this.rerender(containerHeight / base.height);
  }
}
