// ─── Theme Colors ────────────────────────────────────────────────────────────

export const C = {
  bg: '#0d0d14',
  card: '#13131e',
  border: '#1e2030',
  accent: '#3b82f6',
  accentDim: '#1d3a6e',
  green: '#10b981',
  greenDim: '#052e1c',
  yellow: '#f59e0b',
  yellowDim: '#3a1f00',
  red: '#ef4444',
  redDim: '#3b0808',
  muted: '#c0c4cc',
  text: '#e8e8f0',
  sub: '#d4d8e0',
  purple: '#8b5cf6',
  teal: '#14b8a6',
} as const;

// ─── Style Helpers ───────────────────────────────────────────────────────────

export const btn = (bg: string, color: string, x: React.CSSProperties = {}): React.CSSProperties => ({
  background: bg, color, border: 'none', borderRadius: 8,
  padding: '9px 16px', fontWeight: 600, cursor: 'pointer',
  fontSize: 14, transition: 'opacity 0.15s', ...x,
});

export const inp = (x: React.CSSProperties = {}): React.CSSProperties => ({
  background: '#0a0a12', border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '9px 12px', color: C.text,
  fontSize: 14, width: '100%', outline: 'none', ...x,
});

export const card = (x: React.CSSProperties = {}): React.CSSProperties => ({
  background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 12, padding: 20, ...x,
});

// ─── Pricing Defaults ────────────────────────────────────────────────────────

export const PRICING_DEFAULTS = {
  contingencyBOM: 1500,
  contingencyConsumables: 400,
  budgetaryContingencyPct: 20,
  laborRate: 45,
} as const;

// ─── Page Types ──────────────────────────────────────────────────────────────

export const PAGE_TYPES = ['bom', 'schematic', 'layout', 'backpanel', 'enclosure', 'pid', 'wiring'] as const;

// ─── Panel Statuses ──────────────────────────────────────────────────────────

export const PANEL_STATUSES = ['draft', 'extracted', 'validated', 'costed', 'pushed_to_bc', 'complete'] as const;

// ─── IndexedDB ───────────────────────────────────────────────────────────────

export const IDB_NAME = 'matrix-arc-images';
export const IDB_STORE = 'pages';

// ─── Anthropic API ───────────────────────────────────────────────────────────

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

// ─── Firebase Config ─────────────────────────────────────────────────────────

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCGgcsb-pV7ZpDDfUd6KQKaDetXUZPCTVw',
  authDomain: 'matrix-arc.firebaseapp.com',
  projectId: 'matrix-arc',
  storageBucket: 'matrix-arc.firebasestorage.app',
  messagingSenderId: '198633509276',
  appId: '1:198633509276:web:852ce699c3ee3213643859',
} as const;
