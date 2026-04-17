/**
 * ARC Purchasing Module
 *
 * Standalone Purchase Order management module for MatrixARC.
 * Loaded as an iframe inside the main ARC app, or standalone at /purchasing/
 *
 * Dependencies:
 *   - Firebase SDK (loaded in index.html)
 *   - /modules/shared.js (ARC context bridge)
 *
 * Data paths:
 *   - companies/{companyId}/purchaseOrders/{poId}
 *   - companies/{companyId}/purchaseOrders/{poId}/lines/{lineId}
 */

const PO_VERSION = '0.1.0';

arcModuleReady.then(function(ctx) {
  console.log('[PO Module] v' + PO_VERSION + ' — user:', ctx.uid, 'company:', ctx.companyId);
  document.getElementById('po-loading').style.display = 'none';

  if (!ctx.uid) {
    renderError('Not signed in. Please sign in to ARC first.');
    return;
  }
  if (!ctx.companyId) {
    renderError('No company assigned. Contact your administrator.');
    return;
  }

  renderApp(ctx);
});

function renderError(msg) {
  document.getElementById('po-app').innerHTML =
    '<div class="po-placeholder"><h2>Purchasing Module</h2><p style="color:#ef4444">' + msg + '</p></div>';
}

function renderApp(ctx) {
  const C = window.arcColors;
  const app = document.getElementById('po-app');

  app.innerHTML = `
    <div class="po-content">
      <div class="po-placeholder">
        <h2>Purchase Order Module</h2>
        <p>This module is under development. Purchase order creation, tracking, and BC integration will be available here.</p>
        <div class="po-status-badge">MODULE ACTIVE</div>
        <div style="margin-top: 32px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <div style="background: ${C.card}; border: 1px solid ${C.border}; border-radius: 10px; padding: 20px 24px; min-width: 180px; text-align: center;">
            <div style="font-size: 32px; font-weight: 800; color: ${C.accent};" id="po-count">—</div>
            <div style="font-size: 12px; color: ${C.muted}; margin-top: 4px;">Purchase Orders</div>
          </div>
          <div style="background: ${C.card}; border: 1px solid ${C.border}; border-radius: 10px; padding: 20px 24px; min-width: 180px; text-align: center;">
            <div style="font-size: 32px; font-weight: 800; color: ${C.green};" id="po-open-count">—</div>
            <div style="font-size: 12px; color: ${C.muted}; margin-top: 4px;">Open / In Progress</div>
          </div>
          <div style="background: ${C.card}; border: 1px solid ${C.border}; border-radius: 10px; padding: 20px 24px; min-width: 180px; text-align: center;">
            <div style="font-size: 32px; font-weight: 800; color: ${C.yellow};" id="po-bc-status">—</div>
            <div style="font-size: 12px; color: ${C.muted}; margin-top: 4px;">BC Connection</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Show BC connection status
  document.getElementById('po-bc-status').textContent = ctx.bcToken ? 'Connected' : 'Offline';
  document.getElementById('po-bc-status').style.color = ctx.bcToken ? C.green : C.red;

  // Load PO count from Firestore
  loadPOCount(ctx);
}

async function loadPOCount(ctx) {
  try {
    const snap = await ctx.db.collection('companies/' + ctx.companyId + '/purchaseOrders').get();
    const total = snap.size;
    const open = snap.docs.filter(function(d) {
      var s = d.data().status;
      return s === 'draft' || s === 'open' || s === 'in_progress';
    }).length;
    document.getElementById('po-count').textContent = total;
    document.getElementById('po-open-count').textContent = open;
  } catch (e) {
    document.getElementById('po-count').textContent = '0';
    document.getElementById('po-open-count').textContent = '0';
  }
}
