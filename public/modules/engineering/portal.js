/**
 * ARC Customer Review Portal v0.5.0
 *
 * Public-facing portal for customers to review drawings and respond to engineering notes.
 * Accessed via token URL: /review?reviewUpload=TOKEN
 * No sign-in required — token-based access.
 *
 * Layout: Drawing viewer (left) + Notes sidebar (right)
 * Customer can add their own notes on drawings (blue) + respond to engineering notes (red).
 *
 * Data: reviewUploads/{token}
 */

const PORTAL_VERSION = '0.8.0';
let _customerNotes = []; // customer-added notes
let _customerNoteCounter = 0;
let _currentPage = 0;
let _drawingPages = [];
let _engineeringNotes = [];
let _notesByPage = {};
let _newNotePos = null; // {x,y,pageNum} — for inline input
let _editingNoteId = null; // which customer note is being text-edited
let _editingDetailId = null; // which customer note detail is being edited
let _markupTool = null; // null|"line"|"circle"|"rect"|"triangle"
let _drawingShapeStart = null; // {x,y}
let _customerShapes = []; // customer-drawn shapes
let _shapeCounter = 0;
let _newShapeData = null; // completed shape awaiting note input
let _polylinePoints = []; // [{x,y},...] for multi-segment line
let _polylinePreview = null; // {x,y} mouse position
let _draftResponses = {}; // noteId → response text (for engineering note responses)
let _draftAdditionalComments = '';
let _autoSaveTimer = null;
let _db = null;
let _token = null;
let _saveIndicator = null;

function autosaveDrafts() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    if (!_db || !_token) return;
    // Collect current textarea values
    _engineeringNotes.forEach((note, i) => {
      const el = document.getElementById('response-' + i);
      if (el) _draftResponses[note.id] = el.value || '';
    });
    const addl = document.getElementById('additional-comments');
    if (addl) _draftAdditionalComments = addl.value || '';
    try {
      await _db.collection('reviewUploads').doc(_token).update({
        draftCustomerNotes: _customerNotes,
        draftCustomerShapes: _customerShapes,
        draftResponses: _draftResponses,
        draftAdditionalComments: _draftAdditionalComments
      });
      showSaveIndicator('Saved');
    } catch (e) {
      console.warn('Autosave failed:', e);
      showSaveIndicator('Save failed');
    }
  }, 1500); // 1.5s debounce
}

function showSaveIndicator(text) {
  if (!_saveIndicator) {
    _saveIndicator = document.getElementById('save-indicator');
  }
  if (_saveIndicator) {
    _saveIndicator.textContent = text;
    _saveIndicator.style.opacity = '1';
    setTimeout(() => { if (_saveIndicator) _saveIndicator.style.opacity = '0'; }, 2000);
  }
}

(async function() {
  const db = firebase.firestore();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reviewUpload');

  if (!token) { renderError('No review token provided. Please use the link from your email.'); return; }

  let info;
  try {
    const doc = await db.collection('reviewUploads').doc(token).get();
    if (!doc.exists) { renderError('Review session not found or has expired.'); return; }
    info = doc.data();
  } catch (e) { renderError('Failed to load review: ' + e.message); return; }

  if (info.expiresAt && info.expiresAt < Date.now()) {
    renderError('This review link has expired. Please contact the engineering team for a new link.');
    return;
  }

  if (info.status === 'submitted') { renderSubmitted(info); return; }

  renderReview(info, token, db);
})();

function renderError(msg) {
  document.getElementById('portal-app').innerHTML =
    '<div class="portal-loading"><div style="font-size:48px;opacity:0.3">📐</div><p style="color:#ef4444;font-size:16px;margin-top:16px">' + escapeHtml(msg) + '</p></div>';
}

function renderSubmitted(info) {
  document.getElementById('portal-app').innerHTML = `
    <div class="portal-header">
      <h1>ARC Drawing Review</h1>
      <span style="margin-left:auto;color:#64748b;font-size:13px">${escapeHtml(info.customerName || 'Customer')}</span>
    </div>
    <div style="text-align:center;padding:80px 24px">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <h2 style="color:#16a34a;margin-bottom:8px">Review Submitted</h2>
      <p style="color:#64748b;font-size:15px">Thank you for your review of ${escapeHtml((info.bcProjectNumber || '') + ' ' + (info.projectName || ''))}.<br>The engineering team has been notified of your responses.</p>
    </div>
  `;
}

function renderReview(info, token, db) {
  _db = db;
  _token = token;
  _engineeringNotes = info.notes || [];
  _drawingPages = info.drawingPages || [];

  _notesByPage = {};
  _engineeringNotes.forEach(n => {
    const pg = n.pageNum || 1;
    if (!_notesByPage[pg]) _notesByPage[pg] = [];
    _notesByPage[pg].push(n);
  });

  // Restore drafts from previous session
  if (info.draftCustomerShapes && info.draftCustomerShapes.length > 0) {
    _customerShapes = info.draftCustomerShapes;
    _shapeCounter = _customerShapes.reduce((max, s) => Math.max(max, s.number || 0), 0);
  }
  if (info.draftCustomerNotes && info.draftCustomerNotes.length > 0) {
    _customerNotes = info.draftCustomerNotes;
  }
  if (info.draftResponses) {
    _draftResponses = info.draftResponses;
  }
  if (info.draftAdditionalComments) {
    _draftAdditionalComments = info.draftAdditionalComments;
  }

  // Find highest note number from all notes (engineering + restored customer)
  _customerNoteCounter = _engineeringNotes.reduce((max, n) => Math.max(max, n.number || 0), 0);
  _customerNoteCounter = _customerNotes.reduce((max, n) => Math.max(max, n.number || 0), _customerNoteCounter);

  const app = document.getElementById('portal-app');

  app.innerHTML = `
    <div class="portal-header">
      <h1>📐 ARC Drawing Review</h1>
      <span id="save-indicator" style="font-size:11px;color:#16a34a;opacity:0;transition:opacity 0.3s;margin-left:8px">Saved</span>
      <span style="margin-left:auto;color:#64748b;font-size:13px">${escapeHtml(info.bcProjectNumber || '')} — ${escapeHtml(info.projectName || '')}</span>
    </div>
    <div style="display:flex;height:calc(100vh - 56px);overflow:hidden">
      <!-- Left: Drawing viewer -->
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#f1f5f9">
        <div style="padding:8px 12px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;flex-shrink:0">
          <button id="prev-page" onclick="changePage(-1)" style="background:#e2e8f0;border:none;border-radius:4px;padding:5px 12px;cursor:pointer;font-size:12px;font-weight:600">← Prev</button>
          <span id="page-label" style="font-size:12px;font-weight:700;color:#1e293b">Page 1 of ${_drawingPages.length}</span>
          <button id="next-page" onclick="changePage(1)" style="background:#e2e8f0;border:none;border-radius:4px;padding:5px 12px;cursor:pointer;font-size:12px;font-weight:600">Next →</button>
          <div style="display:flex;gap:2px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:2px 4px;margin-left:8px" id="markup-toolbar"></div>
          <div style="margin-left:auto;display:flex;gap:4px" id="page-thumbs"></div>
        </div>
        <div id="drawing-container" style="flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:12px;position:relative">
          <div id="drawing-viewer" style="position:relative;display:inline-block;cursor:crosshair"></div>
        </div>
      </div>
      <!-- Right: Notes sidebar -->
      <div style="width:380px;flex-shrink:0;border-left:1px solid #e2e8f0;display:flex;flex-direction:column;background:#fff">
        <div style="padding:12px 16px;background:#1e40af;color:#fff;font-size:13px;font-weight:700;flex-shrink:0">
          📝 ENGINEERING NOTES (${_engineeringNotes.length})
          <div style="font-size:11px;font-weight:400;color:#bfdbfe;margin-top:2px">from ${escapeHtml(info.designerName || 'Engineering')}</div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px" id="notes-sidebar"></div>
        <div style="padding:10px 12px;border-top:1px solid #e2e8f0;flex-shrink:0">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Additional Comments</label>
          <textarea id="additional-comments" placeholder="Any additional comments..." rows="2" oninput="autosaveDrafts()"
            style="width:100%;border:2px solid #e2e8f0;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;min-height:48px;box-sizing:border-box;outline:none"
            onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'"
          >${escapeHtml(_draftAdditionalComments)}</textarea>
          <button class="portal-btn" id="submit-btn" onclick="submitReview()" style="width:100%;margin-top:8px;font-size:14px;padding:12px 20px;border-radius:8px">Submit Review</button>
        </div>
      </div>
    </div>
  `;

  // Render sidebar notes
  renderSidebar();

  // Page thumbnails
  const thumbContainer = document.getElementById('page-thumbs');
  if (thumbContainer && _drawingPages.length > 1) {
    thumbContainer.innerHTML = _drawingPages.map((url, i) => `
      <div class="page-thumb" onclick="changePage(${i}, true)" style="width:40px;height:28px;border-radius:3px;overflow:hidden;cursor:pointer;border:2px solid ${i === 0 ? '#2563eb' : '#e2e8f0'};opacity:${i === 0 ? '1' : '0.5'};flex-shrink:0;background:#f1f5f9">
        <img src="${url}" style="width:100%;height:100%;object-fit:cover" alt="Page ${i+1}"/>
      </div>
    `).join('');
  }

  // Markup toolbar
  const toolbar = document.getElementById('markup-toolbar');
  if (toolbar) {
    const tools = [{id:'',label:'📌',tip:'Note'},{id:'line',label:'─',tip:'Line'},{id:'circle',label:'○',tip:'Circle'},{id:'rect',label:'□',tip:'Rectangle'},{id:'triangle',label:'△',tip:'Triangle'}];
    toolbar.innerHTML = tools.map(t => `<button onclick="setMarkupTool('${t.id}')" id="tool-${t.id||'note'}" title="${t.tip}" style="background:${_markupTool===t.id?'#dbeafe':'transparent'};color:${_markupTool===t.id?'#2563eb':'#64748b'};border:${_markupTool===t.id?'1px solid #2563eb':'1px solid transparent'};border-radius:4px;padding:3px 8px;font-size:14px;cursor:pointer;font-weight:700;line-height:1">${t.label}</button>`).join('');
  }

  window.setMarkupTool = function(id) {
    _markupTool = id || null;
    _newNotePos = null;
    _newShapeData = null;
    _drawingShapeStart = null;
    _polylinePoints = [];
    _polylinePreview = null;
    renderDrawingPage(_currentPage);
    // Update toolbar highlights
    const tb = document.getElementById('markup-toolbar');
    if (tb) tb.querySelectorAll('button').forEach(b => {
      const isActive = b.id === 'tool-' + (id || 'note');
      b.style.background = isActive ? '#dbeafe' : 'transparent';
      b.style.color = isActive ? '#2563eb' : '#64748b';
      b.style.border = isActive ? '1px solid #2563eb' : '1px solid transparent';
    });
  };

  // Drawing viewer mouse handlers for shapes
  const viewer = document.getElementById('drawing-viewer');
  viewer.addEventListener('click', function(e) {
    if (e.target.closest('.portal-note-overlay') || e.target.closest('.portal-new-note-input') || e.target.closest('.portal-shape-input')) return;
    const rect = this.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(1));
    const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(1));
    if (_markupTool === 'line') {
      // Polyline: each click adds a point
      _polylinePoints.push({x, y});
      renderDrawingPage(_currentPage);
      return;
    }
    if (_markupTool) return; // other shapes use mousedown/up
    _newNotePos = { x, y, pageNum: _currentPage + 1 };
    renderDrawingPage(_currentPage);
  });

  viewer.addEventListener('dblclick', function(e) {
    if (_markupTool === 'line' && _polylinePoints.length >= 2) {
      e.stopPropagation();
      _newShapeData = {type:'line', points:[..._polylinePoints]};
      _polylinePoints = []; _polylinePreview = null;
      renderDrawingPage(_currentPage);
    }
  });

  viewer.addEventListener('mousedown', function(e) {
    if (!_markupTool || _markupTool === 'line' || e.target.closest('.portal-shape-input')) return;
    e.preventDefault();
    const rect = this.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(1));
    const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(1));
    _drawingShapeStart = { x, y };
  });

  viewer.addEventListener('mousemove', function(e) {
    const rect = this.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(1));
    const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(1));
    // Polyline preview
    if (_markupTool === 'line' && _polylinePoints.length > 0) {
      _polylinePreview = {x, y};
      const svg = document.getElementById('shape-svg');
      const rb = document.getElementById('rubber-band');
      if (svg && rb) {
        const allPts = [..._polylinePoints, {x, y}];
        const pts = allPts.map(p => p.x + '%,' + p.y + '%').join(' ');
        rb.innerHTML = `<polyline points="${pts}" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 3" fill="none" stroke-linejoin="round"/>` +
          _polylinePoints.map(p => `<circle cx="${p.x}%" cy="${p.y}%" r="3" fill="#ef4444"/>`).join('');
      }
      return;
    }
    // Shape drag preview
    if (!_drawingShapeStart || !_markupTool) return;
    const svg = document.getElementById('shape-svg');
    if (!svg) return;
    const s = _drawingShapeStart;
    let preview = '';
    if (_markupTool === 'circle') { const r = Math.sqrt((x-s.x)**2 + (y-s.y)**2); preview = `<circle cx="${s.x}%" cy="${s.y}%" r="${r}%" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 3" fill="none"/>`; }
    else if (_markupTool === 'rect') { const rx=Math.min(s.x,x),ry=Math.min(s.y,y),rw=Math.abs(x-s.x),rh=Math.abs(y-s.y); preview = `<rect x="${rx}%" y="${ry}%" width="${rw}%" height="${rh}%" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 3" fill="none"/>`; }
    else if (_markupTool === 'triangle') { const cx=(s.x+x)/2; preview = `<polygon points="${cx}%,${s.y}% ${s.x}%,${y}% ${x}%,${y}%" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 3" fill="none"/>`; }
    const rb = document.getElementById('rubber-band');
    if (rb) rb.innerHTML = preview;
  });

  viewer.addEventListener('mouseup', function(e) {
    if (!_drawingShapeStart || !_markupTool || _markupTool === 'line') return;
    const rect = this.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(1));
    const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(1));
    const s = _drawingShapeStart;
    _drawingShapeStart = null;
    const dist = Math.sqrt((x-s.x)**2 + (y-s.y)**2);
    if (dist < 1) { renderDrawingPage(_currentPage); return; }
    let shapeData;
    if (_markupTool === 'circle') shapeData = {type:'circle', cx:s.x, cy:s.y, r:dist};
    else if (_markupTool === 'rect') shapeData = {type:'rect', x1:s.x, y1:s.y, x2:x, y2:y};
    else if (_markupTool === 'triangle') shapeData = {type:'triangle', x1:s.x, y1:s.y, x2:x, y2:y};
    if (shapeData) { _newShapeData = shapeData; }
    renderDrawingPage(_currentPage);
  });

  // End polyline button handler
  window.endPolyline = function() {
    if (_polylinePoints.length >= 2) {
      _newShapeData = {type:'line', points:[..._polylinePoints]};
      _polylinePoints = []; _polylinePreview = null;
      renderDrawingPage(_currentPage);
    }
  };

  window.cancelPolyline = function() {
    _polylinePoints = []; _polylinePreview = null;
    renderDrawingPage(_currentPage);
  };

  window.saveNewShape = function() {
    const input = document.getElementById('new-shape-note');
    const note = input ? input.value.trim() : '';
    if (!_newShapeData) return;
    _shapeCounter++;
    const shape = { ..._newShapeData, id: 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), number: _shapeCounter, note: note, color: '#ef4444', strokeWidth: 2, author: info.customerName || 'Customer', isCustomer: true, createdAt: Date.now(), pageNum: _currentPage + 1 };
    _customerShapes.push(shape);
    _newShapeData = null;
    renderDrawingPage(_currentPage);
    renderSidebar();
    autosaveDrafts();
  };

  window.saveNewShapeNoNote = function() {
    if (!_newShapeData) return;
    _shapeCounter++;
    const shape = { ..._newShapeData, id: 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), number: _shapeCounter, note: '', color: '#ef4444', strokeWidth: 2, author: info.customerName || 'Customer', isCustomer: true, createdAt: Date.now(), pageNum: _currentPage + 1 };
    _customerShapes.push(shape);
    _newShapeData = null;
    renderDrawingPage(_currentPage);
    renderSidebar();
    autosaveDrafts();
  };

  window.cancelNewShape = function() {
    _newShapeData = null;
    renderDrawingPage(_currentPage);
  };

  window.deleteCustomerShape = function(shapeId) {
    _customerShapes = _customerShapes.filter(s => s.id !== shapeId);
    renderDrawingPage(_currentPage);
    renderSidebar();
    autosaveDrafts();
  };

  window.changePage = function(delta, absolute) {
    _newNotePos = null;
    _newShapeData = null;
    _drawingShapeStart = null;
    if (absolute) { renderDrawingPage(delta); return; }
    const next = _currentPage + delta;
    if (next >= 0 && next < _drawingPages.length) renderDrawingPage(next);
  };

  if (_drawingPages.length > 0) renderDrawingPage(0);

  // Submit handler
  window.submitReview = async function() {
    const btn = document.getElementById('submit-btn');
    // Collect responses to engineering notes
    const responses = _engineeringNotes.map((note, i) => ({
      noteId: note.id,
      noteNumber: note.number,
      response: document.getElementById('response-' + i)?.value?.trim() || ''
    })).filter(r => r.response);

    const additionalComments = document.getElementById('additional-comments')?.value?.trim() || '';

    if (responses.length === 0 && !additionalComments && _customerNotes.length === 0) {
      if (!confirm('No responses or notes entered. Submit anyway?')) return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      await db.collection('reviewUploads').doc(token).update({
        status: 'submitted',
        submittedAt: Date.now(),
        responses,
        customerNotes: _customerNotes,
        customerShapes: _customerShapes,
        additionalComments,
        customerName: info.customerName || ''
      });
      renderSubmitted(info);
    } catch (e) {
      alert('Failed to submit: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  };

  // Save new customer note
  window.saveNewNote = function() {
    const input = document.getElementById('new-note-input');
    const text = input ? input.value.trim() : '';
    if (!text || !_newNotePos) { _newNotePos = null; renderDrawingPage(_currentPage); return; }
    _customerNoteCounter++;
    const note = {
      id: 'cn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      number: _customerNoteCounter,
      x: _newNotePos.x,
      y: _newNotePos.y,
      pageNum: _newNotePos.pageNum,
      text: text,
      detail: '',
      author: info.customerName || 'Customer',
      isCustomer: true,
      createdAt: Date.now()
    };
    _customerNotes.push(note);
    _newNotePos = null;
    renderDrawingPage(_currentPage);
    renderSidebar();
    autosaveDrafts();
  };

  window.cancelNewNote = function() {
    _newNotePos = null;
    renderDrawingPage(_currentPage);
  };

  window.deleteCustomerNote = function(noteId) {
    _customerNotes = _customerNotes.filter(n => n.id !== noteId);
    renderDrawingPage(_currentPage);
    renderSidebar();
    autosaveDrafts();
  };

  window.startEditNote = function(noteId) {
    _editingNoteId = noteId;
    _editingDetailId = null;
    renderSidebar();
    setTimeout(() => { const el = document.getElementById('edit-note-' + noteId); if (el) el.focus(); }, 50);
  };

  window.saveNoteEdit = function(noteId) {
    const input = document.getElementById('edit-note-' + noteId);
    const text = input ? input.value.trim() : '';
    if (text) {
      const note = _customerNotes.find(n => n.id === noteId);
      if (note) note.text = text;
    }
    _editingNoteId = null;
    renderDrawingPage(_currentPage);
    renderSidebar();
    autosaveDrafts();
  };

  window.startEditDetail = function(noteId) {
    _editingDetailId = noteId;
    _editingNoteId = null;
    renderSidebar();
    setTimeout(() => { const el = document.getElementById('edit-detail-' + noteId); if (el) el.focus(); }, 50);
  };

  window.saveDetailEdit = function(noteId) {
    const input = document.getElementById('edit-detail-' + noteId);
    const text = input ? input.value.trim() : '';
    const note = _customerNotes.find(n => n.id === noteId);
    if (note) note.detail = text;
    _editingDetailId = null;
    renderSidebar();
    autosaveDrafts();
  };

  // Highlight a note on the drawing — navigate to its page and pulse it
  window.highlightNote = function(noteId, pageNum) {
    const targetPage = (pageNum || 1) - 1;
    if (targetPage !== _currentPage) {
      renderDrawingPage(targetPage);
    }
    // Small delay to ensure DOM is rendered after page change
    setTimeout(() => {
      const el = document.getElementById('note-overlay-' + noteId);
      if (!el) return;
      el.classList.remove('note-pulsing');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('note-pulsing');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el.classList.remove('note-pulsing'), 2500);
    }, 100);
  };

  // Drag customer notes
  window.startNoteDrag = function(noteId, e) {
    e.preventDefault();
    const note = _customerNotes.find(n => n.id === noteId);
    if (!note) return;
    const viewer = document.getElementById('drawing-viewer');
    const rect = viewer.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const origX = note.x, origY = note.y;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / rect.width * 100;
      const dy = (ev.clientY - startY) / rect.height * 100;
      note.x = Math.max(0, Math.min(90, origX + dx));
      note.y = Math.max(0, Math.min(90, origY + dy));
      const el = document.getElementById('note-overlay-' + noteId);
      if (el) { el.style.left = note.x + '%'; el.style.top = note.y + '%'; }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      autosaveDrafts();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
}

function renderDrawingPage(idx) {
  _currentPage = idx;
  const viewer = document.getElementById('drawing-viewer');
  if (!viewer || !_drawingPages[idx]) return;
  const url = _drawingPages[idx];
  const pageNum = idx + 1;
  const engNotes = _notesByPage[pageNum] || [];
  const custNotes = _customerNotes.filter(n => n.pageNum === pageNum);

  let html = `<img src="${url}" style="display:block;max-width:100%;max-height:calc(100vh - 120px);width:auto;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);user-select:none;-webkit-user-drag:none" draggable="false" alt="Page ${pageNum}"
    onerror="this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;color:#ef4444\\'>Drawing image could not be loaded.</div>'" />`;

  // Engineering note overlays (red)
  engNotes.forEach(note => {
    html += `<div id="note-overlay-${note.id}" class="portal-note-overlay" style="position:absolute;left:${note.x || 5}%;top:${note.y || 5}%;background:rgba(239,68,68,0.9);color:#fff;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
      #${note.number}: ${escapeHtml((note.text || '').slice(0, 40))}
    </div>`;
  });

  // Customer note overlays (blue, draggable, deletable)
  custNotes.forEach(note => {
    html += `<div id="note-overlay-${note.id}" class="portal-note-overlay" style="position:absolute;left:${note.x}%;top:${note.y}%;background:rgba(37,99,235,0.9);color:#fff;border-radius:4px;padding:2px 4px 2px 0;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;gap:4px;cursor:default;max-width:220px">
      <span style="cursor:grab;padding:2px 4px;font-size:10px;user-select:none" onmousedown="startNoteDrag('${note.id}',event)">⠿</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">#${note.number}: ${escapeHtml((note.text || '').slice(0, 35))}</span>
      <span onclick="deleteCustomerNote('${note.id}')" style="cursor:pointer;padding:0 4px;font-size:13px;opacity:0.7;flex-shrink:0" title="Delete">✕</span>
    </div>`;
  });

  // SVG overlay for shapes
  const engShapes = (info?.drawingShapes || []).filter(s => s.pageNum === pageNum); // engineering shapes from main app (future)
  const custShapes = _customerShapes.filter(s => s.pageNum === pageNum);
  const allShapes = [...engShapes, ...custShapes];
  let svgContent = '';
  allShapes.forEach(shp => {
    const stroke = shp.color || '#ef4444'; const sw = shp.strokeWidth || 2;
    const id = shp.id || '';
    if (shp.type === 'line' && shp.points) { const pts = shp.points.map(p => p.x + '%,' + p.y + '%').join(' '); svgContent += `<polyline id="shape-${id}" points="${pts}" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`; }
    else if (shp.type === 'line') svgContent += `<line id="shape-${id}" x1="${shp.x1}%" y1="${shp.y1}%" x2="${shp.x2}%" y2="${shp.y2}%" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`;
    else if (shp.type === 'circle') svgContent += `<circle id="shape-${id}" cx="${shp.cx}%" cy="${shp.cy}%" r="${shp.r}%" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`;
    else if (shp.type === 'rect') { const x=Math.min(shp.x1,shp.x2),y=Math.min(shp.y1,shp.y2),w=Math.abs(shp.x2-shp.x1),h=Math.abs(shp.y2-shp.y1); svgContent += `<rect id="shape-${id}" x="${x}%" y="${y}%" width="${w}%" height="${h}%" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`; }
    else if (shp.type === 'triangle') { const cx=(shp.x1+shp.x2)/2; svgContent += `<polygon id="shape-${id}" points="${cx}%,${shp.y1}% ${shp.x1}%,${shp.y2}% ${shp.x2}%,${shp.y2}%" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`; }
  });
  html += `<svg id="shape-svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6">${svgContent}<g id="rubber-band"></g></svg>`;

  // End Line button when polyline in progress
  if (_polylinePoints.length >= 2) {
    html += `<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:25;display:flex;gap:6px">
      <button onclick="endPolyline()" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4)">✓ End Line (${_polylinePoints.length} points)</button>
      <button onclick="cancelPolyline()" style="background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer">✕ Cancel</button>
    </div>`;
  }

  // Shape note popup
  if (_newShapeData) {
    const sx = _newShapeData.points ? (_newShapeData.points[0]?.x || 50) : (_newShapeData.x1 || _newShapeData.cx || 50);
    const sy = _newShapeData.points ? (_newShapeData.points[0]?.y || 50) : (_newShapeData.y1 || _newShapeData.cy || 50);
    const label = _newShapeData.type === 'line' && _newShapeData.points ? 'LINE (' + _newShapeData.points.length + ' points)' : (_newShapeData.type || '').toUpperCase();
    html += `<div class="portal-shape-input" style="position:absolute;left:${Math.min(sx,75)}%;top:${Math.min(sy,75)}%;background:#fff;border:2px solid #ef4444;border-radius:6px;padding:6px 8px;z-index:25;min-width:200px;box-shadow:0 2px 12px rgba(0,0,0,0.3)">
      <div style="font-size:10px;font-weight:700;color:#ef4444;margin-bottom:4px">${label} — add note</div>
      <input id="new-shape-note" type="text" placeholder="Note for this markup..." autofocus
        style="width:100%;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box"
        onkeydown="if(event.key==='Enter')saveNewShape();if(event.key==='Escape'){saveNewShapeNoNote();}"
      />
      <div style="display:flex;gap:4px;margin-top:4px">
        <button onclick="saveNewShape()" style="background:#ef4444;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer">Save with Note</button>
        <button onclick="saveNewShapeNoNote()" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">Save without Note</button>
      </div>
    </div>`;
  }

  // New note input ghost box
  if (_newNotePos && _newNotePos.pageNum === pageNum) {
    html += `<div class="portal-new-note-input" style="position:absolute;left:${_newNotePos.x}%;top:${_newNotePos.y}%;background:#fff;border:2px solid #2563eb;border-radius:6px;padding:6px 8px;z-index:20;min-width:200px;box-shadow:0 2px 12px rgba(0,0,0,0.2)">
      <input id="new-note-input" type="text" placeholder="Type your note..." autofocus
        style="width:100%;border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box"
        onkeydown="if(event.key==='Enter')saveNewNote();if(event.key==='Escape')cancelNewNote();"
      />
      <div style="display:flex;gap:4px;margin-top:4px">
        <button onclick="saveNewNote()" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer">Save</button>
        <button onclick="cancelNewNote()" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">Cancel</button>
      </div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px">Enter to save · Esc to cancel</div>
    </div>`;
  }

  viewer.innerHTML = html;

  // Auto-focus new note/shape input
  if (_newNotePos) {
    const inp = document.getElementById('new-note-input');
    if (inp) setTimeout(() => inp.focus(), 50);
  }
  if (_newShapeData) {
    const inp = document.getElementById('new-shape-note');
    if (inp) setTimeout(() => inp.focus(), 50);
  }

  // Update nav
  const label = document.getElementById('page-label');
  if (label) label.textContent = 'Page ' + pageNum + ' of ' + _drawingPages.length;
  const prev = document.getElementById('prev-page');
  const next = document.getElementById('next-page');
  if (prev) { prev.disabled = idx === 0; prev.style.opacity = idx === 0 ? '0.4' : '1'; }
  if (next) { next.disabled = idx >= _drawingPages.length - 1; next.style.opacity = idx >= _drawingPages.length - 1 ? '0.4' : '1'; }
  document.querySelectorAll('.page-thumb').forEach((el, i) => {
    el.style.border = i === idx ? '2px solid #2563eb' : '2px solid #e2e8f0';
    el.style.opacity = i === idx ? '1' : '0.5';
  });
}

function renderSidebar() {
  const sidebar = document.getElementById('notes-sidebar');
  if (!sidebar) return;

  let html = '';

  // Engineering notes with response fields
  _engineeringNotes.forEach((note, i) => {
    html += `
      <div style="padding:12px;margin-bottom:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;cursor:pointer;transition:box-shadow 0.15s" onclick="highlightNote('${note.id}',${note.pageNum||1})">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="font-size:12px;font-weight:700;color:#ef4444">Note #${note.number}</span>
          <span style="font-size:10px;color:#64748b;background:#fee2e2;border-radius:4px;padding:1px 6px">ENGINEER</span>
          <span style="font-size:10px;color:#2563eb;background:#e2e8f0;border-radius:4px;padding:1px 6px">Page ${note.pageNum || '?'} →</span>
        </div>
        <div style="font-size:13px;color:#1e293b;line-height:1.5;margin-bottom:4px">${escapeHtml(note.text)}</div>
        ${note.detail ? `<div style="font-size:11px;color:#64748b;margin:4px 0 8px;line-height:1.4;white-space:pre-wrap;background:#fff;padding:6px 10px;border-radius:4px;border:1px solid #fecaca">${escapeHtml(note.detail)}</div>` : ''}
        <div style="font-size:10px;color:#94a3b8;margin-bottom:6px">— ${escapeHtml(note.initials || '')} ${escapeHtml(note.date || '')}</div>
        <label style="font-size:11px;font-weight:600;color:#475569;display:block;margin-bottom:3px" onclick="event.stopPropagation()">Your Response:</label>
        <textarea id="response-${i}" placeholder="Your response..." rows="2" onclick="event.stopPropagation()" oninput="autosaveDrafts()"
          style="width:100%;border:2px solid #fecaca;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;min-height:44px;box-sizing:border-box;outline:none;transition:border-color 0.15s"
          onfocus="this.style.borderColor='#ef4444'" onblur="this.style.borderColor='#fecaca'"
        >${escapeHtml(_draftResponses[note.id] || '')}</textarea>
      </div>
    `;
  });

  // Customer notes
  if (_customerNotes.length > 0) {
    html += `<div style="font-size:11px;font-weight:700;color:#2563eb;letter-spacing:0.5px;margin:12px 0 6px;padding-top:8px;border-top:1px solid #e2e8f0">YOUR NOTES</div>`;
    _customerNotes.forEach(note => {
      const isEditingText = _editingNoteId === note.id;
      const isEditingDetail = _editingDetailId === note.id;
      html += `
        <div style="padding:10px 12px;margin-bottom:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:12px;font-weight:700;color:#2563eb;cursor:pointer" onclick="highlightNote('${note.id}',${note.pageNum||1})">#${note.number}</span>
            <span style="font-size:10px;color:#2563eb;background:#dbeafe;border-radius:4px;padding:1px 6px;cursor:pointer" onclick="highlightNote('${note.id}',${note.pageNum||1})">Page ${note.pageNum} →</span>
            <span onclick="event.stopPropagation();deleteCustomerNote('${note.id}')" style="cursor:pointer;color:#ef4444;font-size:14px;margin-left:auto;padding:0 2px" title="Delete">✕</span>
          </div>
          ${isEditingText ? `
            <input id="edit-note-${note.id}" type="text" value="${escapeHtml(note.text)}"
              onkeydown="if(event.key==='Enter')saveNoteEdit('${note.id}');if(event.key==='Escape'){_editingNoteId=null;renderSidebar();}"
              onblur="saveNoteEdit('${note.id}')"
              style="width:100%;border:2px solid #2563eb;border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:4px"/>
          ` : `
            <div onclick="startEditNote('${note.id}')" style="font-size:13px;color:#1e293b;line-height:1.4;cursor:text;margin-bottom:4px" title="Click to edit">${escapeHtml(note.text)}</div>
          `}
          <div style="border-top:1px solid #bfdbfe44;padding-top:4px">
            ${isEditingDetail ? `
              <textarea id="edit-detail-${note.id}" rows="3" placeholder="Add details..."
                onkeydown="if(event.key==='Enter'&&event.ctrlKey)saveDetailEdit('${note.id}');if(event.key==='Escape'){_editingDetailId=null;renderSidebar();}"
                onblur="saveDetailEdit('${note.id}')"
                style="width:100%;border:2px solid #2563eb;border-radius:4px;padding:6px 8px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box;resize:vertical;min-height:48px">${escapeHtml(note.detail || '')}</textarea>
              <div style="font-size:9px;color:#94a3b8;margin-top:2px">Ctrl+Enter to save · Esc to cancel</div>
            ` : `
              <div onclick="startEditDetail('${note.id}')" style="font-size:12px;color:${note.detail ? '#475569' : '#94a3b8'};line-height:1.4;cursor:text;font-style:${note.detail ? 'normal' : 'italic'};white-space:pre-wrap;word-break:break-word" title="Click to add details">${note.detail ? escapeHtml(note.detail) : '+ Add details...'}</div>
            `}
          </div>
        </div>
      `;
    });
  }

  // Customer shapes section
  if (_customerShapes.length > 0) {
    const icons = {line:'─', circle:'○', rect:'□', triangle:'△'};
    html += `<div style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;margin:12px 0 6px;padding-top:8px;border-top:1px solid #e2e8f0">YOUR MARKUP (${_customerShapes.length})</div>`;
    _customerShapes.forEach(shp => {
      html += `
        <div style="padding:8px 10px;margin-bottom:6px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;display:flex;align-items:center;gap:6px;cursor:pointer" onclick="highlightNote('shape-${shp.id}',${shp.pageNum||1})">
          <span style="font-size:16px;color:#ef4444">${icons[shp.type] || '?'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#1e293b">${shp.type.charAt(0).toUpperCase()+shp.type.slice(1)} — Page ${shp.pageNum||'?'}</div>
            ${shp.note ? `<div style="font-size:11px;color:#64748b;margin-top:1px">${escapeHtml(shp.note.slice(0,50))}${shp.note.length>50?'…':''}</div>` : ''}
          </div>
          <span onclick="event.stopPropagation();deleteCustomerShape('${shp.id}')" style="cursor:pointer;color:#ef4444;font-size:13px;flex-shrink:0" title="Delete">✕</span>
        </div>
      `;
    });
  }

  sidebar.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
