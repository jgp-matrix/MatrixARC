/**
 * ARC Engineering Review Module v0.1.0
 *
 * Provides pre-quote and post-PO engineering review workflow.
 * Loaded as an iframe inside the main ARC app via the ENGINEERING tab.
 *
 * Features:
 * - View projects pending pre-review and post-review
 * - Drawing annotations (red note boxes)
 * - Review questions (internal/external)
 * - Approve / Return for changes
 * - Customer review portal integration
 */

const ENG_VERSION = '0.1.0';

arcModuleReady.then(function(ctx) {
  console.log('[ENG Module] v' + ENG_VERSION + ' — user:', ctx.uid, 'company:', ctx.companyId);
  document.getElementById('eng-loading').style.display = 'none';

  if (!ctx.uid) { renderError('Not signed in.'); return; }
  if (!ctx.companyId) { renderError('No company assigned.'); return; }

  renderApp(ctx);
});

function renderError(msg) {
  document.getElementById('eng-app').innerHTML =
    '<div style="padding:80px 24px;text-align:center"><h2 style="color:#a78bfa">Engineering Module</h2><p style="color:#ef4444;margin-top:12px">' + msg + '</p></div>';
}

async function renderApp(ctx) {
  const C = window.arcColors;
  const app = document.getElementById('eng-app');
  const db = ctx.db || firebase.firestore();

  // Load projects with pending reviews
  const path = 'companies/' + ctx.companyId + '/projects';
  let projects = [];
  try {
    const snap = await db.collection(path).get();
    projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[ENG] Failed to load projects:', e);
  }

  const preReview = projects.filter(p => p.preReviewStatus === 'pending');
  const postReview = projects.filter(p => p.postReviewStatus === 'pending');
  const recentApproved = projects.filter(p =>
    (p.preReviewStatus === 'approved' && p.preReviewApprovedAt > Date.now() - 7 * 24 * 60 * 60 * 1000) ||
    (p.postReviewStatus === 'approved' && p.postReviewApprovedAt > Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  app.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:24px">
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:24px">
        <div style="background:${C.card};border:1px solid #a78bfa44;border-radius:10px;padding:20px 24px;min-width:200px;flex:1;text-align:center">
          <div style="font-size:36px;font-weight:800;color:#a78bfa" id="pre-count">${preReview.length}</div>
          <div style="font-size:12px;color:${C.muted};margin-top:4px">Pre-Quote Reviews</div>
        </div>
        <div style="background:${C.card};border:1px solid #a78bfa44;border-radius:10px;padding:20px 24px;min-width:200px;flex:1;text-align:center">
          <div style="font-size:36px;font-weight:800;color:#a78bfa" id="post-count">${postReview.length}</div>
          <div style="font-size:12px;color:${C.muted};margin-top:4px">Post-PO Reviews</div>
        </div>
        <div style="background:${C.card};border:1px solid ${C.green}44;border-radius:10px;padding:20px 24px;min-width:200px;flex:1;text-align:center">
          <div style="font-size:36px;font-weight:800;color:${C.green}">${recentApproved.length}</div>
          <div style="font-size:12px;color:${C.muted};margin-top:4px">Recently Approved (7d)</div>
        </div>
      </div>

      ${preReview.length > 0 ? `
        <div style="margin-bottom:24px">
          <h3 style="color:#a78bfa;font-size:14px;font-weight:700;letter-spacing:1px;margin-bottom:12px">📐 PRE-QUOTE REVIEWS PENDING</h3>
          ${preReview.map(p => projectCard(p, 'pre', C)).join('')}
        </div>
      ` : ''}

      ${postReview.length > 0 ? `
        <div style="margin-bottom:24px">
          <h3 style="color:#a78bfa;font-size:14px;font-weight:700;letter-spacing:1px;margin-bottom:12px">🔧 POST-PO REVIEWS PENDING</h3>
          ${postReview.map(p => projectCard(p, 'post', C)).join('')}
        </div>
      ` : ''}

      ${preReview.length === 0 && postReview.length === 0 ? `
        <div style="text-align:center;padding:60px 24px;color:${C.muted}">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.3">📐</div>
          <div style="font-size:18px;font-weight:700;color:${C.sub};margin-bottom:8px">No Pending Reviews</div>
          <div style="font-size:13px;line-height:1.7">All engineering reviews are complete. New reviews will appear here when submitted.</div>
        </div>
      ` : ''}
    </div>
  `;
}

function projectCard(p, type, C) {
  const panelCount = (p.panels || []).length;
  const bomCount = (p.panels || []).flatMap(pan => (pan.bom || []).filter(r => !r.isLaborRow)).length;
  const submittedDate = type === 'pre' ? p.preReviewSubmittedAt : p.postReviewSubmittedAt;
  const dateStr = submittedDate ? new Date(submittedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  return `
    <div style="background:${C.card};border:1px solid ${C.border};border-radius:8px;padding:14px 18px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:14px"
      onclick="window.parent.postMessage({type:'arc-module-open-project',projectId:'${p.id}'},'*')">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:700;color:#a78bfa">${p.bcProjectNumber || '—'}</span>
          <span style="font-size:13px;color:${C.text};font-weight:600">${p.bcCustomerName || ''}</span>
        </div>
        <div style="font-size:12px;color:${C.muted}">${p.name || '—'} · ${panelCount} panel${panelCount !== 1 ? 's' : ''} · ${bomCount} items</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;color:${C.muted}">Submitted ${dateStr}</div>
        <div style="font-size:10px;color:#a78bfa;font-weight:700;margin-top:2px">${type === 'pre' ? 'PRE-REVIEW' : 'POST-PO REVIEW'}</div>
      </div>
    </div>
  `;
}
