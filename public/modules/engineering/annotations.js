/**
 * ARC Drawing Annotation Engine v0.1.0
 *
 * Canvas-based annotation system for engineering review.
 * Renders red note boxes overlaid on drawing page images.
 * Notes are stored per-page: panel.pages[].reviewNotes[]
 *
 * Usage:
 *   const annotator = new DrawingAnnotator(containerEl, imageUrl, existingNotes, options);
 *   annotator.onNotesChanged = (notes) => { save to Firestore };
 */

class DrawingAnnotator {
  constructor(container, imageUrl, notes, options = {}) {
    this.container = container;
    this.imageUrl = imageUrl;
    this.notes = (notes || []).map(n => ({ ...n }));
    this.options = {
      authorName: options.authorName || 'Designer',
      authorInitials: options.authorInitials || 'XX',
      readOnly: options.readOnly || false,
      reviewType: options.reviewType || 'pre_review',
      ...options
    };
    this.selectedNoteId = null;
    this.dragging = null;
    this.onNotesChanged = null;
    this.noteCounter = this.notes.length;

    this._render();
  }

  _render() {
    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.display = 'inline-block';
    this.container.style.cursor = this.options.readOnly ? 'default' : 'crosshair';

    // Image
    this.img = document.createElement('img');
    this.img.src = this.imageUrl;
    this.img.style.cssText = 'display:block;max-width:100%;max-height:calc(100vh - 100px);width:auto;height:auto;object-fit:contain;user-select:none;-webkit-user-drag:none;';
    this.img.draggable = false;
    this.container.appendChild(this.img);

    // Overlay for notes
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this.container.appendChild(this.overlay);

    // Click handler to add notes
    if (!this.options.readOnly) {
      this.container.addEventListener('click', (e) => {
        if (e.target.closest('.ann-note')) return; // clicking on existing note
        const rect = this.container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        this._addNote(parseFloat(x), parseFloat(y));
      });
    }

    this._renderNotes();
  }

  _addNote(xPct, yPct) {
    // Create note with empty text — user types directly into the box
    const now = new Date();
    const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.getMonth()];
    const dateStr = `${String(now.getDate()).padStart(2,'0')}-${mon}-${String(now.getFullYear()).slice(2)}`;

    this.noteCounter++;
    const note = {
      id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      number: this.noteCounter,
      x: xPct,
      y: yPct,
      text: '',
      _editing: true, // flag to show textarea on first render
      author: this.options.authorName,
      initials: this.options.authorInitials,
      date: dateStr,
      createdAt: Date.now(),
      reviewType: this.options.reviewType,
      visibility: 'internal', // 'internal' | 'external'
      status: 'open',
      responses: []
    };

    this.notes.push(note);
    this._renderNotes();
    this._fireChanged();
  }

  _renderNotes() {
    this.overlay.innerHTML = '';

    this.notes.forEach(note => {
      const el = document.createElement('div');
      el.className = 'ann-note';
      el.dataset.noteId = note.id;
      // DECISION(v1.19.538): External=RED solid border, Internal=YELLOW dashed RED border
      const isExternal = note.visibility === 'external';
      const borderColor = '#ef4444';
      const bgColor = isExternal ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)';
      const borderStyle = isExternal ? '2px solid #ef4444' : '2px dashed #ef4444';
      const textColor = isExternal ? '#ef4444' : '#fbbf24';
      el.title = `${note.author} — ${note.date}${note.responses?.length ? '\n' + note.responses.map(r=>r.authorName+': '+r.text).join('\n') : ''}`;

      if (note._editing) {
        // Editing mode — show input box
        el.style.cssText = `
          position:absolute;left:${note.x}%;top:${note.y}%;
          width:220px;
          background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);
          border:${borderStyle};border-radius:6px;padding:6px 8px;
          pointer-events:auto;font-family:-apple-system,sans-serif;z-index:20;
          box-shadow:0 2px 12px rgba(0,0,0,0.6);
        `;
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
            <span style="font-size:9px;font-weight:800;color:${textColor}">#${note.number} ${isExternal?'EXT':'INT'}</span>
            <button class="ann-delete" data-note-id="${note.id}" style="background:none;border:none;color:#ef4444;font-size:11px;cursor:pointer;pointer-events:auto;margin-left:auto;padding:0 3px">✕</button>
          </div>
          <input class="ann-text-input" data-note-id="${note.id}" type="text" placeholder="Type note..." value="${this._escapeHtml(note.text)}" style="width:100%;background:rgba(255,255,255,0.1);border:1px solid ${borderColor}66;border-radius:3px;color:#f1f5f9;font-size:11px;font-family:inherit;padding:3px 6px;outline:none;pointer-events:auto"/>
          <div style="display:flex;gap:4px;margin-top:4px">
            <button class="ann-save-text" data-note-id="${note.id}" style="background:${borderColor};color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:9px;font-weight:700;cursor:pointer;pointer-events:auto">Save</button>
            <button class="ann-toggle-vis" data-note-id="${note.id}" style="background:none;border:1px solid ${borderColor}44;border-radius:3px;color:${textColor};font-size:9px;padding:2px 5px;cursor:pointer;pointer-events:auto">${isExternal?'→ INT':'→ EXT'}</button>
          </div>
        `;
      } else {
        // Display mode — compact single-line tag
        const displayText = note.text || '(empty)';
        const truncated = displayText.length > 40 ? displayText.slice(0, 37) + '…' : displayText;
        el.style.cssText = `
          position:absolute;left:${note.x}%;top:${note.y}%;
          max-width:280px;
          background:${bgColor};backdrop-filter:blur(4px);
          border:${borderStyle};border-radius:4px;padding:3px 8px;
          pointer-events:auto;cursor:${this.options.readOnly ? 'default' : 'move'};
          font-family:-apple-system,sans-serif;z-index:10;
          box-shadow:0 1px 6px rgba(0,0,0,0.4);
          display:flex;align-items:center;gap:6px;white-space:nowrap;
        `;
        el.innerHTML = `
          <span style="font-size:9px;font-weight:800;color:${textColor};flex-shrink:0">#${note.number}</span>
          <span class="ann-text-display" data-note-id="${note.id}" style="font-size:11px;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;pointer-events:auto;cursor:${this.options.readOnly?'default':'text'}">${this._escapeHtml(truncated)}</span>
          ${!this.options.readOnly ? `<button class="ann-delete" data-note-id="${note.id}" style="background:none;border:none;color:#ef4444;font-size:10px;cursor:pointer;pointer-events:auto;padding:0 2px;flex-shrink:0;opacity:0.6">✕</button>` : ''}
        `;
      }

      // Save text handler (for new notes in edit mode)
      // Enter key saves the note
      el.querySelectorAll('.ann-text-input').forEach(inp => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); el.querySelector('.ann-save-text')?.click(); }
          if (e.key === 'Escape') { if (!note.text) { this.notes = this.notes.filter(n => n.id !== note.id); } else { note._editing = false; } this._renderNotes(); this._fireChanged(); }
        });
      });
      el.querySelectorAll('.ann-save-text').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const inp = el.querySelector('.ann-text-input');
          const text = inp ? inp.value.trim() : '';
          if (!text) return; // silently ignore empty
          note.text = text;
          note._editing = false;
          this._renderNotes();
          this._fireChanged();
        });
      });

      // Auto-focus textarea for new notes
      if (note._editing) {
        const ta = el.querySelector('.ann-text-input');
        if (ta) setTimeout(() => ta.focus(), 50);
      }

      // Click-to-edit handler (for existing notes)
      el.querySelectorAll('.ann-text-display').forEach(disp => {
        if (this.options.readOnly) return;
        disp.addEventListener('click', (e) => {
          e.stopPropagation();
          note._editing = true;
          this._renderNotes();
        });
      });

      // Delete handler — delete immediately (no confirm dialog to avoid browser popup issues)
      el.querySelectorAll('.ann-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.notes = this.notes.filter(n => n.id !== note.id);
          this._renderNotes();
          this._fireChanged();
        });
      });

      // Toggle visibility handler
      el.querySelectorAll('.ann-toggle-vis').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          note.visibility = note.visibility === 'internal' ? 'external' : 'internal';
          this._renderNotes();
          this._fireChanged();
        });
      });

      // Drag handler
      if (!this.options.readOnly) {
        let startX, startY, startLeft, startTop;
        el.addEventListener('mousedown', (e) => {
          if (e.target.closest('button')) return;
          e.preventDefault();
          const rect = this.container.getBoundingClientRect();
          startX = e.clientX;
          startY = e.clientY;
          startLeft = note.x;
          startTop = note.y;

          const onMove = (e2) => {
            const dx = (e2.clientX - startX) / rect.width * 100;
            const dy = (e2.clientY - startY) / rect.height * 100;
            note.x = Math.max(0, Math.min(80, startLeft + dx));
            note.y = Math.max(0, Math.min(90, startTop + dy));
            el.style.left = note.x + '%';
            el.style.top = note.y + '%';
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this._fireChanged();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }

      this.overlay.appendChild(el);
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _fireChanged() {
    if (this.onNotesChanged) this.onNotesChanged([...this.notes]);
  }

  // Public API
  getNotes() { return [...this.notes]; }

  getExternalNotes() { return this.notes.filter(n => n.visibility === 'external'); }

  getInternalNotes() { return this.notes.filter(n => n.visibility === 'internal'); }

  addResponse(noteId, text, author, authorName) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    if (!note.responses) note.responses = [];
    note.responses.push({ text, author, authorName, date: Date.now() });
    this._renderNotes();
    this._fireChanged();
  }

  destroy() {
    this.container.innerHTML = '';
    this.onNotesChanged = null;
  }
}

// Make available globally
window.DrawingAnnotator = DrawingAnnotator;
