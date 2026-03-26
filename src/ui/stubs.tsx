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

// ─── Modal Stubs ─────────────────────────────────────────────────────────────

export function NewProjectModal({ uid, onCreated, onClose }: any) {
  return <Stub name="New Project" onClose={onClose} />;
}

export function DeleteConfirmModal({ projectName, onConfirm, onCancel }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, maxWidth: 400 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Delete "{projectName}"?</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={btn(C.border, C.muted)}>Cancel</button>
          <button onClick={() => onConfirm(false)} style={btn(C.red, '#fff')}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export function TransferProjectModal({ onClose }: any) {
  return <Stub name="Transfer Project" onClose={onClose} />;
}

export function CopyProjectModal({ onClose }: any) {
  return <Stub name="Copy Project" onClose={onClose} />;
}

export function SettingsModal({ uid, onClose }: any) {
  return <Stub name="Settings" onClose={onClose} />;
}

export function ReportsModal({ uid, onClose }: any) {
  return <Stub name="Reports" onClose={onClose} />;
}

export function PricingConfigModal({ uid, onClose }: any) {
  return <Stub name="Pricing Configuration" onClose={onClose} />;
}

export function TeamModal({ uid, companyId, userRole, onClose }: any) {
  return <Stub name="Team & Permissions" onClose={onClose} />;
}

export function AboutModal({ onClose }: any) {
  return <Stub name="About ARC" onClose={onClose} />;
}

export function SupplierPricingUploadModal({ uid, onClose }: any) {
  return <Stub name="Supplier Pricing Upload" onClose={onClose} />;
}

export function CompanySetupModal({ uid, email, onDone, onClose }: any) {
  return <Stub name="Company Setup" onClose={onClose} />;
}

export function SupplierPortalPage({ token }: any) {
  return <Stub name={`Supplier Portal (token: ${token})`} />;
}

// ─── View Stubs ──────────────────────────────────────────────────────────────

export function ProjectView({ project, uid, onBack, onChange }: any) {
  return (
    <div style={{ padding: 32 }}>
      <button onClick={onBack} style={btn(C.border, C.muted, { marginBottom: 16 })}>← Back</button>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{project?.name || 'Project'}</div>
        <div style={{ fontSize: 13, color: C.muted }}>ProjectView not yet migrated. {project?.panels?.length || 0} panels.</div>
      </div>
    </div>
  );
}

export function AIDatabasePage({ uid, onBack }: any) {
  return <Stub name="ARC AI Database" onBack={onBack} />;
}

export function TourOverlay({ stepIdx, onNext, onPrev, onDone, onSkip }: any) {
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, background: C.card, border: `1px solid ${C.accent}`, borderRadius: 12, padding: 16, zIndex: 10000, minWidth: 280 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Training Step {stepIdx + 1}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onPrev} style={btn(C.border, C.muted, { fontSize: 12 })}>Prev</button>
        <button onClick={onNext} style={btn(C.accent, '#fff', { fontSize: 12 })}>Next</button>
        <button onClick={onDone} style={btn(C.border, C.muted, { fontSize: 12 })}>Done</button>
      </div>
    </div>
  );
}

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
