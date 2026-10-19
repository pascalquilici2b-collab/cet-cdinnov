/** Persisted shapes: optional/unknown fields are retained by immutable spreads and JSON backups. */
export type CellValue = string | number | boolean | null;
export interface Column {
  id: string;
  title: string;
  type: string;
  width: number;
  options?: string[];
  [field: string]: unknown;
}
export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  background?: string;
  align?: string;
  [field: string]: unknown;
}
export interface SheetRow {
  id: string;
  parentId?: string | null;
  cells: Record<string, CellValue>;
  formats?: Record<string, CellFormat>;
  format?: CellFormat;
  updatedAt?: string;
  [field: string]: unknown;
}
export interface Comment {
  id: string;
  rowId: string | null;
  text: string;
  author?: string;
  createdAt?: string;
  [field: string]: unknown;
}
export interface FormField {
  columnId: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
  help?: string;
  description?: string;
  placeholder?: string;
  [field: string]: unknown;
}
export interface SheetForm {
  id: string;
  title: string;
  description?: string;
  active: boolean;
  successMessage?: string;
  fields: FormField[];
  [field: string]: unknown;
}
export interface ResolvedField extends FormField {
  column: Column;
}
export interface Sheet {
  id: string;
  name: string;
  workspaceId: string;
  folderId: string | null;
  favorite: boolean;
  columns: Column[];
  rows: SheetRow[];
  comments: Comment[];
  forms: SheetForm[];
  automations: unknown[];
  lastView: string;
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
}
export interface Folder {
  id: string;
  name: string;
  [field: string]: unknown;
}
export interface Workspace {
  id: string;
  name: string;
  folders: Folder[];
  [field: string]: unknown;
}
export interface Widget {
  id: string;
  type: string;
  title: string;
  metric?: string;
  chart?: string;
  mode?: string;
  text?: string;
  [field: string]: unknown;
}
export interface SheetDashboard {
  rows?: never;
  folderId?: string | null;
  id: string;
  name: string;
  workspaceId: string;
  favorite?: boolean;
  sheetIds?: string[];
  widgets?: Widget[];
  createdAt?: string;
  updatedAt?: string;
  [field: string]: unknown;
}
export interface Activity {
  createdAt?: string;
  id: string;
  text: string;
  at: string;
  [field: string]: unknown;
}
export interface WorkspaceState {
  workspaces: Workspace[];
  sheets: Sheet[];
  dashboards: SheetDashboard[];
  activity: Activity[];
  profile: { name: string; organization: string; [field: string]: unknown };
  sampleData?: boolean;
  [field: string]: unknown;
}
export type WorkspaceUpdate =
  | WorkspaceState
  | ((state: WorkspaceState) => WorkspaceState);
export interface Session {
  email: string;
  token: string;
  expiresAt: number;
  [field: string]: unknown;
}
export interface CellAddress {
  rowId: string;
  columnId: string;
}
export interface RowFilter {
  query?: string;
  status?: string;
  collapsed?: Set<string>;
  sort?: { columnId: string; direction: string } | null;
}
export interface FormulaReference {
  column: string;
  row: string;
}
export interface DashboardTask {
  id: string;
  sheetId: string;
  sheetName: string;
  title: string;
  owner: string;
  status: string;
  progress: number;
  completed: boolean;
  budget: number;
  end: string | null;
  overdue: boolean;
  index: number;
  updatedAt: string;
}
export interface SheetSummaryData {
  id: string;
  name: string;
  total: number;
  completed: number;
  progress: number;
}
export interface DashboardSummary {
  total: number;
  completed: number;
  overdue: number;
  progress: number;
  budget: number;
  statusCounts: Record<string, number>;
  tasks: DashboardTask[];
  due: DashboardTask[];
  recent: DashboardTask[];
  sheets: SheetSummaryData[];
}
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number;
  }
}
