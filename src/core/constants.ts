// ─── Theme Colors ────────────────────────────────────────────────────────────

export const C = {
  // Surfaces (light mode)
  bg: '#f5f5f7',
  card: '#ffffff',
  input: '#ffffff',

  // Borders
  border: '#e1e2e5',
  borderLight: '#f0f0f2',

  // Text
  text: '#111111',
  muted: '#777777',
  sub: '#555555',
  faint: '#aaaaaa',

  // Accent — muted indigo
  accent: '#5e6ad2',
  accentDim: '#eef2ff',
  accentHover: '#4f5ab8',

  // Semantic
  green: '#3b8c5f',
  greenDim: '#edf7f1',
  yellow: '#c07a00',
  yellowDim: '#fef9e8',
  red: '#d14343',
  redDim: '#fdf0f0',
  blue: '#5e6ad2',
  blueDim: '#eef2ff',

  // Navigation (dark strip — Clyde sidebar aesthetic)
  nav: '#1c1c22',
  navText: 'rgba(255,255,255,0.75)',
  navHover: 'rgba(255,255,255,0.92)',
  navBorder: 'rgba(255,255,255,0.08)',

  // Extended
  purple: '#6b5fbd',
  teal: '#3d8a8a',
} as const;

// ─── Style Helpers ───────────────────────────────────────────────────────────

export const btn = (bg: string, color: string, x: React.CSSProperties = {}): React.CSSProperties => ({
  background: bg, color, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '6px 12px', fontWeight: 500, cursor: 'pointer',
  fontSize: 12, transition: 'all 0.12s ease', ...x,
});

export const inp = (x: React.CSSProperties = {}): React.CSSProperties => ({
  background: C.input, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '7px 10px', color: C.text,
  fontSize: 13, width: '100%', outline: 'none', ...x,
});

export const card = (x: React.CSSProperties = {}): React.CSSProperties => ({
  background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: 16, ...x,
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

// ─── App Version ────────────────────────────────────────────────────────────

export const APP_VERSION = 'v1.19.408';
export const APP_SCHEMA_VERSION = 2;
export const SANDBOX_VERSION = 'V1.0';

// ─── Device Categories ──────────────────────────────────────────────────────

export const DEFAULT_DEVICE_CATEGORIES = [
  'Terminal Block', 'Splice', 'Fuse Holder', 'Ground Bar', 'DIN Rail',
  'Wire Duct', 'Lug/Connector', 'Ferrule', 'Cable Tie', 'Label',
  'Mounting Hardware', 'Power Distribution Block', 'Bus Bar',
] as const;

export const DOOR_DEVICE_TYPES = new Set([
  'pushbutton', 'pilot_light', 'selector_switch', 'hmi', 'e_stop', 'horn', 'meter',
]);

// ─── Contingency Items ──────────────────────────────────────────────────────

export const CONTINGENCY_ITEMS = [
  { partNumber: 'BOM CONTINGENCY', description: 'BOM CONTINGENCY' },
  { partNumber: 'WIRE & CONSUMABLES', description: 'WIRE & CONSUMABLES' },
] as const;

export const CONTINGENCY_PNS = new Set(
  CONTINGENCY_ITEMS.map(c => c.partNumber.toUpperCase())
);

// ─── RFQ Timing Constants ───────────────────────────────────────────────────

/** 30 days -- don't re-send RFQ within this window */
export const RFQ_SENT_COOLDOWN = 30 * 24 * 60 * 60 * 1000;

/** 30 days -- cooldown for UI display */
export const RFQ_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** 60 days -- prices older than this are stale */
export const RFQ_STALE_MS = 60 * 24 * 60 * 60 * 1000;

/** 5 days -- RFQ considered expired after this */
export const RFQ_EXPIRED_MS = 5 * 24 * 60 * 60 * 1000;

/** Items excluded from RFQ grouping by description/partNumber */
export const RFQ_EXCLUDE_ITEMS = /job\s*buy.?off|crating|^crate$/i;

/** Vendors excluded from RFQ grouping */
export const RFQ_EXCLUDE_VENDORS = /^matrix\s*systems|crate|job\s*buyoff|job\s*buy.?off/i;

// ─── BC Manufacturer Code Map ───────────────────────────────────────────────
// Maps free-text manufacturer names (from BOM AI extraction) -> BC Manufacturer Code

export const BC_MFR_MAP = [
  { code: 'AB', terms: ['allen-bradley', 'allen bradley', 'allen brad', 'rockwell automation', 'rockwell', 'a-b', 'ab ', 'a/b'] },
  { code: 'SE', terms: ['schneider electric', 'schneider', 'square d', 'squared', 'squaredee', 'modicon', 'telemecanique', 't\u00e9l\u00e9m\u00e9canique', 'merlin gerin'] },
  { code: 'SIEMENS', terms: ['siemens'] },
  { code: 'ABB', terms: ['abb'] },
  { code: 'EATON', terms: ['eaton', 'cutler-hammer', 'cutler hammer', 'ch ', 'c-h', 'moeller', 'klockner moeller'] },
  { code: 'HOFFMAN', terms: ['hoffman', 'pentair', 'pentair/hoffman'] },
  { code: 'RITTAL', terms: ['rittal'] },
  { code: 'HAMMOND', terms: ['hammond', 'hammond mfg'] },
  { code: 'SAGINAW', terms: ['saginaw', 'saginaw control', 'sce'] },
  { code: 'PHX', terms: ['phoenix contact', 'phoenix', 'phoenixcontact'] },
  { code: 'WEIDMULLER', terms: ['weidmuller', 'weidm\u00fcller'] },
  { code: 'TURCK', terms: ['turck', 'banner'] },
  { code: 'OMRON', terms: ['omron'] },
  { code: 'PILZ', terms: ['pilz'] },
  { code: 'IDEC', terms: ['idec'] },
  { code: 'PANDUIT', terms: ['panduit'] },
  { code: 'BRADY', terms: ['brady'] },
  { code: 'HUBBELL', terms: ['hubbell', 'kellems'] },
  { code: 'LEVITON', terms: ['leviton'] },
  { code: 'BELDEN', terms: ['belden'] },
  { code: 'LAPP', terms: ['lapp', 'lapp group', '\u00f6lflex', 'olflex'] },
  { code: 'PF', terms: ['pepperl', 'pepperl+fuchs', 'pepperl fuchs'] },
  { code: 'SICK', terms: ['sick', 'sick ag'] },
  { code: 'KEYENCE', terms: ['keyence'] },
  { code: 'AUTOMDIR', terms: ['automation direct', 'automationdirect', 'adirect'] },
  { code: 'MURR', terms: ['murr', 'murr elektronik'] },
  { code: 'WAGO', terms: ['wago'] },
  { code: 'LEUZE', terms: ['leuze'] },
  { code: 'COGNEX', terms: ['cognex'] },
] as const;

// Reverse map: BC Manufacturer Code -> display name
export const BC_MFR_CODE_NAMES: Record<string, string> = {
  'AB': 'Allen-Bradley', 'SE': 'Schneider Electric', 'SIEMENS': 'Siemens', 'ABB': 'ABB',
  'EATON': 'Eaton', 'HOFFMAN': 'Hoffman', 'RITTAL': 'Rittal', 'HAMMOND': 'Hammond',
  'SAGINAW': 'Saginaw', 'PHX': 'Phoenix Contact', 'WEIDMULLER': 'Weidmuller',
  'TURCK': 'Turck', 'OMRON': 'Omron', 'PILZ': 'Pilz', 'IDEC': 'IDEC', 'PANDUIT': 'Panduit',
  'BRADY': 'Brady', 'HUBBELL': 'Hubbell', 'LEVITON': 'Leviton', 'BELDEN': 'Belden',
  'LAPP': 'Lapp', 'PF': 'Pepperl+Fuchs', 'SICK': 'Sick', 'KEYENCE': 'Keyence',
  'AUTOMDIR': 'Automation Direct', 'MURR': 'Murr Elektronik', 'WAGO': 'Wago',
  'LEUZE': 'Leuze', 'COGNEX': 'Cognex',
};

// ─── BC UOM Map ─────────────────────────────────────────────────────────────

export const BC_UOM_MAP: Record<string, string> = {
  E: 'EA', EA: 'EA', PC: 'PCS', PCS: 'PCS', FT: 'FT', M: 'M',
  LB: 'LB', KG: 'KG', BX: 'BOX', BOX: 'BOX', RL: 'ROLL', ROLL: 'ROLL',
  PR: 'PR', SET: 'SET', PKG: 'PKG', C: 'C100', HR: 'HOUR', HOUR: 'HOUR',
};

// ─── API Vendor Patterns ────────────────────────────────────────────────────

export const API_VENDOR_PATTERNS = [
  { pattern: /digi[\s-]?key/i, type: 'digikey', label: 'DigiKey API', hasApi: true },
  { pattern: /mouser/i, type: 'mouser', label: 'Mouser API', hasApi: true },
  { pattern: /rs[\s-]?online|rs[\s-]?components/i, type: 'rsonline', label: 'RS-Online (via DigiKey/Mouser)', hasApi: false },
];

// ─── Firebase Config ─────────────────────────────────────────────────────────

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCGgcsb-pV7ZpDDfUd6KQKaDetXUZPCTVw',
  authDomain: 'matrix-arc.firebaseapp.com',
  projectId: 'matrix-arc',
  storageBucket: 'matrix-arc.firebasestorage.app',
  messagingSenderId: '198633509276',
  appId: '1:198633509276:web:852ce699c3ee3213643859',
} as const;
