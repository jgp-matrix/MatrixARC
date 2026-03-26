// ─── Core Domain Types ───────────────────────────────────────────────────────
// All domain interfaces for MatrixARC. These are the contracts between layers.

// ─── Page & Scanning ─────────────────────────────────────────────────────────

export type PageType = 'bom' | 'schematic' | 'layout' | 'backpanel' | 'enclosure' | 'pid' | 'wiring' | 'unknown';

export interface Region {
  type: string;          // "bom" | "spec" | "label" | etc.
  label?: string;
  note?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface Page {
  id: string;                    // "pg-{timestamp}-{random}"
  name?: string;
  dataUrl?: string;              // base64 JPEG — stored in IndexedDB, NOT Firestore
  storageUrl?: string;           // Firebase Storage URL
  types?: string[];              // e.g. ["bom", "schematic"]
  type?: string;                 // legacy single type
  aiDetectedTypes?: string[];
  sheetNo?: string;
  regions?: Region[];
  isZoomedSection?: boolean;
  zoomedSectionType?: string;
  _srcStorageUrl?: string;
  _srcPageId?: string;
}

// ─── BOM ─────────────────────────────────────────────────────────────────────

export interface BomRow {
  id: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  qty: number;
  unitPrice: number | null;
  priceSource: 'bc' | 'manual' | 'ai' | null;
  priceDate?: number;
  notes: string;
  isLaborRow?: boolean;
  isCrossed?: boolean;
  crossedFrom?: string;
  autoReplaced?: boolean;
  bcVendorName?: string;
  bcPoDate?: number;
  bcInventory?: number;
  bcDisplayName?: string;
  cpdCategory?: string;
  category?: string;
  autoLoaded?: boolean;
  _row?: any;
}

// ─── Labor ───────────────────────────────────────────────────────────────────

export interface LaborCounts {
  wireCount: number;
  wireTerminations: number;
  doorDevices: number;
  allDevices: number;
  panelHoles: number;
  ductDinFeet: number;
  sideTopSmallCount: number;
  sideTopLargeCount: number;
  squareCutoutCount: number;
  sideDeviceHours: number;
  sideDeviceCount: number;
}

export interface LaborDefaults {
  pmUnits: number;
  buyoffUnits: number;
  cratingUnits: number;
  labelHours: number;
}

export interface LaborData {
  counts: LaborCounts;
  overrides: Record<string, number>;
  defaults: LaborDefaults;
  hasLayoutData: boolean;
  layoutAnalysis?: any;
  deviceClassification?: any;
  accepted?: Record<string, boolean>;
}

export interface LaborEstimateLine {
  category: string;
  qty: number;
  unit: string;
  minPerUnit?: number;
  hours: number;
  cost: number;
  field?: string;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface SchematicTag {
  tag: string;
  type?: string;
}

export interface ValidationResult {
  runAt: number;
  schematicTags: (string | SchematicTag)[];
  wireCount: number;
  matched: any[];
  missingFromSchematic: any[];
  notTraceable: any[];
  unaccountedTags: string[];
  confidence: 'high' | 'medium' | 'low';
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface PricingConfig {
  contingencyBOM: number;          // default 1500
  contingencyConsumables: number;  // default 400
  budgetaryContingencyPct: number; // default 20
}

export interface PanelPricing {
  laborRate?: number;              // default 45
  laborHoursOverride?: number;
  contingencyBOM?: number;
  contingencyConsumables?: number;
  budgetaryContingencyPct?: number;
}

export interface BudgetaryQuoteData {
  generatedAt?: number;
  contingencyPct?: number;
  baseGrandTotal?: number;
  budgetarySellPrice?: number;
}

// ─── Engineering Questions ───────────────────────────────────────────────────

export interface EngineeringQuestion {
  id: string;
  source: 'bom' | 'compliance' | 'extraction';
  category: string;
  severity: 'info' | 'warning' | 'error';
  question: string;
  options?: string[];
  rowRef?: string;
  pageName?: string;
  answer: string | null;
  answeredBy?: string;
  answeredAt?: number;
  status: 'open' | 'skipped' | 'on_quote';
  createdAt: number;
}

// ─── BOM Verification ────────────────────────────────────────────────────────

export interface BomVerificationResult {
  id: string;
  status: 'verified' | 'plausible' | 'suspect';
  note: string;
}

// ─── Compliance ──────────────────────────────────────────────────────────────

export interface ComplianceReview {
  [key: string]: any;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export interface Panel {
  id: string;                          // "panel-{timestamp}"
  name: string;
  pages: Page[];
  bom: BomRow[];
  validation: ValidationResult | null;
  pricing: PanelPricing | null;
  budgetaryQuote?: BudgetaryQuoteData | null;
  status: PanelStatus;
  drawingNo?: string;
  drawingDesc?: string;
  drawingRev?: string;
  lineQty?: number;                    // default 1
  bcProjectNumber?: string;
  bcItemNumber?: string;
  bcPdfAttached?: boolean;
  bcPdfFileName?: string;
  laborData?: LaborData | null;
  engineeringQuestions?: EngineeringQuestion[];
  bomVerification?: BomVerificationResult[];
  complianceReview?: ComplianceReview;
  wiringAccepted?: string[];
  createdAt?: number;
  updatedAt?: number;
  extractionNotes?: string;
  aiQuestions?: any[];
}

export type PanelStatus = 'draft' | 'extracted' | 'validated' | 'costed' | 'pushed_to_bc' | 'complete';

// ─── Project ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  customerName: string;
  customerNumber?: string;
  contact?: string;
  panels: Panel[];
  quote?: ProjectQuote;
  bcProjectNumber?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  schemaVersion: number;
  quoteRev?: number;
  quoteRevAtPrint?: number;
  lastPrintedBomHash?: string;
  lastQuotePrintedAt?: number;
}

export interface ProjectQuote {
  supplier?: string;
  quoteId?: string;
  revision?: string;
  [key: string]: any;
}

// ─── Company & Team ──────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'edit' | 'view';

export interface CompanyMember {
  uid: string;
  email: string;
  role: UserRole;
  addedAt: number;
}

export interface PendingInvite {
  token: string;
  email: string;
  role: UserRole;
  invitedAt: number;
  invitedBy: string;
}

// ─── App Context ─────────────────────────────────────────────────────────────

export interface AppContext {
  uid: string | null;
  companyId: string | null;
  role: UserRole | null;
  projectsPath: string | null;
  configPath: string | null;
}

// ─── Background Tasks ────────────────────────────────────────────────────────

export type TaskStatus = 'extracting' | 'uploading' | 'syncing' | 'complete' | 'error';

export interface BackgroundTask {
  status: TaskStatus;
  msg: string;
  pct: number;
  panelName: string;
  projectId: string;
}

// ─── Supplier Quotes ─────────────────────────────────────────────────────────

export interface SupplierQuoteLineItem {
  partNumber: string;
  supplierPartNumber?: string;
  supplierLineNumber?: string;
  description: string;
  qty: number;
  price: number;
  extPrice: number | null;
  leadTimeDays?: number;
  unitPrice?: number;
  notes: string;
  isPriced: boolean;
  confidence?: 'high' | 'medium' | 'low' | 'unmatched';
}

export interface SupplierQuote {
  quoteId: string;
  revision: string;
  supplier: string;
  supplierLower: string;
  jobName: string;
  contactName: string;
  quoteDate: number | null;
  expiresOn: number | null;
  fob: string;
  freight: string;
  status: 'pending_review' | 'superseded';
  merchandiseTotal: number;
  lineItems: SupplierQuoteLineItem[];
  searchTokens: string[];
  pdfUrl: string | null;
  fileName: string;
  supersedes: string | null;
  supersededBy: string | null;
  projectId: string | null;
  bcProjectNumber: string | null;
  importedAt: any;
  importedBy: string;
}

// ─── RFQ ─────────────────────────────────────────────────────────────────────

export interface RfqUpload {
  uid: string;
  projectId: string;
  projectName: string;
  vendorName: string;
  vendorNumber: string;
  vendorEmail: string;
  rfqNum: string;
  lineItems: { partNumber: string; description: string; qty: number; manufacturer: string }[];
  sentAt: number;
  expiresAt: number;
  status: string;
  companyName: string;
  companyLogoUrl: string;
  companyAddress: string;
  companyPhone: string;
}

// ─── Part Library ────────────────────────────────────────────────────────────

export interface PartLibraryEntry {
  key: string;
  manufacturer: string;
  description: string;
  partNumber: string;
  updatedAt: number;
}

export interface PartCorrection {
  badPN: string;
  correctedPN: string;
  type: string;
  createdAt: number;
}

export interface SupplierCrossRef {
  origPartNumber: string;
  bcPartNumber: string;
  description: string;
  manufacturer: string;
  vendorName: string;
  rfqNum: string;
  rfqDate: number;
}

// ─── Alternate Parts ─────────────────────────────────────────────────────────

export interface AlternatePart {
  originalPN: string;
  replacement: {
    partNumber: string;
    description?: string;
    unitCost?: number;
  };
  autoReplace?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// ─── Layer Interfaces (Cross-Layer Contracts) ────────────────────────────────

/** Layer 1 → Layer 2: Output of scanning, input to BOM extraction */
export interface ClassifiedPage {
  id: string;
  imageData: string;           // base64 JPEG
  types: PageType[];
  sheetNo?: string;
  name?: string;
}

/** Layer 2 → Layer 3: Output of BOM processing, input to BC sync */
export interface PanelExport {
  panelName: string;
  panelIndex: number;
  lineQty: number;
  sellPrice: number;
  items: ExportBomItem[];
  labor: LaborBreakdown;
}

export interface ExportBomItem {
  partNumber: string;
  description: string;
  manufacturer: string;
  quantity: number;
  unitPrice: number | null;
  priceSource: 'ai' | 'manual' | 'bc' | null;
  uom: string;
}

export interface LaborBreakdown {
  engineering: number;
  cut: number;
  layout: number;
  wire: number;
  totalHours: number;
  wireCount: number;
}
