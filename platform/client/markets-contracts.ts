export interface RuleSource {
  documentId: string;
  locator: string;
  note: string;
}
export interface Rule {
  id: string;
  status: "proposed" | "validated";
  source: RuleSource;
}
export interface Price extends Rule {
  label: string;
  amountMinor: number | null;
  vatRate?: number | null;
  unit: string;
  profile: string;
  location: string;
  startDate: string;
  endDate: string;
  notes: string;
}
export interface Ceiling extends Rule {
  label: string;
  amountMinor: number | null;
  basis: string;
  scope: string;
  periodId: string;
  consumptionBasis: string;
  notes: string;
}
export interface Period extends Rule {
  label: string;
  startDate: string;
  endDate: string;
  decision: string;
}
export interface Condition extends Rule {
  category: string;
  label: string;
  value: string;
}
export interface Issue {
  id: string;
  title: string;
  detail: string;
  blocking: boolean;
  status: "open" | "resolved";
  resolution: string;
  source: RuleSource;
}
export interface Market {
  linkedEngagements?:(import('../billing-contracts').BillingEngagementDetails&{documentId:string;kind:'order'|'signed_quote';filename:string;quoteNumber:string})[];
  id: string;
  version: number;
  title: string;
  reference: string;
  clientName: string;
  clientId: string;
  type: string;
  currency: string;
  status: string;
  billingMode: string;
  notificationDate: string;
  startBasis?: ''|'notification'|'first_order'|'date';
  startDate?: string;
  initialDurationMonths?: number|null;
  maximumMinor?: number|null;
  invoicedMinor?: number|null;
  tracking?:{sentQuoteCount:number;quotedMinor:number};
  periodBasis: string;
  renewalMode: string;
  renewalCount: number | null;
  noMinimum: boolean;
  minimumMinor: number | null;
  feesIncluded: boolean;
  notes: string;
  prices: Price[];
  ceilings: Ceiling[];
  periods: Period[];
  conditions: Condition[];
  issues: Issue[];
  projects?: MarketProject[];
  orders?: MarketOrder[];
}
export interface MarketOrder {id:string;reference:string;date:string;amountMinor:number|null;documentId:string;notes:string;archived:boolean;historyPending?:boolean;}
export interface MarketProject {id:string;name:string;code:string;programme?:string;startDate?:string;endDate?:string;logoData?:string;marketIds?:string[];clientIds?:string[];notes:string;archived:boolean;orders:MarketOrder[];}
export interface MarketDocument {
  id: string;
  name: string;
  kind: string;
  size: number;
  uploadedAt: string;
  hasText: boolean;
  mime: string;
}
export interface MarketVersion {
  version: number;
  updatedAt: string;
  updatedBy: string;
  market: Market;
}
export interface AnalysisResult {
  projects?: MarketProject[];
  coverage: {
    id: string;
    name: string;
    selected: boolean;
    complete: boolean;
    warnings: string[];
  }[];
  facts: {
    field: string;
    value: unknown;
    conflict?: boolean;
    source: RuleSource;
  }[];
  prices: Price[];
  ceilings: Ceiling[];
  periods: Period[];
  conditions: Condition[];
  issues: Issue[];
  warnings: string[];
}
export interface MarketAnalysis {
  documentIds?:string[];
  id: string;
  status: string;
  completed: number;
  total: number;
  error?: string;
  result?: AnalysisResult;
  stale?: boolean;
  baseVersion: number;
}
export interface ReadingSuggestion {
  value: number;
  basis?: string;
  annual: boolean;
  excerpt: string;
}
export interface MarketsSnapshot {
  appliedAnalysisId?:string;
  rows: Market[];
  clients: { id: string; name: string }[];
  current: Market | null;
  docs: MarketDocument[];
  tab: string;
  dirty: boolean;
  busy: boolean;
  error: string;
  notice: string;
  query: string;
  history: MarketVersion[] | null;
  analysis: MarketAnalysis | null;
  readings: { id: string; read: boolean; complete: boolean }[];
  ai: {
    model: string;
    remaining: number;
    dailyBudget: number;
    configured: boolean;
  } | null;
  progress: string;
  uploadStatus: string;
  suggestions: { documentId: string; items: ReadingSuggestion[] } | null;
}
export interface MarketsProps {
  state: MarketsSnapshot;
  onQuery: (query: string) => void;
}
