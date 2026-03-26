// ─── Business Central Types ──────────────────────────────────────────────────

export interface BCConfig {
  env: string;              // e.g. "MATR_SndBx_01152026"
  companyName: string;
  clientId: string;
}

export interface BCItem {
  number: string;
  displayName: string;
  unitCost: number | null;
  unitPrice: number | null;
  inventory: number;
  lastModifiedDateTime?: string;
  vendorNo?: string;
  id?: string;
}

export interface BCSearchResult {
  items: BCItem[];
  hasMore: boolean;
}

export interface BCFuzzyLookupResult {
  match: BCItem | null;
  type: 'exact' | 'fuzzy' | null;
  suggestions: BCItem[];
}

export interface BCCreateItemRequest {
  number?: string;
  displayName: string;
  unitCost: number;
  itemCategoryCode?: string;
  baseUnitOfMeasureCode?: string;
  vendorNo?: string;
  genProdPostingGroup?: string;
  inventoryPostingGroup?: string;
}

export interface BCPurchasePrice {
  vendorNo: string;
  directUnitCost: number;
  startingDate: string;
  uom: string;
}

export interface BCPlanningLine {
  Line_No: number;
  Planning_Date: string;
  Line_Type: 'Budget' | 'Billable';
  Type: 'Item' | 'Resource';
  No: string;
  Description: string;
  Quantity: number;
  Unit_Price: number;
  Location_Code: string;
  [key: string]: any;       // dynamic field names (FP_NO, FP_TASK_NO)
}

export interface BCProject {
  id: string;
  number: string;
  displayName: string;
  customerNumber?: string;
  customerName?: string;
}

export interface BCSyncResult {
  created: number;
  total: number;
  failed: { partNumber: string; description: string; rowId: string; lineNo: number; error: string }[];
  warning?: string;
}

export interface BCBomSyncResult {
  deleted: number;
  added: number;
  skipped: number;
  errors: string[];
  warning?: string;
}

export interface BCPricePushResult {
  ok: boolean;
  reason?: 'post_failed' | 'item_not_found' | 'error';
}

export interface BCCompany {
  id: string;
  name: string;
}

/** UOM normalization map */
export const BC_UOM_MAP: Record<string, string> = {
  E: 'EA', EA: 'EA',
  PC: 'PCS', PCS: 'PCS',
  FT: 'FT', M: 'M',
  LB: 'LB', KG: 'KG',
  BX: 'BOX', BOX: 'BOX',
  RL: 'ROLL', ROLL: 'ROLL',
  PR: 'PR', SET: 'SET', PKG: 'PKG',
  C: 'C100', HR: 'HOUR', HOUR: 'HOUR',
};
