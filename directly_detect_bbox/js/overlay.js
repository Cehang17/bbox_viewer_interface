const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function clamp(num, min) {
  return Math.max(min, num);
}

export class OverlayEditor {
  constructor(rootEl, onSelect, onChange, onCreate) {
    this.rootEl = rootEl;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.onCreate = onCreate;
    this.pageOverlays = new Map();
    this.drawMode = false;
    this.active = null;
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', () => this.onUp());
  }

  setDrawMode(enabled) {
    this.drawMode = enabled;
    this.rootEl.style.cursor = enabled ? 'crosshair' : 'default';
  }

  syncPages(pages) {
    this.rootEl.innerHTML = '';
    this.pageOverlays.clear();
    for (const page of pages) {
      const overlay = document.createElement('div');
      overlay.className = 'page-overlay';
      overlay.dataset.page = String(page.pageNumber);
      overlay.style.left = `${page.wrapper.offsetLeft}px`;
      overlay.style.top = `${page.wrapper.offsetTop}px`;
      overlay.style.width = `${page.wrapper.clientWidth}px`;
      overlay.style.height = `${page.wrapper.clientHeight}px`;
      overlay.addEventListener('mousedown', (event) => this.startDraw(event, page.pageNumber));
      this.rootEl.appendChild(overlay);
      this.pageOverlays.set(page.pageNumber, overlay);
    }
  }

  render(boxes, selectedSentenceId, filter) {
    for (const overlay of this.pageOverlays.values()) overlay.innerHTML = '';
    const visible = boxes.filter((box) => filter !== 'selected' || box.sentence_id === selectedSentenceId);
    for (const box of visible) {
      const overlay = this.pageOverlays.get(box.page);
      if (!overlay) continue;
      const node = document.createElement('div');
      node.className = 'bbox';
      node.dataset.id = box.id;
      node.dataset.selected = String(box.sentence_id === selectedSentenceId);
      node.style.left = `${box.x}px`;
      node.style.top = `${box.y}px`;
      node.style.width = `${box.width}px`;
      node.style.height = `${box.height}px`;
      node.addEventListener('mousedown', (event) => this.startMove(event, box));
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onSelect(box);
      });

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(box.sentence_id);
      node.appendChild(badge);

      for (const handleName of HANDLES) {
        const handle = document.createElement('span');
        handle.className = `handle ${handleName}`;
        handle.dataset.handle = handleName;
        handle.addEventListener('mousedown', (event) => this.startResize(event, box, handleName));
        node.appendChild(handle);
      }
      overlay.appendChild(node);
    }
  }

  startMove(event, box) {
    if (event.target.dataset.handle || this.drawMode) return;
    event.preventDefault();
    event.stopPropagation();
    this.active = {
      type: 'move',
      box,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...box }
    };
    this.onSelect(box);
  }

  startResize(event, box, handle) {
    if (this.drawMode) return;
    event.preventDefault();
    event.stopPropagation();
    this.active = {
      type: 'resize',
      handle,
      box,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...box }
    };
    this.onSelect(box);
  }

  startDraw(event, page) {
    if (!this.drawMode || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.active = {
      type: 'draw',
      page,
      overlay: event.currentTarget,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y
    };
  }

  onMove(event) {
    if (!this.active) return;
    if (this.active.type === 'draw') {
      const rect = this.active.overlay.getBoundingClientRect();
      this.active.currentX = event.clientX - rect.left;
      this.active.currentY = event.clientY - rect.top;
      this.previewDraw();
      return;
    }

    const dx = event.clientX - this.active.startX;
    const dy = event.clientY - this.active.startY;
    const draft = { ...this.active.origin };
    if (this.active.type === 'move') {
      draft.x = this.active.origin.x + dx;
      draft.y = this.active.origin.y + dy;
    } else {
      const h = this.active.handle;
      if (h.includes('w')) {
        draft.x = this.active.origin.x + dx;
        draft.width = this.active.origin.width - dx;
      }
      if (h.includes('e')) draft.width = this.active.origin.width + dx;
      if (h.includes('n')) {
        draft.y = this.active.origin.y + dy;
        draft.height = this.active.origin.height - dy;
      }
      if (h.includes('s')) draft.height = this.active.origin.height + dy;
      draft.width = clamp(draft.width, 8);
      draft.height = clamp(draft.height, 8);
    }
    this.onChange(this.active.box.id, draft);
  }

  onUp() {
    if (!this.active) return;
    if (this.active.type === 'draw') {
      const x = Math.min(this.active.startX, this.active.currentX);
      const y = Math.min(this.active.startY, this.active.currentY);
      const width = Math.abs(this.active.currentX - this.active.startX);
      const height = Math.abs(this.active.currentY - this.active.startY);
      if (width > 5 && height > 5) {
        this.onCreate({ page: this.active.page, x, y, width, height });
      }
    }
    this.active = null;
    this.removePreview();
  }

  previewDraw() {
    this.removePreview();
    const preview = document.createElement('div');
    preview.id = 'draw-preview';
    preview.className = 'bbox';
    const x = Math.min(this.active.startX, this.active.currentX);
    const y = Math.min(this.active.startY, this.active.currentY);
    const width = Math.abs(this.active.currentX - this.active.startX);
    const height = Math.abs(this.active.currentY - this.active.startY);
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    this.active.overlay.appendChild(preview);
  }

  removePreview() {
    document.getElementById('draw-preview')?.remove();
  }
}
