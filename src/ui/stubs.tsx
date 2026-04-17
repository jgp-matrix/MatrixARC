// ─── Component Stubs ─────────────────────────────────────────────────────────
// Placeholder components for children not yet migrated from the monolith.
// Each stub renders a minimal UI that indicates it's a placeholder.
// As components are migrated, remove the stub and import the real component.

import { C, btn } from '@/core/constants';

function Stub({ name, onClose, onBack }: { name: string; onClose?: () => void; onBack?: () => void }) {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, maxWidth: 500 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>{name}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>This component has not been migrated yet.</div>
        {onClose && <button onClick={onClose} style={btn(C.border, C.muted, { fontSize: 13 })}>Close</button>}
        {onBack && <button onClick={onBack} style={btn(C.border, C.muted, { fontSize: 13 })}>Back</button>}
      </div>
    </div>
  );
}

// ─── Migrated Modal Re-exports ──────────────────────────────────────────────

export { default as NewProjectModal } from './modals/NewProjectModal';
export { default as DeleteConfirmModal } from './modals/DeleteConfirmModal';
export { default as SettingsModal } from './modals/SettingsModal';
export { default as PricingConfigModal } from './modals/PricingConfigModal';
export { default as TeamModal } from './modals/TeamModal';
export { default as AboutModal } from './modals/AboutModal';
export { default as CompanySetupModal } from './modals/CompanySetupModal';
export { default as TransferProjectModal } from './modals/TransferProjectModal';
export { default as CopyProjectModal } from './modals/CopyProjectModal';
export { default as ReportsModal } from './modals/ReportsModal';
export { default as SupplierPricingUploadModal } from './modals/SupplierPricingUploadModal';
export { default as EngineeringQuestionsModal } from './modals/EngineeringQuestionsModal';
export { default as RemoveMemberModal } from './modals/RemoveMemberModal';
export { default as RfqEmailModal } from './modals/RfqEmailModal';
export { default as RfqDocument } from './modals/RfqDocument';
export { default as RfqHistoryModal } from './modals/RfqHistoryModal';
export { default as PoReceivedModal } from './modals/PoReceivedModal';
export { default as PurchasePriceCheckModal } from './modals/PurchasePriceCheckModal';
export { default as PortalSubmissionsModal } from './modals/PortalSubmissionsModal';
export { default as SupplierQuoteImportModal } from './modals/SupplierQuoteImportModal';
export { default as BCItemBrowserModal } from './modals/BCItemBrowserModal';
export { default as UpdateBomInBCModal } from './modals/UpdateBomInBCModal';
export { default as CPDSearchModal } from './modals/CPDSearchModal';
export { default as CADLinkSendModal } from './modals/CADLinkSendModal';
export { default as PricingReportsModal } from './modals/PricingReportsModal';
export { default as QuoteSendModal } from './modals/QuoteSendModal';

// ─── Tab Re-exports ────────────────────────────────────────────────────────

export { default as QuoteTab } from './tabs/QuoteTab';
export { default as ItemsTab } from './tabs/ItemsTab';
export { default as PurchasingTab } from './tabs/PurchasingTab';

// ─── Shared Component Re-exports ───────────────────────────────────────────

export { default as Badge } from './shared/Badge';
export { default as ConfidenceBar } from './shared/ConfidenceBar';
export { default as DrawingLightbox } from './shared/DrawingLightbox';
export { default as ContingencyInput } from './shared/ContingencyInput';
export { default as PageTags } from './shared/PageTags';
export { default as TooltipToggle } from './shared/TooltipToggle';
export { default as LeftNav } from './shared/LeftNav';

// ─── View Re-exports ────────────────────────────────────────────────────────

export { default as SupplierPortalPage } from './SupplierPortalPage';
export { default as AIDatabasePage } from './AIDatabasePage';
export { default as TourOverlay } from './shared/TourOverlay';

// ─── View Re-exports (migrated) ──────────────────────────────────────────────

export { default as ProjectView } from './ProjectView';

// ─── Error Boundary ──────────────────────────────────────────────────────────

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onBack?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{this.state.error?.message}</div>
          {this.props.onBack && <button onClick={this.props.onBack} style={btn(C.accent, '#fff')}>Back to Dashboard</button>}
        </div>
      );
    }
    return this.props.children;
  }
}
